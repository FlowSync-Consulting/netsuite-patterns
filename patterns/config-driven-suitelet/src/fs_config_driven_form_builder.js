/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @description Configuration-driven form builder for NetSuite Suitelets
 *
 * PATTERN: Config-Driven Suitelet
 *
 * This module separates form rendering logic from column definitions,
 * making report suitelets easier to maintain and extend.
 *
 * Instead of hardcoding columns in rendering code, you define columns
 * in a separate config file and this builder renders them automatically.
 *
 * BENEFITS:
 * - Add/remove columns without touching rendering logic
 * - Reuse the same builder across multiple suitelets
 * - Type-safe value formatting (currency, percent, dates)
 * - Consistent error handling for missing/null values
 *
 * USAGE:
 *   const builder = new ConfigDrivenFormBuilder();
 *   const form = builder.buildForm({
 *     title: 'Sales Report',
 *     resultsData: searchResults,
 *     columnConfig: COLUMN_DEFINITIONS
 *   });
 *   context.response.writePage(form);
 */
define(['N/ui/serverWidget'], (serverWidget) => {

    class ConfigDrivenFormBuilder {
        constructor() {
            this._form = null;
        }

        /**
         * Build form with results table using configuration
         * @param {Object} params
         * @param {string} params.title - Form title
         * @param {Array} params.resultsData - Array of result objects
         * @param {Array} params.columnConfig - Column configuration array
         * @param {Object} [params.sublistOptions] - Sublist options (id, label)
         * @param {string} [params.clientScriptPath] - Path to client script
         * @returns {serverWidget.Form}
         */
        buildForm(params) {
            const {
                title,
                resultsData,
                columnConfig,
                sublistOptions = {},
                clientScriptPath = null
            } = params;

            // Create base form
            this._form = serverWidget.createForm({
                title: title,
                hideNavBar: false
            });

            // Attach client script if provided
            if (clientScriptPath) {
                this._form.clientScriptModulePath = clientScriptPath;
            }

            // Add custom styling
            this._addCustomCSS();

            // Add help text
            this._addHelpText(resultsData.length);

            // Add results table
            this._addResultsTable({
                resultsData: resultsData,
                columnConfig: columnConfig,
                sublistOptions: sublistOptions
            });

            return this._form;
        }

        /**
         * Add results table using configuration-driven approach
         *
         * This is the core of the config-driven pattern.
         * Instead of manually creating each field, we iterate over
         * the column config and create fields dynamically.
         *
         * @private
         */
        _addResultsTable(params) {
            const { resultsData, columnConfig, sublistOptions } = params;

            // Create sublist
            const sublist = this._form.addSublist({
                id: sublistOptions.id || 'custpage_results',
                type: serverWidget.SublistType.LIST,
                label: sublistOptions.label || `Results (${resultsData.length} found)`
            });

            // Add fields from configuration (data-driven approach)
            columnConfig.forEach(config => {
                const field = sublist.addField({
                    id: config.id,
                    label: config.label,
                    type: config.type
                });

                if (config.displayType) {
                    field.updateDisplayType({
                        displayType: config.displayType
                    });
                }
            });

            // Populate data
            resultsData.forEach((result, index) => {
                columnConfig.forEach(config => {
                    // Skip checkbox columns (no value to set)
                    if (config.type === serverWidget.FieldType.CHECKBOX) {
                        return;
                    }

                    const value = this._getColumnValue(result, config);

                    sublist.setSublistValue({
                        id: config.id,
                        line: index,
                        value: this._getSafeSublistValue(value, config.type)
                    });
                });
            });

            return sublist;
        }

        /**
         * Extract value from result using column configuration
         *
         * Supports three value accessor patterns:
         * 1. Function: (result) => result.someField
         * 2. String path: 'field.nested.value'
         * 3. Null: returns empty string
         *
         * @private
         */
        _getColumnValue(result, config) {
            if (!config.valueAccessor) {
                return '';
            }

            // If valueAccessor is a function, call it
            if (typeof config.valueAccessor === 'function') {
                return config.valueAccessor(result);
            }

            // If it's a property path string, resolve it
            if (typeof config.valueAccessor === 'string') {
                return this._getValueByPath(result, config.valueAccessor);
            }

            return '';
        }

        /**
         * Resolve nested property path
         * @private
         * @param {Object} obj - Source object
         * @param {string} path - Dot-notation path (e.g., 'values.customer.text')
         * @returns {*} Resolved value
         */
        _getValueByPath(obj, path) {
            try {
                return path.split('.').reduce((current, prop) =>
                    current?.[prop], obj
                );
            } catch (e) {
                return null;
            }
        }

        /**
         * Ensure sublist values are safe for NetSuite
         *
         * CRITICAL: NetSuite throws INVALID_FLD_VALUE if you pass:
         * - Empty strings to some field types
         * - Improperly formatted currency (must be string with 2 decimals)
         * - Null or undefined
         *
         * This helper prevents those errors.
         *
         * @private
         */
        _getSafeSublistValue(value, fieldType, fallback = ' ') {
            // Return fallback if value is null, undefined, or empty string
            if (value === null || value === undefined || value === '') {
                return fallback;
            }

            // Handle CURRENCY fields - must be string with exactly 2 decimal places
            if (fieldType === serverWidget.FieldType.CURRENCY || fieldType === 'currency') {
                const numValue = parseFloat(value);
                if (isNaN(numValue)) {
                    return fallback;
                }
                return numValue.toFixed(2);  // Returns string like "100.50"
            }

            // Handle PERCENT fields - round to 2 decimal places
            if (fieldType === serverWidget.FieldType.PERCENT || fieldType === 'percent') {
                const numValue = parseFloat(value);
                if (isNaN(numValue)) {
                    return fallback;
                }
                return numValue.toFixed(2);  // Returns string like "83.33"
            }

            // All other types - convert to string
            return String(value);
        }

        /**
         * Add custom CSS for styling
         * @private
         */
        _addCustomCSS() {
            const cssField = this._form.addField({
                id: 'custpage_custom_css',
                type: serverWidget.FieldType.INLINEHTML,
                label: 'Custom CSS'
            });

            cssField.defaultValue = `
                <style>
                    /* Results table styling */
                    .uir-list-table {
                        width: 100%;
                        border-collapse: collapse;
                    }

                    /* Zebra striping for rows */
                    .uir-list-table tr:nth-child(even) {
                        background-color: #f8f9fa;
                    }

                    .uir-list-table tr:hover {
                        background-color: #e3f2fd;
                    }

                    /* Status-based row highlighting */
                    .status-achieved-row {
                        background-color: #d4edda !important;
                        border-left: 3px solid #28a745;
                    }

                    .status-critical-row {
                        background-color: #f8d7da !important;
                        border-left: 3px solid #dc3545;
                    }

                    .status-at-risk-row {
                        background-color: #fff3cd !important;
                        border-left: 3px solid #ffc107;
                    }

                    /* Header styling */
                    .uir-list-header-td {
                        font-weight: bold;
                        background-color: #e9ecef;
                        padding: 10px;
                    }
                </style>
            `;

            return cssField;
        }

        /**
         * Add help text
         * @private
         */
        _addHelpText(recordCount) {
            const helpField = this._form.addField({
                id: 'custpage_help_text',
                type: serverWidget.FieldType.INLINEHTML,
                label: 'Help'
            });

            helpField.defaultValue = `
                <div style="background-color: #d1ecf1; border: 1px solid #bee5eb; border-radius: 4px; padding: 15px; margin-bottom: 20px;">
                    <h3 style="margin-top: 0; color: #0c5460;">Report Results</h3>
                    <p style="margin-bottom: 10px; color: #0c5460;">
                        <strong>Showing ${recordCount} records</strong>
                    </p>
                    <p style="margin-top: 10px; margin-bottom: 0; font-size: 0.9em; color: #0c5460;">
                        <strong>Note:</strong> This report uses the configuration-driven suitelet pattern.
                        Column definitions are separated from rendering logic for easy maintenance.
                    </p>
                </div>
            `;

            return helpField;
        }
    }

    return ConfigDrivenFormBuilder;
});
