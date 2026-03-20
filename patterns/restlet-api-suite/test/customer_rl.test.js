/**
 * Tests for fs_customer_rl.js
 * @jest-environment node
 */

const search = require('../../../shared/mocks/search');
const record = require('../../../shared/mocks/record');

// Import customer RESTlet
const customerRl = require('../fs_customer_rl');

describe('Customer RESTlet', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET', () => {
        test('should return customer data when found', () => {
            // Mock finding customer by external ID
            search.mockSearchResults([
                { id: '123', values: { externalid: 'EXT-CUST-123' } }
            ]);

            // Mock loading customer record
            const mockCustomer = record.mockRecord({
                externalid: 'EXT-CUST-123',
                companyname: 'Test Company',
                email: 'test@example.com',
                phone: '555-1234',
                subsidiary: '1',
                entitystatus: '13'
            });

            record.load.mockReturnValue(mockCustomer);

            const result = customerRl.get({ external_id: 'EXT-CUST-123' });

            expect(result.success).toBe(true);
            expect(result.internal_id).toBe('123');
            expect(result.company_name).toBe('Test Company');
            expect(result.email).toBe('test@example.com');
        });

        test('should return error when customer not found', () => {
            search.mockSearchResults([]);

            const result = customerRl.get({ external_id: 'NOT-FOUND' });

            expect(result.success).toBe(false);
            expect(result.code).toBe('RECORD_NOT_FOUND');
        });

        test('should return error when external_id is missing', () => {
            const result = customerRl.get({});

            expect(result.success).toBe(false);
            expect(result.code).toBe('MISSING_REQUIRED_FIELD');
        });
    });

    describe('POST', () => {
        test('should create new customer', () => {
            search.mockSearchResults([]); // Customer doesn't exist
            record.mockRecordId('999');

            const result = customerRl.post({
                external_id: 'NEW-CUST-123',
                company_name: 'New Company',
                email: 'new@example.com',
                phone: '555-9999',
                subsidiary_id: '1'
            });

            expect(result.success).toBe(true);
            expect(result.internal_id).toBe('999');
            expect(result.created).toBe(true);
            expect(record.create).toHaveBeenCalled();
        });

        test('should return error when customer already exists', () => {
            search.mockSearchResults([
                { id: '123', values: { externalid: 'EXISTING-123' } }
            ]);

            const result = customerRl.post({
                external_id: 'EXISTING-123',
                company_name: 'Existing Company',
                subsidiary_id: '1'
            });

            expect(result.success).toBe(false);
            expect(result.code).toBe('DUPLICATE_RECORD');
            expect(result.internal_id).toBe('123');
        });

        test('should validate required fields', () => {
            const result = customerRl.post({
                external_id: 'NEW-123'
                // Missing company_name and subsidiary_id
            });

            expect(result.success).toBe(false);
            expect(result.code).toBe('MISSING_REQUIRED_FIELD');
        });

        test('should validate email format', () => {
            const result = customerRl.post({
                external_id: 'NEW-123',
                company_name: 'Test Co',
                subsidiary_id: '1',
                email: 'invalid-email'
            });

            expect(result.success).toBe(false);
            expect(result.code).toBe('INVALID_FIELD_TYPE');
        });
    });

    describe('PUT', () => {
        test('should update existing customer', () => {
            search.mockSearchResults([
                { id: '123', values: { externalid: 'EXISTING-123' } }
            ]);

            const mockCustomer = record.mockRecord();
            record.load.mockReturnValue(mockCustomer);
            record.mockRecordId('123');

            const result = customerRl.put({
                external_id: 'EXISTING-123',
                company_name: 'Updated Company Name',
                email: 'updated@example.com'
            });

            expect(result.success).toBe(true);
            expect(result.internal_id).toBe('123');
            expect(result.updated).toBe(true);
            expect(result.created).toBe(false);
        });

        test('should create new customer if not exists', () => {
            search.mockSearchResults([]);
            record.mockRecordId('999');

            const result = customerRl.put({
                external_id: 'NEW-CUST-456',
                company_name: 'New Company',
                subsidiary_id: '1'
            });

            expect(result.success).toBe(true);
            expect(result.internal_id).toBe('999');
            expect(result.created).toBe(true);
            expect(result.updated).toBe(false);
        });

        test('should require company_name and subsidiary_id for new customers', () => {
            search.mockSearchResults([]);

            const result = customerRl.put({
                external_id: 'NEW-CUST-789',
                email: 'test@example.com'
                // Missing company_name and subsidiary_id
            });

            expect(result.success).toBe(false);
            expect(result.code).toBe('MISSING_REQUIRED_FIELD');
        });
    });
});
