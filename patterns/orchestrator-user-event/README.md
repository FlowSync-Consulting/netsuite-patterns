# Orchestrator User Event Pattern

**Production-ready pattern for managing multiple record actions via handler registry with lazy loading**

## Overview

The Orchestrator User Event pattern solves the problem of monolithic User Event scripts by delegating responsibility to specialized handlers. Each handler focuses on a single concern (surcharge calculation, validation, field derivation), and the orchestrator coordinates their execution in a defined order.

This pattern implements:
- **Handler Registry**: Centralized registration and execution of handlers
- **Lazy Loading**: Handlers are loaded only when needed to optimize governance
- **Priority Ordering**: Handlers execute in defined sequence
- **Enable/Disable**: Individual handlers can be toggled without code changes
- **Comprehensive Error Handling**: Each handler has isolated error handling
- **Extensive Test Coverage**: 15+ unit tests across all components

## Case Study

This pattern is based on the **Intelligent Billing Automation** project featured in FlowSync Consulting's portfolio:

[https://flowsyncconsulting.com/portfolio/automation-invoice-surcharge/](https://flowsyncconsulting.com/portfolio/automation-invoice-surcharge/)

The real-world implementation automated invoice surcharge calculation, validation, and field derivation for a professional services firm, reducing manual processing time by 85% and eliminating billing errors.

## Architecture

### Handler Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                    User Event Trigger                       │
│                    (beforeSubmit)                            │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Handler Registry                         │
│  • Load handler configuration                               │
│  • Sort by priority order                                   │
│  • Filter enabled handlers                                  │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
    ┌─────────────────┐         ┌─────────────────┐
    │ Lazy Load       │         │ Lazy Load       │
    │ Handler Class   │         │ Handler Class   │
    └────────┬────────┘         └────────┬────────┘
             │                           │
             ▼                           ▼
┌────────────────────┐      ┌────────────────────┐
│ Handler 1          │      │ Handler 2          │
│ (Priority: 1)      │      │ (Priority: 2)      │
│ • Check conditions │      │ • Check conditions │
│ • Execute logic    │      │ • Execute logic    │
│ • Return result    │      │ • Return result    │
└────────────────────┘      └────────────────────┘
             │                           │
             └───────────┬───────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Aggregate Results                        │
│  • Executed: [handler1, handler2]                           │
│  • Skipped: [handler3]                                      │
│  • Failed: []                                               │
└─────────────────────────────────────────────────────────────┘
```

### Class Hierarchy

```
BaseHandler (config/fs_base_handler.js)
    ├─ Error handling (parseError, handleException)
    ├─ Logging utilities (debug, audit, error)
    ├─ Module loading (lazy-load N/* modules)
    └─ Common field IDs and parameters
         │
         ├─ HandlerRegistry (src/lib/fs_handler_registry.js)
         │    ├─ Handler registration and configuration
         │    ├─ Lazy loading of handler modules
         │    ├─ Execution orchestration (beforeLoad, beforeSubmit, afterSubmit)
         │    └─ Enable/disable handler management
         │
         ├─ SurchargeHandler (src/handlers/fs_surcharge_handler.js)
         │    ├─ Check customer surcharge enabled
         │    ├─ Calculate surcharge percentage
         │    └─ Apply surcharge to invoice
         │
         ├─ ValidationHandler (src/handlers/fs_validation_handler.js)
         │    ├─ Validate required fields
         │    ├─ Validate date rules
         │    ├─ Validate line items
         │    └─ Validate business rules
         │
         └─ FieldDerivationHandler (src/handlers/fs_field_derivation_handler.js)
              ├─ Derive territory from customer
              ├─ Derive approval requirement
              └─ Derive risk level
```

## Why This Pattern?

### The Problem with Monolithic User Event Scripts

Traditional User Event scripts often become monolithic:

```javascript
// ❌ Bad: Monolithic User Event
function beforeSubmit(context) {
    // 500+ lines of mixed concerns
    if (needsSurcharge) { /* 50 lines */ }
    if (needsValidation) { /* 100 lines */ }
    if (needsFieldDerivation) { /* 80 lines */ }
    // ...impossible to test, maintain, or extend
}
```

### The Orchestrator Solution

```javascript
// ✅ Good: Orchestrator delegates to handlers
function beforeSubmit(context) {
    const registry = new HandlerRegistry();
    registry.executeBeforeSubmit(context);
}
```

Each handler is:
- **Focused**: Single responsibility
- **Testable**: Unit tested in isolation
- **Reusable**: Can be shared across scripts
- **Maintainable**: Changes isolated to one handler
- **Extensible**: New handlers added without touching existing code

## File Structure

```
orchestrator-user-event/
├── src/
│   ├── fs_invoice_orchestrator_ue.js        # Main User Event entry points
│   ├── lib/
│   │   └── fs_handler_registry.js           # Handler orchestration and lazy loading
│   └── handlers/
│       ├── fs_surcharge_handler.js          # Surcharge calculation
│       ├── fs_validation_handler.js         # Field and business rule validation
│       └── fs_field_derivation_handler.js   # Auto-populate derived fields
├── config/
│   └── fs_base_handler.js                   # Base class with error handling and logging
├── __tests__/
│   ├── fs_handler_registry.test.js          # 10 tests for registry
│   ├── fs_surcharge_handler.test.js         # 6 tests for surcharge
│   ├── fs_validation_handler.test.js        # 9 tests for validation
│   └── fs_field_derivation_handler.test.js  # 10 tests for field derivation
├── deploy/
│   └── deploy.xml                           # SDF deployment manifest
└── README.md
```

## Handler Details

### 1. SurchargeHandler

**Purpose**: Calculate and apply configurable surcharges based on customer settings and item percentages.

**Configuration**:
- Script Parameter: `custscript_fs_surcharge_item` (surcharge item ID)
- Item Custom Field: `custitem_fs_surcharge_percentage` (percentage as decimal or whole number)
- Customer Custom Field: `custentity_fs_add_surcharge` (checkbox)

**Logic**:
1. Check if customer has surcharge enabled
2. Find surcharge line item on invoice
3. Calculate total of non-surcharge items
4. Apply configured percentage
5. Update surcharge line with calculated amount

**Example**:
- Invoice has two items: $100 + $200 = $300
- Surcharge percentage: 3%
- Calculated surcharge: $9.00
- Invoice total: $309.00

### 2. ValidationHandler

**Purpose**: Validate invoice data before save to prevent invalid records.

**Validations**:
- **Required Fields**: Customer, Transaction Date
- **Date Rules**: Ship date must be on/after transaction date, no future dates
- **Line Items**: At least one item, valid quantities and rates
- **Business Rules**: Customer not on credit hold

**Behavior**:
- On validation failure, throws `N/error` to prevent save
- Returns user-friendly error message
- All validations run (collects all errors, not just first)

### 3. FieldDerivationHandler

**Purpose**: Auto-populate derived fields based on customer data and invoice amounts.

**Derived Fields**:
- **Territory**: From customer's default territory
- **Approval Required**: True if total > $10,000
- **Risk Level**: High/Medium/Low based on credit limit and overdue balance

**Example Risk Calculation**:
- High: Over credit limit OR has overdue balance
- Medium: Within 80% of credit limit OR invoice > $10,000
- Low: Otherwise

## Adding a New Handler

The orchestrator pattern follows the **Open/Closed Principle** - open for extension, closed for modification.

### Step 1: Create Handler Class

```javascript
// src/handlers/fs_my_new_handler.js
define(['../../config/fs_base_handler'], (BaseHandler) => {
    class MyNewHandler extends BaseHandler {
        constructor() {
            super();
        }

        executeBeforeSubmit = (scriptContext) => {
            try {
                const record = scriptContext.newRecord;

                // Your logic here
                const result = this.doSomething(record);

                if (!result.success) {
                    return { executed: false, reason: 'Conditions not met' };
                }

                return { executed: true, result: result };
            } catch (e) {
                this.handleException(e, 'MyNewHandler.executeBeforeSubmit');
                return { executed: false, error: e.message };
            }
        }

        doSomething = (record) => {
            // Implementation
        }
    }

    return MyNewHandler;
});
```

### Step 2: Register in Handler Registry

```javascript
// src/lib/fs_handler_registry.js

