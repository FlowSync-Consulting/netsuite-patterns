/**
 * @NApiVersion 2.1
 * @description Result renderer for batch transaction search - renders search results with pagination
 */
define(['N/ui/serverWidget', 'N/url', 'N/runtime'], (serverWidget, url, runtime) => {

    /**
     * Render search results with pagination and sorting
     * @param {serverWidget.Form} form - The Suitelet form
     * @param {Array<search.Result>} results - Search results to render
     * @param {Object} options - Rendering options
     * @param {number} options.pageNumber - Current page number (0-indexed)
     * @param {number} options.pageSize - Results per page
     * @param {number} options.totalCount - Total result count
     * @param {string} options.sortColumn - Currently sorted column
     * @param {string} options.sortDir - Sort direction (ASC/DESC)
     */
    function renderResults(form, results, options) {
        const {
            pageNumber = 0,
            pageSize = 50,
            totalCount = 0,
            sortColumn = 'trandate',
            sortDir = 'DESC'
        } = options;

        // Create sublist for results
        const sublist = form.addSublist({
            id: 'custpage_results',
            type: serverWidget.SublistType.LIST,
            label: `Search Results (Page ${pageNumber + 1} of ${Math.ceil(totalCount / pageSize)})`
        });

        // Add columns with sorting
        addSortableColumn(sublist, 'custpage_trandate', 'Date', sortColumn, sortDir, 'trandate');
        addSortableColumn(sublist, 'custpage_type', 'Type', sortColumn, sortDir, 'type');
        addSortableColumn(sublist, 'custpage_tranid', 'Number', sortColumn, sortDir, 'tranid');
        addSortableColumn(sublist, 'custpage_entity', 'Entity', sortColumn, sortDir, 'entity');
        addSortableColumn(sublist, 'custpage_status', 'Status', sortColumn, sortDir, 'status');
        addSortableColumn(sublist, 'custpage_amount', 'Amount', sortColumn, sortDir, 'amount');
        sublist.addField({
            id: 'custpage_memo',
            type: serverWidget.FieldType.TEXT,
            label: 'Memo'
        });

        // Populate results
        results.forEach((result, index) => {
            sublist.setSublistValue({
                id: 'custpage_trandate',
                line: index,
                value: result.getValue('trandate') || ''
            });

            sublist.setSublistValue({
                id: 'custpage_type',
                line: index,
                value: result.getText('type') || ''
            });

            // Make transaction number a clickable link
            const tranId = result.getValue('tranid') || '';
            const recordType = result.getValue('type');
            const recordId = result.id;
            const recordUrl = url.resolveRecord({
                recordType: recordType,
                recordId: recordId,
                isEditMode: false
            });

            sublist.setSublistValue({
                id: 'custpage_tranid',
                line: index,
                value: `<a href="${recordUrl}" target="_blank">${tranId}</a>`
            });

            sublist.setSublistValue({
                id: 'custpage_entity',
                line: index,
                value: result.getText('entity') || ''
            });

            sublist.setSublistValue({
                id: 'custpage_status',
                line: index,
                value: result.getText('status') || ''
            });

            sublist.setSublistValue({
                id: 'custpage_amount',
                line: index,
                value: formatCurrency(result.getValue('amount'))
            });

            sublist.setSublistValue({
                id: 'custpage_memo',
                line: index,
                value: result.getValue('memo') || ''
            });
        });

        // Add pagination controls
        addPaginationControls(form, pageNumber, pageSize, totalCount);

        // Add summary row
        addSummaryRow(form, results);
    }

    /**
     * Add sortable column with click handler
     * @param {serverWidget.Sublist} sublist
     * @param {string} id - Field ID
     * @param {string} label - Column label
     * @param {string} currentSortColumn - Currently sorted column
     * @param {string} currentSortDir - Current sort direction
     * @param {string} columnName - Column name for sorting
     */
    function addSortableColumn(sublist, id, label, currentSortColumn, currentSortDir, columnName) {
        let displayLabel = label;

        // Add sort indicator if this column is currently sorted
        if (currentSortColumn === columnName) {
            displayLabel += (currentSortDir === 'ASC') ? ' ▲' : ' ▼';
        }

        const field = sublist.addField({
            id: id,
            type: serverWidget.FieldType.TEXT,
            label: displayLabel
        });

        return field;
    }

    /**
     * Add pagination controls to form
     * @param {serverWidget.Form} form
     * @param {number} pageNumber
     * @param {number} pageSize
     * @param {number} totalCount
     */
    function addPaginationControls(form, pageNumber, pageSize, totalCount) {
        const totalPages = Math.ceil(totalCount / pageSize);

        if (totalPages <= 1) {
            return; // No pagination needed
        }

        const paginationGroup = form.addFieldGroup({
            id: 'custpage_pagination_group',
            label: 'Pagination'
        });

        // Previous button
        if (pageNumber > 0) {
            form.addButton({
                id: 'custpage_prev_page',
                label: '← Previous',
                functionName: `goToPage(${pageNumber - 1})`
            });
        }

        // Page info field
        const pageInfoField = form.addField({
            id: 'custpage_page_info',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Page',
            container: 'custpage_pagination_group'
        });
        pageInfoField.defaultValue = `<div style="padding: 10px; font-weight: bold;">Page ${pageNumber + 1} of ${totalPages}</div>`;

        // Next button
        if (pageNumber < totalPages - 1) {
            form.addButton({
                id: 'custpage_next_page',
                label: 'Next →',
                functionName: `goToPage(${pageNumber + 1})`
            });
        }
    }

    /**
     * Add summary row with totals
     * @param {serverWidget.Form} form
     * @param {Array<search.Result>} results
     */
    function addSummaryRow(form, results) {
        if (!results || results.length === 0) {
            return;
        }

        // Calculate total amount
        let totalAmount = 0;
        results.forEach(result => {
            const amount = parseFloat(result.getValue('amount') || '0');
            if (!isNaN(amount)) {
                totalAmount += amount;
            }
        });

        const summaryGroup = form.addFieldGroup({
            id: 'custpage_summary_group',
            label: 'Summary'
        });

        const summaryField = form.addField({
            id: 'custpage_summary',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Summary',
            container: 'custpage_summary_group'
        });

        summaryField.defaultValue = `
            <div style="padding: 10px; background-color: #f5f5f5; border: 1px solid #ddd; margin-top: 10px;">
                <strong>Results on this page:</strong> ${results.length}<br>
                <strong>Total Amount (this page):</strong> ${formatCurrency(totalAmount)}
            </div>
        `;
    }

    /**
     * Format currency value
     * @param {string|number} value
     * @returns {string}
     */
    function formatCurrency(value) {
        const num = parseFloat(value);
        if (isNaN(num)) {
            return '$0.00';
        }
        return '$' + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    /**
     * Build URL for pagination/sorting
     * @param {number} page
     * @param {string} sortColumn
     * @param {string} sortDir
     * @returns {string}
     */
    function buildPageUrl(page, sortColumn, sortDir) {
        const script = runtime.getCurrentScript();
        return url.resolveScript({
            scriptId: script.id,
            deploymentId: script.deploymentId,
            params: {
                custpage_page: page,
                custpage_sort_column: sortColumn,
                custpage_sort_dir: sortDir,
                custpage_search_submitted: 'T'
            }
        });
    }

    return {
        renderResults: renderResults,
        formatCurrency: formatCurrency
    };
});
