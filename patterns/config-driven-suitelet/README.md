# Config-Driven Suitelet Pattern

**Pattern Type:** Suitelet
**Complexity:** Medium
**Use Case:** Report suitelets with dynamic column definitions
**Tests:** 11 unit tests (Jest)

## Overview

The config-driven suitelet pattern separates column definitions from form rendering logic, making report suitelets easier to maintain and extend.

Instead of hardcoding columns in your rendering code, you:
1. Define columns in a separate config file
2. Use a reusable form builder to render them
3. Keep business logic separate

This pattern is especially valuable for:
- Reports with many columns (10+ fields)
- Pivot tables or matrix layouts
- Reports that change frequently
- Multiple similar reports that share rendering logic

## Real-World Example

This pattern was extracted from a commission reporting system that delivered **$250K/year in annual value** for a manufacturing company. The system included:

- 4 different report suitelets with 15-50 columns each
- Pivot table layouts (territories × months = 48+ columns)
- Frequent column additions from stakeholder feedback
- Complex calculated fields (YoY growth, goal achievement, etc.)

By using the config-driven pattern, adding a new column took **5 minutes** instead of 30-45 minutes, and the risk of breaking existing functionality dropped to near-zero.

[See the full case study →](https://flowsyncconsulting.com/portfolio/suitelet-commission-reporting/)

## File Structure

```
patterns/config-driven-suitelet/
├── src/
│   ├── fs_config_driven_form_builder.js     # Reusable form builder
│   ├── fs_territory_report_columns_config.js # Column definitions
│   └── fs_territory_performance_sl.js        # Main suitelet
├── __tests__/
│   └── fs_config_driven_form_builder.spec.js # Unit tests
├── deploy/
│   └── deploy.xml                             # SDF manifest
└── README.md                                  # This file
```

## How It Works

### 1. Define Columns in Config File

```javascript
// fs_territory_report_columns_config.js
const COLUMNS = [
    {
        id: 'custpage_territory',
        label: 'Territory',
        type: serverWidget.FieldType.TEXT,
        valueAccessor: 'territory_name'  // Simple property path
    },
    {
        id: 'custpage_current_sales',
        label: 'Current Sales',
        type: serverWidget.FieldType.CURRENCY,
        valueAccessor: (result) => result.current_year_sales  // Function accessor
    },
    {
        id: 'custpage_growth',
        label: 'Growth %',
        type: serverWidget.FieldType.PERCENT,
        valueAccessor: (result) => {
            // Complex calculation
            const current = parseFloat(result.current_year_sales) || 0;
            const prior = parseFloat(result.prior_year_sales) || 0;
            if (prior === 0) return 0;
            return ((current - prior) / prior * 100).toFixed(2);
        }
    }
];
```

### 2. Build Form with Config

```javascript
// fs_territory_performance_sl.js
const formBuilder = new ConfigDrivenFormBuilder();

const form = formBuilder.buildForm({
    title: 'Territory Performance Report',
    resultsData: territoryData,        // Array of data objects
    columnConfig: ColumnConfig.COLUMNS  // Column definitions
});

context.response.writePage(form);
```

### 3. Form Builder Handles Rendering

The `ConfigDrivenFormBuilder` automatically:
- Creates sublist fields from config
- Extracts values using `valueAccessor` (string path or function)
- Formats currency/percent fields correctly
- Handles null/undefined values safely
- Applies custom CSS

## Value Accessor Patterns

The `valueAccessor` property supports three patterns:

**1. String Property Path**
```javascript
valueAccessor: 'territory_name'
```

**2. Function (for calculations)**
```javascript
valueAccessor: (result) => {
    const current = result.current || 0;
    const prior = result.prior || 0;
    return ((current - prior) / prior * 100).toFixed(2);
}
```

**3. Null (for display-only fields like checkboxes)**
```javascript
valueAccessor: null
```

## Benefits

### Before (Traditional Approach)
```javascript
// Hardcoded columns in rendering logic
const sublist = form.addSublist({ id: 'custpage_results', type: 'list' });

sublist.addField({ id: 'custpage_territory', label: 'Territory', type: 'text' });
sublist.addField({ id: 'custpage_sales', label: 'Sales', type: 'currency' });
// ... 47 more addField() calls ...

results.forEach((result, i) => {
    sublist.setSublistValue({ id: 'custpage_territory', line: i, value: result.territory });
    sublist.setSublistValue({ id: 'custpage_sales', line: i, value: result.sales.toFixed(2) });
    // ... 47 more setSublistValue() calls ...
});
```

**Problems:**
- Column definitions mixed with rendering logic
- Hard to see structure at a glance
- Tedious to add/remove columns (touch 3+ places per column)
- Easy to introduce bugs (mismatched field IDs, wrong line in loops)

### After (Config-Driven Approach)
```javascript
// Column definitions in separate config file
const COLUMNS = [
    { id: 'custpage_territory', label: 'Territory', type: 'text', valueAccessor: 'territory' },
    { id: 'custpage_sales', label: 'Sales', type: 'currency', valueAccessor: 'sales' }
];

// Rendering logic is generic and reusable
const form = formBuilder.buildForm({
    title: 'Report',
    resultsData: results,
    columnConfig: COLUMNS
});
```

**Benefits:**
- Column definitions are declarative and easy to read
- Add/remove columns by editing config file only
- Form builder is reusable across multiple suitelets
- Type-safe formatting (currency, percent) handled automatically
- Unit testable (mock config, test rendering separately)

## When to Use This Pattern

**Good fit:**
- Reports with 10+ columns
- Reports that change frequently
- Multiple similar reports (territory, account, product reports)
- Pivot tables or matrix layouts
- Calculated columns (YoY growth, variance, percentages)

**Not needed:**
- Simple forms with 3-5 static fields
- One-off reports that won't change
- Non-report suitelets (data entry, workflow UIs)

## Testing

Run tests with:
```bash
npm test
```

The test suite covers:
- Form creation with correct title
- Sublist field generation from config
- Data population using string accessors
- Data population using function accessors
- Currency formatting (2 decimal places)
- Percent formatting (2 decimal places)
- Null/undefined value handling
- Checkbox field skipping
- Client script attachment

## Deployment

1. Copy files to FileCabinet:
   ```
   /SuiteScripts/[YourCompany]/patterns/config-driven-suitelet/
   ```

2. Deploy using SDF:
   ```bash
   suitecloud project:deploy
   ```

3. Create script record in NetSuite:
   - Type: Suitelet
   - Script File: `fs_territory_performance_sl.js`
   - ID: `customscript_fs_territory_performance`

4. Create deployment:
   - Status: Testing (or Released)
   - ID: `customdeploy_fs_territory_performance`

## Extending the Pattern

### Add a New Column

Edit `fs_territory_report_columns_config.js`:
```javascript
const COLUMNS = [
    // ... existing columns ...
    {
        id: 'custpage_goal_achieved',
        label: 'Goal Achieved',
        type: serverWidget.FieldType.CHECKBOX,
        valueAccessor: (result) => {
            return result.current_sales >= result.goal_amount;
        }
    }
];
```

No changes needed to the form builder or suitelet!

### Create a New Report Using the Same Builder

```javascript
// new_product_report_sl.js
define([
    './product_report_columns_config',  // New config file
    '../lib/fs_config_driven_form_builder',  // Reuse builder
    'N/search'
], (ColumnConfig, ConfigDrivenFormBuilder, search) => {

    function onRequest(context) {
        const productData = loadProductData();
        const formBuilder = new ConfigDrivenFormBuilder();

        const form = formBuilder.buildForm({
            title: 'Product Performance Report',
            resultsData: productData,
            columnConfig: ColumnConfig.PRODUCT_COLUMNS  // Different config
        });

        context.response.writePage(form);
    }

    return { onRequest };
});
```

## Related Patterns

- **Map/Reduce Companion** — For batch report generation (coming soon)
- **Search Builder** — For modular search construction (coming soon)
- **Pivot Table Builder** — For transforming row data into pivot format (coming soon)

## License

MIT — use freely in your own NetSuite projects.

## Questions?

Found a bug or have a question about this pattern?
[Open an issue on GitHub](https://github.com/FlowSync-Consulting/netsuite-patterns/issues)

Need help implementing this in your NetSuite environment?
[Book a free discovery call](https://flowsyncconsulting.com/contact/)
