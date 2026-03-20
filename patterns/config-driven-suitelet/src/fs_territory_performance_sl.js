/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NScriptId customscript_fs_territory_performance
 * @NScriptName FS Territory Performance Report
 * @description Demonstrates the config-driven suitelet pattern
 *
 * PATTERN: Config-Driven Suitelet
 *
 * This suitelet demonstrates how to separate concerns:
 * 1. Column definitions → fs_territory_report_columns_config.js
 * 2. Form rendering → fs_config_driven_form_builder.js
 * 3. Business logic → this file
 *
 * BENEFITS:
 * - Easy to add/remove columns (edit config file only)
 * - Reusable form builder across multiple suitelets
 * - Testable (mock the config and test rendering separately)
 * - Maintainable (each concern in its own file)
 *
 * EXAMPLE USE CASE:
 * This suitelet shows year-over-year territory performance with:
 * - Prior year sales, current year sales, growth %, and goal achievement
 * - Pivot table layout (territories as rows, months as columns)
 * - Data from custom records (territory goals and transaction export)
 */
define([
    './fs_territory_report_columns_config',
    './fs_config_driven_form_builder',
    'N/search',
    'N/log'
], (
    ColumnConfig,
    ConfigDrivenFormBuilder,
    search,
    log
) => {

    /**
     * Handle GET requests - Display territory performance report
     * @param {Object} context
     * @param {ServerRequest} context.request
     * @param {ServerResponse} context.response
     */
    function onRequest(context) {
        try {
            log.audit('Territory Performance Report', 'Loading data...');

            // Load territory goals and sales data
            const territoryData = loadTerritoryData();

            if (!territoryData || territoryData.length === 0) {
                displayNoDataWarning(context);
                return;
            }

            // Initialize form builder
            const formBuilder = new ConfigDrivenFormBuilder();

            // Build form using pivot table configuration
            // NOTICE: We pass the column config here, and the builder
            // handles all the rendering logic automatically
            const form = formBuilder.buildForm({
                title: 'Territory Performance - Year-over-Year Comparison',
                resultsData: territoryData,
                columnConfig: ColumnConfig.PIVOT_TABLE_COLUMNS,
                sublistOptions: {
                    id: 'custpage_territory_performance',
                    label: `Territory Performance (${territoryData.length} rows)`
                }
            });

            // Write form to response
            context.response.writePage(form);

            log.audit('Territory Performance Report', 'Report rendered successfully');

        } catch (e) {
            log.error('Error in onRequest', {
                name: e.name,
                message: e.message,
                stack: e.stack
            });

            displayErrorPage(context, 'Error Loading Report', e.message);
        }
    }

    /**
     * Load territory data with YoY comparison
     *
     * In a real implementation, this would:
     * 1. Query custom records for territory goals
     * 2. Query transaction export records for sales data
     * 3. Aggregate by territory and month
     * 4. Calculate growth percentages
     * 5. Return pivot table format
     *
     * For this demo, we return sample data structure.
     *
     * @returns {Array<Object>} Territory data in pivot format
     */
    function loadTerritoryData() {
        try {
            // EXAMPLE: In production, this would be a saved search or
            // SuiteQL query against your custom records

            // For this pattern demo, return mock data structure
            // showing what the pivot table data looks like
            return [
                {
                    territory_name: 'Territory 1 - East',
                    territory_id: '1',
                    // January data
                    month_1_prior: 45000.00,
                    month_1_growth: 15.5,
                    month_1_current: 52000.00,
                    month_1_goal: 50000.00,
                    // February data
                    month_2_prior: 48000.00,
                    month_2_growth: 10.2,
                    month_2_current: 53000.00,
                    month_2_goal: 52000.00,
                    // ... (months 3-12 would be here in production)
                    // Totals
                    total_prior: 540000.00,
                    total_growth: 12.3,
                    total_current: 606420.00,
                    total_goal: 600000.00
                },
                {
                    territory_name: 'Territory 2 - West',
                    territory_id: '2',
                    month_1_prior: 38000.00,
                    month_1_growth: 8.5,
                    month_1_current: 41230.00,
                    month_1_goal: 42000.00,
                    month_2_prior: 40000.00,
                    month_2_growth: 5.0,
                    month_2_current: 42000.00,
                    month_2_goal: 43000.00,
                    total_prior: 480000.00,
                    total_growth: 7.8,
                    total_current: 517440.00,
                    total_goal: 520000.00
                }
            ];

            // PRODUCTION IMPLEMENTATION EXAMPLE:
            /*
            const salesSearch = search.create({
                type: 'customrecord_fs_transaction_export',
                filters: [
                    ['custrecord_fs_year', 'anyof', [currentYear, priorYear]]
                ],
                columns: [
                    search.createColumn({ name: 'custrecord_fs_territory', summary: 'GROUP' }),
                    search.createColumn({ name: 'custrecord_fs_month', summary: 'GROUP' }),
                    search.createColumn({ name: 'custrecord_fs_amount', summary: 'SUM' })
                ]
            });

            // Execute search and transform results into pivot format
            const results = getAllResults(salesSearch);
            return transformToPivotFormat(results);
            */

        } catch (e) {
            log.error('loadTerritoryData Error', e.toString());
            return [];
        }
    }

    /**
     * Display warning when no data is available
     * @param {Object} context - Suitelet context
     */
    function displayNoDataWarning(context) {
        const warningHtml = `
            <html>
            <head>
                <title>No Data Available</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 40px; background-color: #f8f9fa; }
                    .warning-container {
                        background-color: #fff3cd;
                        border: 2px solid #ffc107;
                        padding: 30px;
                        border-radius: 4px;
                        max-width: 700px;
                        margin: 0 auto;
                    }
                    h1 { color: #856404; margin-top: 0; }
                </style>
            </head>
            <body>
                <div class="warning-container">
                    <h1>No Territory Data Found</h1>
                    <p>No territory performance data is available for the current year.</p>
                    <p>Please ensure territory goals and transaction data have been loaded.</p>
                </div>
            </body>
            </html>
        `;

        context.response.write(warningHtml);
    }

    /**
     * Display error page
     * @param {Object} context - Suitelet context
     * @param {string} title - Error title
     * @param {string} message - Error message
     */
    function displayErrorPage(context, title, message) {
        const errorHtml = `
            <html>
            <head>
                <title>${title}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; background-color: #f8f9fa; }
                    .error-container {
                        background-color: #f8d7da;
                        border: 2px solid #f5c6cb;
                        padding: 20px;
                        border-radius: 4px;
                        max-width: 800px;
                        margin: 0 auto;
                    }
                    h1 { color: #721c24; margin-top: 0; }
                </style>
            </head>
            <body>
                <div class="error-container">
                    <h1>${title}</h1>
                    <p>${message}</p>
                </div>
            </body>
            </html>
        `;

        context.response.write(errorHtml);
    }

    return {
        onRequest: onRequest
    };
});
