# Testing SuiteScript with Jest

This guide explains how to test SuiteScript 2.1 modules using Jest and the mock NetSuite modules provided in this repository.

## Why Test SuiteScript?

Testing SuiteScript is challenging because:
- NetSuite modules (`N/search`, `N/record`, etc.) only work in the NetSuite environment
- You can't run SuiteScript locally without mocks
- Manual testing in NetSuite is slow (deploy → test → fix → repeat)

Jest + Mocks solve this by:
- Providing test doubles for NetSuite modules
- Running tests instantly on your local machine
- Enabling TDD (write tests before implementation)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Run tests:
```bash
npm test
```

## Writing Tests

### Basic Test Structure

```javascript
/**
 * @jest-environment node
 */

// Import your module under test
const MyModule = require('../src/my_module');

// Import NetSuite mocks
const search = require('../../shared/mocks/search');
const record = require('../../shared/mocks/record');

describe('MyModule', () => {
    it('should do something', () => {
        // Arrange
        const input = { foo: 'bar' };

        // Act
        const result = MyModule.doSomething(input);

        // Assert
        expect(result).toBe('expected value');
    });
});
```

### Testing Search Operations

```javascript
const search = require('../../shared/mocks/search');

it('should execute search and return results', () => {
    // Create mock search
    const mockSearch = search.create({
        type: search.Type.CUSTOMER,
        filters: [['companyname', 'contains', 'ACME']],
        columns: ['companyname', 'email']
    });

    // Set mock results
    mockSearch._setMockResults([
        {
            id: '1',
            values: {
                companyname: 'ACME Corp',
                email: 'contact@acme.com'
            }
        }
    ]);

    // Execute search
    const results = mockSearch.run().getRange({ start: 0, end: 10 });

    expect(results.length).toBe(1);
    expect(results[0].getValue('companyname')).toBe('ACME Corp');
});
```

### Testing Form Building

```javascript
const serverWidget = require('../../shared/mocks/serverWidget');

it('should create form with sublist', () => {
    const form = serverWidget.createForm({
        title: 'Test Form'
    });

    const sublist = form.addSublist({
        id: 'custpage_items',
        type: serverWidget.SublistType.LIST,
        label: 'Items'
    });

    sublist.addField({
        id: 'custpage_name',
        type: serverWidget.FieldType.TEXT,
        label: 'Name'
    });

    expect(form.title).toBe('Test Form');
    expect(sublist.fields.length).toBe(1);
});
```

### Testing Record Operations

```javascript
const record = require('../../shared/mocks/record');

it('should create and save record', () => {
    const rec = record.create({
        type: record.Type.CUSTOMER
    });

    rec.setValue({ fieldId: 'companyname', value: 'ACME Corp' });
    rec.setValue({ fieldId: 'email', value: 'contact@acme.com' });

    const savedId = rec.save();

    expect(savedId).toBeDefined();
    expect(rec.getValue('companyname')).toBe('ACME Corp');
});
```

### Testing Governance

```javascript
const runtime = require('../../shared/mocks/runtime');

it('should check governance before operations', () => {
    const script = runtime.getCurrentScript();

    // Set low governance
    script._setRemainingUsage(50);

    expect(script.getRemainingUsage()).toBe(50);

    // Your code should check governance
    const governanceGuard = require('../src/governance_guard');
    const hasEnoughUnits = governanceGuard.checkGovernance(100);

    expect(hasEnoughUnits).toBe(false);
});
```

## Test Coverage

Run tests with coverage:
```bash
npm test -- --coverage
```

Aim for:
- 80%+ line coverage
- 100% coverage for critical business logic
- Edge case coverage (null, undefined, empty arrays)

## Best Practices

1. **Test one thing per test**
   - Good: `it('should format currency to 2 decimals')`
   - Bad: `it('should format currency and percent and handle nulls')`

2. **Use descriptive test names**
   - Good: `it('should return empty array when no results found')`
   - Bad: `it('should work')`

3. **Arrange-Act-Assert pattern**
   ```javascript
   it('should calculate total', () => {
       // Arrange
       const items = [{ price: 10 }, { price: 20 }];

       // Act
       const total = calculateTotal(items);

       // Assert
       expect(total).toBe(30);
   });
   ```

4. **Test edge cases**
   - Null/undefined values
   - Empty arrays
   - Division by zero
   - Large datasets

5. **Mock external dependencies**
   - Don't make real API calls in tests
   - Use mocks for N/search, N/record, N/https

## Debugging Tests

Run a single test file:
```bash
npm test -- patterns/config-driven-suitelet/__tests__/fs_config_driven_form_builder.spec.js
```

Run tests in watch mode (re-runs on file change):
```bash
npm test -- --watch
```

Enable verbose logging:
```bash
VERBOSE_LOGS=1 npm test
```

## Common Issues

### Module Not Found

**Problem:** `Cannot find module 'N/search'`

**Solution:** Check `jest.config.js` has correct module mappings:
```javascript
moduleNameMapper: {
    '^N/search$': '<rootDir>/shared/mocks/search.js'
}
```

### Async Test Timeout

**Problem:** Test hangs or times out

**Solution:** Use async/await or return promises:
```javascript
it('should load record async', async () => {
    const rec = await loadRecordAsync('customer', '1');
    expect(rec).toBeDefined();
});
```

### Mock Not Resetting

**Problem:** Tests affect each other

**Solution:** Reset mocks in `beforeEach`:
```javascript
beforeEach(() => {
    jest.resetModules();
    const log = require('../../shared/mocks/log');
    log._clearLogs();
});
```

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [SuiteScript 2.1 API Reference](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/chapter_4387172221.html)
- [FlowSync Consulting Blog](https://flowsyncconsulting.com/blog/) (coming soon)
