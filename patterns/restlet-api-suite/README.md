# RESTlet API Suite Pattern

Production-tested NetSuite RESTlet API design for external system integration.
Demonstrates sophisticated error handling, input validation, idempotent upserts,
and external ID matching patterns used in enterprise field service integrations.

## Overview

This pattern implements a complete RESTlet API suite for field service management
integration. It showcases:

- **6 RESTlet endpoints** — Customer, Job, Sales Order, Fulfillment, Invoice, Payment
- **Shared validation framework** — Structured input validation with custom rules
- **Consistent error handling** — Standardized error responses across all endpoints
- **External ID matching** — Idempotent upsert pattern with caching
- **Postman collection** — Ready-to-import API collection with examples
- **Comprehensive tests** — 15+ Jest tests with NetSuite module mocks

> Based on a field service integration that processes 10,000+ transactions monthly
> across 6 synchronized transaction types.
> [See the case study](https://flowsyncconsulting.com/portfolio/integration-blaze-restlet-api/)

## Use Cases

- **External system integration** — Sync field service software with NetSuite
- **Mobile app backend** — Provide API layer for custom mobile applications
- **Middleware integration** — Connect NetSuite to iPaaS platforms (Celigo, Workato)
- **Partner portals** — Enable external partners to create orders and payments
- **IoT data ingestion** — Receive sensor data and create service records

## Architecture

### RESTlet Endpoints

| Endpoint | Methods | Purpose |
|----------|---------|---------|
| `fs_customer_rl.js` | GET, POST, PUT | Customer lookup, creation, and upsert |
| `fs_job_rl.js` | GET, POST, PUT | Job/work order management with status tracking |
| `fs_sales_order_rl.js` | POST | Create sales orders with multi-line items |
| `fs_fulfillment_rl.js` | POST | Item fulfillment with partial fulfillment support |
| `fs_invoice_rl.js` | POST | Invoice generation from fulfilled orders |
| `fs_payment_rl.js` | POST | Customer payment application with overpayment handling |

### Shared Libraries

| Library | Purpose |
|---------|---------|
| `lib/validation.js` | Input validation framework (required fields, types, custom rules) |
| `lib/error_handler.js` | Consistent error response formatting |
| `lib/external_id_matcher.js` | External ID to internal ID matching with caching |

## Key Features

### 1. Input Validation Framework

Comprehensive validation with structured error responses:

```javascript
const schema = {
  required: ['customer_id', 'amount'],
  types: {
    customer_id: 'string',
    amount: 'number',
    email: 'email'
  },
  rules: {
    amount: function(val) { return val > 0; }
  }
};

const validationErr = validation.validate(context, schema);
if (validationErr) return validationErr;
```

**Validation types supported:**
- `string`, `number`, `boolean`, `array`, `object`
- `date` — ISO 8601 or JavaScript date strings
- `email` — RFC-compliant email format

### 2. Consistent Error Handling

All endpoints return standardized error responses:

```json
{
  "success": false,
  "code": "RECORD_NOT_FOUND",
  "message": "Customer not found with external_id: FS-CUST-12345"
}
```

**Standard error codes:**
- `MISSING_REQUIRED_FIELD` — Required field not provided
- `INVALID_FIELD_TYPE` — Field type mismatch
- `INVALID_FIELD_VALUE` — Value fails validation rule
- `RECORD_NOT_FOUND` — Record lookup failed
- `DUPLICATE_RECORD` — Record already exists (POST operations)
- `UNEXPECTED_ERROR` — NetSuite or JavaScript error

### 3. Idempotent Upsert Pattern

External ID matching prevents duplicate record creation:

```javascript
// PUT endpoint - creates if not exists, updates if exists
function put(context) {
  const existingId = externalIdMatcher.findByExternalId('customer', context.external_id);

  if (existingId) {
    // Update existing record
    customerRec = record.load({ type: record.Type.CUSTOMER, id: existingId });
  } else {
    // Create new record
    customerRec = record.create({ type: record.Type.CUSTOMER });
    customerRec.setValue({ fieldId: 'externalid', value: context.external_id });
  }

  // Set fields and save
  // ...
}
```

**Benefits:**
- Safe retry logic for external systems
- Prevents duplicate records on API retry
- Cached lookups reduce governance usage (10 units → 0 units on cache hit)

### 4. Governance-Aware Design

External ID matcher includes in-memory cache:

```javascript
// First call: 10 governance units (search)
const customerId = externalIdMatcher.findByExternalId('customer', 'FS-CUST-123');

// Subsequent calls: 0 governance units (cache hit)
const customerId2 = externalIdMatcher.findByExternalId('customer', 'FS-CUST-123');
```

**Cache features:**
- In-memory cache per script execution
- Batch lookup for multiple IDs
- Optional cache bypass for testing

## API Examples

### Customer - Create

**Request:**
```json
POST /app/site/hosting/restlet.nl?script=123&deploy=1

{
  "external_id": "FS-CUST-12345",
  "company_name": "Example Field Services LLC",
  "email": "contact@example.com",
  "phone": "555-1234",
  "subsidiary_id": "1"
}
```

**Response:**
```json
{
  "success": true,
  "internal_id": "9876",
  "external_id": "FS-CUST-12345",
  "created": true,
  "message": "Customer created successfully"
}
```

### Job - Upsert

**Request:**
```json
PUT /app/site/hosting/restlet.nl?script=124&deploy=1

{
  "external_id": "FS-JOB-98765",
  "customer_external_id": "FS-CUST-12345",
  "job_name": "Water Damage Restoration - 123 Main St",
  "status": "in_progress",
  "assigned_technician": "John Smith"
}
```

**Response:**
```json
{
  "success": true,
  "internal_id": "5432",
  "external_id": "FS-JOB-98765",
  "created": false,
  "updated": true,
  "message": "Job updated successfully"
}
```

### Sales Order - Create with Line Items

**Request:**
```json
POST /app/site/hosting/restlet.nl?script=125&deploy=1

{
  "external_id": "FS-SO-55555",
  "customer_external_id": "FS-CUST-12345",
  "job_external_id": "FS-JOB-98765",
  "order_date": "2026-03-15",
  "line_items": [
    {
      "item_id": "100",
      "quantity": 5,
      "rate": 49.99,
      "description": "Water extraction equipment rental"
    },
    {
      "item_id": "101",
      "quantity": 10,
      "rate": 12.50,
      "description": "Dehumidifier rental (daily)"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "internal_id": "SO-12345",
  "external_id": "FS-SO-55555",
  "created": true,
  "line_count": 2,
  "message": "Sales order created successfully"
}
```

### Payment - Overpayment Scenario

**Request:**
```json
POST /app/site/hosting/restlet.nl?script=128&deploy=1

{
  "customer_external_id": "FS-CUST-12345",
  "payment_date": "2026-03-18",
  "amount": 1500.00,
  "payment_method": "Check",
  "reference_number": "CHK-9877",
  "invoice_external_id": "FS-INV-11111"
}
```

**Response (Invoice balance was $1,250):**
```json
{
  "success": true,
  "internal_id": "PMT-999",
  "customer_id": "9876",
  "invoice_id": "INV-123",
  "payment_amount": 1500.00,
  "applied_amount": 1250.00,
  "unapplied_amount": 250.00,
  "created": true,
  "message": "Customer payment created successfully (unapplied balance remains)"
}
```

## Authentication

NetSuite RESTlets use OAuth 1.0 (Token-Based Authentication) or OAuth 2.0.

### OAuth 1.0 Setup

1. **Enable Token-Based Authentication**
   - Setup → Company → Enable Features → SuiteCloud → Token-Based Authentication

2. **Create Integration Record**
   - Setup → Integration → Manage Integrations → New
   - Save the Consumer Key and Consumer Secret

3. **Generate Access Token**
   - Setup → Users/Roles → Access Tokens → New
   - Select the integration and user
   - Save the Token ID and Token Secret

4. **Configure Postman**
   - Import the Postman collection from `postman/netsuite_api_collection.json`
   - Set environment variables:
     - `account_id` — Your NetSuite account ID
     - `consumer_key`, `consumer_secret` — From integration record
     - `token`, `token_secret` — From access token
     - `customer_restlet_id`, `job_restlet_id`, etc. — RESTlet script IDs

### OAuth 2.0 Setup

Refer to NetSuite's OAuth 2.0 documentation for setup instructions.

## Deployment

### SDF (Recommended)

1. Copy files to your SDF project:
   ```
   src/FileCabinet/SuiteScripts/field_service_api/
   ├── fs_customer_rl.js
   ├── fs_job_rl.js
   ├── fs_sales_order_rl.js
   ├── fs_fulfillment_rl.js
   ├── fs_invoice_rl.js
   ├── fs_payment_rl.js
   └── lib/
       ├── validation.js
       ├── error_handler.js
       └── external_id_matcher.js
   ```

2. Deploy via SDF CLI:
   ```bash
   sdf deploy -p
   ```

3. Create script records in NetSuite for each RESTlet
4. Create deployments for each script

### Manual Upload

1. Upload files via Setup → SuiteBundles → Search & Install Bundles → File Cabinet
2. Navigate to Customization → Scripting → Scripts → New
3. Create a new RESTlet script for each endpoint
4. Set the script file path
5. Create deployments and note the script IDs

## Rate Limiting & Governance

### Governance Usage

Typical governance consumption per endpoint:

| Endpoint | Typical Units | Notes |
|----------|---------------|-------|
| Customer GET | 10-20 | Search (10) + record.load (10) |
| Customer POST | 20 | Search (10) + record.create (10) |
| Sales Order POST | 20 + (5 × lines) | Transform adds 5 units per line |
| Payment POST | 30-40 | Multiple record operations |

**Optimization tips:**
- Cache external ID lookups (reduces 10 units to 0)
- Batch operations where possible
- Use `isDynamic: false` for better performance

### Rate Limiting

NetSuite enforces concurrency limits:
- **Standard** — 10 concurrent RESTlet requests
- **Premium** — 25 concurrent RESTlet requests

**Recommendation:** Implement queue-based integration on the external system side.

## Error Handling Best Practices

### 1. Validate Early

Always validate input before performing any NetSuite operations:

```javascript
// Validate required fields first
const validationErr = validation.validateRequired(context, ['customer_id', 'amount']);
if (validationErr) return validationErr;

// Then validate types
const typeErr = validation.validateTypes(context, { amount: 'number' });
if (typeErr) return typeErr;

// Finally, perform business logic
```

### 2. Use Structured Error Codes

Return machine-readable error codes for integration error handling:

```javascript
if (!customerId) {
  return errorHandler.createError(
    errorHandler.ErrorCode.RECORD_NOT_FOUND,
    'Customer not found with external_id: ' + context.external_id
  );
}
```

### 3. Log Context

Include operation context in error logs:

```javascript
return errorHandler.formatError(err, 'fs_customer_rl.post');
```

This creates logs like:
```
ERROR: fs_customer_rl.post - NetSuite Error
Details: {name: 'RCRD_DSNT_EXIST', message: 'Record does not exist', ...}
```

## Testing

Run the test suite:

```bash
npm test
```

### Test Coverage

- ✅ **Validation framework** — 12 tests (required fields, types, custom rules)
- ✅ **Error handler** — 8 tests (success/error formatting, NetSuite errors)
- ✅ **External ID matcher** — 10 tests (find, create, batch, cache)
- ✅ **Customer RESTlet** — 8 tests (GET, POST, PUT operations)

**Total: 38 tests**

### Mock Strategy

Tests use custom NetSuite module mocks from `shared/test_utils.js`:

```javascript
const { search, record } = require('../../../shared/test_utils');

// Mock search result
search.mockSearchResults([
  { id: '123', values: { externalid: 'EXT-123' } }
]);

// Mock record creation
record.mockRecordId('999');
```

## Performance Considerations

### 1. External ID Cache

Cache hit rates significantly reduce governance usage:

```javascript
// First execution: 10 units
const id1 = externalIdMatcher.findByExternalId('customer', 'EXT-123');

// Same execution: 0 units (cache hit)
const id2 = externalIdMatcher.findByExternalId('customer', 'EXT-123');

// Next execution: Cache cleared, 10 units again
```

**Recommendation:** Structure your integration to batch operations per execution.

### 2. Batch Lookups

Use batch find for multiple external IDs:

```javascript
// Instead of 3 separate searches (30 units):
const id1 = externalIdMatcher.findByExternalId('customer', 'EXT-1');
const id2 = externalIdMatcher.findByExternalId('customer', 'EXT-2');
const id3 = externalIdMatcher.findByExternalId('customer', 'EXT-3');

// Use batch find (10 units):
const idMap = externalIdMatcher.batchFind('customer', ['EXT-1', 'EXT-2', 'EXT-3']);
```

### 3. Partial Fulfillment

Minimize record transformation overhead:

```javascript
// Partial fulfillment (25 units)
const fulfillmentRec = record.transform({
  fromType: record.Type.SALES_ORDER,
  fromId: salesOrderId,
  toType: record.Type.ITEM_FULFILLMENT
});

// Mark only specific lines for fulfillment (5 units per line)
```

## Security Considerations

### 1. Input Sanitization

All user input is validated before database operations:

```javascript
// Prevent SQL injection via search filters
const customerId = externalIdMatcher.findByExternalId('customer', externalId);
// Uses parameterized search filters internally
```

### 2. Error Message Sanitization

Error messages never expose internal IDs to external systems unless explicitly included:

```javascript
// Good: Controlled exposure
return errorHandler.createError(
  errorHandler.ErrorCode.DUPLICATE_RECORD,
  'Customer already exists',
  { internal_id: existingId }  // Explicitly included
);

// Bad: Unintentional exposure avoided by error handler
throw new Error('Record 12345 failed');  // Internal ID hidden in response
```

### 3. Permission Enforcement

RESTlet deployments should restrict access:
- **Role Restrictions** — Limit to integration-specific roles
- **Authentication** — Require OAuth token authentication
- **IP Restrictions** — Whitelist external system IP addresses (if applicable)

## Customization

### Adding a New Endpoint

1. **Create RESTlet file** (e.g., `fs_vendor_rl.js`)
2. **Import shared libraries**:
   ```javascript
   define(['N/record', './lib/validation', './lib/error_handler', './lib/external_id_matcher'], ...)
   ```
3. **Implement handlers** (`get`, `post`, `put`, `delete`)
4. **Add validation schema**
5. **Add tests** in `test/vendor_rl.test.js`
6. **Update Postman collection**
7. **Update `deploy.xml`**

### Extending Validation

Add custom field type validators in `lib/validation.js`:

```javascript
const TypeValidators = {
  // ... existing validators
  phone: function(value) {
    if (typeof value !== 'string') return false;
    const phoneRegex = /^\d{3}-\d{4}$/;
    return phoneRegex.test(value);
  }
};
```

### Custom Error Codes

Add business-specific error codes in `lib/error_handler.js`:

```javascript
const ErrorCode = {
  // ... existing codes
  INSUFFICIENT_INVENTORY: 'INSUFFICIENT_INVENTORY',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION'
};
```

## Troubleshooting

### Common Issues

**Issue:** `RECORD_NOT_FOUND` when external ID should exist

**Solution:** Check external ID field on the record. External IDs are case-sensitive.

---

**Issue:** `INSUFFICIENT_PERMISSION` error

**Solution:** Ensure the integration role has permissions for the record types being accessed (Customer, Job, Sales Order, etc.)

---

**Issue:** Governance limit exceeded

**Solution:** Reduce batch size or implement caching. Review governance usage in Execution Log.

---

**Issue:** Validation passing but record creation fails

**Solution:** Check mandatory fields in NetSuite. The validation schema may be incomplete.

---

**Issue:** Cache not working across requests

**Solution:** Cache is per-execution, not per-deployment. External systems should batch operations.

## Related Patterns

- **Config-Driven Suitelet** — Dynamic UI generation from config
- **Scheduled Search Processor** (Coming soon) — Batch processing with governance management
- **Map/Reduce Template** (Coming soon) — Large dataset processing

## Support

Found a bug or have a suggestion? [Open an issue](https://github.com/FlowSync-Consulting/netsuite-patterns/issues)

Need help implementing this pattern? [Book a consultation](https://flowsyncconsulting.com/contact/)

## License

MIT — Use this pattern freely in your NetSuite projects.
