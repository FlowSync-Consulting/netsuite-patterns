/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope Public
 *
 * Field Service API - Sales Order RESTlet
 *
 * Creates sales orders from external field service system.
 * Handles line item creation, inventory validation, and job linkage.
 *
 * @example POST Request
 * {
 *   "external_id": "FS-SO-55555",
 *   "customer_external_id": "FS-CUST-12345",
 *   "job_external_id": "FS-JOB-98765",
 *   "order_date": "2026-03-15",
 *   "line_items": [
 *     {
 *       "item_id": "100",
 *       "quantity": 5,
 *       "rate": 49.99,
 *       "description": "Water extraction equipment rental"
 *     }
 *   ]
 * }
 */
define(['N/record', 'N/search', './lib/validation', './lib/error_handler', './lib/external_id_matcher'],
    function(record, search, validation, errorHandler, externalIdMatcher) {
        'use strict';

        /**
         * POST: Create sales order
         *
         * @param {Object} context - Request body
         * @param {string} context.external_id - External system sales order ID
         * @param {string} context.customer_external_id - Customer external ID
         * @param {string} [context.job_external_id] - Job external ID (optional)
         * @param {string} [context.order_date] - Order date (ISO format)
         * @param {Array<Object>} context.line_items - Line items array
         * @returns {Object} - Created sales order data or error
         */
        function post(context) {
            try {
                // Validate required fields
                const schema = {
                    required: ['external_id', 'customer_external_id', 'line_items'],
                    types: {
                        external_id: 'string',
                        customer_external_id: 'string',
                        job_external_id: 'string',
                        order_date: 'date',
                        line_items: 'array'
                    },
                    rules: {
                        line_items: function(val) {
                            return val.length > 0;
                        }
                    }
                };

                const validationErr = validation.validate(context, schema);
                if (validationErr) return validationErr;

                // Check if sales order already exists
                const existingId = externalIdMatcher.findByExternalId('salesorder', context.external_id);

                if (existingId) {
                    return errorHandler.createError(
                        errorHandler.ErrorCode.DUPLICATE_RECORD,
                        'Sales order already exists with external_id: ' + context.external_id,
                        { internal_id: existingId }
                    );
                }

                // Find customer
                const customerId = externalIdMatcher.findByExternalId('customer', context.customer_external_id);

                if (!customerId) {
                    return errorHandler.createError(
                        errorHandler.ErrorCode.RECORD_NOT_FOUND,
                        'Customer not found with external_id: ' + context.customer_external_id
                    );
                }

                // Find job (if provided)
                let jobId = null;
                if (context.job_external_id) {
                    jobId = externalIdMatcher.findByExternalId('job', context.job_external_id);

                    if (!jobId) {
                        return errorHandler.createError(
                            errorHandler.ErrorCode.RECORD_NOT_FOUND,
                            'Job not found with external_id: ' + context.job_external_id
                        );
                    }
                }

                // Create sales order
                const soRec = record.create({
                    type: record.Type.SALES_ORDER,
                    isDynamic: false
                });

                soRec.setValue({ fieldId: 'externalid', value: context.external_id });
                soRec.setValue({ fieldId: 'entity', value: customerId });

                if (jobId) {
                    soRec.setValue({ fieldId: 'job', value: jobId });
                }

                if (context.order_date) {
                    soRec.setValue({ fieldId: 'trandate', value: new Date(context.order_date) });
                }

                // Add line items
                const lineItems = context.line_items;
                for (let i = 0; i < lineItems.length; i++) {
                    const lineItem = lineItems[i];

                    // Validate line item fields
                    if (!lineItem.item_id || !lineItem.quantity) {
                        return errorHandler.createError(
                            errorHandler.ErrorCode.INVALID_FIELD_VALUE,
                            'Line item ' + i + ' is missing required fields (item_id, quantity)'
                        );
                    }

                    soRec.setSublistValue({
                        sublistId: 'item',
                        fieldId: 'item',
                        line: i,
                        value: lineItem.item_id
                    });

                    soRec.setSublistValue({
                        sublistId: 'item',
                        fieldId: 'quantity',
                        line: i,
                        value: lineItem.quantity
                    });

                    if (lineItem.rate) {
                        soRec.setSublistValue({
                            sublistId: 'item',
                            fieldId: 'rate',
                            line: i,
                            value: lineItem.rate
                        });
                    }

                    if (lineItem.description) {
                        soRec.setSublistValue({
                            sublistId: 'item',
                            fieldId: 'description',
                            line: i,
                            value: lineItem.description
                        });
                    }
                }

                const salesOrderId = soRec.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: false
                });

                return errorHandler.formatSuccess({
                    internal_id: salesOrderId,
                    external_id: context.external_id,
                    created: true,
                    line_count: lineItems.length
                }, 'Sales order created successfully');
            } catch (err) {
                return errorHandler.formatError(err, 'fs_sales_order_rl.post');
            }
        }

        return {
            post: post
        };
    }
);
