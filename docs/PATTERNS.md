# Pattern Index

This document provides an overview of all patterns in this repository.

## Available Patterns

### Config-Driven Suitelet

**Type:** Suitelet
**Complexity:** Medium
**Location:** `patterns/config-driven-suitelet/`

Separate column definitions from form rendering logic for maintainable report suitelets.

**Use Cases:**
- Reports with 10+ columns
- Pivot tables or matrix layouts
- Reports that change frequently
- Multiple similar reports

**Key Files:**
- `fs_config_driven_form_builder.js` — Reusable form builder
- `fs_territory_report_columns_config.js` — Column definitions
- `fs_territory_performance_sl.js` — Main suitelet

**Tests:** 11 unit tests (Jest)

[View Pattern Documentation →](../patterns/config-driven-suitelet/README.md)

---

## Coming Soon

The following patterns are being prepared for release:

- **Map/Reduce Companion** — Batch report generation and data processing
- **Search Builder** — Modular search construction with dynamic filters
- **Pivot Table Builder** — Transform row data into pivot format
- **Workflow State Machine** — Robust workflow state management
- **RESTlet API Gateway** — Standardized RESTlet request/response handling

## Pattern Selection Guide

| Pattern | Best For | Avoid When |
|---------|----------|------------|
| Config-Driven Suitelet | Reports, pivot tables, frequent column changes | Simple forms (< 5 fields), one-off reports |

## Contributing

Have a NetSuite pattern you'd like to share? [Open an issue](https://github.com/FlowSync-Consulting/netsuite-patterns/issues) to discuss it.
