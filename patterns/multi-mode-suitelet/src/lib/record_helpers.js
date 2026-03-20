/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Record Helpers
 * Safe record operation wrappers with error handling and logging.
 *
 * Features:
 * - Standardized error handling
 * - Audit logging
 * - Type normalization
 * - Null-safe getValue/setText operations
 *
 * @module record_helpers
 */
define(['N/record', 'N/log'], function(record, log) {
    'use strict';

    /**
     * Create a record with field values
     * @param {string} recordType - The record type to create
     * @param {Object} fieldValues - Object mapping field IDs to values
     * @param {boolean} [isDynamic=false] - Whether to create in dynamic mode
     * @returns {number} The created record ID
     * @throws {Error} If record creation fails
     */
    function createRecord(recordType, fieldValues, isDynamic) {
        try {
            const rec = record.create({
                type: recordType,
                isDynamic: isDynamic || false
            });

            // Set field values
            for (const fieldId in fieldValues) {
                if (fieldValues.hasOwnProperty(fieldId)) {
                    const value = fieldValues[fieldId];

                    // Skip null/undefined values
                    if (value === null || value === undefined) {
                        continue;
                    }

                    rec.setValue({
                        fieldId: fieldId,
                        value: value
                    });
                }
            }

            const recordId = rec.save();

            log.audit({
                title: 'Record Created',
                details: 'Type: ' + recordType + ', ID: ' + recordId
            });

            return recordId;

        } catch (e) {
            log.error({
                title: 'Record Creation Error',
                details: 'Type: ' + recordType + ', Error: ' + e.message
            });
            throw e;
        }
    }

    /**
     * Update an existing record with field values
     * @param {string} recordType - The record type
     * @param {number|string} recordId - The record internal ID
     * @param {Object} fieldValues - Object mapping field IDs to values
     * @param {boolean} [isDynamic=false] - Whether to load in dynamic mode
     * @returns {number} The updated record ID
     * @throws {Error} If record update fails
     */
    function updateRecord(recordType, recordId, fieldValues, isDynamic) {
        try {
            const rec = record.load({
                type: recordType,
                id: recordId,
                isDynamic: isDynamic || false
            });

            // Set field values
            for (const fieldId in fieldValues) {
                if (fieldValues.hasOwnProperty(fieldId)) {
                    const value = fieldValues[fieldId];

                    // Skip null/undefined values (preserve existing)
                    if (value === null || value === undefined) {
                        continue;
                    }

                    rec.setValue({
                        fieldId: fieldId,
                        value: value
                    });
                }
            }

            rec.save();

            log.audit({
                title: 'Record Updated',
                details: 'Type: ' + recordType + ', ID: ' + recordId
            });

            return recordId;

        } catch (e) {
            log.error({
                title: 'Record Update Error',
                details: 'Type: ' + recordType + ', ID: ' + recordId + ', Error: ' + e.message
            });
            throw e;
        }
    }

    /**
     * Safely get a field value with null handling
     * @param {Record} rec - The NetSuite record
     * @param {string} fieldId - The field ID
     * @param {*} [defaultValue=''] - Default value if field is null/undefined
     * @returns {*} The field value or default
     */
    function safeGetValue(rec, fieldId, defaultValue) {
        try {
            const value = rec.getValue({ fieldId: fieldId });
            return (value === null || value === undefined) ? (defaultValue || '') : value;
        } catch (e) {
            log.debug({
                title: 'safeGetValue - Field Not Found',
                details: 'Field: ' + fieldId + ', Error: ' + e.message
            });
            return defaultValue || '';
        }
    }

    /**
     * Safely get a field text value with null handling
     * @param {Record} rec - The NetSuite record
     * @param {string} fieldId - The field ID
     * @param {string} [defaultValue=''] - Default value if field is null/undefined
     * @returns {string} The field text or default
     */
    function safeGetText(rec, fieldId, defaultValue) {
        try {
            const text = rec.getText({ fieldId: fieldId });
            return (text === null || text === undefined) ? (defaultValue || '') : text;
        } catch (e) {
            log.debug({
                title: 'safeGetText - Field Not Found',
                details: 'Field: ' + fieldId + ', Error: ' + e.message
            });
            return defaultValue || '';
        }
    }

    /**
     * Safely set a field value with error handling
     * Useful for optional fields that may not exist in all environments
     *
     * @param {Record} rec - The NetSuite record
     * @param {string} fieldId - The field ID
     * @param {*} value - The value to set
     * @param {boolean} [silent=true] - If true, log as debug instead of error
     * @returns {boolean} True if successful, false otherwise
     */
    function safeSetValue(rec, fieldId, value, silent) {
        try {
            rec.setValue({
                fieldId: fieldId,
                value: value
            });
            return true;
        } catch (e) {
            if (silent !== false) {
                log.debug({
                    title: 'safeSetValue - Field Not Available',
                    details: 'Field: ' + fieldId + ', Error: ' + e.message
                });
            } else {
                log.error({
                    title: 'safeSetValue - Error',
                    details: 'Field: ' + fieldId + ', Value: ' + value + ', Error: ' + e.message
                });
            }
            return false;
        }
    }

    /**
     * Safely set a sublist value with error handling
     * @param {Record} rec - The NetSuite record
     * @param {string} sublistId - The sublist ID
     * @param {string} fieldId - The field ID
     * @param {*} value - The value to set
     * @param {boolean} [silent=true] - If true, log as debug instead of error
     * @returns {boolean} True if successful, false otherwise
     */
    function safeSetCurrentSublistValue(rec, sublistId, fieldId, value, silent) {
        try {
            rec.setCurrentSublistValue({
                sublistId: sublistId,
                fieldId: fieldId,
                value: value
            });
            return true;
        } catch (e) {
            if (silent !== false) {
                log.debug({
                    title: 'safeSetCurrentSublistValue - Field Not Available',
                    details: 'Sublist: ' + sublistId + ', Field: ' + fieldId + ', Error: ' + e.message
                });
            } else {
                log.error({
                    title: 'safeSetCurrentSublistValue - Error',
                    details: 'Sublist: ' + sublistId + ', Field: ' + fieldId + ', Error: ' + e.message
                });
            }
            return false;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EXPORTS
    // ═══════════════════════════════════════════════════════════════════════════

    return {
        createRecord: createRecord,
        updateRecord: updateRecord,
        safeGetValue: safeGetValue,
        safeGetText: safeGetText,
        safeSetValue: safeSetValue,
        safeSetCurrentSublistValue: safeSetCurrentSublistValue
    };
});
