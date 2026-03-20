/**
 * Mock for N/record module
 */

class Record {
  constructor(config = {}) {
    this.id = config.id || null;
    this.type = config.type || 'customrecord_test';
    this.isDynamic = config.isDynamic !== false;
    this._values = {};
    this._sublists = {};
  }

  getValue(config) {
    const fieldId = config.fieldId || config;
    return this._values[fieldId];
  }

  setValue(config) {
    this._values[config.fieldId] = config.value;
    return this;
  }

  getText(config) {
    const fieldId = config.fieldId || config;
    return this._values[fieldId + '_text'];
  }

  setText(config) {
    this._values[config.fieldId + '_text'] = config.text;
    return this;
  }

  getSublistValue(config) {
    const { sublistId, fieldId, line } = config;
    if (!this._sublists[sublistId]) return null;
    if (!this._sublists[sublistId][line]) return null;
    return this._sublists[sublistId][line][fieldId];
  }

  setSublistValue(config) {
    const { sublistId, fieldId, line, value } = config;

    if (!this._sublists[sublistId]) {
      this._sublists[sublistId] = [];
    }

    if (!this._sublists[sublistId][line]) {
      this._sublists[sublistId][line] = {};
    }

    this._sublists[sublistId][line][fieldId] = value;
    return this;
  }

  getLineCount(config) {
    const sublistId = config.sublistId || config;
    if (!this._sublists[sublistId]) return 0;
    return this._sublists[sublistId].length;
  }

  save() {
    this.id = this.id || String(Math.floor(Math.random() * 100000));
    return this.id;
  }
}

let loadedRecord = null;

function create(config) {
  return new Record({ type: config.type, isDynamic: config.isDynamic });
}

const load = jest.fn((config) => {
  if (loadedRecord) {
    const rec = loadedRecord;
    loadedRecord = null; // Reset after use
    return rec;
  }
  return new Record({ id: config.id, type: config.type, isDynamic: config.isDynamic });
});

// Store original implementation
const originalLoad = load.getMockImplementation();

// Custom mockReturnValue that stores the record
load.mockReturnValue = function(rec) {
  loadedRecord = rec;
  return this;
};

// Custom mockClear
const originalMockClear = load.mockClear.bind(load);
load.mockClear = function() {
  loadedRecord = null;
  if (originalMockClear) originalMockClear();
  return this;
};

function submitFields(config) {
  return config.id;
}

function deleteRecord(config) {
  return config.id;
}

const Type = {
  CUSTOMER: 'customer',
  CONTACT: 'contact',
  VENDOR: 'vendor',
  VENDOR_BILL: 'vendorbill',
  EMPLOYEE: 'employee',
  SALES_ORDER: 'salesorder',
  INVOICE: 'invoice',
  ITEM_FULFILLMENT: 'itemfulfillment',
  PURCHASE_ORDER: 'purchaseorder',
  ITEM: 'inventoryitem',
  CUSTOM_RECORD: 'customrecord'
};

// Test helper: mock record ID
let mockRecordId = null;

function setMockRecordId(id) {
  mockRecordId = id;
}

// Test helper: create mock record with values
function mockRecord(values = {}) {
  const rec = new Record();
  rec._values = values;

  // Make methods Jest-mockable with implementation that accesses _values
  rec.getValue = jest.fn((config) => {
    const fieldId = config.fieldId || config;
    return rec._values[fieldId];
  });

  rec.setValue = jest.fn((config) => {
    rec._values[config.fieldId] = config.value;
    return rec;
  });

  rec.save = jest.fn(() => {
    if (mockRecordId) return mockRecordId;
    rec.id = rec.id || String(Math.floor(Math.random() * 100000));
    return rec.id;
  });

  return rec;
}

// Override save to use mock ID
Record.prototype.save = function() {
  if (mockRecordId) return mockRecordId;
  this.id = this.id || String(Math.floor(Math.random() * 100000));
  return this.id;
};

module.exports = {
  create,
  load,
  submitFields,
  delete: deleteRecord,
  Type,
  Record,
  mockRecord,
  mockRecordId: setMockRecordId
};
