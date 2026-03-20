/**
 * Tests for segmentation.js
 * @jest-environment node
 */

const segmentation = require('../lib/segmentation');

describe('Segmentation Module', () => {
    describe('generateKey', () => {
        test('should generate invoice key with vendor and date', () => {
            const payload = {
                vendor_id: 'V-123',
                invoice_date: '2026-03-15',
                amount: 1000
            };

            const key = segmentation.generateKey('invoice', payload);

            expect(key).toBe('invoice|V-123|2026-03-15');
        });

        test('should use vendor_internal_id if vendor_id missing', () => {
            const payload = {
                vendor_internal_id: '789',
                invoice_date: '2026-03-15'
            };

            const key = segmentation.generateKey('invoice', payload);

            expect(key).toBe('invoice|789|2026-03-15');
        });

        test('should handle missing vendor with unknown', () => {
            const payload = {
                invoice_date: '2026-03-15'
            };

            const key = segmentation.generateKey('invoice', payload);

            expect(key).toBe('invoice|unknown|2026-03-15');
        });

        test('should truncate date to YYYY-MM-DD', () => {
            const payload = {
                vendor_id: 'V-123',
                invoice_date: '2026-03-15T10:30:00.000Z'
            };

            const key = segmentation.generateKey('invoice', payload);

            expect(key).toBe('invoice|V-123|2026-03-15');
        });

        test('should generate sales_order key with customer and ship_date', () => {
            const payload = {
                customer_id: 'C-456',
                ship_date: '2026-03-20'
            };

            const key = segmentation.generateKey('sales_order', payload);

            expect(key).toBe('sales_order|C-456|2026-03-20');
        });

        test('should generate journal_entry key with period and department', () => {
            const payload = {
                posting_period: '2026-03',
                department_id: 'DEPT-10'
            };

            const key = segmentation.generateKey('journal_entry', payload);

            expect(key).toBe('journal_entry|2026-03|DEPT-10');
        });

        test('should use default strategy for unknown entity types', () => {
            const payload = {
                field1: 'value1'
            };

            const key = segmentation.generateKey('unknown_type', payload);

            expect(key).toBe('default|batch');
        });

        test('should throw error for invalid entity type', () => {
            expect(() => {
                segmentation.generateKey(null, {});
            }).toThrow('Entity type must be a non-empty string');
        });

        test('should throw error for invalid payload', () => {
            expect(() => {
                segmentation.generateKey('invoice', null);
            }).toThrow('Payload must be an object');
        });
    });

    describe('parseKey', () => {
        test('should parse invoice key correctly', () => {
            const result = segmentation.parseKey('invoice|V-123|2026-03-15');

            expect(result.entityType).toBe('invoice');
            expect(result.segments).toEqual(['V-123', '2026-03-15']);
        });

        test('should parse default key correctly', () => {
            const result = segmentation.parseKey('default|batch');

            expect(result.entityType).toBe('default');
            expect(result.segments).toEqual(['batch']);
        });

        test('should throw error for invalid key format', () => {
            expect(() => {
                segmentation.parseKey('invalid');
            }).toThrow('Invalid segmentation key format');
        });

        test('should throw error for null key', () => {
            expect(() => {
                segmentation.parseKey(null);
            }).toThrow('Key must be a non-empty string');
        });
    });

    describe('groupRecords', () => {
        test('should group records by segmentation key', () => {
            const records = [
                {
                    entityType: 'invoice',
                    payload: { vendor_id: 'V-123', invoice_date: '2026-03-15' }
                },
                {
                    entityType: 'invoice',
                    payload: { vendor_id: 'V-123', invoice_date: '2026-03-15' }
                },
                {
                    entityType: 'invoice',
                    payload: { vendor_id: 'V-456', invoice_date: '2026-03-16' }
                }
            ];

            const grouped = segmentation.groupRecords(records);

            expect(Object.keys(grouped).length).toBe(2);
            expect(grouped['invoice|V-123|2026-03-15'].length).toBe(2);
            expect(grouped['invoice|V-456|2026-03-16'].length).toBe(1);
        });

        test('should group mixed entity types correctly', () => {
            const records = [
                {
                    entityType: 'invoice',
                    payload: { vendor_id: 'V-123', invoice_date: '2026-03-15' }
                },
                {
                    entityType: 'vendor',
                    payload: { company_name: 'Acme Corp' }
                },
                {
                    entityType: 'invoice',
                    payload: { vendor_id: 'V-123', invoice_date: '2026-03-15' }
                }
            ];

            const grouped = segmentation.groupRecords(records);

            expect(Object.keys(grouped).length).toBe(2);
            expect(grouped['invoice|V-123|2026-03-15'].length).toBe(2);
            expect(grouped['vendor|batch'].length).toBe(1);
        });

        test('should throw error for non-array input', () => {
            expect(() => {
                segmentation.groupRecords({ not: 'array' });
            }).toThrow('Records must be an array');
        });

        test('should throw error for records missing entityType', () => {
            const records = [
                {
                    payload: { vendor_id: 'V-123' }
                }
            ];

            expect(() => {
                segmentation.groupRecords(records);
            }).toThrow('Record at index 0 missing entityType or payload');
        });
    });

    describe('registerStrategy', () => {
        test('should register custom strategy', () => {
            segmentation.registerStrategy('custom_type', function(payload) {
                return 'custom|' + payload.region;
            });

            const key = segmentation.generateKey('custom_type', { region: 'US-WEST' });

            expect(key).toBe('custom|US-WEST');
        });

        test('should throw error for invalid entity type', () => {
            expect(() => {
                segmentation.registerStrategy(null, function() {});
            }).toThrow('Entity type must be a non-empty string');
        });

        test('should throw error for non-function strategy', () => {
            expect(() => {
                segmentation.registerStrategy('invalid', 'not-a-function');
            }).toThrow('Strategy must be a function');
        });
    });
});
