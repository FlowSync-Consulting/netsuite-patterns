/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope Public
 *
 * Field Service API - Item Fulfillment RESTlet
 *
 * Creates item fulfillments against sales orders. Supports partial fulfillment
 * when the external system marks certain line items as shipped.
 *
 * @example POST Request (Full Fulfillment)
 * {
 *   "sales_order_external_id": "FS-SO-55555",
 *   "shipment_date": "2026-03-16",
 *   "tracking_number": "1Z999AA10123456784"
 * }
 *
 * @example POST Request (Partial Fulfillment)
 * {
 *   "sales_order_external_id": "FS-SO-55555",
 *   "shipment_date": "2026-03-16",
 *   "line_items": [
 *     { "line_number": 0, "quantity": 3 }
 *   ]
 * }
 */
define(['N/record', 'N/search', './lib/validation', './lib/error_handler', './lib/external_id_matcher'],
    function(record, search, validation, errorHandler, externalIdMatcher) {
        'use strict';

        /**
         * POST: Create item fulfillment from sales order
         *
         * @param {Object} context - Request body
         * @param {string} context.sales_order_external_id - Sales order external ID
         * @param {string} [context.shipment_date] - Shipment date (ISO format)
         * @param {string} [context.tracking_number] - Shipping tracking number
         * @param {Array<Object>} [context.line_items] - Line items to fulfill (partial fulfillment)
         * @returns {Object} - Created fulfillment data or error
         */
        function post(context) {
            try {
                // Validate required fields
                const schema = {
                    required: ['sales_order_external_id'],
                    types: {
                        sales_order_external_id: 'string',
                        shipment_date: 'date',
                        tracking_number: 'string',
                        line_items: 'array'
                    }
                };

                const validationErr = validation.validate(context, schema);
                if (validationErr) return validationErr;

                // Find sales order
                const salesOrderId = externalIdMatcher.findByExternalId('salesorder', context.sales_order_external_id);

                if (!salesOrderId) {
                    return errorHandler.createError(
                        errorHandler.ErrorCode.RECORD_NOT_FOUND,
                        'Sales order not found with external_id: ' + context.sales_order_external_id
                    );
                }

                // Transform sales order to item fulfillment
                const fulfillmentRec = record.transform({
                    fromType: record.Type.SALES_ORDER,
                    fromId: salesOrderId,
                    toType: record.Type.ITEM_FULFILLMENT,
                    isDynamic: false
                });

                if (context.shipment_date) {
                    fulfillmentRec.setValue({
                        fieldId: 'trandate',
                        value: new Date(context.shipment_date)
                    });
                }

                if (context.tracking_number) {
                    // Set tracking number on package sublist
                    const packageCount = fulfillmentRec.getLineCount({ sublistId: 'package' });
                    if (packageCount > 0) {
                        fulfillmentRec.setSublistValue({
                            sublistId: 'package',
                            fieldId: 'packagetrackingnumber',
                            line: 0,
                            value: context.tracking_number
                        });
                    }
                }

                // Handle partial fulfillment
                if (context.line_items && context.line_items.length > 0) {
                    const itemLineCount = fulfillmentRec.getLineCount({ sublistId: 'item' });

                    // Create a map of line numbers to fulfill
                    const fulfillMap = {};
                    for (let i = 0; i < context.line_items.length; i++) {
                        const lineItem = context.line_items[i];
                        fulfillMap[lineItem.line_number] = lineItem.quantity;
                    }

                    // Mark lines for fulfillment
                    for (let i = 0; i < itemLineCount; i++) {
                        const lineNumber = i;

                        if (fulfillMap.hasOwnProperty(lineNumber)) {
                            // Mark this line for fulfillment
                            fulfillmentRec.setSublistValue({
                                sublistId: 'item',
                                fieldId: 'itemreceive',
                                line: i,
                                value: true
                            });

                            // Set quantity to fulfill
                            fulfillmentRec.setSublistValue({
                                sublistId: 'item',
                                fieldId: 'quantity',
                                line: i,
                                value: fulfillMap[lineNumber]
                            });
                        } else {
                            // Do not fulfill this line
                            fulfillmentRec.setSublistValue({
                                sublistId: 'item',
                                fieldId: 'itemreceive',
                                line: i,
                                value: false
                            });
                        }
                    }
                }

                const fulfillmentId = fulfillmentRec.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: false
                });

                return errorHandler.formatSuccess({
                    internal_id: fulfillmentId,
                    sales_order_id: salesOrderId,
                    created: true,
                    partial_fulfillment: !!(context.line_items && context.line_items.length > 0)
                }, 'Item fulfillment created successfully');
            } catch (err) {
                return errorHandler.formatError(err, 'fs_fulfillment_rl.post');
            }
        }

        return {
            post: post
        };
    }
);
