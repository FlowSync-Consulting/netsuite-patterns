/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @description Common search patterns and utilities
 */
define(['N/search'], function(search) {

  /**
   * Execute paged search and return all results
   * Handles pagination automatically
   * @param {search.Search} searchObj - Search object
   * @returns {Array<search.Result>} All search results
   */
  function getAllResults(searchObj) {
    var results = [];
    var pagedData = searchObj.runPaged({ pageSize: 1000 });

    pagedData.pageRanges.forEach(function(pageRange) {
      var page = pagedData.fetch({ index: pageRange.index });
      results = results.concat(page.data);
    });

    return results;
  }

  /**
   * Extract column value from search result
   * Handles joined columns and summary columns
   * @param {search.Result} result - Search result
   * @param {string|search.Column} column - Column name or Column object
   * @returns {string} Column value
   */
  function getColumnValue(result, column) {
    if (typeof column === 'string') {
      return result.getValue(column);
    }
    return result.getValue(column);
  }

  /**
   * Extract column text from search result
   * @param {search.Result} result - Search result
   * @param {string|search.Column} column - Column name or Column object
   * @returns {string} Column text (for select fields)
   */
  function getColumnText(result, column) {
    if (typeof column === 'string') {
      return result.getText(column);
    }
    return result.getText(column);
  }

  /**
   * Create a filter array from object
   * @param {Object} filterObj - Key-value pairs of field: value
   * @param {string} operator - Filter operator (default: 'is')
   * @returns {Array<search.Filter>} Filter array
   */
  function createFilters(filterObj, operator) {
    operator = operator || search.Operator.IS;
    var filters = [];

    Object.keys(filterObj).forEach(function(fieldName) {
      filters.push([fieldName, operator, filterObj[fieldName]]);
    });

    return filters;
  }

  return {
    getAllResults: getAllResults,
    getColumnValue: getColumnValue,
    getColumnText: getColumnText,
    createFilters: createFilters
  };
});
