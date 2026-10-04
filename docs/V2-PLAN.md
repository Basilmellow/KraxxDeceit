# KraxxDeceit v2 delivery plan

The original master roadmap ends at v1. On 2026-10-04 the user selected PDF reports
and sharing-ready exports as the first v2 phase. This document records the scoped
extension; it does not treat all future master-plan features as implemented.

## v2.0 - local research exports

PDF report download plus ZIP with JSON evidence, PDF/Markdown summaries, README
and exact-byte SHA-256 file checksums. Local generation, no case upload or public
share URL, no extra model calls or sandboxes. Preserve case integrity, provenance,
comparison limitations, assessment origins and evidence references.

## Later v2 phases

- Authentication and private case storage: choose provider and database, then enforce
  case ownership on every read/write/export/delete operation before storing cases.
- Controlled publication: explicit sanitized preview and publication decision, retention
  and revocation semantics. Downloads in v2.0 do not publish anything.
- Advanced differential experiments: agreed controls/repetitions and bounded execution
  with evidence-backed comparisons; no unrestricted public target enablement by default.

Deliver and validate each phase locally and in production. Free AI remains experimental
and paid model tests remain excluded. Infrastructure decisions for later phases require
user input; no new external accounts or databases are required for v2.0.
