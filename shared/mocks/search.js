/**
 * Mock for N/search module
 * Provides test doubles for NetSuite Search API
 */

class Column {
  constructor(config) {
    this.name = config.name;
    this.join = config.join || null;
    this.summary = config.summary || null;
    this.formula = config.formula || null;
    this.label = config.label || null;
  }
}

class Result {
  constructor(data = {}) {
    this.id = data.id || '1';
    this.recordType = data.recordType || 'customrecord_test';
    this._values = data.values || {};
    this._columns = data.columns || [];
  }

  getValue(column) {
    if (typeof column === 'string') {
      return this._values[column];
    }
    const key = this._getColumnKey(column);
    return this._values[key];
  }

  getText(column) {
    if (typeof column === 'string') {
      return this._values[column + '_text'];
    }
    const key = this._getColumnKey(column);
    return this._values[key + '_text'];
  }

  _getColumnKey(column) {
    let key = column.name;
    if (column.join) key = column.join + '.' + key;
    if (column.summary) key += '_' + column.summary;
    return key;
  }
}

class ResultSet {
  constructor(results = []) {
    this._results = results;
    this._currentIndex = 0;
  }

  each(callback) {
    for (let i = 0; i < this._results.length; i++) {
      const continueIteration = callback(this._results[i], i);
      if (continueIteration === false) {
        return false;
      }
    }
    return true;
  }

  getRange(options) {
    const start = options.start || 0;
    const end = options.end || this._results.length;
    return this._results.slice(start, end);
  }
}

class PagedData {
  constructor(results = [], pageSize = 1000) {
    this._results = results;
    this._pageSize = pageSize;
    this.count = results.length;
    this.pageRanges = [];

    // Calculate page ranges
    for (let i = 0; i < results.length; i += pageSize) {
      this.pageRanges.push({
        index: Math.floor(i / pageSize),
        size: Math.min(pageSize, results.length - i)
      });
    }
  }

  fetch(options) {
    const pageIndex = options.index || 0;
    const start = pageIndex * this._pageSize;
    const end = Math.min(start + this._pageSize, this._results.length);

    return {
      data: this._results.slice(start, end),
      isLast: end >= this._results.length
    };
  }
}

class Search {
  constructor(config = {}) {
    this.searchType = config.type || 'transaction';
    this.filters = config.filters || [];
    this.columns = config.columns || [];
    this.title = config.title || '';
    this._mockResults = [];
  }

  run() {
    return new ResultSet(this._mockResults);
  }

  runPaged(options = {}) {
    const pageSize = options.pageSize || 1000;
    return new PagedData(this._mockResults, pageSize);
  }

  save() {
    return 'customsearch_mock_' + Date.now();
  }

  // Test helper to set mock results
  _setMockResults(results) {
    this._mockResults = results.map(r => new Result(r));
  }
}

// Module functions
function create(config) {
  return new Search(config);
}

function load(config) {
  const search = new Search();
  search.searchId = config.id;
  return search;
}

function lookupFields(config) {
  // Mock implementation returns empty object
  return {};
}

// Type enums
const Type = {
  TRANSACTION: 'transaction',
  CUSTOMER: 'customer',
  ITEM: 'item',
  EMPLOYEE: 'employee',
  VENDOR: 'vendor',
  CUSTOM_RECORD: 'customrecord'
};

const Operator = {
  IS: 'is',
  CONTAINS: 'contains',
  STARTSWITH: 'startswith',
  ANYOF: 'anyof',
  NONEOF: 'noneof',
  GREATERTHAN: 'greaterthan',
  LESSTHAN: 'lessthan',
  BETWEEN: 'between',
  ISEMPTY: 'isempty',
  ISNOTEMPTY: 'isnotempty'
};

const Summary = {
  SUM: 'SUM',
  AVG: 'AVG',
  COUNT: 'COUNT',
  MIN: 'MIN',
  MAX: 'MAX',
  GROUP: 'GROUP'
};

// Test helper: mock search results
let globalMockResults = [];

function mockSearchResults(results) {
  globalMockResults = results.map(r => new Result(r));
}

// Override create to use global mock results
const originalCreate = create;
function createWithMocks(config) {
  const searchObj = originalCreate(config);
  searchObj._mockResults = globalMockResults;
  return searchObj;
}

module.exports = {
  create: createWithMocks,
  load,
  lookupFields,
  Type,
  Operator,
  Summary,
  Column,
  Result,
  ResultSet,
  Search,
  PagedData,
  mockSearchResults
};
