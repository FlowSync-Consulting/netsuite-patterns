# Integration Pipeline Pattern

Enterprise-grade multi-stage inbound processing with record segmentation, duplicate detection, and status tracking.

> **Real-world impact:** This pattern has processed 140,000+ invoices across 3 client implementations with 99.7% success rate and zero duplicate record creation.

[See the full case study →](https://flowsyncconsulting.com/portfolio/integration-hub-invoice-pipeline/)

## Overview

The Integration Pipeline pattern provides a robust framework for receiving, validating, and processing external data into NetSuite records. It's designed for high-volume integrations where data quality, idempotency, and observability are critical.

### Key Features

- **Idempotent Operations** — Duplicate tracking ID rejection prevents resubmitted payloads from creating duplicate records
- **Multi-Stage Processing** — Separate inbound receipt from batch processing for resilience
- **Segmentation** — Groups records by configurable keys (vendor+date, customer+region) for efficient batch processing
- **Duplicate Detection** — External ID and payload hash comparison prevents duplicates even when tracking IDs differ
- **Status State Machine** — Enforces valid status transitions (Pending → Processing → Complete/Failed/Duplicate)
- **Error Recovery** — Failed records can be retried; detailed error messages stored on staging records

## Architecture

```
External System → RESTlet → Staging Record → Map/Reduce → Target Record
                    ↓             ↓               ↓
                  Validate    Track Status   Detect Duplicates
                                               Group by Segment
```

### Processing Flow

1. **Inbound RESTlet** receives payload and creates staging record
2. **Status: Pending** → awaiting processing
3. **Map/Reduce** queries pending records
4. **Map Stage** validates, enriches, checks duplicates → **Status: Processing**
5. **Reduce Stage** groups by segmentation key and creates target records
6. **Status: Complete** (success), **Failed** (error), or **Duplicate** (duplicate detected)

## Components

### 1. Inbound RESTlet (`fs_inbound_rl.js`)

Receives JSON payloads from external systems.

**POST** — Create staging record

```javascript
// Request
{
  "tracking_id": "EXT-INV-2026-03-001",
  "source_system": "ERP",
  "entity_type": "invoice",
  "payload": {
    "vendor_id": "V-12345",
    "invoice_date": "2026-03-15",
    "amount": 1250.00,
    "line_items": [...]
  }
}

// Response (success)
{
  "success": true,
  "tracking_id": "EXT-INV-2026-03-001",
  "staging_id": "987",
  "status": "Pending"
}

// Response (duplicate)
{
  "success": false,
  "code": "DUPLICATE_TRACKING_ID",
  "existing_staging_id": "456"
}
```

**GET** — Check status by tracking ID

```javascript
// Request
{ "tracking_id": "EXT-INV-2026-03-001" }

// Response
{
  "success": true,
  "tracking_id": "EXT-INV-2026-03-001",
  "status": "Complete",
  "target_record_id": "999",
  "processed_date": "2026-03-15T14:30:00.000Z"
}
```

### 2. Processor Map/Reduce (`fs_processor_mr.js`)

Transforms staging records into NetSuite target records.

**Script Parameters:**
- `custscript_entity_type_filter` — Process specific entity type (optional)
- `custscript_priority_filter` — Process high/normal/low priority records (optional)

**Stages:**
- **getInputData** — Query pending staging records
- **map** — Validate schema, enrich with lookups, check duplicates
- **reduce** — Group by segmentation key and create target records
- **summarize** — Update statuses, send notifications on failures

### 3. Libraries

#### Segmentation (`lib/segmentation.js`)

Groups records by configurable keys for batch processing.

```javascript
const segmentation = require('./lib/segmentation');

// Generate segmentation key
const key = segmentation.generateKey('invoice', {
  vendor_id: 'V-123',
  invoice_date: '2026-03-15'
});
// Returns: 'invoice|V-123|2026-03-15'

// Group records
const grouped = segmentation.groupRecords([
  { entityType: 'invoice', payload: {...} },
  { entityType: 'invoice', payload: {...} }
]);
// Returns: { 'invoice|V-123|2026-03-15': [rec1, rec2], ... }
```

**Built-in Strategies:**
- Invoice: `vendor + date`
- Sales Order: `customer + ship_date`
- Journal Entry: `period + department`
- Vendor: `batch` (no segmentation)

**Custom Strategies:**

```javascript
segmentation.registerStrategy('custom_type', function(payload) {
  return 'custom|' + payload.region + '|' + payload.category;
});
```

#### Duplicate Detection (`lib/duplicate_detector.js`)

Prevents duplicate records via external ID and payload hash comparison.

```javascript
const duplicateDetector = require('./lib/duplicate_detector');

const result = duplicateDetector.checkDuplicate({
  entityType: 'invoice',
  externalId: 'INV-2026-001',
  payload: { vendor_id: 'V-123', amount: 1000 }
});

if (result.isDuplicate) {
  // { isDuplicate: true, existingRecordId: '456', matchType: 'external_id' }
}
```

**Detection Methods:**
1. **External ID** — Fastest, requires unique external IDs
2. **Payload Hash** — SHA-256 hash of normalized payload, catches identical resubmissions

**Optional Enhancement:**
Add `custbody_payload_hash` custom field to target records for hash-based duplicate detection.

#### Status State Machine (`lib/status_machine.js`)

Manages staging record lifecycle with validation.

```javascript
const statusMachine = require('./lib/status_machine');

// Valid transitions
statusMachine.transitionStatus('123', 'Processing');
statusMachine.transitionStatus('123', 'Complete', null, '999'); // target record ID
statusMachine.transitionStatus('123', 'Failed', 'Vendor not found');

// Invalid transitions throw errors
statusMachine.transitionStatus('123', 'Pending'); // Error: cannot go backward
```

**Status Flow:**
```
Pending → Processing → Complete
                    ↘ Failed (retryable)
                    ↘ Duplicate (terminal)
```

## Custom Record Definition

### Integration Staging Record (`customrecord_integration_staging`)

| Field ID | Type | Description |
|----------|------|-------------|
| `custrecord_staging_tracking_id` | Text | Unique external tracking identifier |
| `custrecord_staging_source_system` | Text | Source system name (ERP, CRM, etc.) |
| `custrecord_staging_entity_type` | Text | Target entity type (invoice, vendor, etc.) |
| `custrecord_staging_payload` | Long Text | JSON payload |
| `custrecord_staging_status` | List/Record | Status (Pending, Processing, Complete, Failed, Duplicate) |
| `custrecord_staging_priority` | List/Record | Processing priority (high, normal, low) |
| `custrecord_staging_received_date` | Date/Time | When payload was received |
| `custrecord_staging_processed_date` | Date/Time | When processing completed |
| `custrecord_staging_error_message` | Long Text | Error details for failed records |
| `custrecord_staging_target_record_id` | Text | Internal ID of created target record |

**Status List Values:**
1. Pending
2. Processing
3. Complete
4. Failed
5. Duplicate

## Deployment

### 1. Create Custom Record Type

```bash
# Use SDF or UI to create customrecord_integration_staging
# Add all fields listed above
# Create status list with 5 values
```

### 2. Deploy Scripts

```bash
# Upload via SDF or file cabinet
# Deploy fs_inbound_rl.js as RESTlet
# Deploy fs_processor_mr.js as Map/Reduce
# Schedule Map/Reduce to run every 15 minutes
```

### 3. Configure External System

Point your external system to the RESTlet URL:
```
https://[account].restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=XXX&deploy=1
```

## Testing

```bash
npm test patterns/integration-pipeline/test/
```

**Test Coverage:**
- Segmentation: 15 tests (grouping, key generation, custom strategies)
- Duplicate Detection: 13 tests (hash generation, external ID, payload comparison)
- Status Machine: 16 tests (transitions, validation, batch updates)

## Use Cases

### High-Volume Invoice Processing

**Client:** Manufacturing company with 500+ daily vendor invoices from ERP system

**Challenge:** Manual entry backlog, duplicate invoices, no visibility into processing status

**Solution:**
- Inbound RESTlet receives invoices from ERP via scheduled job
- Segmentation groups invoices by vendor+date for batch processing
- Duplicate detection prevents resubmitted invoices
- Status tracking provides real-time dashboard of processing progress

**Results:** 140,000+ invoices processed, 99.7% success rate, 90% reduction in duplicate invoice errors

### Multi-Source Customer Sync

**Client:** E-commerce company with customers from Shopify, Amazon, and B2B portal

**Challenge:** Same customer can place orders on multiple platforms with different IDs

**Solution:**
- Inbound RESTlet receives customer data from all 3 platforms
- Duplicate detection uses email hash to detect existing customers across platforms
- Segmentation groups by source system for different validation rules

### Sales Order Integration

**Client:** Distribution company with EDI orders from 200+ trading partners

**Challenge:** Orders arrive 24/7, need fast processing, must handle malformed data gracefully

**Solution:**
- Inbound RESTlet provides idempotent endpoint for EDI processor
- Failed records stay in staging with detailed error messages
- Retry mechanism re-processes failed records after data corrections

## Best Practices

### Segmentation Strategy

**DO:**
- Group by natural batch boundaries (vendor+date, customer+region)
- Keep segment sizes under 100 records for optimal performance
- Use segmentation to enforce business rules (e.g., one invoice per vendor per day)

**DON'T:**
- Use unique values as segmentation keys (creates 1 record per segment)
- Mix unrelated entity types in same segment

### Error Handling

**DO:**
- Store detailed error messages on staging records
- Differentiate between retriable errors (network timeout) and permanent failures (invalid data)
- Send notifications for failed batches, not individual records

**DON'T:**
- Mark records as "Failed" for transient errors (use retry logic instead)
- Lose original payload when processing fails

### Performance Optimization

**DO:**
- Filter by entity_type and priority in Map/Reduce parameters
- Use scheduled Map/Reduce for predictable load patterns
- Index tracking_id field for fast duplicate detection

**DON'T:**
- Process all entity types in single Map/Reduce execution
- Query staging records in reduce stage (use context.values)

## Extension Points

### Custom Validation Rules

Extend `validatePayload()` in `fs_processor_mr.js`:

```javascript
function validatePayload(entityType, payload) {
  const errors = [];

  if (entityType === 'custom_transaction') {
    if (!payload.required_custom_field) {
      errors.push('Missing required_custom_field');
    }
  }

  return { valid: errors.length === 0, errors: errors };
}
```

### Custom Target Record Creation

Extend `createTargetRecord()` in `fs_processor_mr.js`:

```javascript
function createTargetRecord(entityType, payload) {
  if (entityType === 'custom_entity') {
    const rec = record.create({ type: 'customrecord_entity' });
    // Map payload to custom record fields
    return rec.save();
  }
  // ... existing logic
}
```

### Notification Integration

Replace `sendFailureNotification()` in `fs_processor_mr.js`:

```javascript
function sendFailureNotification(statusCounts) {
  email.send({
    author: runtime.getCurrentUser().id,
    recipients: 'integration-team@company.com',
    subject: 'Integration Pipeline: ' + statusCounts.Failed + ' failed records',
    body: 'View failed records: [URL]'
  });
}
```

## Monitoring

### Key Metrics

- **Success Rate** — % of staging records reaching "Complete" status
- **Duplicate Rate** — % of staging records marked "Duplicate"
- **Avg Processing Time** — Time from received_date to processed_date
- **Backlog Size** — Count of records in "Pending" status

### Saved Search: Failed Records Dashboard

```
Record Type: Integration Staging Record
Filters:
  - Status = Failed
  - Received Date = last 7 days
Columns:
  - Tracking ID
  - Source System
  - Entity Type
  - Received Date
  - Error Message
```

## Troubleshooting

### Staging Records Stuck in "Processing"

**Cause:** Map/Reduce script failed mid-execution

**Solution:**
1. Check Map/Reduce execution logs for errors
2. Manually update stuck records to "Pending" to retry
3. Fix underlying issue (governance, permissions, etc.)

### High Duplicate Rate

**Cause:** External system resubmitting same payloads multiple times

**Solution:**
1. Investigate why external system is sending duplicates
2. Verify tracking ID generation is unique per transaction
3. Consider payload hash detection if tracking IDs vary

### Performance Degradation

**Cause:** Large number of pending records or inefficient segmentation

**Solution:**
1. Increase Map/Reduce concurrency
2. Add entity_type filter to process different types in separate executions
3. Review segmentation strategy to balance segment sizes

## License

MIT — Use freely in your NetSuite projects

## About

Built by [Ben Saralegui](https://flowsyncconsulting.com/about/), NetSuite SuiteCloud Developer II.

[Book a free discovery call](https://flowsyncconsulting.com/contact/) to discuss integrating this pattern into your NetSuite account.
