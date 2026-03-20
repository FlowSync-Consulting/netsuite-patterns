/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope Public
 *
 * Entry Mode Client Script
 * Handles client-side behavior for the data entry form.
 *
 * Features:
 * - Auto-focus on first field for rapid entry
 * - Save and New button handler
 * - Client-side validation
 * - Clear form button
 *
 * @module fs_workflow_entry_cs
 */
define(['N/currentRecord', 'N/ui/dialog'], function(currentRecord, dialog) {
    'use strict';

    /**
     * Page initialization
     * @param {Object} context
     */
    function pageInit(context) {
        // Auto-focus on serial number field for quick entry
        const serialField = document.getElementById('custpage_serial');
        if (serialField) {
            setTimeout(function() {
                serialField.focus();
            }, 100);
        }
    }

    /**
     * Save and enter another entry
     * Sets action to save_and_new and submits the form
     */
    function saveAndNew() {
        const rec = currentRecord.get();

        // Validate required fields before submission
        if (!validateRequiredFields(rec)) {
            return;
        }

        // Set the action field
        rec.setValue({
            fieldId: 'custpage_action',
            value: 'save_and_new'
        });

        // Submit the form
        document.forms['main_form'].submit();
    }

    /**
     * Validate required fields before submission
     * @param {Record} rec - Current record
     * @returns {boolean} True if valid, false otherwise
     */
    function validateRequiredFields(rec) {
        const missing = [];

        const customer = rec.getValue({ fieldId: 'custpage_customer' });
        if (!customer) missing.push('Customer');

        const serial = rec.getValue({ fieldId: 'custpage_serial' });
        if (!serial) missing.push('Serial Number');

        const boardType = rec.getValue({ fieldId: 'custpage_board_type' });
        if (!boardType) missing.push('Equipment Type');

        const receivedDate = rec.getValue({ fieldId: 'custpage_received_date' });
        if (!receivedDate) missing.push('Received Date');

        if (missing.length > 0) {
            dialog.alert({
                title: 'Required Fields Missing',
                message: 'Please fill in the following required fields:\n\n• ' + missing.join('\n• ')
            });
            return false;
        }

        return true;
    }

    /**
     * Save record handler (before form submit)
     * @param {Object} context
     * @returns {boolean} True to allow save, false to prevent
     */
    function saveRecord(context) {
        const rec = currentRecord.get();

        // Set default action if not already set (regular save button)
        const action = rec.getValue({ fieldId: 'custpage_action' });
        if (!action) {
            rec.setValue({
                fieldId: 'custpage_action',
                value: 'save_entry'
            });
        }

        // Validate before allowing save
        return validateRequiredFields(rec);
    }

    /**
     * Field change handler
     * @param {Object} context
     */
    function fieldChanged(context) {
        // Future: Could add serial number format validation
        // Future: Could check for duplicate serial numbers via AJAX
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EXPORTS
    // ═══════════════════════════════════════════════════════════════════════════

    return {
        pageInit: pageInit,
        saveRecord: saveRecord,
        fieldChanged: fieldChanged,
        saveAndNew: saveAndNew  // Called by custom button
    };
});
