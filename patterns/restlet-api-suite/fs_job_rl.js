/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope Public
 *
 * Field Service API - Job/Work Order RESTlet
 *
 * Provides GET, POST, and PUT operations for job (project/work order) records.
 * Manages job status, assignment, and customer linkage.
 *
 * @example POST Request (Create Job)
 * {
 *   "external_id": "FS-JOB-98765",
 *   "customer_external_id": "FS-CUST-12345",
 *   "job_name": "Water Damage Restoration - 123 Main St",
 *   "status": "pending",
 *   "assigned_technician": "John Smith"
 * }
 */
define(['N/record', 'N/search', './lib/validation', './lib/error_handler', './lib/external_id_matcher'],
    function(record, search, validation, errorHandler, externalIdMatcher) {
        'use strict';

        /**
         * Valid job statuses
         */
        const JobStatus = {
            PENDING: 'pending',
            ASSIGNED: 'assigned',
            IN_PROGRESS: 'in_progress',
            COMPLETED: 'completed',
            CANCELLED: 'cancelled'
        };

        /**
         * GET: Lookup job by external ID
         *
         * @param {Object} context - Request parameters
         * @param {string} context.external_id - External system job ID
         * @returns {Object} - Job data or error
         */
        function get(context) {
            try {
                const validationErr = validation.validateRequired(context, ['external_id']);
                if (validationErr) return validationErr;

                const externalId = context.external_id;

                // Find job by external ID
                const jobId = externalIdMatcher.findByExternalId('job', externalId);

                if (!jobId) {
                    return errorHandler.createError(
                        errorHandler.ErrorCode.RECORD_NOT_FOUND,
                        'Job not found with external_id: ' + externalId
                    );
                }

                // Load job record
                const jobRec = record.load({
                    type: record.Type.JOB,
                    id: jobId,
                    isDynamic: false
                });

                // Build response data
                const responseData = {
                    internal_id: jobId,
                    external_id: jobRec.getValue({ fieldId: 'externalid' }),
                    job_name: jobRec.getValue({ fieldId: 'companyname' }),
                    customer_id: jobRec.getValue({ fieldId: 'parent' }),
                    status: jobRec.getText({ fieldId: 'entitystatus' }),
                    assigned_technician: jobRec.getValue({ fieldId: 'custentity_fs_assigned_tech' })
                };

                return errorHandler.formatSuccess(responseData);
            } catch (err) {
                return errorHandler.formatError(err, 'fs_job_rl.get');
            }
        }

        /**
         * POST: Create new job
         *
         * @param {Object} context - Request body
         * @param {string} context.external_id - External system job ID
         * @param {string} context.customer_external_id - Parent customer external ID
         * @param {string} context.job_name - Job/project name
         * @param {string} [context.status] - Job status (default: pending)
         * @param {string} [context.assigned_technician] - Assigned technician name
         * @returns {Object} - Created job data or error
         */
        function post(context) {
            try {
                // Validate required fields
                const schema = {
                    required: ['external_id', 'customer_external_id', 'job_name'],
                    types: {
                        external_id: 'string',
                        customer_external_id: 'string',
                        job_name: 'string',
                        status: 'string',
                        assigned_technician: 'string'
                    },
                    rules: {
                        status: function(val) {
                            // Validate status is one of the allowed values
                            const allowedStatuses = Object.keys(JobStatus).map(function(key) {
                                return JobStatus[key];
                            });
                            return allowedStatuses.indexOf(val) !== -1;
                        }
                    }
                };

                const validationErr = validation.validate(context, schema);
                if (validationErr) return validationErr;

                // Check if job already exists
                const existingId = externalIdMatcher.findByExternalId('job', context.external_id);

                if (existingId) {
                    return errorHandler.createError(
                        errorHandler.ErrorCode.DUPLICATE_RECORD,
                        'Job already exists with external_id: ' + context.external_id,
                        { internal_id: existingId }
                    );
                }

                // Find parent customer
                const customerId = externalIdMatcher.findByExternalId('customer', context.customer_external_id);

                if (!customerId) {
                    return errorHandler.createError(
                        errorHandler.ErrorCode.RECORD_NOT_FOUND,
                        'Parent customer not found with external_id: ' + context.customer_external_id
                    );
                }

                // Create job record
                const jobRec = record.create({
                    type: record.Type.JOB,
                    isDynamic: false
                });

                jobRec.setValue({ fieldId: 'externalid', value: context.external_id });
                jobRec.setValue({ fieldId: 'companyname', value: context.job_name });
                jobRec.setValue({ fieldId: 'parent', value: customerId });

                if (context.status) {
                    jobRec.setText({ fieldId: 'entitystatus', text: context.status });
                }

                if (context.assigned_technician) {
                    jobRec.setValue({ fieldId: 'custentity_fs_assigned_tech', value: context.assigned_technician });
                }

                const jobId = jobRec.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: false
                });

                return errorHandler.formatSuccess({
                    internal_id: jobId,
                    external_id: context.external_id,
                    created: true
                }, 'Job created successfully');
            } catch (err) {
                return errorHandler.formatError(err, 'fs_job_rl.post');
            }
        }

        /**
         * PUT: Upsert job (create if not exists, update if exists)
         *
         * @param {Object} context - Request body
         * @param {string} context.external_id - External system job ID
         * @param {string} [context.customer_external_id] - Parent customer external ID (required for create)
         * @param {string} [context.job_name] - Job/project name
         * @param {string} [context.status] - Job status
         * @param {string} [context.assigned_technician] - Assigned technician
         * @returns {Object} - Upserted job data or error
         */
        function put(context) {
            try {
                const validationErr = validation.validateRequired(context, ['external_id']);
                if (validationErr) return validationErr;

                // Find existing job
                const existingId = externalIdMatcher.findByExternalId('job', context.external_id);

                let jobRec;
                let isUpdate = false;

                if (existingId) {
                    // Load existing record
                    jobRec = record.load({
                        type: record.Type.JOB,
                        id: existingId,
                        isDynamic: false
                    });
                    isUpdate = true;
                } else {
                    // Create new record
                    if (!context.customer_external_id || !context.job_name) {
                        return errorHandler.createError(
                            errorHandler.ErrorCode.MISSING_REQUIRED_FIELD,
                            'customer_external_id and job_name are required for creating new jobs'
                        );
                    }

                    // Find parent customer
                    const customerId = externalIdMatcher.findByExternalId('customer', context.customer_external_id);

                    if (!customerId) {
                        return errorHandler.createError(
                            errorHandler.ErrorCode.RECORD_NOT_FOUND,
                            'Parent customer not found with external_id: ' + context.customer_external_id
                        );
                    }

                    jobRec = record.create({
                        type: record.Type.JOB,
                        isDynamic: false
                    });

                    jobRec.setValue({ fieldId: 'externalid', value: context.external_id });
                    jobRec.setValue({ fieldId: 'parent', value: customerId });
                }

                // Update fields (only if provided)
                if (context.job_name) {
                    jobRec.setValue({ fieldId: 'companyname', value: context.job_name });
                }

                if (context.status) {
                    jobRec.setText({ fieldId: 'entitystatus', text: context.status });
                }

                if (context.assigned_technician) {
                    jobRec.setValue({ fieldId: 'custentity_fs_assigned_tech', value: context.assigned_technician });
                }

                const jobId = jobRec.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: false
                });

                return errorHandler.formatSuccess({
                    internal_id: jobId,
                    external_id: context.external_id,
                    created: !isUpdate,
                    updated: isUpdate
                }, isUpdate ? 'Job updated successfully' : 'Job created successfully');
            } catch (err) {
                return errorHandler.formatError(err, 'fs_job_rl.put');
            }
        }

        return {
            get: get,
            post: post,
            put: put
        };
    }
);
