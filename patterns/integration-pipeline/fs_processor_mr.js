/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope Public
 *
 * Integration Pipeline - Processor Map/Reduce
 *
 * Multi-stage processor that transforms staging records into target NetSuite records.
 * Uses segmentation for batch processing and duplicate detection to prevent record duplication.
 *
 * Stages:
 * 1. getInputData - Query pending staging records
 * 2. map - Validate, enrich, and prepare each record
 * 3. reduce - Group by segmentation key and create/update target records
 * 4. summarize - Update staging statuses and send notifications
 *
 * Processing Flow:
 * Pending → Processing → Complete/Failed/Duplicate
 */
define(['N/record', 'N/search', 'N/runtime', 'N/error',
        './lib/segmentation', './lib/duplicate_detector', './lib/status_machine'],
    function(record, search, runtime, error, segmentation, duplicateDetector, statusMachine) {
        'use strict';

        const STAGING_RECORD_TYPE = 'customrecord_integration_staging';

        /**
         * Get pending staging records for processing
         *
         * @returns {Object} - Search results
         */
        function getInputData() {
            const script = runtime.getCurrentScript();
            const entityTypeFilter = script.getParameter({ name: 'custscript_entity_type_filter' });
            const priorityFilter = script.getParameter({ name: 'custscript_priority_filter' });

            const filters = [
                ['custrecord_staging_status', search.Operator.ANYOF, '1'], // Pending
                'AND',
                ['isinactive', search.Operator.IS, 'F']
            ];

            if (entityTypeFilter) {
                filters.push('AND', ['custrecord_staging_entity_type', search.Operator.IS, entityTypeFilter]);
            }

            if (priorityFilter) {
                filters.push('AND', ['custrecord_staging_priority', search.Operator.IS, priorityFilter]);
            }

            return search.create({
                type: STAGING_RECORD_TYPE,
                filters: filters,
                columns: [
                    'custrecord_staging_tracking_id',
                    'custrecord_staging_source_system',
                    'custrecord_staging_entity_type',
                    'custrecord_staging_payload',
                    'custrecord_staging_priority',
                    'custrecord_staging_received_date'
                ]
            });
        }

        /**
         * Validate and enrich each staging record
         *
         * @param {Object} context
         * @param {string} context.key - Staging record internal ID
         * @param {Object} context.value - Search result data
         */
        function map(context) {
            try {
                const stagingId = context.key;
                const searchResult = JSON.parse(context.value);

                // Update status to Processing
                statusMachine.transitionStatus(stagingId, 'Processing');

                // Parse payload
                const payload = JSON.parse(searchResult.values.custrecord_staging_payload);
                const entityType = searchResult.values.custrecord_staging_entity_type;

                // Validate payload schema
                const validationResult = validatePayload(entityType, payload);
                if (!validationResult.valid) {
                    statusMachine.transitionStatus(stagingId, 'Failed', validationResult.errors.join('; '));
                    return;
                }

                // Check for duplicates using external ID and payload hash
                const duplicateCheck = duplicateDetector.checkDuplicate({
                    entityType: entityType,
                    externalId: payload.external_id || searchResult.values.custrecord_staging_tracking_id,
                    payload: payload
                });

                if (duplicateCheck.isDuplicate) {
                    statusMachine.transitionStatus(
                        stagingId,
                        'Duplicate',
                        'Duplicate record found: ' + duplicateCheck.existingRecordId
                    );
                    return;
                }

                // Enrich payload with lookup values
                const enrichedPayload = enrichPayload(entityType, payload);

                // Generate segmentation key for batch processing
                const segmentKey = segmentation.generateKey(entityType, enrichedPayload);

                // Write to reduce stage
                context.write({
                    key: segmentKey,
                    value: {
                        staging_id: stagingId,
                        entity_type: entityType,
                        payload: enrichedPayload,
                        tracking_id: searchResult.values.custrecord_staging_tracking_id
                    }
                });

            } catch (err) {
                log.error({
                    title: 'Map Stage Error',
                    details: 'Staging ID: ' + context.key + ' | Error: ' + err.message
                });

                statusMachine.transitionStatus(context.key, 'Failed', err.message);
            }
        }

        /**
         * Process grouped records and create/update target records
         *
         * @param {Object} context
         * @param {string} context.key - Segmentation key
         * @param {Array} context.values - Array of enriched payloads
         */
        function reduce(context) {
            try {
                const segmentKey = context.key;
                const records = context.values.map(function(val) { return JSON.parse(val); });

                log.audit({
                    title: 'Processing Segment',
                    details: 'Key: ' + segmentKey + ' | Count: ' + records.length
                });

                // Process each record in the segment
                for (let i = 0; i < records.length; i++) {
                    const recordData = records[i];

                    try {
                        // Create target record based on entity type
                        const targetRecordId = createTargetRecord(recordData.entity_type, recordData.payload);

                        // Update staging record with success
                        statusMachine.transitionStatus(
                            recordData.staging_id,
                            'Complete',
                            null,
                            targetRecordId
                        );

                        log.audit({
                            title: 'Record Created',
                            details: 'Tracking: ' + recordData.tracking_id + ' | Target ID: ' + targetRecordId
                        });

                    } catch (err) {
                        log.error({
                            title: 'Record Creation Failed',
                            details: 'Tracking: ' + recordData.tracking_id + ' | Error: ' + err.message
                        });

                        statusMachine.transitionStatus(
                            recordData.staging_id,
                            'Failed',
                            err.message
                        );
                    }
                }

            } catch (err) {
                log.error({
                    title: 'Reduce Stage Error',
                    details: 'Segment: ' + context.key + ' | Error: ' + err.message
                });
            }
        }

        /**
         * Summarize processing results and send notifications
         *
         * @param {Object} summary
         */
        function summarize(summary) {
            log.audit({
                title: 'Processing Summary',
                details: 'Total: ' + summary.inputSummary.count + ' records processed'
            });

            // Log map stage errors
            summary.mapSummary.errors.iterator().each(function(key, err) {
                log.error({
                    title: 'Map Error - Staging ID: ' + key,
                    details: err
                });
                return true;
            });

            // Log reduce stage errors
            summary.reduceSummary.errors.iterator().each(function(key, err) {
                log.error({
                    title: 'Reduce Error - Segment: ' + key,
                    details: err
                });
                return true;
            });

            // Query final status counts
            const statusCounts = getStatusCounts();

            log.audit({
                title: 'Final Status Distribution',
                details: JSON.stringify(statusCounts)
            });

            // Send notification if failures occurred
            if (statusCounts.Failed > 0) {
                sendFailureNotification(statusCounts);
            }
        }

        /**
         * Validate payload against entity type schema
         *
         * @param {string} entityType - Entity type
         * @param {Object} payload - Payload data
         * @returns {Object} - Validation result
         */
        function validatePayload(entityType, payload) {
            const errors = [];

            // Basic validation - extend based on entity type
            if (entityType === 'invoice') {
                if (!payload.vendor_id) errors.push('Missing vendor_id');
                if (!payload.invoice_date) errors.push('Missing invoice_date');
                if (!payload.amount || payload.amount <= 0) errors.push('Invalid amount');
            } else if (entityType === 'vendor') {
                if (!payload.company_name) errors.push('Missing company_name');
            }

            return {
                valid: errors.length === 0,
                errors: errors
            };
        }

        /**
         * Enrich payload with NetSuite lookups
         *
         * @param {string} entityType - Entity type
         * @param {Object} payload - Raw payload
         * @returns {Object} - Enriched payload
         */
        function enrichPayload(entityType, payload) {
            const enriched = JSON.parse(JSON.stringify(payload)); // Deep clone

            // Example: Resolve vendor external ID to internal ID
            if (payload.vendor_id && entityType === 'invoice') {
                const vendorSearch = search.create({
                    type: search.Type.VENDOR,
                    filters: [
                        ['externalid', search.Operator.IS, payload.vendor_id]
                    ],
                    columns: ['internalid']
                });

                const results = vendorSearch.run().getRange({ start: 0, end: 1 });
                if (results && results.length > 0) {
                    enriched.vendor_internal_id = results[0].id;
                }
            }

            return enriched;
        }

        /**
         * Create target NetSuite record
         *
         * @param {string} entityType - Entity type
         * @param {Object} payload - Enriched payload
         * @returns {string} - Created record internal ID
         */
        function createTargetRecord(entityType, payload) {
            let targetRecord;

            if (entityType === 'invoice') {
                targetRecord = record.create({
                    type: record.Type.VENDOR_BILL,
                    isDynamic: false
                });

                targetRecord.setValue({
                    fieldId: 'entity',
                    value: payload.vendor_internal_id
                });

                targetRecord.setValue({
                    fieldId: 'trandate',
                    value: new Date(payload.invoice_date)
                });

                // Add line items
                if (payload.line_items && payload.line_items.length > 0) {
                    for (let i = 0; i < payload.line_items.length; i++) {
                        const line = payload.line_items[i];
                        targetRecord.setSublistValue({
                            sublistId: 'expense',
                            fieldId: 'account',
                            line: i,
                            value: line.account_id
                        });

                        targetRecord.setSublistValue({
                            sublistId: 'expense',
                            fieldId: 'amount',
                            line: i,
                            value: line.amount
                        });
                    }
                }
            } else {
                throw error.create({
                    name: 'UNSUPPORTED_ENTITY_TYPE',
                    message: 'Entity type not supported: ' + entityType
                });
            }

            return targetRecord.save({
                enableSourcing: true,
                ignoreMandatoryFields: false
            });
        }

        /**
         * Get status counts for final summary
         *
         * @returns {Object} - Status counts
         */
        function getStatusCounts() {
            const counts = {
                Pending: 0,
                Processing: 0,
                Complete: 0,
                Failed: 0,
                Duplicate: 0
            };

            const statusSearch = search.create({
                type: STAGING_RECORD_TYPE,
                filters: [
                    ['isinactive', search.Operator.IS, 'F']
                ],
                columns: [
                    search.createColumn({
                        name: 'custrecord_staging_status',
                        summary: search.Summary.GROUP
                    }),
                    search.createColumn({
                        name: 'internalid',
                        summary: search.Summary.COUNT
                    })
                ]
            });

            statusSearch.run().each(function(result) {
                const status = result.getText({
                    name: 'custrecord_staging_status',
                    summary: search.Summary.GROUP
                });
                const count = parseInt(result.getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                }));
                counts[status] = count;
                return true;
            });

            return counts;
        }

        /**
         * Send notification for failed records
         *
         * @param {Object} statusCounts - Status distribution
         */
        function sendFailureNotification(statusCounts) {
            // Placeholder - implement via N/email or custom notification system
            log.audit({
                title: 'Failure Notification',
                details: 'Failed records: ' + statusCounts.Failed
            });
        }

        return {
            getInputData: getInputData,
            map: map,
            reduce: reduce,
            summarize: summarize
        };
    }
);