// Add to handlerPaths
this.handlerPaths = {
    // ...existing handlers
    myNewHandler: '../handlers/fs_my_new_handler'
};

// Add to handler configuration
beforeSubmitHandlers: [
    // ...existing handlers
    {
        name: 'MyNewHandler',
        key: 'myNewHandler',
        enabled: true,
        order: 4  // Execution order
    }
]
```

### Step 3: Write Tests

```javascript
// __tests__/fs_my_new_handler.test.js
describe('MyNewHandler', () => {
    it('should execute successfully when conditions are met', () => {
        // Test implementation
    });

    it('should skip when conditions are not met', () => {
        // Test implementation
    });
});
```

That's it! No changes to the User Event script required.

## Lazy Loading Strategy

Handlers are lazy-loaded to optimize governance units:

```javascript
// ❌ Without lazy loading: All handlers loaded upfront
define([
    './handlers/fs_surcharge_handler',
    './handlers/fs_validation_handler',
    './handlers/fs_field_derivation_handler'
], (Surcharge, Validation, FieldDerivation) => {
    // All modules loaded, even if not used
});

// ✅ With lazy loading: Handlers loaded on-demand
loadHandler = (handlerKey) => {
    if (this.handlers[handlerKey]) {
        return this.handlers[handlerKey];  // Return cached
    }

    const HandlerClass = this.loadModule(this.handlerPaths[handlerKey]);
    this.handlers[handlerKey] = new HandlerClass();
    return this.handlers[handlerKey];
}
```

**Benefits**:
- Reduced initial script load time
- Lower governance consumption for disabled handlers
- Faster execution when only some handlers apply

## Testing

Run all tests:

```bash
npm test -- patterns/orchestrator-user-event
```

Run specific test suite:

```bash
npm test -- patterns/orchestrator-user-event/__tests__/fs_handler_registry.test.js
```

**Test Coverage**:
- Handler Registry: 10 tests (lazy loading, execution, error handling, enable/disable)
- Surcharge Handler: 6 tests (calculation, customer check, line management)
- Validation Handler: 9 tests (required fields, dates, line items, business rules)
- Field Derivation Handler: 10 tests (territory, approval, risk level)

**Total: 35+ unit tests**

## Deployment

### Via SDF

```bash
# Deploy to account
suitecloud project:deploy

