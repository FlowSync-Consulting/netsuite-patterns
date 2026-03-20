/**
 * @NApiVersion 2.1
 * @description Input parser for batch transaction search - validates and builds search filters
 */
define(['N/search', 'N/log'], (search, log) => {

    /**
     * Parse search criteria from request parameters and build filter array
     * @param {Object} params - Request parameters from Suitelet
     * @returns {Array<search.Filter>} - Array of NetSuite search filters
     */
    function parseSearchCriteria(params) {
        const filters = [];

        // Date range filter
        if (params.custpage_date_from || params.custpage_date_to) {
            addDateRangeFilter(filters, params.custpage_date_from, params.custpage_date_to);
        }

        // Transaction type filter
        if (params.custpage_tran_type) {
            addTransactionTypeFilter(filters, params.custpage_tran_type);
        }

        // Entity filter (customer/vendor)
        if (params.custpage_entity) {
            addEntityFilter(filters, params.custpage_entity);
        }

        // Status filter
        if (params.custpage_status) {
            addStatusFilter(filters, params.custpage_status);
        }

        // Amount range filter
        if (params.custpage_amount_min || params.custpage_amount_max) {
            addAmountRangeFilter(filters, params.custpage_amount_min, params.custpage_amount_max);
        }

        log.debug('Parsed Filters', {
            count: filters.length,
            filters: filters.map(f => ({ name: f.name, operator: f.operator }))
        });

        return filters;
    }

    /**
     * Add date range filter
     * @param {Array} filters
     * @param {string} dateFrom
     * @param {string} dateTo
     */
    function addDateRangeFilter(filters, dateFrom, dateTo) {
        if (dateFrom && dateTo) {
            filters.push(search.createFilter({
                name: 'trandate',
                operator: search.Operator.WITHIN,
                values: [dateFrom, dateTo]
            }));
        } else if (dateFrom) {
            filters.push(search.createFilter({
                name: 'trandate',
                operator: search.Operator.ONORAFTER,
                values: dateFrom
            }));
        } else if (dateTo) {
            filters.push(search.createFilter({
                name: 'trandate',
                operator: search.Operator.ONORBEFORE,
                values: dateTo
            }));
        }
    }

    /**
     * Add transaction type filter
     * @param {Array} filters
     * @param {string} tranTypeParam - Comma-separated list or single value
     */
    function addTransactionTypeFilter(filters, tranTypeParam) {
        const types = parseMultiSelectValue(tranTypeParam);
        if (types.length > 0) {
            filters.push(search.createFilter({
                name: 'type',
                operator: search.Operator.ANYOF,
                values: types
            }));
        }
    }

    /**
     * Add entity (customer/vendor) filter
     * @param {Array} filters
     * @param {string} entityId
     */
    function addEntityFilter(filters, entityId) {
        if (entityId && entityId !== '') {
            filters.push(search.createFilter({
                name: 'entity',
                operator: search.Operator.ANYOF,
                values: [entityId]
            }));
        }
    }

    /**
     * Add status filter
     * @param {Array} filters
     * @param {string} statusParam - Comma-separated list of status values
     */
    function addStatusFilter(filters, statusParam) {
        const statuses = parseMultiSelectValue(statusParam);
        if (statuses.length > 0) {
            filters.push(search.createFilter({
                name: 'status',
                operator: search.Operator.ANYOF,
                values: statuses
            }));
        }
    }

    /**
     * Add amount range filter
     * @param {Array} filters
     * @param {string} amountMin
     * @param {string} amountMax
     */
    function addAmountRangeFilter(filters, amountMin, amountMax) {
        const min = parseFloat(amountMin);
        const max = parseFloat(amountMax);

        if (!isNaN(min) && !isNaN(max)) {
            filters.push(search.createFilter({
                name: 'amount',
                operator: search.Operator.BETWEEN,
                values: [min, max]
            }));
        } else if (!isNaN(min)) {
            filters.push(search.createFilter({
                name: 'amount',
                operator: search.Operator.GREATERTHANOREQUALTO,
                values: min
            }));
        } else if (!isNaN(max)) {
            filters.push(search.createFilter({
                name: 'amount',
                operator: search.Operator.LESSTHANOREQUALTO,
                values: max
            }));
        }
    }

    /**
     * Parse multi-select parameter value
     * @param {string|Array} value - Comma-separated string or array
     * @returns {Array<string>}
     */
    function parseMultiSelectValue(value) {
        if (!value) {
            return [];
        }

        if (Array.isArray(value)) {
            return value.filter(v => v !== '');
        }

        return value.split(',').filter(v => v !== '');
    }

    /**
     * Validate date format (YYYY-MM-DD or MM/DD/YYYY)
     * @param {string} dateStr
     * @returns {boolean}
     */
    function isValidDate(dateStr) {
        if (!dateStr) {
            return false;
        }

        const date = new Date(dateStr);
        return !isNaN(date.getTime());
    }

    /**
     * Validate numeric value
     * @param {string|number} value
     * @returns {boolean}
     */
    function isValidNumber(value) {
        if (value === null || value === undefined || value === '') {
            return false;
        }
        return !isNaN(parseFloat(value));
    }

    return {
        parseSearchCriteria: parseSearchCriteria,
        isValidDate: isValidDate,
        isValidNumber: isValidNumber
    };
});
