/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope Public
 *
 * Billing Mode Client Script
 * Handles sales order creation form logic.
 *
 * @module fs_workflow_billing_cs
 */
define(['N/currentRecord', 'N/ui/dialog'], function(currentRecord, dialog) {
    'use strict';

    function pageInit(context) {
        // Toggle existing SO field based on initial option
        toggleExistingSoField();
    }

    /**
     * Field change handler
     */
    function fieldChanged(context) {
        if (context.fieldId === 'custpage_so_option') {
            toggleExistingSoField();
        }
    }

    /**
     * Toggle visibility of existing SO field based on option selection
     */
    function toggleExistingSoField() {
        const rec = currentRecord.get();
        const soOption = rec.getValue({ fieldId: 'custpage_so_option' });
        const existingSoField = rec.getField({ fieldId: 'custpage_existing_so' });

        if (existingSoField) {
            if (soOption === 'existing') {
                existingSoField.isDisabled = false;
                existingSoField.isMandatory = true;
            } else {
                existingSoField.isDisabled = true;
                existingSoField.isMandatory = false;
                rec.setValue({ fieldId: 'custpage_existing_so', value: '' });
            }
        }
    }

    /**
     * Load billable entries for selected customer
     */
    function loadBillableEntries() {
        const rec = currentRecord.get();
        const customerId = rec.getValue({ fieldId: 'custpage_billing_customer' });

        if (!customerId) {
            dialog.alert({
                title: 'Missing Customer',
                message: 'Please select a customer first.'
            });
            return;
        }

        // Reload page with search parameter
        const currentUrl = window.location.href;
        const baseUrl = currentUrl.split('?')[0];

        const searchUrl = baseUrl + '?mode=billing&dosearch=T' +
            '&custpage_billing_customer=' + encodeURIComponent(customerId);

        window.location.href = searchUrl;
    }

    /**
     * Save record handler - validate SO creation
     */
    function saveRecord(context) {
        const rec = currentRecord.get();

        // Check customer
        const customerId = rec.getValue({ fieldId: 'custpage_billing_customer' });
        if (!customerId) {
            dialog.alert({
                title: 'Missing Customer',
                message: 'Please select a customer.'
            });
            return false;
        }

        // Check selection
        const lineCount = rec.getLineCount({ sublistId: 'custpage_billable_entries' });
        let hasSelection = false;

        for (let i = 0; i < lineCount; i++) {
            const isSelected = rec.getSublistValue({
                sublistId: 'custpage_billable_entries',
                fieldId: 'custpage_select',
                line: i
            });
            if (isSelected) {
                hasSelection = true;
                break;
            }
        }

        if (!hasSelection) {
            dialog.alert({
                title: 'No Selection',
                message: 'Please select at least one work entry to bill.'
            });
            return false;
        }

        // Check existing SO if needed
        const soOption = rec.getValue({ fieldId: 'custpage_so_option' });
        if (soOption === 'existing') {
            const existingSo = rec.getValue({ fieldId: 'custpage_existing_so' });
            if (!existingSo) {
                dialog.alert({
                    title: 'Missing Sales Order',
                    message: 'Please select an existing sales order.'
                });
                return false;
            }
        }

        // Set action
        const action = soOption === 'existing' ? 'add_to_so' : 'create_so';
        rec.setValue({
            fieldId: 'custpage_action',
            value: action
        });

        return true;
    }

    return {
        pageInit: pageInit,
        fieldChanged: fieldChanged,
        saveRecord: saveRecord,
        loadBillableEntries: loadBillableEntries
    };
});
