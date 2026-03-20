# Shared Utilities

Reusable modules used across multiple patterns.

## Modules

### Governance Guard (`governance_guard.js`)

Safe governance checking for long-running scripts. Prevents UNEXPECTED_ERROR by checking remaining usage before expensive operations.

**Usage:**
```javascript
define(['./shared/governance_guard'], function(governanceGuard) {
    // Check before executing search
    if (governanceGuard.checkGovernance(governanceGuard.THRESHOLDS.SEARCH)) {
        var results = mySearch.run().getRange({ start: 0, end: 1000 });
    }

    // Check before saving record
    if (governanceGuard.checkGovernance(governanceGuard.THRESHOLDS.RECORD_SAVE)) {
        record.save();
    }
});
```

**Recommended Thresholds:**
- SEARCH: 100 units
- RECORD_SAVE: 200 units
- MAP_REDUCE_YIELD: 500 units
- SUITELET_RENDER: 50 units

### Search Helpers (`search_helpers.js`)

Common search patterns for paged iteration, column extraction, and filter building.

**Usage:**
```javascript
define(['./shared/search_helpers', 'N/search'], function(searchHelpers, search) {
    var mySearch = search.create({ /* config */ });

    // Get all results (handles pagination)
    var allResults = searchHelpers.getAllResults(mySearch);

    // Extract column values
    allResults.forEach(function(result) {
        var name = searchHelpers.getColumnValue(result, 'name');
        var salesRepText = searchHelpers.getColumnText(result, 'salesrep');
    });
});
```

### Record Helpers (`record_helpers.js`)

Safe record operations with error handling and null/undefined protection.

**Usage:**
```javascript
define(['./shared/record_helpers', 'N/record'], function(recordHelpers, record) {
    var rec = record.load({ type: 'customer', id: '1234' });

    // Safe value getter with fallback
    var email = recordHelpers.getSafeValue(rec, 'email', 'no-email@example.com');

    // Safe value setter (handles null/undefined)
    recordHelpers.setSafeValue(rec, 'phone', null);  // Sets to empty string

    rec.save();
});
```

## Mocks (for Testing)

The `mocks/` directory contains Jest test doubles for NetSuite modules.

**Available Mocks:**
- `search.js` — N/search with Search, Result, ResultSet, PagedData
- `record.js` — N/record with Record class
- `runtime.js` — N/runtime with Script and User
- `log.js` — N/log with debug/audit/error capture
- `serverWidget.js` — N/ui/serverWidget with Form, Field, Sublist
- `format.js` — N/format with type conversion
- `url.js` — N/url with script/record URL resolution

**Usage in Tests:**
```javascript
const search = require('../shared/mocks/search');

describe('My Module', () => {
    it('should execute search', () => {
        const mockSearch = search.create({ type: 'customer' });
        mockSearch._setMockResults([
            { id: '1', values: { companyname: 'ACME Corp' } }
        ]);

        const results = mockSearch.run().getRange({ start: 0, end: 10 });
        expect(results.length).toBe(1);
    });
});
```

## Contributing

When adding a new shared utility:
1. Use `@NApiVersion 2.1` and AMD `define()`
2. Add JSDoc comments for all public functions
3. Create unit tests in `__tests__/`
4. Document usage in this README
