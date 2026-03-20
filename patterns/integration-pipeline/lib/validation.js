/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Field Service API - Input Validation Framework
 *
 * Provides consistent input validation across all RESTlet endpoints with
 * structured error responses and custom validation rules.
 */
(function(factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD (NetSuite)
        define(['N/error'], factory);
    } else if (typeof module === 'object' && module.exports) {
        // CommonJS (Jest)
        module.exports = factory({});
    }
})(function(error) {
    'use strict';

    /**
     * Validation error codes
     */
    const ErrorCode = {
        MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
        INVALID_FIELD_TYPE: 'INVALID_FIELD_TYPE',
        INVALID_FIELD_VALUE: 'INVALID_FIELD_VALUE',
        INVALID_DATE_FORMAT: 'INVALID_DATE_FORMAT',
        INVALID_EMAIL_FORMAT: 'INVALID_EMAIL_FORMAT',
        VALIDATION_FAILED: 'VALIDATION_FAILED'
    };

    /**
     * Field type validators
     */
    const TypeValidators = {
        string: function(value) {
            return typeof value === 'string';
        },
        number: function(value) {
            return typeof value === 'number' && !isNaN(value);
        },
        boolean: function(value) {
            return typeof value === 'boolean';
        },
        array: function(value) {
            return Array.isArray(value);
        },
        object: function(value) {
            return typeof value === 'object' && value !== null && !Array.isArray(value);
        },
        date: function(value) {
            if (typeof value === 'string') {
                const date = new Date(value);
                return !isNaN(date.getTime());
            }
            return value instanceof Date && !isNaN(value.getTime());
        },
        email: function(value) {
            if (typeof value !== 'string') return false;
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(value);
        }
    };

    /**
     * Validate required fields are present
     *
     * @param {Object} data - Input data object
     * @param {Array<string>} requiredFields - Array of required field names
     * @returns {Object|null} - Error object if validation fails, null if passes
     *
     * @example
     * const err = validateRequired(context, ['customer_id', 'job_number']);
     * if (err) return err;
     */
    function validateRequired(data, requiredFields) {
        const missing = [];

        for (let i = 0; i < requiredFields.length; i++) {
            const field = requiredFields[i];
            if (data[field] === undefined || data[field] === null || data[field] === '') {
                missing.push(field);
            }
        }

        if (missing.length > 0) {
            return {
                success: false,
                code: ErrorCode.MISSING_REQUIRED_FIELD,
                message: 'Missing required fields: ' + missing.join(', '),
                fields: missing
            };
        }

        return null;
    }

    /**
     * Validate field types match expected types
     *
     * @param {Object} data - Input data object
     * @param {Object} typeMap - Map of field names to expected types
     * @returns {Object|null} - Error object if validation fails, null if passes
     *
     * @example
     * const err = validateTypes(context, {
     *   customer_id: 'string',
     *   amount: 'number',
     *   line_items: 'array'
     * });
     */
    function validateTypes(data, typeMap) {
        const invalid = [];

        for (const field in typeMap) {
            if (!typeMap.hasOwnProperty(field)) continue;

            const value = data[field];
            if (value === undefined || value === null) continue; // Skip undefined/null (use validateRequired for required checks)

            const expectedType = typeMap[field];
            const validator = TypeValidators[expectedType];

            if (!validator) {
                throw error.create({
                    name: 'INVALID_VALIDATOR',
                    message: 'Unknown type validator: ' + expectedType
                });
            }

            if (!validator(value)) {
                invalid.push({
                    field: field,
                    expected: expectedType,
                    received: typeof value
                });
            }
        }

        if (invalid.length > 0) {
            return {
                success: false,
                code: ErrorCode.INVALID_FIELD_TYPE,
                message: 'Invalid field types detected',
                fields: invalid
            };
        }

        return null;
    }

    /**
     * Validate field values against custom rules
     *
     * @param {Object} data - Input data object
     * @param {Object} rules - Map of field names to validation functions
     * @returns {Object|null} - Error object if validation fails, null if passes
     *
     * @example
     * const err = validateRules(context, {
     *   amount: function(val) { return val > 0; },
     *   status: function(val) { return ['pending', 'approved'].indexOf(val) !== -1; }
     * });
     */
    function validateRules(data, rules) {
        const failed = [];

        for (const field in rules) {
            if (!rules.hasOwnProperty(field)) continue;

            const value = data[field];
            if (value === undefined || value === null) continue;

            const validatorFn = rules[field];

            if (typeof validatorFn !== 'function') {
                throw error.create({
                    name: 'INVALID_VALIDATOR',
                    message: 'Validator for field "' + field + '" must be a function'
                });
            }

            if (!validatorFn(value)) {
                failed.push(field);
            }
        }

        if (failed.length > 0) {
            return {
                success: false,
                code: ErrorCode.INVALID_FIELD_VALUE,
                message: 'Field validation failed for: ' + failed.join(', '),
                fields: failed
            };
        }

        return null;
    }

    /**
     * Validate date string format (ISO 8601 or standard JavaScript date strings)
     *
     * @param {string} dateString - Date string to validate
     * @returns {Object|null} - Error object if validation fails, null if passes
     */
    function validateDateFormat(dateString) {
        if (typeof dateString !== 'string') {
            return {
                success: false,
                code: ErrorCode.INVALID_DATE_FORMAT,
                message: 'Date must be a string'
            };
        }

        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
            return {
                success: false,
                code: ErrorCode.INVALID_DATE_FORMAT,
                message: 'Invalid date format: ' + dateString
            };
        }

        return null;
    }

    /**
     * Comprehensive validation for RESTlet input
     *
     * @param {Object} data - Input data object
     * @param {Object} schema - Validation schema
     * @param {Array<string>} schema.required - Required fields
     * @param {Object} schema.types - Field type map
     * @param {Object} schema.rules - Custom validation rules
     * @returns {Object|null} - Error object if validation fails, null if passes
     *
     * @example
     * const schema = {
     *   required: ['customer_id', 'amount'],
     *   types: { customer_id: 'string', amount: 'number' },
     *   rules: { amount: function(val) { return val > 0; } }
     * };
     * const err = validate(context, schema);
     * if (err) return err;
     */
    function validate(data, schema) {
        // Validate required fields
        if (schema.required) {
            const reqErr = validateRequired(data, schema.required);
            if (reqErr) return reqErr;
        }

        // Validate field types
        if (schema.types) {
            const typeErr = validateTypes(data, schema.types);
            if (typeErr) return typeErr;
        }

        // Validate custom rules
        if (schema.rules) {
            const ruleErr = validateRules(data, schema.rules);
            if (ruleErr) return ruleErr;
        }

        return null;
    }

    return {
        validate: validate,
        validateRequired: validateRequired,
        validateTypes: validateTypes,
        validateRules: validateRules,
        validateDateFormat: validateDateFormat,
        ErrorCode: ErrorCode
    };
});
