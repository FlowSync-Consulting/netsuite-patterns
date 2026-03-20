/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope Public
 *
 * Management Mode Client Script
 * Handles search, selection, and bulk actions.
 *
 * @module fs_workflow_manage_cs
 */
define(['N/currentRecord', 'N/url', 'N/ui/dialog'], function(currentRecord, url, dialog) {
    'use strict';

    function pageInit(context) {
        // Form initialized
    }

    /**
     * Search work entries - reload form with search parameters
     */
    function searchEntries() {
        const rec = currentRecord.get();

        const serialSearch = rec.getValue({ fieldId: 'custpage_search_serial' }) || '';
        const customerSearch = rec.getValue({ fieldId: 'custpage_search_customer' }) || '';
        const statusSearch = rec.getValue({ fieldId: 'custpage_search_status' }) || '';

        // Get current script URL
        const currentUrl = window.location.href;
        const baseUrl = currentUrl.split('?')[0];

        // Build search URL
        const searchUrl = baseUrl + '?mode=manage&dosearch=T' +
            '&custpage_search_serial=' + encodeURIComponent(serialSearch) +
            '&custpage_search_customer=' + encodeURIComponent(customerSearch) +
            '&custpage_search_status=' + encodeURIComponent(statusSearch);

        window.location.href = searchUrl;
    }

    /**
     * View selected work entry in new tab
     */
    function viewSelected() {
        const rec = currentRecord.get();
        const lineCount = rec.getLineCount({ sublistId: 'custpage_work_entries' });

        let selectedId = null;

        for (let i = 0; i < lineCount; i++) {
            const isSelected = rec.getSublistValue({
                sublistId: 'custpage_work_entries',
                fieldId: 'custpage_select',
                line: i
            });

            if (isSelected === true || isSelected === 'T') {
                selectedId = rec.getSublistValue({
                    sublistId: 'custpage_work_entries',
                    fieldId: 'custpage_id',
                    line: i
                });
                break;
            }
        }

        if (!selectedId) {
            dialog.alert({
                title: 'No Selection',
                message: 'Please select a work entry to view.'
            });
            return;
        }

        // Open work entry record
        const recordUrl = url.resolveRecord({
            recordType: 'customrecord_fs_work_entry',
            recordId: selectedId
        });

        window.open(recordUrl, '_blank');
    }

    /**
     * Save record handler - validate bulk action
     */
    function saveRecord(context) {
        const rec = currentRecord.get();
        const newStatus = rec.getValue({ fieldId: 'custpage_new_status' });

        if (!newStatus) {
            dialog.alert({
                title: 'Missing Status',
                message: 'Please select a status to update to.'
            });
            return false;
        }

        // Set action
        rec.setValue({
            fieldId: 'custpage_action',
            value: 'update_status'
        });

        return true;
    }

    return {
        pageInit: pageInit,
        saveRecord: saveRecord,
        searchEntries: searchEntries,
        viewSelected: viewSelected
    };
});
