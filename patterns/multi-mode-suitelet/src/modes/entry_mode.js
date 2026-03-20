/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Entry Mode Module
 * Handles data entry form for new equipment intake.
 *
 * Features:
 * - Quick data entry form with required fields
 * - Save and continue entry workflow
 * - Client-side validation
 * - Auto-focus for rapid entry
 *
 * @module entry_mode
 */
define([
    'N/ui/serverWidget',
    'N/redirect',
    'N/runtime',
    'N/log',
    '../lib/record_helpers'
], function(serverWidget, redirect, runtime, log, recordHelpers) {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    const FIELDS = {
        CUSTOMER: 'custpage_customer',
        SERIAL: 'custpage_serial',
        BOARD_TYPE: 'custpage_board_type',
        RECEIVED_DATE: 'custpage_received_date',
        PROBLEM_DESC: 'custpage_problem_desc',
        ACTION: 'custpage_action'
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // FORM BUILDING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Build the data entry form
     * @param {Object} context - The Suitelet context
     * @returns {Form} The NetSuite form object
     */
    function buildForm(context) {
        const params = context.request.parameters;
        const form = serverWidget.createForm({ title: 'Equipment Intake - Data Entry' });

        // Attach client script for validation and button handlers
        form.clientScriptModulePath = './client_scripts/fs_workflow_entry_cs.js';

        // Show success message if present
        if (params.message) {
            const msgType = params.msgtype === 'error'
                ? serverWidget.MessageType.ERROR
                : serverWidget.MessageType.CONFIRMATION;

            form.addPageInitMessage({
                type: msgType,
                title: params.msgtype === 'error' ? 'Error' : 'Success',
                message: params.message
            });
        }

        // Add instruction field
        const instructions = form.addField({
            id: 'custpage_instructions',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Instructions'
        });
        instructions.defaultValue = '<p style="margin: 10px 0; color: #555;">' +
            'Enter equipment details for intake. Required fields are marked with an asterisk (*).</p>';

        // Add customer field (required)
        const customerField = form.addField({
            id: FIELDS.CUSTOMER,
            type: serverWidget.FieldType.SELECT,
            label: 'Customer',
            source: 'customer'
        });
        customerField.isMandatory = true;

        // Add serial number field (required)
        const serialField = form.addField({
            id: FIELDS.SERIAL,
            type: serverWidget.FieldType.TEXT,
            label: 'Serial Number'
        });
        serialField.isMandatory = true;
        serialField.maxLength = 50;

        // Add board type field (required)
        const boardTypeField = form.addField({
            id: FIELDS.BOARD_TYPE,
            type: serverWidget.FieldType.TEXT,
            label: 'Equipment Type'
        });
        boardTypeField.isMandatory = true;
        boardTypeField.maxLength = 100;
        boardTypeField.setHelpText({
            help: 'Enter the model or type of equipment (e.g., "Controller Board", "Sensor Module")'
        });

        // Add received date field (required, default to today)
        const receivedDateField = form.addField({
            id: FIELDS.RECEIVED_DATE,
            type: serverWidget.FieldType.DATE,
            label: 'Received Date'
        });
        receivedDateField.isMandatory = true;
        receivedDateField.defaultValue = new Date();

        // Add problem description field (optional)
        const problemDescField = form.addField({
            id: FIELDS.PROBLEM_DESC,
            type: serverWidget.FieldType.TEXTAREA,
            label: 'Problem Description'
        });
        problemDescField.maxLength = 4000;
        problemDescField.setHelpText({
            help: 'Describe the reported issue or reason for intake (optional)'
        });

        // Add hidden action field
        const actionField = form.addField({
            id: FIELDS.ACTION,
            type: serverWidget.FieldType.TEXT,
            label: 'Action'
        });
        actionField.updateDisplayType({
            displayType: serverWidget.FieldDisplayType.HIDDEN
        });

        // Add submit buttons
        form.addSubmitButton({ label: 'Save Entry' });

        form.addButton({
            id: 'custpage_save_and_new',
            label: 'Save & Enter Another',
            functionName: 'saveAndNew'
        });

        form.addResetButton({ label: 'Clear Form' });

        return form;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // POST PROCESSING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Process entry form submission
     * @param {Object} context - The Suitelet context
     */
    function processEntry(context) {
        const params = context.request.parameters;
        const action = params[FIELDS.ACTION];

        log.audit({
            title: 'Entry Mode - Processing Entry',
            details: 'Action: ' + action + ', Customer: ' + params[FIELDS.CUSTOMER]
        });

        try {
            // Validate required fields
            validateRequiredFields(params);

            // Create work entry record
            const recordId = createWorkEntry(params);

            log.audit({
                title: 'Entry Mode - Record Created',
                details: 'Created work entry ID: ' + recordId
            });

            // Redirect based on action
            if (action === 'save_and_new') {
                // Redirect back to entry form with success message
                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        mode: 'entry',
                        message: 'Entry saved successfully (ID: ' + recordId + ')',
                        msgtype: 'confirmation'
                    }
                });
            } else {
                // Redirect to the created record
                redirect.toRecord({
                    type: 'customrecord_fs_work_entry',
                    id: recordId
                });
            }

        } catch (e) {
            log.error({
                title: 'Entry Mode - Processing Error',
                details: e.message + '\n' + e.stack
            });

            // Redirect back to form with error message
            redirect.toSuitelet({
                scriptId: runtime.getCurrentScript().id,
                deploymentId: runtime.getCurrentScript().deploymentId,
                parameters: {
                    mode: 'entry',
                    message: 'Error saving entry: ' + e.message,
                    msgtype: 'error'
                }
            });
        }
    }

    /**
     * Validate required fields
     * @param {Object} params - Request parameters
     * @throws {Error} If validation fails
     */
    function validateRequiredFields(params) {
        const missing = [];

        if (!params[FIELDS.CUSTOMER]) missing.push('Customer');
        if (!params[FIELDS.SERIAL]) missing.push('Serial Number');
        if (!params[FIELDS.BOARD_TYPE]) missing.push('Equipment Type');
        if (!params[FIELDS.RECEIVED_DATE]) missing.push('Received Date');

        if (missing.length > 0) {
            throw new Error('Missing required fields: ' + missing.join(', '));
        }
    }

    /**
     * Create work entry record
     * @param {Object} params - Request parameters
     * @returns {number} The created record ID
     */
    function createWorkEntry(params) {
        return recordHelpers.createRecord('customrecord_fs_work_entry', {
            custrecord_fs_customer: params[FIELDS.CUSTOMER],
            custrecord_fs_serial: params[FIELDS.SERIAL],
            custrecord_fs_board_type: params[FIELDS.BOARD_TYPE],
            custrecord_fs_received_date: params[FIELDS.RECEIVED_DATE],
            custrecord_fs_problem_desc: params[FIELDS.PROBLEM_DESC] || '',
            custrecord_fs_status: '1'  // Status: New
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EXPORTS
    // ═══════════════════════════════════════════════════════════════════════════

    return {
        buildForm: buildForm,
        processEntry: processEntry
    };
});
