/**
 * Tests for lib/error_handler.js
 * @jest-environment node
 */

const errorHandler = require('../lib/error_handler');

describe('Error Handler', () => {
    describe('formatSuccess', () => {
        test('should format success response with data', () => {
            const result = errorHandler.formatSuccess({
                internal_id: '123',
                external_id: 'EXT-123'
            }, 'Record created');

            expect(result.success).toBe(true);
            expect(result.message).toBe('Record created');
            expect(result.internal_id).toBe('123');
            expect(result.external_id).toBe('EXT-123');
        });

        test('should format success response without message', () => {
            const result = errorHandler.formatSuccess({
                internal_id: '123'
            });

            expect(result.success).toBe(true);
            expect(result.message).toBeUndefined();
            expect(result.internal_id).toBe('123');
        });

        test('should handle null data', () => {
            const result = errorHandler.formatSuccess(null, 'Success');

            expect(result.success).toBe(true);
            expect(result.message).toBe('Success');
        });
    });

    describe('formatError', () => {
        test('should format validation error (already formatted)', () => {
            const validationError = {
                success: false,
                code: 'MISSING_REQUIRED_FIELD',
                message: 'Missing required field'
            };

            const result = errorHandler.formatError(validationError);

            expect(result).toEqual(validationError);
        });

        test('should format NetSuite error object', () => {
            const nsError = {
                name: 'RCRD_DSNT_EXIST',
                message: 'Record does not exist',
                id: 'ERR-123'
            };

            const result = errorHandler.formatError(nsError, 'test_context');

            expect(result.success).toBe(false);
            expect(result.code).toBe('RECORD_NOT_FOUND');
            expect(result.message).toBe('Record does not exist');
            expect(result.error_id).toBe('ERR-123');
        });

        test('should format string error', () => {
            const result = errorHandler.formatError('Something went wrong', 'test_context');

            expect(result.success).toBe(false);
            expect(result.code).toBe('UNEXPECTED_ERROR');
            expect(result.message).toBe('Something went wrong');
        });

        test('should format Error object', () => {
            const err = new Error('Test error');

            const result = errorHandler.formatError(err, 'test_context');

            expect(result.success).toBe(false);
            expect(result.code).toBe('UNEXPECTED_ERROR');
            expect(result.message).toBe('Test error');
        });
    });

    describe('createError', () => {
        test('should create custom error with code and message', () => {
            const result = errorHandler.createError('CUSTOM_ERROR', 'This is a custom error');

            expect(result.success).toBe(false);
            expect(result.code).toBe('CUSTOM_ERROR');
            expect(result.message).toBe('This is a custom error');
        });

        test('should create custom error with additional data', () => {
            const result = errorHandler.createError(
                'DUPLICATE_RECORD',
                'Record already exists',
                { internal_id: '999' }
            );

            expect(result.success).toBe(false);
            expect(result.code).toBe('DUPLICATE_RECORD');
            expect(result.message).toBe('Record already exists');
            expect(result.internal_id).toBe('999');
        });
    });

    describe('wrapHandler', () => {
        test('should wrap handler and return success for valid result', () => {
            const handler = function(context) {
                return { internal_id: context.id };
            };

            const wrapped = errorHandler.wrapHandler(handler, 'test');
            const result = wrapped({ id: '123' });

            expect(result.success).toBe(true);
            expect(result.internal_id).toBe('123');
        });

        test('should wrap handler and catch errors', () => {
            const handler = function() {
                throw new Error('Handler failed');
            };

            const wrapped = errorHandler.wrapHandler(handler, 'test');
            const result = wrapped({});

            expect(result.success).toBe(false);
            expect(result.message).toBe('Handler failed');
        });

        test('should pass through already-formatted responses', () => {
            const handler = function() {
                return {
                    success: false,
                    code: 'CUSTOM_ERROR',
                    message: 'Custom error message'
                };
            };

            const wrapped = errorHandler.wrapHandler(handler, 'test');
            const result = wrapped({});

            expect(result.success).toBe(false);
            expect(result.code).toBe('CUSTOM_ERROR');
        });
    });
});
