/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NScriptId customscript_fs_batch_search
 * @NScriptName FS Batch Transaction Search
 * @description Parameter-driven transaction search tool with pagination, sorting, and CSV export
 *
 * PATTERN: Batch Transaction Search
 *
 * This suitelet demonstrates how to build flexible search interfaces:
 * 1. Dynamic filter building from user inputs
 * 2. Paginated results with configurable page size
 * 3. Column sorting
 * 4. CSV export functionality
 * 5. Reusable search parameter parser and result renderer
 *
 * BENEFITS:
 * - User-friendly search interface for finding transactions
 * - Handles large result sets with pagination
 * - Exportable results for further analysis
 * - Extensible filter criteria
 *
 * EXAMPLE USE CASE:
 * Finance team needs to search for transactions matching multiple criteria:
 * - Date range (posted date)
 * - Transaction type (Invoice, Sales Order, Credit Memo)
 * - Customer/Vendor
 * - Status (Open, Paid, Pending)
 * - Amount range (minimum/maximum)
 *
 * [See the full case study](https://flowsyncconsulting.com/portfolio/suitelet-transaction-lookup/)
 */
define([
    './lib/input_parser',
    './lib/result_renderer',
    'N/ui/serverWidget',
    'N/search',
    'N/log',
    'N/redirect',
    'N/runtime',
    'N/file'
], (
    InputParser,
    ResultRenderer,
    serverWidget,
    search,
    log,
    redirect,
    runtime,
    file
) => {

    const PAGE_SIZE = 50;

    /**
     * Handle GET and POST requests
     * @param {Object} context
     * @param {ServerRequest} context.request
     * @param {ServerResponse} context.response
     */
    function onRequest(context) {
        try {
            if (context.request.method === 'GET') {
                handleGet(context);
            } else {
                handlePost(context);
            }
        } catch (e) {
            log.error('Error in onRequest', {
                name: e.name,
                message: e.message,
                stack: e.stack
            });

            const errorForm = serverWidget.createForm({
                title: 'Batch Transaction Search - Error'
            });

            errorForm.addPageInitMessage({
                type: serverWidget.MessageType.ERROR,
                title: 'Search Error',
                message: 'An error occurred: ' + e.message
            });

            context.response.writePage(errorForm);
        }
    }

    /**
     * Handle GET requests - Display search form with optional results
     * @param {Object} context
     */
    function handleGet(context) {
        const params = context.request.parameters;
        const form = buildSearchForm(params);

        // If search criteria provided, execute search and show results
        if (params.custpage_search_submitted === 'T') {
            executeSearchAndRender(form, params);
        }

        context.response.writePage(form);
    }

    /**
     * Handle POST requests - CSV export
     * @param {Object} context
     */
    function handlePost(context) {
        const params = context.request.parameters;
        const action = params.custpage_action;

        if (action === 'export_csv') {
            exportResultsToCSV(context, params);
        } else {
            // Default: redirect back to form with search criteria
            redirect.toSuitelet({
                scriptId: runtime.getCurrentScript().id,
                deploymentId: runtime.getCurrentScript().deploymentId,
                parameters: buildRedirectParams(params)
            });
        }
    }

    /**
     * Build the search form with criteria fields
     * @param {Object} params - Request parameters (for pre-filling)
     * @returns {serverWidget.Form}
     */
    function buildSearchForm(params) {
        const form = serverWidget.createForm({
            title: 'Batch Transaction Search'
        });

        // Add field group for search criteria
        const criteriaGroup = form.addFieldGroup({
            id: 'custpage_criteria_group',
            label: 'Search Criteria'
        });

        // Date range
        const dateFromField = form.addField({
            id: 'custpage_date_from',
            type: serverWidget.FieldType.DATE,
            label: 'Date From',
            container: 'custpage_criteria_group'
        });
        if (params.custpage_date_from) {
            dateFromField.defaultValue = params.custpage_date_from;
        }

        const dateToField = form.addField({
            id: 'custpage_date_to',
            type: serverWidget.FieldType.DATE,
            label: 'Date To',
            container: 'custpage_criteria_group'
        });
        if (params.custpage_date_to) {
            dateToField.defaultValue = params.custpage_date_to;
        }

        // Transaction type (multi-select)
        const typeField = form.addField({
            id: 'custpage_tran_type',
            type: serverWidget.FieldType.MULTISELECT,
            label: 'Transaction Type',
            container: 'custpage_criteria_group'
        });
        typeField.addSelectOption({ value: '', text: '' });
        typeField.addSelectOption({ value: 'SalesOrd', text: 'Sales Order' });
        typeField.addSelectOption({ value: 'CustInvc', text: 'Invoice' });
        typeField.addSelectOption({ value: 'CustCred', text: 'Credit Memo' });
        typeField.addSelectOption({ value: 'CustPymt', text: 'Customer Payment' });
        if (params.custpage_tran_type) {
            typeField.defaultValue = params.custpage_tran_type.split(',');
        }

        // Entity (Customer/Vendor)
        const entityField = form.addField({
            id: 'custpage_entity',
            type: serverWidget.FieldType.SELECT,
            label: 'Customer/Vendor',
            container: 'custpage_criteria_group'
        });
        entityField.addSelectOption({ value: '', text: '' });
        // In production, this would be dynamically populated or use source: 'customer'
        if (params.custpage_entity) {
            entityField.defaultValue = params.custpage_entity;
        }

        // Status
        const statusField = form.addField({
            id: 'custpage_status',
            type: serverWidget.FieldType.MULTISELECT,
            label: 'Status',
            container: 'custpage_criteria_group'
        });
        statusField.addSelectOption({ value: '', text: '' });
        statusField.addSelectOption({ value: 'SalesOrd:A', text: 'Pending Approval' });
        statusField.addSelectOption({ value: 'SalesOrd:B', text: 'Pending Fulfillment' });
        statusField.addSelectOption({ value: 'CustInvc:A', text: 'Open' });
        statusField.addSelectOption({ value: 'CustInvc:B', text: 'Paid In Full' });
        if (params.custpage_status) {
            statusField.defaultValue = params.custpage_status.split(',');
        }

        // Amount range
        const amountMinField = form.addField({
            id: 'custpage_amount_min',
            type: serverWidget.FieldType.CURRENCY,
            label: 'Amount Minimum',
            container: 'custpage_criteria_group'
        });
        if (params.custpage_amount_min) {
            amountMinField.defaultValue = params.custpage_amount_min;
        }

        const amountMaxField = form.addField({
            id: 'custpage_amount_max',
            type: serverWidget.FieldType.CURRENCY,
            label: 'Amount Maximum',
            container: 'custpage_criteria_group'
        });
        if (params.custpage_amount_max) {
            amountMaxField.defaultValue = params.custpage_amount_max;
        }

        // Hidden fields for pagination/sorting
        form.addField({
            id: 'custpage_page',
            type: serverWidget.FieldType.INTEGER,
            label: 'Page'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN })
            .defaultValue = params.custpage_page || '0';

        form.addField({
            id: 'custpage_sort_column',
            type: serverWidget.FieldType.TEXT,
            label: 'Sort Column'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN })
            .defaultValue = params.custpage_sort_column || 'trandate';

        form.addField({
            id: 'custpage_sort_dir',
            type: serverWidget.FieldType.TEXT,
            label: 'Sort Direction'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN })
            .defaultValue = params.custpage_sort_dir || 'DESC';

        form.addField({
            id: 'custpage_search_submitted',
            type: serverWidget.FieldType.TEXT,
            label: 'Search Submitted'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN })
            .defaultValue = 'T';

        form.addField({
            id: 'custpage_action',
            type: serverWidget.FieldType.TEXT,
            label: 'Action'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        // Buttons
        form.addSubmitButton({ label: 'Search' });

        form.addButton({
            id: 'custpage_reset',
            label: 'Reset',
            functionName: 'resetForm'
        });

        form.addButton({
            id: 'custpage_export',
            label: 'Export to CSV',
            functionName: 'exportToCSV'
        });

        // Add client script for button handlers
        form.clientScriptModulePath = './client_scripts/fs_batch_search_cs.js';

        return form;
    }

    /**
     * Execute search based on parameters and render results
     * @param {serverWidget.Form} form
     * @param {Object} params
     */
    function executeSearchAndRender(form, params) {
        // Parse search criteria
        const filters = InputParser.parseSearchCriteria(params);

        if (!filters || filters.length === 0) {
            form.addPageInitMessage({
                type: serverWidget.MessageType.WARNING,
                title: 'No Criteria',
                message: 'Please specify at least one search criterion.'
            });
            return;
        }

        // Build search columns
        const columns = [
            search.createColumn({ name: 'trandate', sort: getSortDirection(params, 'trandate') }),
            search.createColumn({ name: 'type' }),
            search.createColumn({ name: 'tranid' }),
            search.createColumn({ name: 'entity' }),
            search.createColumn({ name: 'status' }),
            search.createColumn({ name: 'amount' }),
            search.createColumn({ name: 'memo' })
        ];

        // Apply column sorting
        const sortColumn = params.custpage_sort_column || 'trandate';
        const sortIndex = getColumnIndex(sortColumn);
        if (sortIndex >= 0 && sortIndex < columns.length) {
            columns[sortIndex].sort = params.custpage_sort_dir === 'ASC'
                ? search.Sort.ASC
                : search.Sort.DESC;
        }

        // Create and run search
        const transactionSearch = search.create({
            type: search.Type.TRANSACTION,
            filters: filters,
            columns: columns
        });

        // Get paginated results
        const pageNumber = parseInt(params.custpage_page || '0', 10);
        const startIndex = pageNumber * PAGE_SIZE;
        const endIndex = startIndex + PAGE_SIZE;

        const results = transactionSearch.run().getRange({
            start: startIndex,
            end: endIndex
        });

        // Get total count (for pagination)
        const totalCount = getTotalCount(transactionSearch);

        log.audit('Search Results', {
            filters: filters.length,
            results: results.length,
            page: pageNumber,
            total: totalCount
        });

        // Render results
        ResultRenderer.renderResults(form, results, {
            pageNumber: pageNumber,
            pageSize: PAGE_SIZE,
            totalCount: totalCount,
            sortColumn: sortColumn,
            sortDir: params.custpage_sort_dir || 'DESC'
        });

        // Add result summary message
        const resultMessage = `Found ${totalCount} transaction(s). Showing ${startIndex + 1}-${Math.min(endIndex, totalCount)}.`;
        form.addPageInitMessage({
            type: serverWidget.MessageType.CONFIRMATION,
            title: 'Search Complete',
            message: resultMessage
        });
    }

    /**
     * Get sort direction for column
     * @param {Object} params
     * @param {string} columnName
     * @returns {search.Sort}
     */
    function getSortDirection(params, columnName) {
        if (params.custpage_sort_column === columnName) {
            return params.custpage_sort_dir === 'ASC'
                ? search.Sort.ASC
                : search.Sort.DESC;
        }
        return search.Sort.NONE;
    }

    /**
     * Get column index by name
     * @param {string} columnName
     * @returns {number}
     */
    function getColumnIndex(columnName) {
        const columns = ['trandate', 'type', 'tranid', 'entity', 'status', 'amount', 'memo'];
        return columns.indexOf(columnName);
    }

    /**
     * Get total result count
     * @param {search.Search} searchObj
     * @returns {number}
     */
    function getTotalCount(searchObj) {
        const countResult = searchObj.runPaged({ pageSize: 1000 });
        return countResult.count;
    }

    /**
     * Export search results to CSV
     * @param {Object} context
     * @param {Object} params
     */
    function exportResultsToCSV(context, params) {
        const filters = InputParser.parseSearchCriteria(params);

        const columns = [
            search.createColumn({ name: 'trandate' }),
            search.createColumn({ name: 'type' }),
            search.createColumn({ name: 'tranid' }),
            search.createColumn({ name: 'entity' }),
            search.createColumn({ name: 'status' }),
            search.createColumn({ name: 'amount' }),
            search.createColumn({ name: 'memo' })
        ];

        const transactionSearch = search.create({
            type: search.Type.TRANSACTION,
            filters: filters,
            columns: columns
        });

        // Build CSV content
        let csvContent = 'Date,Type,Number,Entity,Status,Amount,Memo\n';

        transactionSearch.run().each(function(result) {
            const row = [
                result.getValue('trandate'),
                result.getText('type'),
                result.getValue('tranid'),
                result.getText('entity'),
                result.getText('status'),
                result.getValue('amount'),
                escapeCsvValue(result.getValue('memo') || '')
            ];
            csvContent += row.join(',') + '\n';
            return true; // Continue iteration
        });

        // Create file and return
        const csvFile = file.create({
            name: 'transaction_search_' + new Date().getTime() + '.csv',
            fileType: file.Type.CSV,
            contents: csvContent
        });

        context.response.writeFile({ file: csvFile, isInline: true });
    }

    /**
     * Escape CSV values containing commas or quotes
     * @param {string} value
     * @returns {string}
     */
    function escapeCsvValue(value) {
        if (value.indexOf(',') >= 0 || value.indexOf('"') >= 0) {
            return '"' + value.replace(/"/g, '""') + '"';
        }
        return value;
    }

    /**
     * Build redirect parameters preserving search criteria
     * @param {Object} params
     * @returns {Object}
     */
    function buildRedirectParams(params) {
        return {
            custpage_date_from: params.custpage_date_from,
            custpage_date_to: params.custpage_date_to,
            custpage_tran_type: params.custpage_tran_type,
            custpage_entity: params.custpage_entity,
            custpage_status: params.custpage_status,
            custpage_amount_min: params.custpage_amount_min,
            custpage_amount_max: params.custpage_amount_max,
            custpage_page: params.custpage_page,
            custpage_sort_column: params.custpage_sort_column,
            custpage_sort_dir: params.custpage_sort_dir,
            custpage_search_submitted: 'T'
        };
    }

    return {
        onRequest: onRequest
    };
});
