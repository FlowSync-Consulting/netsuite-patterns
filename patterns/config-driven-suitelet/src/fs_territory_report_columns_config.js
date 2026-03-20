/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @description Column configuration for Territory Performance Report
 *
 * PATTERN: Config-Driven Column Definitions
 *
 * This file demonstrates the config-driven pattern by separating
 * column definitions from rendering logic.
 *
 * Each column config has:
 * - id: NetSuite field ID (must start with 'custpage_')
 * - label: Column header text
 * - type: NetSuite field type (TEXT, CURRENCY, PERCENT, etc.)
 * - displayType: How the field is displayed (INLINE = read-only)
 * - valueAccessor: How to extract the value from result data
 *
 * VALUE ACCESSOR PATTERNS:
 * 1. String property path: 'territory_name'
 * 2. Function for calculated values: (result) => result.current - result.prior
 * 3. Complex calculations: (result) => ((current / prior) * 100).toFixed(2)
 */
define(['N/ui/serverWidget'], (serverWidget) => {

    /**
     * Month names for column headers
     * @const
     */
    const MONTH_NAMES = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    /**
     * Generate pivot table columns dynamically
     *
     * This function demonstrates data-driven column generation.
     * Instead of hardcoding 12 months × 4 metrics = 48 columns,
     * we generate them programmatically.
     *
     * Layout: Territory | Jan Prior $ | Jan Growth % | Jan Current $ | Jan Goal $ | ... | Totals
     *
     * @returns {Array<ColumnConfig>} Column configuration array
     */
    function generatePivotTableColumns() {
        const columns = [];

        // Territory column (fixed)
        columns.push({
            id: 'custpage_territory',
            label: 'Territory',
            type: serverWidget.FieldType.TEXT,
            displayType: serverWidget.FieldDisplayType.INLINE,
            width: 150,
            valueAccessor: 'territory_name'
        });

        // Generate columns for each month (1-12)
        for (let month = 1; month <= 12; month++) {
            const monthName = MONTH_NAMES[month - 1];
            const monthKey = 'month_' + month;

            // Prior Year Sales
            columns.push({
                id: 'custpage_' + monthKey + '_prior',
                label: monthName + ' Prior $',
                type: serverWidget.FieldType.CURRENCY,
                displayType: serverWidget.FieldDisplayType.INLINE,
                width: 100,
                valueAccessor: monthKey + '_prior'
            });

            // Growth % (calculated: (current - prior) / prior * 100)
            columns.push({
                id: 'custpage_' + monthKey + '_growth',
                label: monthName + ' Growth %',
                type: serverWidget.FieldType.PERCENT,
                displayType: serverWidget.FieldDisplayType.INLINE,
                width: 90,
                valueAccessor: monthKey + '_growth'
            });

            // Current Year Sales
            columns.push({
                id: 'custpage_' + monthKey + '_current',
                label: monthName + ' Current $',
                type: serverWidget.FieldType.CURRENCY,
                displayType: serverWidget.FieldDisplayType.INLINE,
                width: 100,
                valueAccessor: monthKey + '_current'
            });

            // Goal Amount
            columns.push({
                id: 'custpage_' + monthKey + '_goal',
                label: monthName + ' Goal $',
                type: serverWidget.FieldType.CURRENCY,
                displayType: serverWidget.FieldDisplayType.INLINE,
                width: 100,
                valueAccessor: monthKey + '_goal'
            });
        }

        // Total columns (summary of all months)
        columns.push({
            id: 'custpage_total_prior',
            label: 'Total Prior $',
            type: serverWidget.FieldType.CURRENCY,
            displayType: serverWidget.FieldDisplayType.INLINE,
            width: 110,
            valueAccessor: 'total_prior'
        });

        columns.push({
            id: 'custpage_total_growth',
            label: 'Total Growth %',
            type: serverWidget.FieldType.PERCENT,
            displayType: serverWidget.FieldDisplayType.INLINE,
            width: 100,
            valueAccessor: 'total_growth'
        });

        columns.push({
            id: 'custpage_total_current',
            label: 'Total Current $',
            type: serverWidget.FieldType.CURRENCY,
            displayType: serverWidget.FieldDisplayType.INLINE,
            width: 110,
            valueAccessor: 'total_current'
        });

        columns.push({
            id: 'custpage_total_goal',
            label: 'Total Goal $',
            type: serverWidget.FieldType.CURRENCY,
            displayType: serverWidget.FieldDisplayType.INLINE,
            width: 110,
            valueAccessor: 'total_goal'
        });

        return columns;
    }

    /**
     * Simple month-by-month view (non-pivot)
     * For comparison: this shows the traditional approach
     */
    const MONTHLY_DETAIL_COLUMNS = [
        {
            id: 'custpage_territory',
            label: 'Territory',
            type: serverWidget.FieldType.TEXT,
            displayType: serverWidget.FieldDisplayType.INLINE,
            width: 150,
            valueAccessor: 'territory_name'
        },
        {
            id: 'custpage_month',
            label: 'Month',
            type: serverWidget.FieldType.TEXT,
            displayType: serverWidget.FieldDisplayType.INLINE,
            width: 100,
            valueAccessor: 'period'  // YYYY-MM format
        },
        {
            id: 'custpage_prior_year',
            label: 'Prior Year Sales',
            type: serverWidget.FieldType.CURRENCY,
            displayType: serverWidget.FieldDisplayType.INLINE,
            width: 130,
            // Function accessor for calculated formatting
            valueAccessor: (result) => {
                const amount = result.prior_year_sales || 0;
                return parseFloat(amount).toFixed(2);
            }
        },
        {
            id: 'custpage_current_year',
            label: 'Current Year Sales',
            type: serverWidget.FieldType.CURRENCY,
            displayType: serverWidget.FieldDisplayType.INLINE,
            width: 140,
            valueAccessor: (result) => {
                const amount = result.current_year_sales || 0;
                return parseFloat(amount).toFixed(2);
            }
        },
        {
            id: 'custpage_monthly_goal',
            label: 'Monthly Goal',
            type: serverWidget.FieldType.CURRENCY,
            displayType: serverWidget.FieldDisplayType.INLINE,
            width: 130,
            valueAccessor: (result) => {
                const amount = result.monthly_goal || 0;
                return parseFloat(amount).toFixed(2);
            }
        },
        {
            id: 'custpage_variance_pct',
            label: 'YoY Variance %',
            type: serverWidget.FieldType.PERCENT,
            displayType: serverWidget.FieldDisplayType.INLINE,
            width: 110,
            // Complex calculation example
            valueAccessor: (result) => {
                const current = parseFloat(result.current_year_sales) || 0;
                const prior = parseFloat(result.prior_year_sales) || 0;

                if (prior === 0) return '0.0';

                const variance = ((current - prior) / prior) * 100;
                return variance.toFixed(1);
            }
        }
    ];

    // Generate the pivot table columns
    const PIVOT_TABLE_COLUMNS = generatePivotTableColumns();

    return {
        PIVOT_TABLE_COLUMNS,
        MONTHLY_DETAIL_COLUMNS
    };
});
