/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Billing Mode Module
 * Handles sales order creation from completed work entries.
 *
 * Features:
 * - Load billable work entries by customer
 * - Create new sales order
 * - Add to existing sales order
 * - Mark entries as billed
 *
 * @module billing_mode
 */
define([
    'N/ui/serverWidget',
    'N/search',
    'N/redirect',
    'N/runtime',
    'N/log',
    '../lib/so_builder'
], function(serverWidget, search, redirect, runtime, log, soBuilder) {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    const FIELDS = {
        BILLING_CUSTOMER: 'custpage_billing_customer',
        SO_OPTION: 'custpage_so_option',
        EXISTING_SO: 'custpage_existing_so',
        ACTION: 'custpage_action'
    };

    const SUBLIST = {
        ID: 'custpage_billable_entries',
        SELECT: 'custpage_select',
        INTERNAL_ID: 'custpage_id',
        SERIAL: 'custpage_serial',
        BOARD_TYPE: 'custpage_board_type',
        OUTCOME: 'custpage_outcome',
        COMPLETED_DATE: 'custpage_completed_date'
    };

    const SO_OPTIONS = [
        { value: 'new', text: 'Create New Sales Order' },
        { value: 'existing', text: 'Add to Existing Sales Order' }
    ];

    // ═══════════════════════════════════════════════════════════════════════════
    // FORM BUILDING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Build the billing form
     * @param {Object} context - The Suitelet context
     * @returns {Form} The NetSuite form object
     */
    function buildBillingForm(context) {
        const params = context.request.parameters;
        const form = serverWidget.createForm({ title: 'Billing - Sales Order Creation' });

        // Attach client script
        form.clientScriptModulePath = './client_scripts/fs_workflow_billing_cs.js';

        // Show message if present
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

        // Add customer selection
        const customerField = form.addField({
            id: FIELDS.BILLING_CUSTOMER,
            type: serverWidget.FieldType.SELECT,
            label: 'Customer',
            source: 'customer'
        });
        customerField.isMandatory = true;
        customerField.defaultValue = params[FIELDS.BILLING_CUSTOMER] || '';

        // Add SO option field
        const soOptionField = form.addField({
            id: FIELDS.SO_OPTION,
            type: serverWidget.FieldType.SELECT,
            label: 'Sales Order Option'
        });
        SO_OPTIONS.forEach(function(opt) {
            soOptionField.addSelectOption({ value: opt.value, text: opt.text });
        });
        soOptionField.defaultValue = params[FIELDS.SO_OPTION] || 'new';

        // Add existing SO field (disabled by default, enabled via client script)
        const existingSoField = form.addField({
            id: FIELDS.EXISTING_SO,
            type: serverWidget.FieldType.SELECT,
            label: 'Existing Sales Order',
            source: 'salesorder'
        });
        existingSoField.updateDisplayType({
            displayType: serverWidget.FieldDisplayType.DISABLED
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

        // Add results sublist
        const sublist = addBillableSublist(form);

        // Load billable entries if customer selected
        if (params[FIELDS.BILLING_CUSTOMER] && params.dosearch === 'T') {
            const billableEntries = searchBillableEntries(params[FIELDS.BILLING_CUSTOMER]);
            populateSublist(sublist, billableEntries);
        }

        // Add action buttons
        form.addButton({
            id: 'custpage_load_btn',
            label: 'Load Billable Entries',
            functionName: 'loadBillableEntries'
        });

        form.addSubmitButton({ label: 'Create Sales Order' });

        return form;
    }

    /**
     * Add billable entries sublist to form
     * @param {Form} form - The NetSuite form
     * @returns {Sublist} The created sublist
     */
    function addBillableSublist(form) {
        const sublist = form.addSublist({
            id: SUBLIST.ID,
            type: serverWidget.SublistType.LIST,
            label: 'Billable Work Entries'
        });

        sublist.addField({
            id: SUBLIST.SELECT,
            type: serverWidget.FieldType.CHECKBOX,
            label: 'Bill'
        });

        sublist.addField({
            id: SUBLIST.INTERNAL_ID,
            type: serverWidget.FieldType.TEXT,
            label: 'ID'
        });

        sublist.addField({
            id: SUBLIST.SERIAL,
            type: serverWidget.FieldType.TEXT,
            label: 'Serial Number'
        });

        sublist.addField({
            id: SUBLIST.BOARD_TYPE,
            type: serverWidget.FieldType.TEXT,
            label: 'Equipment Type'
        });

        sublist.addField({
            id: SUBLIST.OUTCOME,
            type: serverWidget.FieldType.TEXT,
            label: 'Outcome'
        });

        sublist.addField({
            id: SUBLIST.COMPLETED_DATE,
            type: serverWidget.FieldType.DATE,
            label: 'Completed Date'
        });

        return sublist;
    }

    /**
     * Search for billable work entries (status = Complete, not yet billed)
     * @param {string} customerId - Customer internal ID
     * @returns {Array} Search results
     */
    function searchBillableEntries(customerId) {
        const billableSearch = search.create({
            type: 'customrecord_fs_work_entry',
            filters: [
                ['custrecord_fs_customer', 'anyof', customerId],
                'AND',
                ['custrecord_fs_status', 'anyof', '3'],  // Complete
                'AND',
                ['custrecord_fs_sales_order', 'anyof', '@NONE@']  // Not yet billed
            ],
            columns: [
                'internalid',
                'custrecord_fs_serial',
                'custrecord_fs_board_type',
                'custrecord_fs_outcome',
                'custrecord_fs_completed_date'
            ]
        });

        return billableSearch.run().getRange({ start: 0, end: 1000 });
    }

    /**
     * Populate sublist with billable entries
     * @param {Sublist} sublist - The sublist to populate
     * @param {Array} results - Search results
     */
    function populateSublist(sublist, results) {
        results.forEach(function(result, i) {
            sublist.setSublistValue({
                id: SUBLIST.INTERNAL_ID,
                line: i,
                value: result.getValue('internalid')
            });

            sublist.setSublistValue({
                id: SUBLIST.SERIAL,
                line: i,
                value: result.getValue('custrecord_fs_serial') || ''
            });

            sublist.setSublistValue({
                id: SUBLIST.BOARD_TYPE,
                line: i,
                value: result.getValue('custrecord_fs_board_type') || ''
            });

            sublist.setSublistValue({
                id: SUBLIST.OUTCOME,
                line: i,
                value: result.getText('custrecord_fs_outcome') || ''
            });

            sublist.setSublistValue({
                id: SUBLIST.COMPLETED_DATE,
                line: i,
                value: result.getValue('custrecord_fs_completed_date') || ''
            });
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // POST PROCESSING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Process billing form submission (create SO)
     * @param {Object} context - The Suitelet context
     */
    function processBilling(context) {
        const params = context.request.parameters;
        const customerId = params[FIELDS.BILLING_CUSTOMER];
        const soOption = params[FIELDS.SO_OPTION];
        const existingSoId = params[FIELDS.EXISTING_SO];
        const action = params[FIELDS.ACTION];

        log.audit({
            title: 'Billing Mode - Processing',
            details: 'Customer: ' + customerId + ', Option: ' + soOption + ', Action: ' + action
        });

        try {
            // Validate
            if (!customerId) {
                throw new Error('Please select a customer');
            }

            // Get selected entry IDs
            const selectedIds = getSelectedEntryIds(params);

            if (selectedIds.length === 0) {
                throw new Error('Please select at least one work entry to bill');
            }

            let soId;

            if (action === 'create_so') {
                // Create new sales order
                soId = soBuilder.createSalesOrderFromWorkEntries(customerId, selectedIds);

                log.audit({
                    title: 'Billing Mode - SO Created',
                    details: 'Created new SO ID: ' + soId + ' with ' + selectedIds.length + ' line items'
                });

            } else if (action === 'add_to_so') {
                // Add to existing sales order
                if (!existingSoId) {
                    throw new Error('Please select an existing sales order');
                }

                soBuilder.addWorkEntriesToSalesOrder(existingSoId, selectedIds);
                soId = existingSoId;

                log.audit({
                    title: 'Billing Mode - Lines Added to SO',
                    details: 'Added ' + selectedIds.length + ' lines to SO ID: ' + soId
                });
            }

            // Redirect to created/updated SO
            redirect.toRecord({
                type: 'salesorder',
                id: soId
            });

        } catch (e) {
            log.error({
                title: 'Billing Mode - Processing Error',
                details: e.message + '\n' + e.stack
            });

            redirect.toSuitelet({
                scriptId: runtime.getCurrentScript().id,
                deploymentId: runtime.getCurrentScript().deploymentId,
                parameters: {
                    mode: 'billing',
                    message: 'Error creating sales order: ' + e.message,
                    msgtype: 'error',
                    custpage_billing_customer: customerId,
                    dosearch: 'T'
                }
            });
        }
    }

    /**
     * Extract selected entry IDs from sublist parameters
     * @param {Object} params - Request parameters
     * @returns {Array<string>} Selected entry IDs
     */
    function getSelectedEntryIds(params) {
        const selectedIds = [];
        let lineNum = 0;

        // Loop through sublist lines
        while (params['custpage_billable_entries_custpage_select_' + lineNum] !== undefined) {
            const isSelected = params['custpage_billable_entries_custpage_select_' + lineNum];
            const entryId = params['custpage_billable_entries_custpage_id_' + lineNum];

            if (isSelected === 'T' && entryId) {
                selectedIds.push(entryId);
            }

            lineNum++;
        }

        return selectedIds;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EXPORTS
    // ═══════════════════════════════════════════════════════════════════════════

    return {
        buildBillingForm: buildBillingForm,
        processBilling: processBilling
    };
});
