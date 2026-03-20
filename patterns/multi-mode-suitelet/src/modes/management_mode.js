/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Management Mode Module
 * Handles dashboard view for managing work entries.
 *
 * Features:
 * - Search and filter work entries
 * - View entry details
 * - Bulk status updates
 * - Record selection and actions
 *
 * @module management_mode
 */
define([
    'N/ui/serverWidget',
    'N/search',
    'N/redirect',
    'N/runtime',
    'N/log',
    '../lib/record_helpers'
], function(serverWidget, search, redirect, runtime, log, recordHelpers) {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    const FIELDS = {
        SEARCH_SERIAL: 'custpage_search_serial',
        SEARCH_CUSTOMER: 'custpage_search_customer',
        SEARCH_STATUS: 'custpage_search_status',
        NEW_STATUS: 'custpage_new_status',
        ACTION: 'custpage_action'
    };

    const SUBLIST = {
        ID: 'custpage_work_entries',
        SELECT: 'custpage_select',
        INTERNAL_ID: 'custpage_id',
        SERIAL: 'custpage_serial',
        CUSTOMER: 'custpage_customer',
        BOARD_TYPE: 'custpage_board_type',
        STATUS: 'custpage_status',
        RECEIVED_DATE: 'custpage_received_date'
    };

    // Status list (matches customlist_fs_entry_status)
    const STATUS_OPTIONS = [
        { value: '1', text: 'New' },
        { value: '2', text: 'In Evaluation' },
        { value: '3', text: 'Complete' },
        { value: '4', text: 'Billed' }
    ];

    // ═══════════════════════════════════════════════════════════════════════════
    // FORM BUILDING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Build the management dashboard
     * @param {Object} context - The Suitelet context
     * @returns {Form} The NetSuite form object
     */
    function buildDashboard(context) {
        const params = context.request.parameters;
        const form = serverWidget.createForm({ title: 'Work Entry Management' });

        // Attach client script
        form.clientScriptModulePath = './client_scripts/fs_workflow_manage_cs.js';

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

        // Add search fields group
        addSearchFields(form, params);

        // Add action fields group
        addActionFields(form);

        // Add results sublist
        const sublist = addResultsSublist(form);

        // Load and populate data if search was performed
        if (params.dosearch === 'T') {
            const results = searchWorkEntries(params);
            populateSublist(sublist, results);
        }

        // Add action buttons
        form.addButton({
            id: 'custpage_search_btn',
            label: 'Search',
            functionName: 'searchEntries'
        });

        form.addButton({
            id: 'custpage_view_btn',
            label: 'View Selected',
            functionName: 'viewSelected'
        });

        form.addSubmitButton({ label: 'Update Status' });

        return form;
    }

    /**
     * Add search filter fields to form
     * @param {Form} form - The NetSuite form
     * @param {Object} params - Request parameters
     */
    function addSearchFields(form, params) {
        const fieldGroup = form.addFieldGroup({
            id: 'custpage_search_group',
            label: 'Search Filters'
        });

        const serialField = form.addField({
            id: FIELDS.SEARCH_SERIAL,
            type: serverWidget.FieldType.TEXT,
            label: 'Serial Number',
            container: 'custpage_search_group'
        });
        serialField.defaultValue = params[FIELDS.SEARCH_SERIAL] || '';

        const customerField = form.addField({
            id: FIELDS.SEARCH_CUSTOMER,
            type: serverWidget.FieldType.SELECT,
            label: 'Customer',
            source: 'customer',
            container: 'custpage_search_group'
        });
        customerField.defaultValue = params[FIELDS.SEARCH_CUSTOMER] || '';

        const statusField = form.addField({
            id: FIELDS.SEARCH_STATUS,
            type: serverWidget.FieldType.SELECT,
            label: 'Status',
            container: 'custpage_search_group'
        });
        statusField.addSelectOption({ value: '', text: '- All Statuses -' });
        STATUS_OPTIONS.forEach(function(opt) {
            statusField.addSelectOption({ value: opt.value, text: opt.text });
        });
        statusField.defaultValue = params[FIELDS.SEARCH_STATUS] || '';
    }

    /**
     * Add bulk action fields to form
     * @param {Form} form - The NetSuite form
     */
    function addActionFields(form) {
        const fieldGroup = form.addFieldGroup({
            id: 'custpage_action_group',
            label: 'Bulk Actions'
        });

        const newStatusField = form.addField({
            id: FIELDS.NEW_STATUS,
            type: serverWidget.FieldType.SELECT,
            label: 'Update Status To',
            container: 'custpage_action_group'
        });
        newStatusField.addSelectOption({ value: '', text: '- Select Status -' });
        STATUS_OPTIONS.forEach(function(opt) {
            newStatusField.addSelectOption({ value: opt.value, text: opt.text });
        });

        // Hidden action field
        const actionField = form.addField({
            id: FIELDS.ACTION,
            type: serverWidget.FieldType.TEXT,
            label: 'Action'
        });
        actionField.updateDisplayType({
            displayType: serverWidget.FieldDisplayType.HIDDEN
        });
    }

    /**
     * Add results sublist to form
     * @param {Form} form - The NetSuite form
     * @returns {Sublist} The created sublist
     */
    function addResultsSublist(form) {
        const sublist = form.addSublist({
            id: SUBLIST.ID,
            type: serverWidget.SublistType.LIST,
            label: 'Work Entries'
        });

        sublist.addField({
            id: SUBLIST.SELECT,
            type: serverWidget.FieldType.CHECKBOX,
            label: 'Select'
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
            id: SUBLIST.CUSTOMER,
            type: serverWidget.FieldType.TEXT,
            label: 'Customer'
        });

        sublist.addField({
            id: SUBLIST.BOARD_TYPE,
            type: serverWidget.FieldType.TEXT,
            label: 'Equipment Type'
        });

        sublist.addField({
            id: SUBLIST.STATUS,
            type: serverWidget.FieldType.TEXT,
            label: 'Status'
        });

        sublist.addField({
            id: SUBLIST.RECEIVED_DATE,
            type: serverWidget.FieldType.DATE,
            label: 'Received Date'
        });

        return sublist;
    }

    /**
     * Search work entries based on filter criteria
     * @param {Object} params - Search parameters
     * @returns {Array} Search results
     */
    function searchWorkEntries(params) {
        const filters = [];

        // Add serial number filter
        if (params[FIELDS.SEARCH_SERIAL]) {
            filters.push(['custrecord_fs_serial', 'contains', params[FIELDS.SEARCH_SERIAL]]);
        }

        // Add customer filter
        if (params[FIELDS.SEARCH_CUSTOMER]) {
            if (filters.length > 0) filters.push('AND');
            filters.push(['custrecord_fs_customer', 'anyof', params[FIELDS.SEARCH_CUSTOMER]]);
        }

        // Add status filter
        if (params[FIELDS.SEARCH_STATUS]) {
            if (filters.length > 0) filters.push('AND');
            filters.push(['custrecord_fs_status', 'anyof', params[FIELDS.SEARCH_STATUS]]);
        }

        // Default filter: exclude billed entries (unless specifically searching for them)
        if (!params[FIELDS.SEARCH_STATUS]) {
            if (filters.length > 0) filters.push('AND');
            filters.push(['custrecord_fs_status', 'noneof', '4']);  // Exclude Billed
        }

        const workEntrySearch = search.create({
            type: 'customrecord_fs_work_entry',
            filters: filters.length > 0 ? filters : [],
            columns: [
                'internalid',
                'custrecord_fs_serial',
                'custrecord_fs_customer',
                'custrecord_fs_board_type',
                'custrecord_fs_status',
                'custrecord_fs_received_date'
            ]
        });

        return workEntrySearch.run().getRange({ start: 0, end: 1000 });
    }

    /**
     * Populate sublist with search results
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
                id: SUBLIST.CUSTOMER,
                line: i,
                value: result.getText('custrecord_fs_customer') || ''
            });

            sublist.setSublistValue({
                id: SUBLIST.BOARD_TYPE,
                line: i,
                value: result.getValue('custrecord_fs_board_type') || ''
            });

            sublist.setSublistValue({
                id: SUBLIST.STATUS,
                line: i,
                value: result.getText('custrecord_fs_status') || ''
            });

            sublist.setSublistValue({
                id: SUBLIST.RECEIVED_DATE,
                line: i,
                value: result.getValue('custrecord_fs_received_date') || ''
            });
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // POST PROCESSING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Process management dashboard submission (bulk status update)
     * @param {Object} context - The Suitelet context
     */
    function processUpdate(context) {
        const params = context.request.parameters;
        const newStatus = params[FIELDS.NEW_STATUS];

        log.audit({
            title: 'Management Mode - Processing Update',
            details: 'New Status: ' + newStatus
        });

        try {
            if (!newStatus) {
                throw new Error('Please select a status to update to');
            }

            // Get selected entry IDs from sublist
            const selectedIds = getSelectedEntryIds(params);

            if (selectedIds.length === 0) {
                throw new Error('Please select at least one work entry to update');
            }

            // Update status for selected entries
            let updatedCount = 0;
            selectedIds.forEach(function(entryId) {
                recordHelpers.updateRecord('customrecord_fs_work_entry', entryId, {
                    custrecord_fs_status: newStatus
                });
                updatedCount++;
            });

            log.audit({
                title: 'Management Mode - Status Updated',
                details: 'Updated ' + updatedCount + ' entries to status: ' + newStatus
            });

            // Redirect back with success message
            redirect.toSuitelet({
                scriptId: runtime.getCurrentScript().id,
                deploymentId: runtime.getCurrentScript().deploymentId,
                parameters: {
                    mode: 'manage',
                    message: 'Successfully updated ' + updatedCount + ' work entries',
                    msgtype: 'confirmation',
                    dosearch: 'T'
                }
            });

        } catch (e) {
            log.error({
                title: 'Management Mode - Update Error',
                details: e.message + '\n' + e.stack
            });

            redirect.toSuitelet({
                scriptId: runtime.getCurrentScript().id,
                deploymentId: runtime.getCurrentScript().deploymentId,
                parameters: {
                    mode: 'manage',
                    message: 'Error updating entries: ' + e.message,
                    msgtype: 'error'
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
        while (params['custpage_work_entries_custpage_select_' + lineNum] !== undefined) {
            const isSelected = params['custpage_work_entries_custpage_select_' + lineNum];
            const entryId = params['custpage_work_entries_custpage_id_' + lineNum];

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
        buildDashboard: buildDashboard,
        processUpdate: processUpdate
    };
});
