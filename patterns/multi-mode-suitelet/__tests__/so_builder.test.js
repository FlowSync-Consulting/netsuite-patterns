/**
 * @jest-environment node
 *
 * Tests for Sales Order Builder utility
 * Covers SO creation, line item addition, field order, and work entry updates
 */

const record = require('../../../shared/mocks/record');
const search = require('../../../shared/mocks/search');
const log = require('../../../shared/mocks/log');

// Mock record helpers
const mockRecordHelpers = {
    safeSetValue: jest.fn((rec, field, value) => true),
    safeSetCurrentSublistValue: jest.fn((rec, sublist, field, value) => true),
    updateRecord: jest.fn((type, id, values) => id)
};

let soBuilder;

beforeAll(() => {
    global.define = (dependencies, factory) => {
        const modules = dependencies.map(dep => {
            if (dep === 'N/record') return record;
            if (dep === 'N/search') return search;
            if (dep === 'N/log') return log;
            if (dep === './record_helpers') return mockRecordHelpers;
            return {};
        });
        soBuilder = factory(...modules);
    };

    require('../src/lib/so_builder');
});

describe('SO Builder - Sales Order Creation', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Mock work entry search results
        search.create.mockReturnValue({
            run: () => ({
                getRange: () => [
                    {
                        getValue: jest.fn((field) => {
                            const values = {
                                'internalid': '123',
                                'custrecord_fs_serial': 'SN-001',
                                'custrecord_fs_board_type': 'Controller',
                                'custrecord_fs_outcome': '1',  // Repaired
                                'custrecord_fs_customer': '456'
                            };
                            return values[field] || '';
                        }),
                        getText: jest.fn((field) => {
                            if (field === 'custrecord_fs_outcome') return 'Repaired';
                            return '';
                        })
                    }
                ]
            })
        });

        // Mock customer subsidiary lookup
        search.lookupFields.mockReturnValue({
            subsidiary: [{ value: 1 }]
        });
    });

    describe('createSalesOrderFromWorkEntries', () => {
        it('should create sales order with correct header fields', () => {
            const mockSO = {
                setValue: jest.fn(),
                selectNewLine: jest.fn(),
                setCurrentSublistValue: jest.fn(),
                commitLine: jest.fn(),
                save: jest.fn(() => 789)
            };

            record.create.mockReturnValue(mockSO);

            const soId = soBuilder.createSalesOrderFromWorkEntries('456', ['123']);

            // Verify SO creation
            expect(record.create).toHaveBeenCalledWith({
                type: record.Type.SALES_ORDER,
                isDynamic: true
            });

            // Verify header fields set
            expect(mockSO.setValue).toHaveBeenCalledWith({
                fieldId: 'entity',
                value: '456'
            });

            expect(mockSO.setValue).toHaveBeenCalledWith({
                fieldId: 'subsidiary',
                value: 1
            });

            expect(mockSO.setValue).toHaveBeenCalledWith({
                fieldId: 'trandate',
                value: expect.any(Date)
            });

            // Verify SO saved
            expect(mockSO.save).toHaveBeenCalled();
            expect(soId).toBe(789);
        });

        it('should add line items for work entries', () => {
            const mockSO = {
                setValue: jest.fn(),
                selectNewLine: jest.fn(),
                setCurrentSublistValue: jest.fn(),
                commitLine: jest.fn(),
                save: jest.fn(() => 789)
            };

            record.create.mockReturnValue(mockSO);

            soBuilder.createSalesOrderFromWorkEntries('456', ['123']);

            // Verify line created
            expect(mockSO.selectNewLine).toHaveBeenCalledWith({ sublistId: 'item' });
            expect(mockSO.commitLine).toHaveBeenCalledWith({ sublistId: 'item' });
        });

        it('should set item field FIRST before other fields (NetSuite requirement)', () => {
            const mockSO = {
                setValue: jest.fn(),
                selectNewLine: jest.fn(),
                setCurrentSublistValue: jest.fn(),
                commitLine: jest.fn(),
                save: jest.fn(() => 789)
            };

            record.create.mockReturnValue(mockSO);

            soBuilder.createSalesOrderFromWorkEntries('456', ['123']);

            // Get all setCurrentSublistValue calls
            const sublistCalls = mockSO.setCurrentSublistValue.mock.calls;

            // Find the order of field calls
            const itemCallIndex = sublistCalls.findIndex(call =>
                call[0].fieldId === 'item'
            );
            const priceCallIndex = sublistCalls.findIndex(call =>
                call[0].fieldId === 'price'
            );

            // CRITICAL: item must be set before price
            expect(itemCallIndex).toBeGreaterThanOrEqual(0);
            expect(priceCallIndex).toBeGreaterThanOrEqual(0);
            expect(itemCallIndex).toBeLessThan(priceCallIndex);
        });

        it('should set quantity after item', () => {
            const mockSO = {
                setValue: jest.fn(),
                selectNewLine: jest.fn(),
                setCurrentSublistValue: jest.fn(),
                commitLine: jest.fn(),
                save: jest.fn(() => 789)
            };

            record.create.mockReturnValue(mockSO);

            soBuilder.createSalesOrderFromWorkEntries('456', ['123']);

            // Verify quantity set
            expect(mockSO.setCurrentSublistValue).toHaveBeenCalledWith(
                expect.objectContaining({
                    sublistId: 'item',
                    fieldId: 'quantity',
                    value: 1
                })
            );
        });

        it('should update work entries with SO reference after creation', () => {
            const mockSO = {
                setValue: jest.fn(),
                selectNewLine: jest.fn(),
                setCurrentSublistValue: jest.fn(),
                commitLine: jest.fn(),
                save: jest.fn(() => 789)
            };

            record.create.mockReturnValue(mockSO);

            soBuilder.createSalesOrderFromWorkEntries('456', ['123']);

            // Verify work entry updated
            expect(mockRecordHelpers.updateRecord).toHaveBeenCalledWith(
                'customrecord_fs_work_entry',
                '123',
                expect.objectContaining({
                    custrecord_fs_sales_order: 789,
                    custrecord_fs_status: '4'  // Billed
                })
            );
        });

        it('should throw error if no work entries found', () => {
            // Mock empty search results
            search.create.mockReturnValue({
                run: () => ({
                    getRange: () => []
                })
            });

            expect(() => {
                soBuilder.createSalesOrderFromWorkEntries('456', ['999']);
            }).toThrow('No work entries found');
        });

        it('should include serial number in line item description', () => {
            const mockSO = {
                setValue: jest.fn(),
                selectNewLine: jest.fn(),
                setCurrentSublistValue: jest.fn(),
                commitLine: jest.fn(),
                save: jest.fn(() => 789)
            };

            record.create.mockReturnValue(mockSO);

            soBuilder.createSalesOrderFromWorkEntries('456', ['123']);

            // Find description call
            const descCall = mockSO.setCurrentSublistValue.mock.calls.find(call =>
                call[0].fieldId === 'description'
            );

            expect(descCall).toBeDefined();
            expect(descCall[0].value).toContain('SN-001');
            expect(descCall[0].value).toContain('Controller');
            expect(descCall[0].value).toContain('Repaired');
        });
    });

    describe('addWorkEntriesToSalesOrder', () => {
        it('should load existing SO and add lines', () => {
            const mockSO = {
                setValue: jest.fn(),
                selectNewLine: jest.fn(),
                setCurrentSublistValue: jest.fn(),
                commitLine: jest.fn(),
                save: jest.fn(() => 555)
            };

            record.load.mockReturnValue(mockSO);

            const result = soBuilder.addWorkEntriesToSalesOrder('555', ['123']);

            // Verify SO loaded
            expect(record.load).toHaveBeenCalledWith({
                type: record.Type.SALES_ORDER,
                id: '555',
                isDynamic: true
            });

            // Verify line added
            expect(mockSO.selectNewLine).toHaveBeenCalled();
            expect(mockSO.save).toHaveBeenCalled();

            expect(result).toBe('555');
        });

        it('should update work entries after adding to existing SO', () => {
            const mockSO = {
                setValue: jest.fn(),
                selectNewLine: jest.fn(),
                setCurrentSublistValue: jest.fn(),
                commitLine: jest.fn(),
                save: jest.fn(() => 555)
            };

            record.load.mockReturnValue(mockSO);

            soBuilder.addWorkEntriesToSalesOrder('555', ['123']);

            // Verify work entry updated with SO reference
            expect(mockRecordHelpers.updateRecord).toHaveBeenCalledWith(
                'customrecord_fs_work_entry',
                '123',
                expect.objectContaining({
                    custrecord_fs_sales_order: '555',
                    custrecord_fs_status: '4'
                })
            );
        });
    });

    describe('Outcome to Item Mapping', () => {
        it('should map repaired outcome to repair service item', () => {
            const mockSO = {
                setValue: jest.fn(),
                selectNewLine: jest.fn(),
                setCurrentSublistValue: jest.fn(),
                commitLine: jest.fn(),
                save: jest.fn(() => 789)
            };

            record.create.mockReturnValue(mockSO);

            // Mock work entry with outcome '1' (Repaired)
            search.create.mockReturnValue({
                run: () => ({
                    getRange: () => [
                        {
                            getValue: jest.fn((field) => {
                                const values = {
                                    'internalid': '123',
                                    'custrecord_fs_outcome': '1'  // Repaired
                                };
                                return values[field] || '';
                            }),
                            getText: jest.fn(() => 'Repaired')
                        }
                    ]
                })
            });

            soBuilder.createSalesOrderFromWorkEntries('456', ['123']);

            // Find item set call
            const itemCall = mockSO.setCurrentSublistValue.mock.calls.find(call =>
                call[0].fieldId === 'item'
            );

            expect(itemCall).toBeDefined();
            expect(itemCall[0].value).toBe(123);  // Mapped item ID
        });
    });
});
