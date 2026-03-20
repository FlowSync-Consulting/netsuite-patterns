/**
 * Tests for duplicate_detector.js
 * @jest-environment node
 */

const search = require('../../../shared/mocks/search');
const duplicateDetector = require('../lib/duplicate_detector');

describe('Duplicate Detector', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('normalizePayload', () => {
        test('should sort keys alphabetically', () => {
            const payload = {
                zebra: 'last',
                apple: 'first',
                middle: 'center'
            };

            const normalized = duplicateDetector.normalizePayload(payload);
            const keys = Object.keys(normalized);

            expect(keys).toEqual(['apple', 'middle', 'zebra']);
        });

        test('should remove null and undefined values', () => {
            const payload = {
                field1: 'value',
                field2: null,
                field3: undefined,
                field4: 'keep'
            };

            const normalized = duplicateDetector.normalizePayload(payload);

            expect(normalized.field1).toBe('value');
            expect(normalized.field2).toBeUndefined();
            expect(normalized.field3).toBeUndefined();
            expect(normalized.field4).toBe('keep');
        });

        test('should normalize nested objects', () => {
            const payload = {
                outer: {
                    zebra: 'z',
                    apple: 'a'
                }
            };

            const normalized = duplicateDetector.normalizePayload(payload);
            const nestedKeys = Object.keys(normalized.outer);

            expect(nestedKeys).toEqual(['apple', 'zebra']);
        });

        test('should normalize arrays', () => {
            const payload = {
                items: [
                    { zebra: 'z', apple: 'a' },
                    { beta: 'b', alpha: 'a' }
                ]
            };

            const normalized = duplicateDetector.normalizePayload(payload);

            expect(Object.keys(normalized.items[0])).toEqual(['apple', 'zebra']);
            expect(Object.keys(normalized.items[1])).toEqual(['alpha', 'beta']);
        });

        test('should convert dates to ISO strings', () => {
            const testDate = new Date('2026-03-15T10:30:00.000Z');
            const payload = {
                date_field: testDate
            };

            const normalized = duplicateDetector.normalizePayload(payload);

            expect(normalized.date_field).toBe('2026-03-15T10:30:00.000Z');
        });
    });

    describe('generatePayloadHash', () => {
        test('should generate consistent hash for same payload', () => {
            const payload1 = { vendor_id: 'V-123', amount: 1000 };
            const payload2 = { vendor_id: 'V-123', amount: 1000 };

            const hash1 = duplicateDetector.generatePayloadHash(payload1);
            const hash2 = duplicateDetector.generatePayloadHash(payload2);

            expect(hash1).toBe(hash2);
        });

        test('should generate same hash regardless of key order', () => {
            const payload1 = { amount: 1000, vendor_id: 'V-123' };
            const payload2 = { vendor_id: 'V-123', amount: 1000 };

            const hash1 = duplicateDetector.generatePayloadHash(payload1);
            const hash2 = duplicateDetector.generatePayloadHash(payload2);

            expect(hash1).toBe(hash2);
        });

        test('should generate different hash for different payloads', () => {
            const payload1 = { vendor_id: 'V-123', amount: 1000 };
            const payload2 = { vendor_id: 'V-456', amount: 1000 };

            const hash1 = duplicateDetector.generatePayloadHash(payload1);
            const hash2 = duplicateDetector.generatePayloadHash(payload2);

            expect(hash1).not.toBe(hash2);
        });

        test('should throw error for invalid payload', () => {
            expect(() => {
                duplicateDetector.generatePayloadHash(null);
            }).toThrow('Payload must be an object');
        });
    });

    describe('checkDuplicate', () => {
        test('should detect duplicate by external ID', () => {
            search.mockSearchResults([
                { id: '999', values: { externalid: 'EXT-123' } }
            ]);

            const result = duplicateDetector.checkDuplicate({
                entityType: 'invoice',
                externalId: 'EXT-123'
            });

            expect(result.isDuplicate).toBe(true);
            expect(result.existingRecordId).toBe('999');
            expect(result.matchType).toBe('external_id');
        });

        test('should return no duplicate when external ID not found', () => {
            search.mockSearchResults([]);

            const result = duplicateDetector.checkDuplicate({
                entityType: 'invoice',
                externalId: 'NOT-FOUND'
            });

            expect(result.isDuplicate).toBe(false);
            expect(result.existingRecordId).toBeNull();
        });

        test('should detect duplicate by payload hash', () => {
            // Mock search to track call count
            let callCount = 0;
            const originalCreate = search.create;
            search.create = jest.fn((config) => {
                callCount++;
                const searchObj = originalCreate(config);

                if (callCount === 1) {
                    // External ID check - no results
                    searchObj._mockResults = [];
                } else {
                    // Payload hash check - found
                    searchObj._mockResults = [
                        new search.Result({ id: '888', values: { custbody_payload_hash: expect.any(String) } })
                    ];
                }

                return searchObj;
            });

            const result = duplicateDetector.checkDuplicate({
                entityType: 'invoice',
                externalId: 'NEW-123',
                payload: { vendor_id: 'V-123', amount: 1000 }
            });

            expect(result.isDuplicate).toBe(true);
            expect(result.existingRecordId).toBe('888');
            expect(result.matchType).toBe('payload_hash');

            // Restore
            search.create = originalCreate;
        });

        test('should prioritize external ID match over payload hash', () => {
            search.mockSearchResults([
                { id: '777', values: { externalid: 'EXT-999' } }
            ]);

            const result = duplicateDetector.checkDuplicate({
                entityType: 'invoice',
                externalId: 'EXT-999',
                payload: { vendor_id: 'V-123' }
            });

            expect(result.isDuplicate).toBe(true);
            expect(result.existingRecordId).toBe('777');
            expect(result.matchType).toBe('external_id');
        });

        test('should handle payload-only check (no external ID)', () => {
            search.mockSearchResults([]);

            const result = duplicateDetector.checkDuplicate({
                entityType: 'invoice',
                payload: { vendor_id: 'V-123', amount: 1000 }
            });

            expect(result.isDuplicate).toBe(false);
        });

        test('should throw error for missing entity type', () => {
            expect(() => {
                duplicateDetector.checkDuplicate({});
            }).toThrow('Entity type is required');
        });

        test('should throw error for unsupported entity type', () => {
            expect(() => {
                duplicateDetector.checkDuplicate({
                    entityType: 'unsupported_type',
                    externalId: 'TEST-123'
                });
            }).toThrow('Unsupported entity type');
        });
    });

    describe('storePayloadHash', () => {
        test('should store payload hash on record', () => {
            const mockRecord = {
                setValue: jest.fn()
            };

            const payload = { vendor_id: 'V-123', amount: 1000 };

            duplicateDetector.storePayloadHash(mockRecord, payload);

            expect(mockRecord.setValue).toHaveBeenCalledWith({
                fieldId: 'custbody_payload_hash',
                value: expect.any(String)
            });
        });
    });
});
