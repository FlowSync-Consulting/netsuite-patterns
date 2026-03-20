/**
 * Tests for lib/validation.js
 * @jest-environment node
 */

const validation = require('../lib/validation');

describe('Validation Framework', () => {
    describe('validateRequired', () => {
        test('should pass when all required fields are present', () => {
            const data = {
                customer_id: '123',
                amount: 100
            };

            const result = validation.validateRequired(data, ['customer_id', 'amount']);
            expect(result).toBeNull();
        });

        test('should fail when required field is missing', () => {
            const data = {
                customer_id: '123'
            };

            const result = validation.validateRequired(data, ['customer_id', 'amount']);
            expect(result).not.toBeNull();
            expect(result.success).toBe(false);
            expect(result.code).toBe('MISSING_REQUIRED_FIELD');
            expect(result.fields).toEqual(['amount']);
        });

        test('should fail when required field is null', () => {
            const data = {
                customer_id: '123',
                amount: null
            };

            const result = validation.validateRequired(data, ['customer_id', 'amount']);
            expect(result).not.toBeNull();
            expect(result.fields).toEqual(['amount']);
        });

        test('should fail when required field is empty string', () => {
            const data = {
                customer_id: '123',
                amount: ''
            };

            const result = validation.validateRequired(data, ['customer_id', 'amount']);
            expect(result).not.toBeNull();
            expect(result.fields).toEqual(['amount']);
        });
    });

    describe('validateTypes', () => {
        test('should pass when field types match', () => {
            const data = {
                customer_id: '123',
                amount: 100,
                active: true
            };

            const typeMap = {
                customer_id: 'string',
                amount: 'number',
                active: 'boolean'
            };

            const result = validation.validateTypes(data, typeMap);
            expect(result).toBeNull();
        });

        test('should fail when field type is incorrect', () => {
            const data = {
                customer_id: 123,
                amount: '100'
            };

            const typeMap = {
                customer_id: 'string',
                amount: 'number'
            };

            const result = validation.validateTypes(data, typeMap);
            expect(result).not.toBeNull();
            expect(result.success).toBe(false);
            expect(result.code).toBe('INVALID_FIELD_TYPE');
            expect(result.fields.length).toBe(2);
        });

        test('should validate email format', () => {
            const validEmail = { email: 'test@example.com' };
            const invalidEmail = { email: 'not-an-email' };

            const typeMap = { email: 'email' };

            expect(validation.validateTypes(validEmail, typeMap)).toBeNull();
            expect(validation.validateTypes(invalidEmail, typeMap)).not.toBeNull();
        });

        test('should validate date format', () => {
            const validDate = { date: '2026-03-15' };
            const invalidDate = { date: 'not-a-date' };

            const typeMap = { date: 'date' };

            expect(validation.validateTypes(validDate, typeMap)).toBeNull();
            expect(validation.validateTypes(invalidDate, typeMap)).not.toBeNull();
        });

        test('should validate array type', () => {
            const validArray = { items: [1, 2, 3] };
            const invalidArray = { items: 'not-an-array' };

            const typeMap = { items: 'array' };

            expect(validation.validateTypes(validArray, typeMap)).toBeNull();
            expect(validation.validateTypes(invalidArray, typeMap)).not.toBeNull();
        });
    });

    describe('validateRules', () => {
        test('should pass when custom rules are satisfied', () => {
            const data = {
                amount: 100,
                status: 'approved'
            };

            const rules = {
                amount: function(val) { return val > 0; },
                status: function(val) { return ['pending', 'approved'].indexOf(val) !== -1; }
            };

            const result = validation.validateRules(data, rules);
            expect(result).toBeNull();
        });

        test('should fail when custom rule is not satisfied', () => {
            const data = {
                amount: -50,
                status: 'invalid'
            };

            const rules = {
                amount: function(val) { return val > 0; },
                status: function(val) { return ['pending', 'approved'].indexOf(val) !== -1; }
            };

            const result = validation.validateRules(data, rules);
            expect(result).not.toBeNull();
            expect(result.success).toBe(false);
            expect(result.code).toBe('INVALID_FIELD_VALUE');
            expect(result.fields).toEqual(['amount', 'status']);
        });
    });

    describe('validate (comprehensive)', () => {
        test('should pass comprehensive validation', () => {
            const data = {
                customer_id: '123',
                amount: 100,
                email: 'test@example.com'
            };

            const schema = {
                required: ['customer_id', 'amount'],
                types: {
                    customer_id: 'string',
                    amount: 'number',
                    email: 'email'
                },
                rules: {
                    amount: function(val) { return val > 0; }
                }
            };

            const result = validation.validate(data, schema);
            expect(result).toBeNull();
        });

        test('should fail on first validation error (required)', () => {
            const data = {
                amount: 100
            };

            const schema = {
                required: ['customer_id', 'amount'],
                types: { amount: 'number' }
            };

            const result = validation.validate(data, schema);
            expect(result).not.toBeNull();
            expect(result.code).toBe('MISSING_REQUIRED_FIELD');
        });

        test('should fail on type validation', () => {
            const data = {
                customer_id: '123',
                amount: 'not-a-number'
            };

            const schema = {
                required: ['customer_id', 'amount'],
                types: {
                    customer_id: 'string',
                    amount: 'number'
                }
            };

            const result = validation.validate(data, schema);
            expect(result).not.toBeNull();
            expect(result.code).toBe('INVALID_FIELD_TYPE');
        });
    });
});
