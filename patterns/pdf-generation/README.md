# PDF Generation Pattern

**Pattern Type:** Suitelet + Workflow Action
**Complexity:** Medium
**Use Case:** Generate branded PDF documents from NetSuite records with custom templates
**Tests:** None (thin pattern - focused on PDF rendering and email integration)

## Overview

The PDF generation pattern provides a flexible system for creating professional, branded PDF documents from NetSuite records. Instead of using NetSuite's basic PDF/HTML templates or Advanced PDF/HTML, this pattern gives you full control over document layout, styling, and data organization.

This pattern is valuable for:
- Custom invoices with company branding
- Sales order confirmations with grouped line items
- Packing slips with special formatting
- Custom reports requiring complex layouts
- Email workflows that send PDFs automatically

## Real-World Example

This pattern was extracted from a custom invoice PDF generator built for a wholesale distributor. The business requirements were:

- Group line items by product category (not chronological order)
- Show category subtotals and grand total
- Include custom company branding (logo, colors, footer)
- Automatically email PDF to customer when invoice is created
- Support multiple invoice templates (standard, detailed, summary)

The solution replaced NetSuite's standard PDF templates, which couldn't handle grouped line items or category subtotals. The custom PDFs improved **customer satisfaction and reduced billing inquiries by 40%**.

