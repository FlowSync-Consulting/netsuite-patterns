/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope Public
 *
 * Integration Pipeline - Inbound RESTlet
 *
 * Receives JSON payloads from external systems and creates staging records for processing.
 * Supports idempotent operations via tracking ID validation to prevent duplicate submissions.
 *
 * @example POST Request
 * {
 *   "tracking_id": "EXT-INV-2026-03-001",
 *   "source_system": "ERP",
 *   "entity_type": "invoice",
 *   "payload": {
 *     "vendor_id": "V-12345",
 *     "invoice_date": "2026-03-15",
 *     "amount": 1250.00,
 *     "line_items": [...]
 *   }
 * }
 *
 * @example Response (Success)
 * {
 *   "success": true,
 *   "tracking_id": "EXT-INV-2026-03-001",
 *   "staging_id": "987",
 *   "status": "Pending",
 *   "message": "Payload received successfully"
 * }
 *
 * @example Response (Duplicate)
 * {
 *   "success": false,
 *   "code": "DUPLICATE_TRACKING_ID",
 *   "tracking_id": "EXT-INV-2026-03-001",
 *   "existing_staging_id": "456",
 *   "message": "Tracking ID already exists"
 * }
 */
define(['N/record', 'N/search', 'N/runtime', './lib/validation', './lib/error_handler'],
    function(record, search, runtime, validation, errorHandler) {
        'use strict';

        const STAGING_RECORD_TYPE = 'customrecord_integration_staging';

        /**
         * POST: Receive inbound payload and create staging record
         *
         * @param {Object} context - Request body
         * @param {string} context.tracking_id - Unique external tracking identifier
         * @param {string} context.source_system - Source system name (e.g., 'ERP', 'CRM')
         * @param {string} context.entity_type - Target entity type (e.g., 'invoice', 'vendor')
         * @param {Object} context.payload - JSON payload to process
         * @param {string} [context.priority] - Processing priority (high, normal, low)
         * @returns {Object} - Acknowledgment with staging ID or error
         */
        function post(context) {
            try {
                // Validate required fields
                const schema = {
                    required: ['tracking_id', 'source_system', 'entity_type', 'payload'],
                    types: {
                        tracking_id: 'string',
                        source_system: 'string',
                        entity_type: 'string',
                        payload: 'object',
                        priority: 'string'
                    },
                    rules: {
                        priority: function(val) {
                            return ['high', 'normal', 'low'].indexOf(val) !== -1;
                        }
                    }
                };

                const validationErr = validation.validate(context, schema);
                if (validationErr) return validationErr;

                // Check for duplicate tracking ID (idempotent operation)
                const duplicateCheck = search.create({
                    type: STAGING_RECORD_TYPE,
                    filters: [
                        ['custrecord_staging_tracking_id', search.Operator.IS, context.tracking_id]
                    ],
                    columns: ['internalid', 'custrecord_staging_status']
                });

                const existingResults = duplicateCheck.run().getRange({ start: 0, end: 1 });

                if (existingResults && existingResults.length > 0) {
                    const existingId = existingResults[0].id;
                    const existingStatus = existingResults[0].getValue({ name: 'custrecord_staging_status' });

                    return {
                        success: false,
                        code: 'DUPLICATE_TRACKING_ID',
                        tracking_id: context.tracking_id,
                        existing_staging_id: existingId,
                        existing_status: existingStatus,
                        message: 'Tracking ID already exists: ' + context.tracking_id
                    };
                }

                // Create staging record
                const stagingRec = record.create({
                    type: STAGING_RECORD_TYPE,
                    isDynamic: false
                });

                stagingRec.setValue({
                    fieldId: 'custrecord_staging_tracking_id',
                    value: context.tracking_id
                });

                stagingRec.setValue({
                    fieldId: 'custrecord_staging_source_system',
                    value: context.source_system
                });

                stagingRec.setValue({
                    fieldId: 'custrecord_staging_entity_type',
                    value: context.entity_type
                });

                stagingRec.setValue({
                    fieldId: 'custrecord_staging_payload',
                    value: JSON.stringify(context.payload)
                });

                stagingRec.setValue({
                    fieldId: 'custrecord_staging_status',
                    value: '1' // Pending
                });

                stagingRec.setValue({
                    fieldId: 'custrecord_staging_priority',
                    value: context.priority || 'normal'
                });

                stagingRec.setValue({
                    fieldId: 'custrecord_staging_received_date',
                    value: new Date()
                });

                const stagingId = stagingRec.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: false
                });

                return errorHandler.formatSuccess({
                    tracking_id: context.tracking_id,
                    staging_id: stagingId,
                    status: 'Pending',
                    received_date: new Date().toISOString()
                }, 'Payload received successfully');

            } catch (err) {
                return errorHandler.formatError(err, 'fs_inbound_rl.post');
            }
        }

        /**
         * GET: Retrieve staging record status by tracking ID
         *
         * @param {Object} context - Request parameters
         * @param {string} context.tracking_id - Tracking identifier
         * @returns {Object} - Staging record status or error
         */
        function get(context) {
            try {
                const schema = {
                    required: ['tracking_id'],
                    types: {
                        tracking_id: 'string'
                    }
                };

                const validationErr = validation.validate(context, schema);
                if (validationErr) return validationErr;

                const statusSearch = search.create({
                    type: STAGING_RECORD_TYPE,
                    filters: [
                        ['custrecord_staging_tracking_id', search.Operator.IS, context.tracking_id]
                    ],
                    columns: [
                        'internalid',
                        'custrecord_staging_status',
                        'custrecord_staging_entity_type',
                        'custrecord_staging_received_date',
                        'custrecord_staging_processed_date',
                        'custrecord_staging_error_message',
                        'custrecord_staging_target_record_id'
                    ]
                });

                const results = statusSearch.run().getRange({ start: 0, end: 1 });

                if (!results || results.length === 0) {
                    return errorHandler.createError(
                        errorHandler.ErrorCode.RECORD_NOT_FOUND,
                        'No staging record found with tracking_id: ' + context.tracking_id
                    );
                }

                const result = results[0];

                return errorHandler.formatSuccess({
                    tracking_id: context.tracking_id,
                    staging_id: result.id,
                    status: result.getText({ name: 'custrecord_staging_status' }),
                    entity_type: result.getValue({ name: 'custrecord_staging_entity_type' }),
                    received_date: result.getValue({ name: 'custrecord_staging_received_date' }),
                    processed_date: result.getValue({ name: 'custrecord_staging_processed_date' }),
                    target_record_id: result.getValue({ name: 'custrecord_staging_target_record_id' }),
                    error_message: result.getValue({ name: 'custrecord_staging_error_message' })
                }, 'Status retrieved successfully');

            } catch (err) {
                return errorHandler.formatError(err, 'fs_inbound_rl.get');
            }
        }

        return {
            post: post,
            get: get
        };
    }
);
