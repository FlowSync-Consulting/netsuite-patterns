# Batch Transaction Search Pattern

**Pattern Type:** Suitelet
**Complexity:** Medium
**Use Case:** Flexible transaction search tool with dynamic filtering, pagination, sorting, and CSV export
**Tests:** None (thin pattern - focused on UI and search configuration)

## Overview

The batch transaction search pattern provides a user-friendly interface for searching NetSuite transactions using multiple criteria. Instead of building complex saved searches or using the global search, users get a dedicated search form with flexible filters, paginated results, and export capabilities.

This pattern is valuable for:
- Finance teams needing to find specific transactions quickly
- Support teams researching customer transaction histories
- Operations teams analyzing transaction volumes and amounts
- Reporting needs requiring filtered transaction exports

## Real-World Example

This pattern was extracted from a custom transaction lookup tool built for a mid-market manufacturer. The finance team needed to search across 50K+ transactions per month to:

- Find transactions by date range, type, customer, and status
- Review transaction details before processing adjustments
- Export filtered results for management reporting
- Sort results by different criteria (date, amount, status)

The tool reduced average transaction lookup time from 5 minutes to under 30 seconds, saving the 5-person finance team **4+ hours per week**.

[See the full case study →](https://flowsyncconsulting.com/portfolio/suitelet-transaction-lookup/)

## File Structure

```
patterns/batch-transaction-search/
├── src/
│   ├── fs_batch_search_sl.js          # Main Suitelet (form builder and router)
│   ├── lib/
│   │   ├── input_parser.js             # Parse and validate search criteria
│   │   └── result_renderer.js          # Render search results with pagination
├── deploy/
│   └── deploy.xml                      # SDF manifest
└── README.md                           # This file
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                   User Interaction                          │
│                                                             │
│  GET  → Display search form with criteria fields           │
│  POST → Export results to CSV                              │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              fs_batch_search_sl.js                          │
│                 (Main Suitelet)                             │
│                                                             │
│  onRequest() {                                              │
│    if (GET)  → buildSearchForm()                           │
│            → executeSearchAndRender()                       │
│    if (POST) → exportResultsToCSV()                        │
│  }                                                          │
└────────┬──────────────────────────┬─────────────────────────┘
         │                          │
         ▼                          ▼
┌─────────────────────┐  ┌─────────────────────────┐
│  Input Parser       │  │  Result Renderer        │
│  input_parser.js    │  │  result_renderer.js     │
├─────────────────────┤  ├─────────────────────────┤
│ parseSearchCriteria │  │ renderResults()         │
│ - Date range        │  │ - Sublist with columns  │
│ - Transaction type  │  │ - Pagination controls   │
│ - Entity            │  │ - Summary totals        │
│ - Status            │  │ - Sortable columns      │
│ - Amount range      │  │ - Clickable links       │
│                     │  │                         │
│ Returns: Filter[]   │  │ formatCurrency()        │
└─────────────────────┘  └─────────────────────────┘
```

## How It Works

### 1. Search Form Building

The main Suitelet builds a form with multiple search criteria:

```javascript
// fs_batch_search_sl.js
function buildSearchForm(params) {
    const form = serverWidget.createForm({
        title: 'Batch Transaction Search'
    });

    // Date range
    form.addField({
        id: 'custpage_date_from',
        type: serverWidget.FieldType.DATE,
        label: 'Date From'
    });

    form.addField({
        id: 'custpage_date_to',
        type: serverWidget.FieldType.DATE,
        label: 'Date To'
    });

    // Transaction type (multi-select)
    const typeField = form.addField({
        id: 'custpage_tran_type',
        type: serverWidget.FieldType.MULTISELECT,
        label: 'Transaction Type'
    });
    typeField.addSelectOption({ value: 'SalesOrd', text: 'Sales Order' });
    typeField.addSelectOption({ value: 'CustInvc', text: 'Invoice' });
    // ... more types

    // Amount range
    form.addField({
        id: 'custpage_amount_min',
        type: serverWidget.FieldType.CURRENCY,
        label: 'Amount Minimum'
    });

    form.addField({
        id: 'custpage_amount_max',
        type: serverWidget.FieldType.CURRENCY,
        label: 'Amount Maximum'
    });

    // Hidden fields for pagination/sorting
    form.addField({
        id: 'custpage_page',
        type: serverWidget.FieldType.INTEGER,
        label: 'Page'
    }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

    return form;
}
```

### 2. Dynamic Filter Building (Input Parser)

The input parser converts form values into NetSuite search filters:

```javascript
// lib/input_parser.js
function parseSearchCriteria(params) {
    const filters = [];

    // Date range
    if (params.custpage_date_from && params.custpage_date_to) {
        filters.push(search.createFilter({
            name: 'trandate',
            operator: search.Operator.WITHIN,
            values: [params.custpage_date_from, params.custpage_date_to]
        }));
    } else if (params.custpage_date_from) {
        filters.push(search.createFilter({
            name: 'trandate',
            operator: search.Operator.ONORAFTER,
            values: params.custpage_date_from
        }));
    }

    // Transaction type (multi-select)
    if (params.custpage_tran_type) {
        const types = parseMultiSelectValue(params.custpage_tran_type);
        filters.push(search.createFilter({
            name: 'type',
            operator: search.Operator.ANYOF,
            values: types
        }));
    }

    // Amount range
    const min = parseFloat(params.custpage_amount_min);
    const max = parseFloat(params.custpage_amount_max);
    if (!isNaN(min) && !isNaN(max)) {
        filters.push(search.createFilter({
            name: 'amount',
            operator: search.Operator.BETWEEN,
            values: [min, max]
        }));
    }

    return filters;
}
```

### 3. Pagination and Sorting

Results are paginated and sortable:

```javascript
// fs_batch_search_sl.js
function executeSearchAndRender(form, params) {
    const filters = InputParser.parseSearchCriteria(params);

    const columns = [
        search.createColumn({ name: 'trandate', sort: getSortDirection(params, 'trandate') }),
        search.createColumn({ name: 'type' }),
        search.createColumn({ name: 'tranid' }),
        search.createColumn({ name: 'entity' }),
        search.createColumn({ name: 'status' }),
        search.createColumn({ name: 'amount' })
    ];

    const transactionSearch = search.create({
        type: search.Type.TRANSACTION,
        filters: filters,
        columns: columns
    });

    // Paginate results
    const pageNumber = parseInt(params.custpage_page || '0', 10);
    const startIndex = pageNumber * PAGE_SIZE;
    const endIndex = startIndex + PAGE_SIZE;

    const results = transactionSearch.run().getRange({
        start: startIndex,
        end: endIndex
    });

    const totalCount = transactionSearch.runPaged({ pageSize: 1000 }).count;

    ResultRenderer.renderResults(form, results, {
        pageNumber: pageNumber,
        pageSize: PAGE_SIZE,
        totalCount: totalCount
    });
}
```

### 4. Result Rendering with Links

The result renderer creates a sublist with clickable transaction links:

```javascript
// lib/result_renderer.js
function renderResults(form, results, options) {
    const sublist = form.addSublist({
        id: 'custpage_results',
        type: serverWidget.SublistType.LIST,
        label: `Search Results (Page ${options.pageNumber + 1})`
    });

    // Add columns
    sublist.addField({ id: 'custpage_trandate', type: serverWidget.FieldType.TEXT, label: 'Date' });
    sublist.addField({ id: 'custpage_type', type: serverWidget.FieldType.TEXT, label: 'Type' });
    sublist.addField({ id: 'custpage_tranid', type: serverWidget.FieldType.TEXT, label: 'Number' });
    // ... more columns

    // Populate results
    results.forEach((result, index) => {
        sublist.setSublistValue({
            id: 'custpage_trandate',
            line: index,
            value: result.getValue('trandate') || ''
        });

        // Make transaction number a clickable link
        const tranId = result.getValue('tranid');
        const recordUrl = url.resolveRecord({
            recordType: result.getValue('type'),
            recordId: result.id,
            isEditMode: false
        });

        sublist.setSublistValue({
            id: 'custpage_tranid',
            line: index,
            value: `<a href="${recordUrl}" target="_blank">${tranId}</a>`
        });

        // ... more columns
    });

    // Add pagination controls
    addPaginationControls(form, options.pageNumber, options.pageSize, options.totalCount);

    // Add summary row with totals
    addSummaryRow(form, results);
}
```

### 5. CSV Export

Export functionality converts search results to CSV:

```javascript
// fs_batch_search_sl.js
function exportResultsToCSV(context, params) {
    const filters = InputParser.parseSearchCriteria(params);
    const columns = [
        search.createColumn({ name: 'trandate' }),
        search.createColumn({ name: 'type' }),
        // ... more columns
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
        return true;
    });

    // Create and return CSV file
    const csvFile = file.create({
        name: 'transaction_search_' + new Date().getTime() + '.csv',
        fileType: file.Type.CSV,
        contents: csvContent
    });

    context.response.writeFile({ file: csvFile, isInline: true });
}
```

## Benefits

### Before (Manual Saved Searches)

**Problems:**
- Creating saved searches requires administrator privileges
- Each new search criteria combination requires a new saved search
- No pagination (users see all results at once)
- No CSV export from search results
- Hard to share search configurations with team members
- Complex UI for non-technical users

### After (Batch Transaction Search)

**Benefits:**
- Self-service search tool for all users
- Flexible criteria combinations without creating new searches
- Paginated results (50 per page) for large result sets
- One-click CSV export
- Sortable columns
- Clean, user-friendly interface
- Clickable transaction links
- Summary totals on each page

## When to Use This Pattern

**Good fit:**
- Transaction research and lookup tools
- Finance team workflows requiring flexible filtering
- Support teams needing quick transaction access
- Reporting workflows requiring filtered exports
- Large transaction volumes (10K+ records)

**Not needed:**
- Simple, fixed-criteria searches (use saved search)
- Real-time dashboards (use SuiteAnalytics)
- Single-record lookups (use global search)

## Extending the Pattern

### Add New Search Criteria

1. Add field to form in `buildSearchForm()`
2. Add filter logic in `input_parser.js`
3. Update CSV export headers

Example - add memo search:

```javascript
// In buildSearchForm()
form.addField({
    id: 'custpage_memo_contains',
    type: serverWidget.FieldType.TEXT,
    label: 'Memo Contains'
});

// In input_parser.js
function addMemoFilter(filters, memoText) {
    if (memoText && memoText.trim() !== '') {
        filters.push(search.createFilter({
            name: 'memo',
            operator: search.Operator.CONTAINS,
            values: memoText.trim()
        }));
    }
}
```

### Add Advanced Filters

Add custom field filters, join filters, or formula filters:

```javascript
// Join filter example - search by customer category
filters.push(search.createFilter({
    name: 'category',
    join: 'customer',
    operator: search.Operator.ANYOF,
    values: params.custpage_customer_category
}));

// Formula filter example - search by aging
filters.push(search.createFilter({
    name: 'formulanumeric',
    formula: '{today} - {trandate}',
    operator: search.Operator.GREATERTHAN,
    values: 30  // Transactions older than 30 days
}));
```

### Add Bulk Actions

Add checkboxes and bulk processing:

```javascript
// Change sublist type to allow selection
const sublist = form.addSublist({
    id: 'custpage_results',
    type: serverWidget.SublistType.LIST,  // Change to EDITOR for checkboxes
    label: 'Search Results'
});

// Add mark column for selection
sublist.addMarkAllButtons();

// Add bulk action buttons
form.addButton({
    id: 'custpage_bulk_email',
    label: 'Email Selected',
    functionName: 'bulkEmailTransactions'
});
```

## Related Patterns

- **Config-Driven Suitelet** — For data-driven column definitions
- **Multi-Mode Suitelet** — For combining search with other workflows
- **RESTlet API Suite** — For headless transaction search API

## Deployment

1. Copy files to FileCabinet:
   ```
   /SuiteScripts/[YourCompany]/patterns/batch-transaction-search/
   ```

2. Deploy using SDF:
   ```bash
   suitecloud project:deploy
   ```

3. Create script record in NetSuite:
   - Type: Suitelet
   - Script File: `fs_batch_search_sl.js`
   - ID: `customscript_fs_batch_search`

4. Create deployment:
   - Status: Released
   - ID: `customdeploy_fs_batch_search`
   - Audience: Employee Center (or specific roles)

5. Add to navigation:
   - Create custom center tab
   - Add link: "Transaction Search"
   - URL: Suitelet deployment URL

## License

MIT — use freely in your own NetSuite projects.

## Questions?

Found a bug or have a question about this pattern?
[Open an issue on GitHub](https://github.com/FlowSync-Consulting/netsuite-patterns/issues)

Need help implementing this in your NetSuite environment?
[Book a free discovery call](https://flowsyncconsulting.com/contact/)
