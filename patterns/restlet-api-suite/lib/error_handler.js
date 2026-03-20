/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Field Service API - Error Handler
 *
 * Provides consistent error response formatting across all RESTlet endpoints.
 * Catches NetSuite errors and returns clean JSON with error codes and messages.
 */
(function(factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD (NetSuite)
        define(['N/log'], factory);
    } else if (typeof module === 'object' && module.exports) {
        // CommonJS (Jest)
        module.exports = factory(require('../../../shared/mocks/log'));
    }
})(function(log) {
    'use strict';

    /**
     * Standard error codes
     */
    const ErrorCode = {
        // Input validation errors
        MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
        INVALID_FIELD_TYPE: 'INVALID_FIELD_TYPE',
        INVALID_FIELD_VALUE: 'INVALID_FIELD_VALUE',

        // Record operation errors
        RECORD_NOT_FOUND: 'RECORD_NOT_FOUND',
        DUPLICATE_RECORD: 'DUPLICATE_RECORD',
        RECORD_CREATE_FAILED: 'RECORD_CREATE_FAILED',
        RECORD_UPDATE_FAILED: 'RECORD_UPDATE_FAILED',

        // Search errors
        NO_DATA_FOUND: 'NO_DATA_FOUND',
        SEARCH_FAILED: 'SEARCH_FAILED',

        // NetSuite errors
        INSUFFICIENT_PERMISSION: 'INSUFFICIENT_PERMISSION',
        FEATURE_DISABLED: 'FEATURE_DISABLED',
        UNEXPECTED_ERROR: 'UNEXPECTED_ERROR',

        // Business logic errors
        INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
        INSUFFICIENT_INVENTORY: 'INSUFFICIENT_INVENTORY',
        INVALID_OPERATION: 'INVALID_OPERATION'
    };

    /**
     * Map NetSuite error names to standard error codes
     */
    const NetSuiteErrorMap = {
        'RCRD_DSNT_EXIST': ErrorCode.RECORD_NOT_FOUND,
        'INVALID_KEY_OR_REF': ErrorCode.RECORD_NOT_FOUND,
        'INSUFFICIENT_PERMISSION': ErrorCode.INSUFFICIENT_PERMISSION,
        'FEATURE_DISABLED': ErrorCode.FEATURE_DISABLED,
        'INVALID_FLD_VALUE': ErrorCode.INVALID_FIELD_VALUE
    };

    /**
     * Format a success response
     *
     * @param {*} data - Response data
     * @param {string} [message] - Optional success message
     * @returns {Object} - Formatted success response
     *
     * @example
     * return formatSuccess({ customer_id: 123 }, 'Customer created');
     */
    function formatSuccess(data, message) {
        const response = {
            success: true
        };

        if (message) {
            response.message = message;
        }

        // Merge data into response
        if (data && typeof data === 'object') {
            for (const key in data) {
                if (data.hasOwnProperty(key)) {
                    response[key] = data[key];
                }
            }
        }

        return response;
    }

    /**
     * Format an error response
     *
     * @param {string|Error|Object} error - Error object, string, or validation error
     * @param {string} [context] - Optional context string for logging
     * @returns {Object} - Formatted error response
     *
     * @example
     * return formatError(err, 'customer_rl.post');
     */
    function formatError(error, context) {
        const response = {
            success: false,
            code: ErrorCode.UNEXPECTED_ERROR,
            message: 'An unexpected error occurred'
        };

        // If error is already a formatted validation error
        if (error && typeof error === 'object' && error.success === false) {
            return error;
        }

        // Handle NetSuite error objects
        if (error && typeof error === 'object' && error.name) {
            const mappedCode = NetSuiteErrorMap[error.name];
            response.code = mappedCode || error.name;
            response.message = error.message || 'NetSuite error occurred';

            // Include additional error details for debugging (sanitized)
            if (error.id) {
                response.error_id = error.id;
            }

            log.error({
                title: context ? context + ' - NetSuite Error' : 'NetSuite Error',
                details: {
                    name: error.name,
                    message: error.message,
                    id: error.id,
                    stack: error.stack
                }
            });
        }
        // Handle string errors
        else if (typeof error === 'string') {
            response.message = error;

            log.error({
                title: context ? context + ' - Error' : 'Error',
                details: error
            });
        }
        // Handle generic Error objects
        else if (error instanceof Error) {
            response.message = error.message;

            log.error({
                title: context ? context + ' - Error' : 'Error',
                details: {
                    message: error.message,
                    stack: error.stack
                }
            });
        }

        return response;
    }

    /**
     * Create a custom error response
     *
     * @param {string} code - Error code
     * @param {string} message - Error message
     * @param {Object} [additionalData] - Additional data to include
     * @returns {Object} - Formatted error response
     *
     * @example
     * return createError('DUPLICATE_RECORD', 'Customer already exists', { external_id: 'CUST-123' });
     */
    function createError(code, message, additionalData) {
        const response = {
            success: false,
            code: code,
            message: message
        };

        if (additionalData && typeof additionalData === 'object') {
            for (const key in additionalData) {
                if (additionalData.hasOwnProperty(key)) {
                    response[key] = additionalData[key];
                }
            }
        }

        return response;
    }

    /**
     * Wrap a RESTlet handler function with error handling
     *
     * @param {Function} handlerFn - RESTlet handler function (get, post, put, delete)
     * @param {string} context - Context string for logging (e.g., 'customer_rl.post')
     * @returns {Function} - Wrapped handler function
     *
     * @example
     * function post(context) {
     *   // Your RESTlet logic
     * }
     * return { post: wrapHandler(post, 'customer_rl.post') };
     */
    function wrapHandler(handlerFn, context) {
        return function(requestData) {
            try {
                const result = handlerFn(requestData);

                // If result is already a response object with success field, return as-is
                if (result && typeof result === 'object' && result.hasOwnProperty('success')) {
                    return result;
                }

                // Otherwise wrap in success response
                return formatSuccess(result);
            } catch (err) {
                return formatError(err, context);
            }
        };
    }

    return {
        formatSuccess: formatSuccess,
        formatError: formatError,
        createError: createError,
        wrapHandler: wrapHandler,
        ErrorCode: ErrorCode
    };
});
