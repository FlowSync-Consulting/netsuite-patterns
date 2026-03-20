/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope Public
 *
 * Field Service API - Customer Payment RESTlet
 *
 * Applies customer payments against invoices. Handles overpayment scenarios
 * by creating customer deposits for future application.
 *
 * @example POST Request (Full Payment)
 * {
 *   "customer_external_id": "FS-CUST-12345",
 *   "payment_date": "2026-03-18",
 *   "amount": 1250.00,
 *   "payment_method": "Check",
 *   "reference_number": "CHK-9876",
 *   "invoice_external_id": "FS-INV-11111"
 * }
 *
 * @example POST Request (Overpayment - Creates Deposit)
 * {
 *   "customer_external_id": "FS-CUST-12345",
 *   "payment_date": "2026-03-18",
 *   "amount": 1500.00,
 *   "payment_method": "Check",
 *   "reference_number": "CHK-9877",
 *   "invoice_external_id": "FS-INV-11111"
 * }
 */
define(['N/record', 'N/search', './lib/validation', './lib/error_handler', './lib/external_id_matcher'],
    function(record, search, validation, errorHandler, externalIdMatcher) {
        'use strict';

        /**
         * POST: Apply customer payment to invoice
         *
         * @param {Object} context - Request body
         * @param {string} context.customer_external_id - Customer external ID
         * @param {string} context.payment_date - Payment date (ISO format)
         * @param {number} context.amount - Payment amount
         * @param {string} [context.payment_method] - Payment method (Check, Cash, Credit Card)
         * @param {string} [context.reference_number] - Check number or reference
         * @param {string} [context.invoice_external_id] - Invoice external ID to apply to
         * @returns {Object} - Created payment data or error
         */
        function post(context) {
            try {
                // Validate required fields
                const schema = {
                    required: ['customer_external_id', 'payment_date', 'amount'],
                    types: {
                        customer_external_id: 'string',
                        payment_date: 'date',
                        amount: 'number',
                        payment_method: 'string',
                        reference_number: 'string',
                        invoice_external_id: 'string'
                    },
                    rules: {
                        amount: function(val) {
                            return val > 0;
                        }
                    }
                };

                const validationErr = validation.validate(context, schema);
                if (validationErr) return validationErr;

                // Find customer
                const customerId = externalIdMatcher.findByExternalId('customer', context.customer_external_id);

                if (!customerId) {
                    return errorHandler.createError(
                        errorHandler.ErrorCode.RECORD_NOT_FOUND,
                        'Customer not found with external_id: ' + context.customer_external_id
                    );
                }

                // Find invoice (if provided)
                let invoiceId = null;
                let invoiceAmountDue = 0;

                if (context.invoice_external_id) {
                    invoiceId = externalIdMatcher.findByExternalId('invoice', context.invoice_external_id);

                    if (!invoiceId) {
                        return errorHandler.createError(
                            errorHandler.ErrorCode.RECORD_NOT_FOUND,
                            'Invoice not found with external_id: ' + context.invoice_external_id
                        );
                    }

                    // Get invoice amount remaining
                    const invoiceRec = record.load({
                        type: record.Type.INVOICE,
                        id: invoiceId,
                        isDynamic: false
                    });

                    invoiceAmountDue = parseFloat(invoiceRec.getValue({ fieldId: 'amountremainingtostring' }) || 0);
                }

                // Create customer payment
                const paymentRec = record.create({
                    type: record.Type.CUSTOMER_PAYMENT,
                    isDynamic: false
                });

                paymentRec.setValue({ fieldId: 'customer', value: customerId });
                paymentRec.setValue({ fieldId: 'trandate', value: new Date(context.payment_date) });
                paymentRec.setValue({ fieldId: 'payment', value: context.amount });

                if (context.payment_method) {
                    paymentRec.setText({ fieldId: 'paymentmethod', text: context.payment_method });
                }

                if (context.reference_number) {
                    paymentRec.setValue({ fieldId: 'checknum', value: context.reference_number });
                }

                // Apply to invoice (if provided)
                if (invoiceId) {
                    const lineCount = paymentRec.getLineCount({ sublistId: 'apply' });

                    for (let i = 0; i < lineCount; i++) {
                        const applyInvoiceId = paymentRec.getSublistValue({
                            sublistId: 'apply',
                            fieldId: 'internalid',
                            line: i
                        });

                        if (applyInvoiceId == invoiceId) {
                            // Mark invoice for application
                            paymentRec.setSublistValue({
                                sublistId: 'apply',
                                fieldId: 'apply',
                                line: i,
                                value: true
                            });

                            // Apply amount (up to amount due)
                            const amountToApply = Math.min(context.amount, invoiceAmountDue);

                            paymentRec.setSublistValue({
                                sublistId: 'apply',
                                fieldId: 'amount',
                                line: i,
                                value: amountToApply
                            });

                            break;
                        }
                    }
                }

                const paymentId = paymentRec.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: false
                });

                // Check for overpayment (creates unapplied amount / customer deposit)
                const overpayment = context.amount - invoiceAmountDue;
                const hasOverpayment = overpayment > 0.01; // Account for floating point precision

                return errorHandler.formatSuccess({
                    internal_id: paymentId,
                    customer_id: customerId,
                    invoice_id: invoiceId,
                    payment_amount: context.amount,
                    applied_amount: invoiceId ? Math.min(context.amount, invoiceAmountDue) : 0,
                    unapplied_amount: hasOverpayment ? overpayment : 0,
                    created: true
                }, 'Customer payment created successfully' + (hasOverpayment ? ' (unapplied balance remains)' : ''));
            } catch (err) {
                return errorHandler.formatError(err, 'fs_payment_rl.post');
            }
        }

        return {
            post: post
        };
    }
);
