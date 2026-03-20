/**
 * Tests for status_machine.js
 * @jest-environment node
 */

const record = require('../../../shared/mocks/record');
const statusMachine = require('../lib/status_machine');

describe('Status Machine', () => {
    let mockRecord;
    let originalLoad;

    beforeEach(() => {
        jest.clearAllMocks();
        if (record.load.mockClear) {
            record.load.mockClear();
        }
        mockRecord = record.mockRecord({
            custrecord_staging_status: '1' // Pending
        });
        if (record.load.mockReturnValue) {
            record.load.mockReturnValue(mockRecord);
        }
        record.mockRecordId('123');
    });

    describe('transitionStatus', () => {
        test('should transition from Pending to Processing', () => {
            const result = statusMachine.transitionStatus('123', 'Processing');

            expect(result).toBe(true);
            expect(mockRecord.setValue).toHaveBeenCalledWith({
                fieldId: 'custrecord_staging_status',
                value: '2'
            });
        });

        test('should transition from Processing to Complete', () => {
            mockRecord._values.custrecord_staging_status = '2'; // Processing

            const result = statusMachine.transitionStatus('123', 'Complete', null, '999');

            expect(result).toBe(true);
            expect(mockRecord.setValue).toHaveBeenCalledWith({
                fieldId: 'custrecord_staging_status',
                value: '3'
            });
            expect(mockRecord.setValue).toHaveBeenCalledWith({
                fieldId: 'custrecord_staging_processed_date',
                value: expect.any(Date)
            });
            expect(mockRecord.setValue).toHaveBeenCalledWith({
                fieldId: 'custrecord_staging_target_record_id',
                value: '999'
            });
        });

        test('should transition from Processing to Failed with error message', () => {
            mockRecord._values.custrecord_staging_status = '2'; // Processing

            const result = statusMachine.transitionStatus('123', 'Failed', 'Validation error');

            expect(result).toBe(true);
            expect(mockRecord.setValue).toHaveBeenCalledWith({
                fieldId: 'custrecord_staging_status',
                value: '4'
            });
            expect(mockRecord.setValue).toHaveBeenCalledWith({
                fieldId: 'custrecord_staging_error_message',
                value: 'Validation error'
            });
        });

        test('should transition from Processing to Duplicate', () => {
            mockRecord._values.custrecord_staging_status = '2'; // Processing

            const result = statusMachine.transitionStatus('123', 'Duplicate', 'Record 999 already exists');

            expect(result).toBe(true);
            expect(mockRecord.setValue).toHaveBeenCalledWith({
                fieldId: 'custrecord_staging_status',
                value: '5'
            });
        });

        test('should allow Failed to Processing transition (retry)', () => {
            mockRecord._values.custrecord_staging_status = '4'; // Failed

            const result = statusMachine.transitionStatus('123', 'Processing');

            expect(result).toBe(true);
            expect(mockRecord.setValue).toHaveBeenCalledWith({
                fieldId: 'custrecord_staging_status',
                value: '2'
            });
        });

        test('should reject invalid transition from Complete to Pending', () => {
            mockRecord._values.custrecord_staging_status = '3'; // Complete

            expect(() => {
                statusMachine.transitionStatus('123', 'Pending');
            }).toThrow('Cannot transition from Complete to Pending');
        });

        test('should reject invalid transition from Duplicate to Processing', () => {
            mockRecord._values.custrecord_staging_status = '5'; // Duplicate

            expect(() => {
                statusMachine.transitionStatus('123', 'Processing');
            }).toThrow('Cannot transition from Duplicate to Processing');
        });

        test('should throw error for missing staging ID', () => {
            expect(() => {
                statusMachine.transitionStatus(null, 'Processing');
            }).toThrow('Staging record ID is required');
        });

        test('should throw error for invalid status name', () => {
            expect(() => {
                statusMachine.transitionStatus('123', 'InvalidStatus');
            }).toThrow('Invalid status');
        });

        test('should truncate error messages longer than 4000 chars', () => {
            mockRecord._values.custrecord_staging_status = '2'; // Processing

            const longMessage = 'x'.repeat(5000);
            statusMachine.transitionStatus('123', 'Failed', longMessage);

            const savedMessage = mockRecord.setValue.mock.calls.find(
                call => call[0].fieldId === 'custrecord_staging_error_message'
            );

            expect(savedMessage[0].value.length).toBe(4000);
        });
    });

    describe('isValidTransition', () => {
        test('should allow Pending to Processing', () => {
            expect(statusMachine.isValidTransition('1', '2')).toBe(true);
        });

        test('should allow Processing to Complete', () => {
            expect(statusMachine.isValidTransition('2', '3')).toBe(true);
        });

        test('should allow Processing to Failed', () => {
            expect(statusMachine.isValidTransition('2', '4')).toBe(true);
        });

        test('should reject Complete to Pending', () => {
            expect(statusMachine.isValidTransition('3', '1')).toBe(false);
        });

        test('should allow null/undefined to any status', () => {
            expect(statusMachine.isValidTransition(null, '1')).toBe(true);
            expect(statusMachine.isValidTransition(undefined, '2')).toBe(true);
        });
    });

    describe('batchTransition', () => {
        test('should transition multiple records successfully', () => {
            // Set up load to return fresh mock for each call
            let callCount = 0;
            record.load.mockClear();
            record.load.mockReturnValue = null; // Clear single return value

            const originalLoad = record.load;
            record.load = jest.fn((config) => {
                const rec = record.mockRecord({ custrecord_staging_status: '1' });
                return rec;
            });

            const results = statusMachine.batchTransition(
                ['123', '456', '789'],
                'Processing'
            );

            expect(results.success).toBe(3);
            expect(results.failed).toBe(0);
            expect(results.errors.length).toBe(0);

            // Restore
            record.load = originalLoad;
        });

        test('should handle partial failures', () => {
            let callCount = 0;
            const originalLoad = record.load;

            record.load = jest.fn((config) => {
                callCount++;
                if (callCount === 2) {
                    throw new Error('Record not found');
                }
                return record.mockRecord({ custrecord_staging_status: '1' });
            });

            const results = statusMachine.batchTransition(
                ['123', '456', '789'],
                'Processing'
            );

            expect(results.success).toBe(2);
            expect(results.failed).toBe(1);
            expect(results.errors.length).toBe(1);
            expect(results.errors[0].stagingId).toBe('456');

            // Restore
            record.load = originalLoad;
        });

        test('should throw error for invalid input', () => {
            expect(() => {
                statusMachine.batchTransition(null, 'Processing');
            }).toThrow('stagingIds must be a non-empty array');
        });

        test('should throw error for empty array', () => {
            expect(() => {
                statusMachine.batchTransition([], 'Processing');
            }).toThrow('stagingIds must be a non-empty array');
        });
    });

    describe('getStatus', () => {
        test('should return current status information', () => {
            const testRecord = record.mockRecord({
                custrecord_staging_status: '2',
                custrecord_staging_processed_date: null,
                custrecord_staging_error_message: null,
                custrecord_staging_target_record_id: null
            });

            // Override load to return our test record
            const originalLoad = record.load;
            record.load = jest.fn(() => testRecord);

            const status = statusMachine.getStatus('123');

            expect(status.value).toBe('2');
            expect(status.name).toBe('Processing');
            expect(status.processedDate).toBeNull();

            // Restore
            record.load = originalLoad;
        });

        test('should return complete status with target record ID', () => {
            const testRecord = record.mockRecord({
                custrecord_staging_status: '3',
                custrecord_staging_processed_date: '2026-03-15',
                custrecord_staging_target_record_id: '999',
                custrecord_staging_error_message: null
            });

            const originalLoad = record.load;
            record.load = jest.fn(() => testRecord);

            const status = statusMachine.getStatus('123');

            expect(status.value).toBe('3');
            expect(status.name).toBe('Complete');
            expect(status.targetRecordId).toBe('999');

            record.load = originalLoad;
        });

        test('should return failed status with error message', () => {
            const testRecord = record.mockRecord({
                custrecord_staging_status: '4',
                custrecord_staging_error_message: 'Vendor not found',
                custrecord_staging_processed_date: null,
                custrecord_staging_target_record_id: null
            });

            const originalLoad = record.load;
            record.load = jest.fn(() => testRecord);

            const status = statusMachine.getStatus('123');

            expect(status.value).toBe('4');
            expect(status.name).toBe('Failed');
            expect(status.errorMessage).toBe('Vendor not found');

            record.load = originalLoad;
        });

        test('should throw error for missing staging ID', () => {
            expect(() => {
                statusMachine.getStatus(null);
            }).toThrow('Staging record ID is required');
        });
    });
});
