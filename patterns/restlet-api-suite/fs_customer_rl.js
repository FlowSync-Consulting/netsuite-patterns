/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope Public
 *
 * Field Service API - Customer RESTlet
 *
 * Provides GET (lookup), POST (create), and PUT (upsert) operations for customer records.
 * Uses external ID matching for idempotent upserts.
 *
 * @example GET Request
 * {
 *   "external_id": "FS-CUST-12345"
 * }
 *
 * @example POST Request (Create)
 * {
 *   "external_id": "FS-CUST-12345",
 *   "company_name": "Example Field Services LLC",
 *   "email": "contact@example.com",
 *   "phone": "555-1234",
 *   "subsidiary_id": "1"
 * }
 *
 * @example PUT Request (Upsert)
 * {
 *   "external_id": "FS-CUST-12345",
 *   "company_name": "Example Field Services LLC (Updated)",
 *   "email": "newemail@example.com"
 * }
 */
(function(factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD (NetSuite)
        define(['N/record', 'N/search', './lib/validation', './lib/error_handler', './lib/external_id_matcher'], factory);
    } else if (typeof module === 'object' && module.exports) {
        // CommonJS (Jest)
        const record = require('../../shared/mocks/record');
        const search = require('../../shared/mocks/search');
        const validation = require('./lib/validation');
        const errorHandler = require('./lib/error_handler');
        const externalIdMatcher = require('./lib/external_id_matcher');
        module.exports = factory(record, search, validation, errorHandler, externalIdMatcher);
    }
})(function(record, search, validation, errorHandler, externalIdMatcher) {
        'use strict';

        /**
         * GET: Lookup customer by external ID
         *
         * @param {Object} context - Request parameters
         * @param {string} context.external_id - External system customer ID
         * @returns {Object} - Customer data or error
         */
        function get(context) {
            try {
                // Validate required fields
                const validationErr = validation.validateRequired(context, ['external_id']);
                if (validationErr) return validationErr;

                const externalId = context.external_id;

                // Find customer by external ID
                const customerId = externalIdMatcher.findByExternalId('customer', externalId);

                if (!customerId) {
                    return errorHandler.createError(
                        errorHandler.ErrorCode.RECORD_NOT_FOUND,
                        'Customer not found with external_id: ' + externalId
                    );
                }

                // Load customer record
                const customerRec = record.load({
                    type: record.Type.CUSTOMER,
                    id: customerId,
                    isDynamic: false
                });

                // Build response data
                const responseData = {
                    internal_id: customerId,
                    external_id: customerRec.getValue({ fieldId: 'externalid' }),
                    company_name: customerRec.getValue({ fieldId: 'companyname' }),
                    email: customerRec.getValue({ fieldId: 'email' }),
                    phone: customerRec.getValue({ fieldId: 'phone' }),
                    subsidiary_id: customerRec.getValue({ fieldId: 'subsidiary' }),
                    entity_status: customerRec.getValue({ fieldId: 'entitystatus' })
                };

                return errorHandler.formatSuccess(responseData);
            } catch (err) {
                return errorHandler.formatError(err, 'fs_customer_rl.get');
            }
        }

        /**
         * POST: Create new customer
         *
         * @param {Object} context - Request body
         * @param {string} context.external_id - External system customer ID
         * @param {string} context.company_name - Customer company name
         * @param {string} [context.email] - Customer email
         * @param {string} [context.phone] - Customer phone
         * @param {string} context.subsidiary_id - Subsidiary internal ID
         * @returns {Object} - Created customer data or error
         */
        function post(context) {
            try {
                // Validate required fields
                const schema = {
                    required: ['external_id', 'company_name', 'subsidiary_id'],
                    types: {
                        external_id: 'string',
                        company_name: 'string',
                        subsidiary_id: 'string',
                        email: 'email',
                        phone: 'string'
                    }
                };

                const validationErr = validation.validate(context, schema);
                if (validationErr) return validationErr;

                // Check if customer already exists
                const existingId = externalIdMatcher.findByExternalId('customer', context.external_id);

                if (existingId) {
                    return errorHandler.createError(
                        errorHandler.ErrorCode.DUPLICATE_RECORD,
                        'Customer already exists with external_id: ' + context.external_id,
                        { internal_id: existingId }
                    );
                }

                // Create customer record
                const customerRec = record.create({
                    type: record.Type.CUSTOMER,
                    isDynamic: false
                });

                customerRec.setValue({ fieldId: 'externalid', value: context.external_id });
                customerRec.setValue({ fieldId: 'companyname', value: context.company_name });
                customerRec.setValue({ fieldId: 'subsidiary', value: context.subsidiary_id });

                if (context.email) {
                    customerRec.setValue({ fieldId: 'email', value: context.email });
                }

                if (context.phone) {
                    customerRec.setValue({ fieldId: 'phone', value: context.phone });
                }

                const customerId = customerRec.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: false
                });

                return errorHandler.formatSuccess({
                    internal_id: customerId,
                    external_id: context.external_id,
                    created: true
                }, 'Customer created successfully');
            } catch (err) {
                return errorHandler.formatError(err, 'fs_customer_rl.post');
            }
        }

        /**
         * PUT: Upsert customer (create if not exists, update if exists)
         *
         * @param {Object} context - Request body
         * @param {string} context.external_id - External system customer ID
         * @param {string} [context.company_name] - Customer company name
         * @param {string} [context.email] - Customer email
         * @param {string} [context.phone] - Customer phone
         * @param {string} [context.subsidiary_id] - Subsidiary internal ID (required for create)
         * @returns {Object} - Upserted customer data or error
         */
        function put(context) {
            try {
                // Validate required fields
                const validationErr = validation.validateRequired(context, ['external_id']);
                if (validationErr) return validationErr;

                // Find existing customer
                const existingId = externalIdMatcher.findByExternalId('customer', context.external_id);

                let customerRec;
                let isUpdate = false;

                if (existingId) {
                    // Load existing record for update
                    customerRec = record.load({
                        type: record.Type.CUSTOMER,
                        id: existingId,
                        isDynamic: false
                    });
                    isUpdate = true;
                } else {
                    // Create new record
                    if (!context.company_name || !context.subsidiary_id) {
                        return errorHandler.createError(
                            errorHandler.ErrorCode.MISSING_REQUIRED_FIELD,
                            'company_name and subsidiary_id are required for creating new customers'
                        );
                    }

                    customerRec = record.create({
                        type: record.Type.CUSTOMER,
                        isDynamic: false
                    });

                    customerRec.setValue({ fieldId: 'externalid', value: context.external_id });
                    customerRec.setValue({ fieldId: 'subsidiary', value: context.subsidiary_id });
                }

                // Update fields (only if provided)
                if (context.company_name) {
                    customerRec.setValue({ fieldId: 'companyname', value: context.company_name });
                }

                if (context.email) {
                    customerRec.setValue({ fieldId: 'email', value: context.email });
                }

                if (context.phone) {
                    customerRec.setValue({ fieldId: 'phone', value: context.phone });
                }

                const customerId = customerRec.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: false
                });

                return errorHandler.formatSuccess({
                    internal_id: customerId,
                    external_id: context.external_id,
                    created: !isUpdate,
                    updated: isUpdate
                }, isUpdate ? 'Customer updated successfully' : 'Customer created successfully');
            } catch (err) {
                return errorHandler.formatError(err, 'fs_customer_rl.put');
            }
        }

        return {
            get: get,
            post: post,
            put: put
        };
    }
);
