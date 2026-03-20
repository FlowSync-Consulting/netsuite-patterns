/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Integration Pipeline - Status State Machine
 *
 * Manages staging record lifecycle transitions with validation.
 *
 * Status Flow:
 * Pending → Processing → Complete
 *                     ↘ Failed
 *                     ↘ Duplicate
 *
 * Prevents invalid transitions (e.g., Complete → Pending)
 */
(function(factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD (NetSuite)
        define(['N/record', 'N/error'], factory);
    } else if (typeof module === 'object' && module.exports) {
        // CommonJS (Jest)
        module.exports = factory(
            require('../../../shared/mocks/record'),
            { create: (cfg) => new Error(cfg.message) }
        );
    }
})(function(record, error) {
    'use strict';

    const STAGING_RECORD_TYPE = 'customrecord_integration_staging';

    /**
     * Status value mapping (list internal values)
     */
    const Status = {
        PENDING: '1',
        PROCESSING: '2',
        COMPLETE: '3',
        FAILED: '4',
        DUPLICATE: '5'
    };

    /**
     * Status transition validation rules
     * Maps current status to allowed next statuses
     */
    const ALLOWED_TRANSITIONS = {
        '1': ['2'],           // Pending → Processing
        '2': ['3', '4', '5'], // Processing → Complete, Failed, Duplicate
        '3': [],              // Complete → (terminal state)
        '4': ['2'],           // Failed → Processing (retry)
        '5': []               // Duplicate → (terminal state)
    };

    /**
     * Transition staging record to new status
     *
     * @param {string} stagingId - Staging record internal ID
     * @param {string} newStatus - New status name (Pending, Processing, Complete, Failed, Duplicate)
     * @param {string} [errorMessage] - Error message (required for Failed status)
     * @param {string} [targetRecordId] - Target record ID (for Complete status)
     * @returns {boolean} - True if transition successful
     *
     * @example
     * transitionStatus('123', 'Processing');
     * transitionStatus('123', 'Failed', 'Validation error: missing vendor_id');
     * transitionStatus('123', 'Complete', null, '999');
     */
    function transitionStatus(stagingId, newStatus, errorMessage, targetRecordId) {
        if (!stagingId) {
            throw error.create({
                name: 'MISSING_STAGING_ID',
                message: 'Staging record ID is required'
            });
        }

        const statusValue = getStatusValue(newStatus);
        if (!statusValue) {
            throw error.create({
                name: 'INVALID_STATUS',
                message: 'Invalid status: ' + newStatus
            });
        }

        // Load staging record
        const stagingRec = record.load({
            type: STAGING_RECORD_TYPE,
            id: stagingId,
            isDynamic: false
        });

        const currentStatus = stagingRec.getValue({ fieldId: 'custrecord_staging_status' });

        // Validate transition
        if (!isValidTransition(currentStatus, statusValue)) {
            throw error.create({
                name: 'INVALID_TRANSITION',
                message: 'Cannot transition from ' + getStatusName(currentStatus) + ' to ' + newStatus
            });
        }

        // Update status
        stagingRec.setValue({
            fieldId: 'custrecord_staging_status',
            value: statusValue
        });

        // Set processed date for terminal states
        if (statusValue === Status.COMPLETE || statusValue === Status.FAILED || statusValue === Status.DUPLICATE) {
            stagingRec.setValue({
                fieldId: 'custrecord_staging_processed_date',
                value: new Date()
            });
        }

        // Store error message for Failed status
        if (statusValue === Status.FAILED && errorMessage) {
            stagingRec.setValue({
                fieldId: 'custrecord_staging_error_message',
                value: errorMessage.substring(0, 4000) // Limit to field length
            });
        }

        // Store target record ID for Complete status
        if (statusValue === Status.COMPLETE && targetRecordId) {
            stagingRec.setValue({
                fieldId: 'custrecord_staging_target_record_id',
                value: targetRecordId
            });
        }

        // Store existing record ID for Duplicate status
        if (statusValue === Status.DUPLICATE && errorMessage) {
            stagingRec.setValue({
                fieldId: 'custrecord_staging_error_message',
                value: errorMessage
            });
        }

        stagingRec.save({
            enableSourcing: false,
            ignoreMandatoryFields: true
        });

        return true;
    }

    /**
     * Check if a status transition is valid
     *
     * @param {string} currentStatus - Current status value
     * @param {string} newStatus - New status value
     * @returns {boolean} - True if transition is allowed
     */
    function isValidTransition(currentStatus, newStatus) {
        // Allow initial status setting (null/undefined → any status)
        if (!currentStatus) {
            return true;
        }

        const allowedNext = ALLOWED_TRANSITIONS[currentStatus];
        if (!allowedNext) {
            return false;
        }

        return allowedNext.indexOf(newStatus) !== -1;
    }

    /**
     * Get status internal value from name
     *
     * @param {string} statusName - Status name (Pending, Processing, etc.)
     * @returns {string|null} - Status internal value or null
     */
    function getStatusValue(statusName) {
        const normalized = statusName.toUpperCase().replace(/\s+/g, '_');
        return Status[normalized] || null;
    }

    /**
     * Get status name from internal value
     *
     * @param {string} statusValue - Status internal value
     * @returns {string} - Status name
     */
    function getStatusName(statusValue) {
        for (const key in Status) {
            if (Status[key] === statusValue) {
                return key.charAt(0) + key.slice(1).toLowerCase().replace('_', ' ');
            }
        }
        return 'Unknown';
    }

    /**
     * Batch update multiple staging records to same status
     *
     * @param {Array<string>} stagingIds - Array of staging record IDs
     * @param {string} newStatus - New status
     * @param {string} [errorMessage] - Error message
     * @returns {Object} - Results summary
     *
     * @example
     * batchTransition(['123', '456', '789'], 'Failed', 'Vendor not found')
     * // Returns: { success: 2, failed: 1, errors: [...] }
     */
    function batchTransition(stagingIds, newStatus, errorMessage) {
        if (!Array.isArray(stagingIds) || stagingIds.length === 0) {
            throw error.create({
                name: 'INVALID_INPUT',
                message: 'stagingIds must be a non-empty array'
            });
        }

        const results = {
            success: 0,
            failed: 0,
            errors: []
        };

        for (let i = 0; i < stagingIds.length; i++) {
            try {
                transitionStatus(stagingIds[i], newStatus, errorMessage);
                results.success++;
            } catch (err) {
                results.failed++;
                results.errors.push({
                    stagingId: stagingIds[i],
                    error: err.message
                });
            }
        }

        return results;
    }

    /**
     * Get current status of a staging record
     *
     * @param {string} stagingId - Staging record ID
     * @returns {Object} - Status information
     *
     * @example
     * getStatus('123')
     * // Returns: { value: '2', name: 'Processing', processedDate: null }
     */
    function getStatus(stagingId) {
        if (!stagingId) {
            throw error.create({
                name: 'MISSING_STAGING_ID',
                message: 'Staging record ID is required'
            });
        }

        const stagingRec = record.load({
            type: STAGING_RECORD_TYPE,
            id: stagingId,
            isDynamic: false
        });

        const statusValue = stagingRec.getValue({ fieldId: 'custrecord_staging_status' });
        const processedDate = stagingRec.getValue({ fieldId: 'custrecord_staging_processed_date' });
        const errorMessage = stagingRec.getValue({ fieldId: 'custrecord_staging_error_message' });
        const targetRecordId = stagingRec.getValue({ fieldId: 'custrecord_staging_target_record_id' });

        return {
            value: statusValue,
            name: getStatusName(statusValue),
            processedDate: processedDate,
            errorMessage: errorMessage,
            targetRecordId: targetRecordId
        };
    }

    return {
        transitionStatus: transitionStatus,
        batchTransition: batchTransition,
        getStatus: getStatus,
        isValidTransition: isValidTransition,
        Status: Status
    };
});
