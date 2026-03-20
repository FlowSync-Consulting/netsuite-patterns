/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public
 *
 * Multi-Mode Workflow Tracker Suitelet
 * Unified interface for equipment workflow entry, management, and billing.
 *
 * Architecture: Mode-based routing pattern
 * - Single Suitelet serves multiple workflow modes
 * - Mode parameter determines which UI to render
 * - Each mode has its own module for form building and processing
 * - Shared business logic in lib/ modules
 *
 * Modes:
 * - entry: Quick data entry for new equipment intake
 * - manage: Dashboard for viewing and updating work entries
 * - billing: Sales order creation from completed work
 *
 * @module fs_workflow_tracker_sl
 * @version 1.0.0
 */
define([
    'N/ui/serverWidget',
    'N/runtime',
    'N/url',
    'N/log',
    './modes/entry_mode',
    './modes/management_mode',
    './modes/billing_mode'
], function(serverWidget, runtime, url, log, entryMode, managementMode, billingMode) {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    const MODES = {
        ENTRY: 'entry',
        MANAGE: 'manage',
        BILLING: 'billing'
    };

    const ACTIONS = {
        SAVE_ENTRY: 'save_entry',
        SAVE_AND_NEW: 'save_and_new',
        UPDATE_STATUS: 'update_status',
        CREATE_SO: 'create_so',
        ADD_TO_SO: 'add_to_so'
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // MAIN ENTRY POINT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Main entry point for Suitelet
     * Routes GET requests to mode handlers
     * Routes POST requests to action handlers
     *
     * @param {Object} context
     * @param {ServerRequest} context.request - The incoming request
     * @param {ServerResponse} context.response - The outgoing response
     */
    function onRequest(context) {
        try {
            if (context.request.method === 'GET') {
                handleGet(context);
            } else {
                handlePost(context);
            }
        } catch (e) {
            log.error({
                title: 'Workflow Tracker Error',
                details: 'Error in onRequest: ' + e.message + '\n' + e.stack
            });

            // Show error page
            const errorForm = serverWidget.createForm({ title: 'Error' });
            errorForm.addPageInitMessage({
                type: serverWidget.MessageType.ERROR,
                title: 'An error occurred',
                message: e.message
            });
            context.response.writePage(errorForm);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GET REQUEST HANDLER (Mode Routing)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Handle GET requests - route to appropriate mode
     * @param {Object} context
     */
    function handleGet(context) {
        const params = context.request.parameters;
        const mode = params.mode || MODES.ENTRY;

        log.debug({
            title: 'handleGet',
            details: 'Mode: ' + mode
        });

        let form;

        switch (mode) {
            case MODES.ENTRY:
                form = entryMode.buildForm(context);
                break;

            case MODES.MANAGE:
                form = managementMode.buildDashboard(context);
                break;

            case MODES.BILLING:
                form = billingMode.buildBillingForm(context);
                break;

            default:
                log.audit({
                    title: 'Invalid Mode',
                    details: 'Unknown mode: ' + mode + ', defaulting to entry'
                });
                form = entryMode.buildForm(context);
                break;
        }

        // Add mode navigation tabs
        addModeNavigation(form, mode, params);

        // Write the form to response
        context.response.writePage(form);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // POST REQUEST HANDLER (Action Routing)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Handle POST requests - route to appropriate action handler
     * @param {Object} context
     */
    function handlePost(context) {
        const params = context.request.parameters;
        const action = params.custpage_action;

        log.debug({
            title: 'handlePost',
            details: 'Action: ' + action
        });

        switch (action) {
            case ACTIONS.SAVE_ENTRY:
            case ACTIONS.SAVE_AND_NEW:
                entryMode.processEntry(context);
                break;

            case ACTIONS.UPDATE_STATUS:
                managementMode.processUpdate(context);
                break;

            case ACTIONS.CREATE_SO:
            case ACTIONS.ADD_TO_SO:
                billingMode.processBilling(context);
                break;

            default:
                throw new Error('Unknown action: ' + action);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // NAVIGATION HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Add mode navigation tabs to form
     * @param {Form} form - The NetSuite form
     * @param {string} currentMode - The currently active mode
     * @param {Object} params - Request parameters (for preserving external access tokens)
     */
    function addModeNavigation(form, currentMode, params) {
        const baseUrl = getScriptUrl(params);

        const tabs = [
            { label: 'Entry', mode: MODES.ENTRY },
            { label: 'Management', mode: MODES.MANAGE },
            { label: 'Billing', mode: MODES.BILLING }
        ];

        tabs.forEach(function(tab) {
            const tabUrl = baseUrl + '&mode=' + tab.mode;
            const isActive = (tab.mode === currentMode);

            // Add visual indicator for active tab
            const label = isActive ? '▶ ' + tab.label : tab.label;

            form.addButton({
                id: 'custpage_tab_' + tab.mode,
                label: label,
                functionName: 'navigateToMode(\'' + tabUrl + '\')'
            });
        });

        // Add client script for navigation (inline for simplicity)
        form.addField({
            id: 'custpage_nav_script',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Navigation Script'
        }).updateDisplayType({
            displayType: serverWidget.FieldDisplayType.HIDDEN
        }).defaultValue = '<script>function navigateToMode(url) { window.location.href = url; }</script>';
    }

    /**
     * Build the script URL, preserving external access parameters if present
     * @param {Object} params - Request parameters
     * @returns {string} Script URL
     */
    function getScriptUrl(params) {
        let baseUrl = url.resolveScript({
            scriptId: runtime.getCurrentScript().id,
            deploymentId: runtime.getCurrentScript().deploymentId
        });

        // Preserve external access parameters (ns-at token and compid)
        // This allows the Suitelet to work from external/public URLs
        if (params && params['ns-at']) {
            baseUrl += '&compid=' + encodeURIComponent(params.compid || '') +
                       '&ns-at=' + encodeURIComponent(params['ns-at']);
        }

        return baseUrl;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EXPORTS
    // ═══════════════════════════════════════════════════════════════════════════

    return {
        onRequest: onRequest
    };
});
