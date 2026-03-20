# NetSuite Patterns

Production-tested SuiteScript 2.1 patterns from real enterprise implementations. Each pattern includes documentation, tests, and SDF deployment artifacts.

> These patterns come from projects that have collectively delivered $750K+ in annual value across 9 enterprise implementations.
> [See the case studies at FlowSync Consulting](https://flowsyncconsulting.com/portfolio/)

## Patterns

| Pattern | Type | Description | Tests |
|---------|------|-------------|-------|
| [Batch Transaction Search](patterns/batch-transaction-search/) | Suitelet | Parameter-driven transaction search with pagination, sorting, and CSV export | None |
| [Config-Driven Suitelet](patterns/config-driven-suitelet/) | Suitelet | Data-driven column definitions for report forms | 11 tests |
| [Integration Pipeline](patterns/integration-pipeline/) | RESTlet + Map/Reduce | Multi-stage inbound processing with segmentation, duplicate detection, and status tracking | 60 tests |
| [Multi-Mode Suitelet](patterns/multi-mode-suitelet/) | Suitelet | Single Suitelet serving multiple workflow modes (entry, management, billing) | 23 tests |
| [Orchestrator User Event](patterns/orchestrator-user-event/) | User Event | Handler registry pattern for managing multiple record actions (surcharge, validation, field derivation) with lazy loading | 35 tests |
| [PDF Generation](patterns/pdf-generation/) | Suitelet + Workflow | Generate branded PDF documents from records with custom templates and email integration | None |
| [RESTlet API Suite](patterns/restlet-api-suite/) | RESTlet | 6 RESTlet endpoints with validation, error handling, and idempotent upserts | Yes |

## Shared Utilities

Reusable modules used across multiple patterns:

- **Governance Guard** — Safe governance checking for long-running scripts
- **Search Helpers** — Common N/search patterns (paged search, column extraction)
- **Record Helpers** — Safe getValue/setText with type normalization
- **Test Utils** — Jest mock factories for N/search, N/record, N/runtime

## Testing

```bash
npm install
npm test
```

All test suites use Jest with custom NetSuite module mocks in `shared/test_utils.js`.

## About

Built by [Ben Saralegui](https://flowsyncconsulting.com/about/), NetSuite SuiteCloud Developer II. I help mid-market companies automate manual processes and integrate disconnected systems.

[Book a free discovery call](https://flowsyncconsulting.com/contact/)

Found a bug or have a suggestion? [Open an issue](../../issues).

## License

MIT — use these patterns freely in your own NetSuite projects.
