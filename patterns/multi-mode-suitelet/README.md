# Multi-Mode Suitelet Pattern

**Pattern Type:** Suitelet
**Complexity:** High
**Use Case:** Complex workflows with multiple user interfaces (entry, management, billing) served from a single Suitelet
**Tests:** 22 unit tests (Jest)

## Overview

The multi-mode suitelet pattern allows a single Suitelet script to serve multiple workflow modes, each with its own UI and business logic. Instead of deploying separate Suitelets for related workflows, you route to different "modes" based on URL parameters.

This pattern is valuable for:
- Multi-step workflows (intake → evaluation → billing)
- Workflows with different user roles (data entry, management, billing)
- Related UIs that share data models and business logic
- Reducing script deployment overhead

## Real-World Example

This pattern was extracted from a board repair tracking system for a manufacturing company that replaced a legacy third-party system (RepairTrax). The unified Suitelet handled:

- **Entry Mode:** Quick data entry for 50-100 boards/week (serial numbers, condition assessment)
- **Management Mode:** Dashboard for updating board status, assigning technicians, generating packing slips
- **Billing Mode:** Creating sales orders from completed repairs with proper classification and line items

The system delivered **$120K/year in annual value** by eliminating third-party licensing fees and improving billing accuracy.

[See the full case study →](https://flowsyncconsulting.com/portfolio/suitelet-board-repair-tracking/)

## File Structure

```
patterns/multi-mode-suitelet/
├── src/
│   ├── fs_workflow_tracker_sl.js          # Main Suitelet (mode router)
│   ├── modes/
│   │   ├── entry_mode.js                   # Data entry form builder
│   │   ├── management_mode.js              # Dashboard and status updates
│   │   └── billing_mode.js                 # Sales order creation
│   ├── lib/
│   │   ├── record_helpers.js               # Safe record operations
│   │   └── so_builder.js                   # Sales order creation
│   ├── client_scripts/
│   │   ├── fs_workflow_entry_cs.js         # Entry mode client script
│   │   ├── fs_workflow_manage_cs.js        # Management mode client script
│   │   └── fs_workflow_billing_cs.js       # Billing mode client script
├── __tests__/
│   ├── workflow_tracker.test.js            # Mode routing tests
│   ├── entry_mode.test.js                  # Entry form tests
│   ├── management_mode.test.js             # Dashboard tests
│   └── so_builder.test.js                  # SO creation tests
├── objects/
│   ├── customrecord_fs_work_entry.xml      # Work entry custom record
│   ├── customlist_fs_entry_status.xml      # Status custom list
│   └── customlist_fs_entry_outcome.xml     # Outcome custom list
├── deploy/
│   └── deploy.xml                          # SDF manifest
└── README.md                               # This file
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                   User Request (GET/POST)                   │
│                 ?mode=entry|manage|billing                  │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              fs_workflow_tracker_sl.js                      │
│                   (Main Suitelet)                           │
│                                                             │
│  onRequest() {                                              │
│    if (GET)  → handleGet()  → routeToMode()                │
│    if (POST) → handlePost() → routeToAction()              │
│  }                                                          │
└────────┬──────────────────┬──────────────────┬─────────────┘
         │                  │                  │
         ▼                  ▼                  ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  Entry Mode     │ │ Management Mode │ │  Billing Mode   │
│  entry_mode.js  │ │ management_mode │ │ billing_mode.js │
├─────────────────┤ ├─────────────────┤ ├─────────────────┤
│ buildForm()     │ │ buildDashboard()│ │ buildBillingForm│
│ processEntry()  │ │ processUpdate() │ │ createSalesOrder│
└─────────────────┘ └─────────────────┘ └─────────────────┘
         │                  │                  │
         └──────────────────┴──────────────────┘
                           │
                           ▼
                 ┌──────────────────┐
                 │  Shared Utilities│
                 ├──────────────────┤
                 │ record_helpers.js│
                 │ so_builder.js    │
                 └──────────────────┘
```

## How It Works

### 1. Mode Routing (Main Suitelet)

The main Suitelet acts as a router, delegating to mode-specific modules:

```javascript
// fs_workflow_tracker_sl.js
const MODES = {
    ENTRY: 'entry',
    MANAGE: 'manage',
    BILLING: 'billing'
};

function handleGet(context) {
    const mode = context.request.parameters.mode || MODES.ENTRY;

    switch (mode) {
        case MODES.ENTRY:
            return entryMode.buildForm(context);
        case MODES.MANAGE:
            return managementMode.buildDashboard(context);
        case MODES.BILLING:
            return billingMode.buildBillingForm(context);
        default:
            return entryMode.buildForm(context);
    }
}

function handlePost(context) {
    const action = context.request.parameters.custpage_action;

    switch (action) {
        case 'save_entry':
            return entryMode.processEntry(context);
        case 'update_status':
            return managementMode.processUpdate(context);
        case 'create_so':
            return billingMode.createSalesOrder(context);
        default:
            throw new Error('Unknown action: ' + action);
    }
}
```

### 2. Mode Modules (Entry Example)

Each mode handles its own form building and POST processing:

```javascript
// modes/entry_mode.js
define(['N/ui/serverWidget', 'N/record', '../lib/record_helpers'],
function(serverWidget, record, recordHelpers) {

    function buildForm(context) {
        const form = serverWidget.createForm({ title: 'Equipment Intake' });

        // Add client script
        form.clientScriptModulePath = './client_scripts/fs_workflow_entry_cs.js';

        // Add fields
        const customerField = form.addField({
            id: 'custpage_customer',
            type: serverWidget.FieldType.SELECT,
            label: 'Customer',
            source: 'customer'
        });
        customerField.isMandatory = true;

        const serialField = form.addField({
            id: 'custpage_serial',
            type: serverWidget.FieldType.TEXT,
            label: 'Serial Number'
        });
        serialField.isMandatory = true;

        // Add action field (hidden)
        form.addField({
            id: 'custpage_action',
            type: serverWidget.FieldType.TEXT,
            label: 'Action'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        // Add submit buttons
        form.addSubmitButton({ label: 'Save Entry' });
        form.addButton({
            id: 'custpage_save_and_new',
            label: 'Save & Enter Another',
            functionName: 'saveAndNew'
        });

        return form;
    }

    function processEntry(context) {
        const params = context.request.parameters;

        // Validate required fields
        if (!params.custpage_customer || !params.custpage_serial) {
            throw new Error('Missing required fields');
        }

        // Create work entry record
        const workEntry = recordHelpers.createRecord('customrecord_fs_work_entry', {
            custrecord_fs_customer: params.custpage_customer,
            custrecord_fs_serial: params.custpage_serial,
            custrecord_fs_received_date: new Date(),
            custrecord_fs_status: 1  // New
        });

        const recordId = workEntry.save();

        // Redirect based on action
        const action = params.custpage_action;
        if (action === 'save_and_new') {
            redirect.toSuitelet({
                scriptId: runtime.getCurrentScript().id,
                deploymentId: runtime.getCurrentScript().deploymentId,
                parameters: {
                    mode: 'entry',
                    message: 'Entry saved successfully',
                    msgtype: 'confirmation'
                }
            });
        } else {
            redirect.toRecord({
                type: 'customrecord_fs_work_entry',
                id: recordId
            });
        }
    }

    return {
        buildForm: buildForm,
        processEntry: processEntry
    };
});
```

### 3. Shared Utilities (SO Builder Example)

Common business logic is extracted into reusable modules:

```javascript
// lib/so_builder.js
define(['N/record', 'N/search', './record_helpers'],
function(record, search, recordHelpers) {

    function createSalesOrderFromWorkEntries(customerId, workEntryIds, config) {
        // Create SO
        const so = record.create({
            type: record.Type.SALES_ORDER,
            isDynamic: true
        });

        // Set header fields IN CORRECT ORDER
        so.setValue({ fieldId: 'entity', value: customerId });
        so.setValue({ fieldId: 'subsidiary', value: config.subsidiary });
        so.setValue({ fieldId: 'trandate', value: new Date() });

        // Load work entry details
        const workEntries = loadWorkEntries(workEntryIds);

        // Add line items
        workEntries.forEach(function(entry) {
            addLineItem(so, entry, config);
        });

        const soId = so.save();

        // Update work entries with SO reference
        workEntryIds.forEach(function(entryId) {
            recordHelpers.updateRecord('customrecord_fs_work_entry', entryId, {
                custrecord_fs_sales_order: soId,
                custrecord_fs_status: 4  // Billed
            });
        });

        return soId;
    }

    function addLineItem(so, workEntry, config) {
        so.selectNewLine({ sublistId: 'item' });

        // CRITICAL: Set item FIRST (NetSuite requirement)
        so.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'item',
            value: workEntry.itemId
        });

        // Then set quantity
        so.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'quantity',
            value: 1
        });

        // Then set price level (AFTER item)
        so.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'price',
            value: config.priceLevel
        });

        // Then classification fields (AFTER item)
        so.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'department',
            value: config.department
        });

        so.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'location',
            value: config.location
        });

        so.commitLine({ sublistId: 'item' });
    }

    function loadWorkEntries(entryIds) {
        // Search for work entries with item mapping
        const searchResults = search.create({
            type: 'customrecord_fs_work_entry',
            filters: [
                ['internalid', 'anyof', entryIds]
            ],
            columns: [
                'custrecord_fs_customer',
                'custrecord_fs_serial',
                'custrecord_fs_outcome',
                'custrecord_fs_board_type'  // Used to determine item
            ]
        }).run().getRange({ start: 0, end: 1000 });

        return searchResults.map(function(result) {
            return {
                id: result.id,
                customerId: result.getValue('custrecord_fs_customer'),
                serial: result.getValue('custrecord_fs_serial'),
                outcome: result.getValue('custrecord_fs_outcome'),
                itemId: mapOutcomeToItem(result.getValue('custrecord_fs_outcome'))
            };
        });
    }

    function mapOutcomeToItem(outcome) {
        // Map outcome to inventory item
        const ITEM_MAPPING = {
            '1': 123,  // Repaired → Repair Service Item
            '2': 124,  // Replaced → Replacement Item
            '3': 125   // Unrepairable → Evaluation Fee
        };
        return ITEM_MAPPING[outcome] || 125;
    }

    return {
        createSalesOrderFromWorkEntries: createSalesOrderFromWorkEntries
    };
});
```

## Benefits

### Before (Separate Suitelets)

**Problems:**
- 3 separate Suitelet scripts to deploy and maintain
- Duplicated code for shared logic (record creation, validation)
- Hard to share data between workflows
- More script governance consumed across deployments
- Difficult to coordinate UI/UX across related screens

### After (Multi-Mode Suitelet)

**Benefits:**
- Single deployment with mode-based routing
- Shared business logic in reusable modules
- Consistent UI/UX across workflow modes
- Easier to add new modes (add module + route)
- Better code organization (modes/ folder)
- Lower governance overhead
- Tab-based navigation across modes

## When to Use This Pattern

**Good fit:**
- Multi-step workflows with 3+ related UIs
- Workflows with different user roles accessing related data
- Complex processes that would otherwise need multiple Suitelets
- Workflows sharing significant business logic

**Not needed:**
- Single-purpose Suitelets with one UI
- Completely unrelated workflows
- Simple data entry forms

## Testing

Run tests with:
```bash
npm test
```

The test suite covers:

**Mode Routing (workflow_tracker.test.js):**
- GET requests route to correct mode
- POST requests route to correct action
- Default mode handling
- Invalid mode/action handling

**Entry Mode (entry_mode.test.js):**
- Form creation with required fields
- Client script attachment
- Entry record creation
- Save and redirect vs. save and new
- Field validation

**Management Mode (management_mode.test.js):**
- Dashboard rendering
- Search filtering
- Status updates
- Bulk operations

**SO Builder (so_builder.test.js):**
- Sales order creation
- Header field order (critical for NetSuite)
- Line item addition
- Item field set FIRST (NetSuite requirement)
- Price level AFTER item
- Classification fields AFTER item
- Work entry status updates after billing

## Deployment

1. Copy files to FileCabinet:
   ```
   /SuiteScripts/[YourCompany]/patterns/multi-mode-suitelet/
   ```

2. Deploy using SDF:
   ```bash
   suitecloud project:deploy
   ```

3. Create script record in NetSuite:
   - Type: Suitelet
   - Script File: `fs_workflow_tracker_sl.js`
   - ID: `customscript_fs_workflow_tracker`

4. Create deployment:
   - Status: Testing (or Released)
   - ID: `customdeploy_fs_workflow_tracker`
   - URL: `https://<account>.app.netsuite.com/app/site/hosting/scriptlet.nl?script=XXX&deploy=1`

5. Add URL parameters for different modes:
   - Entry: `&mode=entry`
   - Management: `&mode=manage`
   - Billing: `&mode=billing`

## Extending the Pattern

### Add a New Mode

1. Create mode module (`modes/reporting_mode.js`)
2. Add route in main Suitelet
3. Add client script if needed
4. Add tests

Example:

```javascript
// modes/reporting_mode.js
define(['N/ui/serverWidget', 'N/search'],
function(serverWidget, search) {

    function buildReportForm(context) {
        const form = serverWidget.createForm({ title: 'Work Entry Report' });

        // Add date range filters
        form.addField({
            id: 'custpage_date_from',
            type: serverWidget.FieldType.DATE,
            label: 'From Date'
        });

        // Add results sublist
        const sublist = form.addSublist({
            id: 'custpage_results',
            type: serverWidget.SublistType.LIST,
            label: 'Results'
        });

        // Load data and populate
        const results = search.create({
            type: 'customrecord_fs_work_entry',
            // ... search config
        }).run().getRange({ start: 0, end: 1000 });

        results.forEach(function(result, i) {
            // Set sublist values
        });

        return form;
    }

    return {
        buildReportForm: buildReportForm
    };
});

// Update main Suitelet
const MODES = {
    ENTRY: 'entry',
    MANAGE: 'manage',
    BILLING: 'billing',
    REPORT: 'report'  // NEW
};

function handleGet(context) {
    const mode = context.request.parameters.mode || MODES.ENTRY;

    switch (mode) {
        // ... existing modes
        case MODES.REPORT:
            return reportingMode.buildReportForm(context);  // NEW
        default:
            return entryMode.buildForm(context);
    }
}
```

### Add Tab Navigation

Create a navigation helper to show tabs across modes:

```javascript
// lib/navigation_helper.js
function addModeNavigation(form, currentMode, scriptUrl) {
    const tabs = [
        { label: 'Entry', mode: 'entry' },
        { label: 'Management', mode: 'manage' },
        { label: 'Billing', mode: 'billing' }
    ];

    tabs.forEach(function(tab) {
        const url = scriptUrl + '&mode=' + tab.mode;
        const isActive = (tab.mode === currentMode);

        form.addButton({
            id: 'custpage_tab_' + tab.mode,
            label: isActive ? '▶ ' + tab.label : tab.label,
            functionName: 'navigateToMode(\'' + url + '\')'
        });
    });
}
```

## Related Patterns

- **Config-Driven Suitelet** — For modular report column definitions
- **RESTlet API Suite** — For headless mode routing (API endpoints)
- **Map/Reduce Companion** — For batch processing work entries

## License

MIT — use freely in your own NetSuite projects.

## Questions?

Found a bug or have a question about this pattern?
[Open an issue on GitHub](https://github.com/FlowSync-Consulting/netsuite-patterns/issues)

Need help implementing this in your NetSuite environment?
[Book a free discovery call](https://flowsyncconsulting.com/contact/)
