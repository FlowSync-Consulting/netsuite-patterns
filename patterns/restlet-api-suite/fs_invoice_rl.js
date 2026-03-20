/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope Public
 *
 * Field Service API - Invoice RESTlet
 *
 * Generates invoices from fulfilled sales orders. Supports multi-line consolidation
 * when multiple fulfillments exist for a single sales order.
 *
 * @example POST Request
 * {
 *   "sales_order_external_id": "FS-SO-55555",
 *   "invoice_date": "2026-03-17",
 *   "memo": "Field service work completed"
 * }
 */
define(['N/record', 'N/search', './lib/validation', './lib/error_handler', './lib/external_id_matcher'],
    function(record, search, validation, errorHandler, externalIdMatcher) {
        'use strict';

        /**
         * POST: Create invoice from sales order
         *
         * @param {Object} context - Request body
         * @param {string} context.sales_order_external_id - Sales order external ID
         * @param {string} [context.invoice_date] - Invoice date (ISO format)
         * @param {string} [context.memo] - Invoice memo
         * @returns {Object} - Created invoice data or error
         */
        function post(context) {
            try {
                // Validate required fields
                const schema = {
                    required: ['sales_order_external_id'],
                    types: {
                        sales_order_external_id: 'string',
                        invoice_date: 'date',
                        memo: 'string'
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

                // Check if sales order has been fulfilled
                const fulfillmentCheck = search.create({
                    type: search.Type.ITEM_FULFILLMENT,
                    filters: [
                        ['createdfrom', search.Operator.ANYOF, salesOrderId],
                        'AND',
                        ['mainline', search.Operator.IS, 'T']
                    ],
                    columns: ['internalid']
                });

                const fulfillmentResults = fulfillmentCheck.run().getRange({ start: 0, end: 1 });

                if (!fulfillmentResults || fulfillmentResults.length === 0) {
                    return errorHandler.createError(
                        errorHandler.ErrorCode.INVALID_OPERATION,
                        'Cannot create invoice: Sales order has not been fulfilled'
                    );
                }

                // Transform sales order to invoice
                const invoiceRec = record.transform({
                    fromType: record.Type.SALES_ORDER,
                    fromId: salesOrderId,
                    toType: record.Type.INVOICE,
                    isDynamic: false
                });

                if (context.invoice_date) {
                    invoiceRec.setValue({
                        fieldId: 'trandate',
                        value: new Date(context.invoice_date)
                    });
                }

                if (context.memo) {
                    invoiceRec.setValue({
                        fieldId: 'memo',
                        value: context.memo
                    });
                }

                const invoiceId = invoiceRec.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: false
                });

                // Load invoice to get document number
                const invoiceRecLoaded = record.load({
                    type: record.Type.INVOICE,
                    id: invoiceId,
                    isDynamic: false
                });

                const documentNumber = invoiceRecLoaded.getValue({ fieldId: 'tranid' });
                const totalAmount = invoiceRecLoaded.getValue({ fieldId: 'total' });

                return errorHandler.formatSuccess({
                    internal_id: invoiceId,
                    document_number: documentNumber,
                    sales_order_id: salesOrderId,
                    total_amount: totalAmount,
                    created: true
                }, 'Invoice created successfully');
            } catch (err) {
                return errorHandler.formatError(err, 'fs_invoice_rl.post');
            }
        }

        return {
            post: post
        };
    }
);