[See the full case study →](https://flowsyncconsulting.com/portfolio/pdf-template-invoice-generation/)

## File Structure

```
patterns/pdf-generation/
├── src/
│   ├── fs_pdf_generator_sl.js          # Suitelet for on-demand PDF generation
│   ├── fs_email_sender_wa.js           # Workflow action for automatic email
│   ├── lib/
│   │   ├── data_sources.js              # Load and normalize record data
│   │   └── line_item_grouper.js         # Group line items by category/type
│   ├── templates/
│   │   └── invoice_template.html        # BFO-compatible HTML template
├── deploy/
│   └── deploy.xml                       # SDF manifest
└── README.md                            # This file
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                   Usage Scenarios                           │
│                                                             │
│  1. On-Demand: User clicks "Generate PDF" button           │
│  2. Workflow: Invoice created → Auto-email PDF             │
└────────────────────────────┬────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
┌─────────────────────────┐   ┌─────────────────────────┐
│  fs_pdf_generator_sl.js │   │ fs_email_sender_wa.js   │
│  (Suitelet)             │   │ (Workflow Action)       │
├─────────────────────────┤   ├─────────────────────────┤
│ onRequest()             │   │ onAction()              │
│ - Get recordtype/id     │   │ - Get current record    │
│ - Load record data      │   │ - Load record data      │
│ - Generate PDF          │   │ - Generate PDF          │
│ - Return for download   │   │ - Email to customer     │
└────────┬────────────────┘   └────────┬────────────────┘
         │                             │
         └──────────────┬──────────────┘
                        │
         ┌──────────────┴──────────────┐
         │                             │
         ▼                             ▼
┌─────────────────────┐   ┌─────────────────────────┐
│  Data Sources       │   │  Line Item Grouper      │
│  data_sources.js    │   │  line_item_grouper.js   │
├─────────────────────┤   ├─────────────────────────┤
│ loadRecordData()    │   │ groupByCategory()       │
│ - Load transaction  │   │ - Group line items      │
│ - Load line items   │   │ - Calculate subtotals   │
│ - Load entity info  │   │ - Format amounts        │
│ - Format dates/$    │   │                         │
│                     │   │ groupByItemType()       │
│ Returns: Object     │   │ groupByDepartment()     │
└─────────────────────┘   └─────────────────────────┘
                                    │
                                    ▼
                        ┌─────────────────────────┐
                        │  HTML Template          │
                        │  invoice_template.html  │
                        ├─────────────────────────┤
                        │ FreeMarker syntax       │
                        │ - Header (company info) │
                        │ - Invoice info          │
                        │ - Grouped line items    │
                        │ - Totals section        │
                        │ - Footer (terms)        │
                        └─────────────────────────┘
                                    │
                                    ▼
                        ┌─────────────────────────┐
                        │  N/render module        │
                        │  (NetSuite PDF engine)  │
                        └─────────────────────────┘
                                    │
                                    ▼
                        ┌─────────────────────────┐
                        │  PDF File               │
                        │  Invoice_12345.pdf      │
                        └─────────────────────────┘
```

## How It Works

### 1. Data Source Loading

The data sources module loads and normalizes record data:

```javascript
// lib/data_sources.js
function loadRecordData(recordType, recordId) {
    const rec = record.load({ type: recordType, id: recordId });

    return {
        // Header fields
        id: rec.id,
        type: rec.type,
        tranId: rec.getValue('tranid'),
        tranDate: formatDate(rec.getValue('trandate')),
        status: rec.getText('status'),

        // Entity info
        entity: {
            id: rec.getValue('entity'),
            name: rec.getText('entity'),
            email: getEntityEmail(rec.getValue('entity')),
            phone: getEntityPhone(rec.getValue('entity'))
        },

        // Addresses
        billingAddress: {
            addr1: rec.getValue('billaddr1'),
            city: rec.getValue('billcity'),
            state: rec.getValue('billstate'),
            zip: rec.getValue('billzip')
        },

        // Totals
        subtotal: formatCurrency(rec.getValue('subtotal')),
        taxtotal: formatCurrency(rec.getValue('taxtotal')),
        total: formatCurrency(rec.getValue('total')),

        // Line items
        lineItems: loadLineItems(rec),

        // Company info
        company: getCompanyInfo()
    };
}

function loadLineItems(rec) {
    const lineCount = rec.getLineCount({ sublistId: 'item' });
    const lineItems = [];

    for (let i = 0; i < lineCount; i++) {
        lineItems.push({
            line: i + 1,
            item: {
                id: rec.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i }),
                name: rec.getSublistText({ sublistId: 'item', fieldId: 'item', line: i }),
                description: rec.getSublistValue({ sublistId: 'item', fieldId: 'description', line: i })
            },
            quantity: rec.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line: i }),
            rate: formatCurrency(rec.getSublistValue({ sublistId: 'item', fieldId: 'rate', line: i })),
            amount: formatCurrency(rec.getSublistValue({ sublistId: 'item', fieldId: 'amount', line: i })),
            category: rec.getSublistText({ sublistId: 'item', fieldId: 'custcol_category', line: i }) || 'General'
        });
    }

    return lineItems;
}
```

### 2. Line Item Grouping

The line item grouper organizes items by category:

```javascript
// lib/line_item_grouper.js
function groupByCategory(lineItems) {
    const groups = {};

    lineItems.forEach(item => {
        const category = item.category || 'General';

        if (!groups[category]) {
            groups[category] = {
                category: category,
                items: [],
                subtotal: 0
            };
        }

        groups[category].items.push(item);
        groups[category].subtotal += parseAmount(item.amount);
    });

    // Convert to array with formatted subtotals
    return Object.keys(groups).map(category => ({
        category: category,
        items: groups[category].items,
        subtotal: formatCurrency(groups[category].subtotal),
        subtotalRaw: groups[category].subtotal
    })).sort((a, b) => a.category.localeCompare(b.category));
}
```

### 3. PDF Generation (Suitelet)

The Suitelet generates PDFs on demand:

```javascript
// fs_pdf_generator_sl.js
function onRequest(context) {
    const params = context.request.parameters;
    const recordType = params.recordtype;
    const recordId = params.recordid;
    const templateName = params.template || 'invoice_template.html';

    // Load record data
    const recordData = DataSources.loadRecordData(recordType, recordId);

    // Group line items
    if (recordData.lineItems && recordData.lineItems.length > 0) {
        recordData.groupedLineItems = LineItemGrouper.groupByCategory(recordData.lineItems);
    }

    // Generate PDF
    const pdfFile = generatePDF(recordData, templateName);

    // Return PDF for download
    context.response.writeFile({
        file: pdfFile,
        isInline: false
    });
}

function generatePDF(recordData, templateName) {
    const templateFile = file.load({ id: `./templates/${templateName}` });

    const renderer = render.create();
    renderer.templateContent = templateFile.getContents();

    renderer.addCustomDataSource({
        format: render.DataSource.OBJECT,
        alias: 'record',
        data: recordData
    });

    return renderer.renderAsPdf();
}
```

### 4. HTML Template (FreeMarker)

The template uses FreeMarker syntax for dynamic content:

```html
<!-- templates/invoice_template.html -->
<!DOCTYPE html>
<html>
<head>
    <style>
        /* BFO-compatible PDF styles */
        @page {
            size: letter;
            margin: 0.5in;
        }

        body {
            font-family: Arial, Helvetica, sans-serif;
            font-size: 10pt;
        }

        .line-items {
            width: 100%;
            border-collapse: collapse;
        }

        .line-items th {
            background-color: #145250;
            color: white;
            padding: 8px;
        }

        .category-header {
            background-color: #f2ede5;
            font-weight: bold;
            color: #145250;
        }
    </style>
</head>
<body>

    <!-- Company header -->
    <div class="company-name">${record.company.name}</div>
    <div>${record.company.address}</div>

    <!-- Invoice info -->
    <div>Invoice #: ${record.tranId}</div>
    <div>Date: ${record.tranDate}</div>
    <div>Customer: ${record.entity.name}</div>

    <!-- Grouped line items -->
    <#if record.groupedLineItems??>
        <table class="line-items">
            <thead>
                <tr>
                    <th>Item</th>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Rate</th>
                    <th>Amount</th>
                </tr>
            </thead>
            <tbody>
                <#list record.groupedLineItems as group>
                    <!-- Category header -->
                    <tr class="category-header">
                        <td colspan="5">${group.category}</td>
                    </tr>

                    <!-- Items in category -->
                    <#list group.items as item>
                    <tr>
                        <td>${item.item.name}</td>
                        <td>${item.item.description!""}</td>
                        <td>${item.quantity}</td>
                        <td>${item.rate}</td>
                        <td>${item.amount}</td>
                    </tr>
                    </#list>

                    <!-- Category subtotal -->
                    <tr class="category-subtotal">
                        <td colspan="4">Subtotal - ${group.category}:</td>
                        <td>${group.subtotal}</td>
                    </tr>
                </#list>
            </tbody>
        </table>
    </#if>

    <!-- Totals -->
    <div>Subtotal: ${record.subtotal}</div>
    <div>Tax: ${record.taxtotal}</div>
    <div>Total: ${record.total}</div>

</body>
</html>
```

### 5. Email Workflow Action

The workflow action automatically emails PDFs:

```javascript
// fs_email_sender_wa.js
function onAction(context) {
    const currentRecord = context.newRecord;
    const recordType = currentRecord.type;
    const recordId = currentRecord.id;

    // Load record data
    const recordData = DataSources.loadRecordData(recordType, recordId);

    // Group line items
    if (recordData.lineItems && recordData.lineItems.length > 0) {
        recordData.groupedLineItems = LineItemGrouper.groupByCategory(recordData.lineItems);
    }

    // Generate PDF
    const pdfFile = generatePDF(recordData, 'invoice_template.html');

    // Get recipient email from customer record
    const recipientEmail = getRecipientEmail(currentRecord);

    // Send email with PDF attachment
    email.send({
        author: -5,  // No-reply
        recipients: recipientEmail,
        subject: 'Your Invoice from ' + recordData.company.name,
        body: 'Please find your invoice attached.',
        attachments: [pdfFile]
    });
}
```

## Benefits

### Before (Standard NetSuite PDFs)

**Problems:**
- Limited layout customization
- No support for grouped line items
- Can't calculate category subtotals
- Hard to match company branding exactly
- Advanced PDF/HTML requires expensive add-on
- Complex template syntax

### After (Custom PDF Generation)

**Benefits:**
- Full control over PDF layout and styling
- Group line items by category, type, or department
- Calculate and display subtotals for groups
- Perfect company branding (logo, colors, fonts)
- BFO-compatible HTML/CSS (well-documented)
- Reusable data source pattern
- Easy to create multiple templates
- Workflow integration for automatic emailing

## When to Use This Pattern

**Good fit:**
- Custom invoice layouts with grouped line items
- Sales order confirmations with category subtotals
- Packing slips with special formatting
- Multi-page documents with headers/footers
- Documents requiring complex calculations
- Automatic PDF email workflows

**Not needed:**
- Standard NetSuite PDF templates meet requirements
- Simple single-page documents
- No grouping or subtotal requirements
- Built-in Advanced PDF/HTML is already licensed

## Template Design Best Practices

### BFO Renderer Compatibility

NetSuite's PDF renderer uses BFO (Big Faceless Organization) PDF library. Key considerations:

1. **Page sizing:**
   ```css
   @page {
       size: letter;  /* or A4, legal */
       margin: 0.5in;
   }
   ```

2. **Headers and footers:**
   ```css
   @page {
       @top-center {
           content: element(header);
       }
       @bottom-center {
           content: element(footer);
       }
   }

   .header {
       position: running(header);
   }
   ```

3. **Page breaks:**
   ```css
   .avoid-break {
       page-break-inside: avoid;
   }

   .force-break {
       page-break-after: always;
   }
   ```

4. **Supported CSS:**
   - Borders, backgrounds, padding, margins
   - Tables with collapse/separate borders
   - Fonts (Arial, Helvetica, Times, Courier)
   - Colors (hex, rgb, named colors)

5. **Not supported:**
   - Flexbox, Grid
   - CSS transforms
   - Web fonts (@font-face)
   - JavaScript

### FreeMarker Syntax Reference

```html
<!-- Variables -->
${record.tranId}
${record.company.name}

<!-- Conditional display -->
<#if record.memo??>
    <div>${record.memo}</div>
</#if>

<!-- Lists/iteration -->
<#list record.lineItems as item>
    <tr>
        <td>${item.line}</td>
        <td>${item.item.name}</td>
    </tr>
</#list>

<!-- Default values -->
${item.description!"No description"}

<!-- Number formatting -->
${item.quantity?string("0.00")}
```

## Extending the Pattern

### Add New Template

1. Create new HTML file in `templates/` folder
2. Use same data structure (or extend data sources)
3. Pass template name as parameter

```javascript
// Generate PDF with custom template
const pdfFile = generatePDF(recordData, 'packing_slip_template.html');
```

### Add New Grouping Logic

```javascript
// Group by item type instead of category
recordData.groupedLineItems = LineItemGrouper.groupByItemType(recordData.lineItems);

// Group by department
recordData.groupedLineItems = LineItemGrouper.groupByDepartment(recordData.lineItems);
```

### Add Record Types

Extend data sources to support new record types:

```javascript
// lib/data_sources.js
function loadRecordData(recordType, recordId) {
    if (isTransactionRecord(recordType)) {
        return loadTransactionData(rec);
    } else if (recordType === 'estimate') {
        return loadEstimateData(rec);
    } else if (recordType === 'purchaseorder') {
        return loadPurchaseOrderData(rec);
    } else {
        return loadGenericData(rec);
    }
}
```

### Add Button to Record

Add a button to invoice form that opens PDF Suitelet:

1. Create user event script (beforeLoad)
2. Add button to form
3. Set button URL to Suitelet with record info

```javascript
// User event script - beforeLoad
function beforeLoad(context) {
    if (context.type === context.UserEventType.VIEW) {
        const form = context.form;
        const recordId = context.newRecord.id;

        const pdfUrl = url.resolveScript({
            scriptId: 'customscript_fs_pdf_generator',
            deploymentId: 'customdeploy_fs_pdf_generator',
            params: {
                recordtype: 'invoice',
                recordid: recordId
            }
        });

        form.addButton({
            id: 'custpage_generate_pdf',
            label: 'Generate PDF',
            functionName: `window.open('${pdfUrl}', '_blank')`
        });
    }
}
```

## Deployment

1. Copy files to FileCabinet:
   ```
   /SuiteScripts/[YourCompany]/patterns/pdf-generation/
   ```

2. Deploy using SDF:
   ```bash
   suitecloud project:deploy
   ```

3. Create Suitelet script record:
   - Type: Suitelet
   - Script File: `fs_pdf_generator_sl.js`
   - ID: `customscript_fs_pdf_generator`

4. Create Workflow Action script record:
   - Type: Workflow Action Script
   - Script File: `fs_email_sender_wa.js`
   - ID: `customscript_fs_email_sender`
   - Parameters:
     - `custscript_fs_pdf_template` (template file name)
     - `custscript_fs_email_subject` (email subject)
     - `custscript_fs_email_body` (email body text)

5. Configure workflow:
   - Trigger: After Submit (when invoice is created)
   - Action: Execute Script → `fs_email_sender_wa.js`

## Related Patterns

- **Batch Transaction Search** — For finding records to generate PDFs
- **Multi-Mode Suitelet** — For combining PDF generation with other workflows
- **RESTlet API Suite** — For headless PDF generation via API

## License

MIT — use freely in your own NetSuite projects.

## Questions?

Found a bug or have a question about this pattern?
[Open an issue on GitHub](https://github.com/FlowSync-Consulting/netsuite-patterns/issues)

Need help implementing this in your NetSuite environment?
[Book a free discovery call](https://flowsyncconsulting.com/contact/)