# Deploy specific files
suitecloud file:upload -p src/
```

### Manual File Cabinet Upload

1. Upload all files in `src/` to:
   ```
   SuiteScripts/FlowSync/InvoiceOrchestrator/
   ```

2. Create Script Record:
   - Type: User Event Script
   - Script File: `fs_invoice_orchestrator_ue.js`

3. Create Script Deployment:
   - Record Type: Invoice
   - Event Types: Before Load, Before Submit, After Submit
   - Status: Testing (validate first, then set to Released)

4. Configure Script Parameters:
   - `custscript_fs_surcharge_item`: Internal ID of surcharge item

### Custom Field Setup

Create the following custom fields:

**Item Fields**:
- `custitem_fs_surcharge_percentage`: Decimal or Integer (surcharge percentage)

**Customer Fields**:
- `custentity_fs_add_surcharge`: Checkbox (enable surcharge for customer)

**Transaction Body Fields**:
- `custbody_fs_territory`: List/Record (territory)
- `custbody_fs_approval_required`: Checkbox (approval required)
- `custbody_fs_risk_level`: List (High, Medium, Low)

## Configuration

### Enable/Disable Handlers

Handlers can be toggled in `getHandlerConfig()`:

```javascript
beforeSubmitHandlers: [
    {
        name: 'SurchargeHandler',
        key: 'surchargeHandler',
        enabled: true,  // Set to false to disable
        order: 1
    }
]
```

Or programmatically:

```javascript
registry.setHandlerEnabled('SurchargeHandler', false, 'beforeSubmit');
```

### Execution Order

Change `order` property to adjust sequence:

```javascript
{
    name: 'ValidationHandler',
    key: 'validationHandler',
    enabled: true,
    order: 1  // Will run before order: 2
}
```

Lower numbers run first. Handlers without `order` run last.

## Error Handling

All handlers inherit comprehensive error handling from `BaseHandler`:

```javascript
try {
    const result = handler.executeBeforeSubmit(context);
} catch (e) {
    // Error is automatically:
    // 1. Parsed (SuiteScript vs. native errors)
    // 2. Logged to script log with context
    // 3. Returned to registry for aggregation
}
```

Validation errors intentionally bubble up to prevent save:

```javascript
// ValidationHandler throws N/error to prevent save
throw errorModule.create({
    name: 'VALIDATION_ERROR',
    message: 'Customer is required',
    notifyOff: false
});
```

All other errors are caught and logged without preventing save.

## Performance Considerations

1. **Lazy Loading**: Handlers loaded on-demand (reduces upfront governance)
2. **Early Exit**: Handlers check conditions and return early if not applicable
3. **Batch Field Lookups**: Use `search.lookupFields()` instead of `record.load()`
4. **Cached Handler Instances**: Registry caches loaded handlers
5. **Execution Summary**: Audit logs include timing and results

## Production Checklist

Before deploying to production:

- [ ] All tests pass (`npm test`)
- [ ] Custom fields created in target account
- [ ] Surcharge item exists and has percentage configured
- [ ] Script parameters configured
- [ ] Deploy to SANDBOX first
- [ ] Test with real invoice data
- [ ] Verify surcharge calculations
- [ ] Test validation rules (try to create invalid invoices)
- [ ] Verify field derivation (territory, approval, risk)
- [ ] Check script logs for errors
- [ ] Set deployment status to Released

## Troubleshooting

### Handler Not Executing

1. Check handler is enabled in `getHandlerConfig()`
2. Check event type matches (CREATE/EDIT only)
3. Check script logs for skip reasons
4. Verify handler conditions (e.g., customer has surcharge enabled)

### Surcharge Not Calculating

1. Verify script parameter `custscript_fs_surcharge_item` is set
2. Check surcharge item has percentage in `custitem_fs_surcharge_percentage`
3. Verify customer has `custentity_fs_add_surcharge` checked
4. Ensure surcharge line item exists on invoice

### Validation Not Preventing Save

1. Verify ValidationHandler is enabled
2. Check N/error module loaded successfully
3. Review script logs for validation errors
4. Ensure handler runs before NetSuite's validation

### Field Derivation Not Working

1. Check custom fields exist and are accessible
2. Verify customer has required data (territory, credit limit)
3. Review script logs for derivation results
4. Ensure handler runs in correct order (after surcharge, before validation)

## Links

- **Case Study**: [Intelligent Billing Automation](https://flowsyncconsulting.com/portfolio/automation-invoice-surcharge/)
- **SuiteScript 2.1 Docs**: [User Event Scripts](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4387799721.html)
- **Pattern Repository**: [FlowSync-Consulting/netsuite-patterns](https://github.com/FlowSync-Consulting/netsuite-patterns)

## License

MIT License - see [LICENSE](../../LICENSE)

## Author

**FlowSync Consulting**
Enterprise NetSuite integrations and automation
[https://flowsyncconsulting.com](https://flowsyncconsulting.com)
