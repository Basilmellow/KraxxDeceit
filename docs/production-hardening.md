# Security boundaries

These controls describe the current implementation, not a claim of complete protection or a third-party security certification.

- Public execution uses fixed fixtures. Arbitrary public URL investigations are disabled by default.
- URL, DNS, redirect, and destination validation combine with sandbox network restrictions. These checks remain relevant for development inspection; sandbox isolation alone does not replace destination validation.
- Shared production admission precedes compute creation and fails closed when unavailable. Rate, concurrency, execution budgets, bounded lifetimes, and cleanup constrain resource use.
- The browser image is pinned and checked before browser actions. Dependencies are installed at image build time; runtime provisioning and download fallbacks are not permitted.
- Provider credentials remain server-side. Untrusted page text is research input, not authority to change system policy.
- Private cases require verified user identity and owner-scoped access, backed by PostgreSQL row-level policies and serialized quota checks. Anonymous access and updates are not granted.
- Case import/export is bounded. Digests detect content changes under their documented normalization; they do not authenticate an author or prove a hypothesis.
- Evidence is not automatically anonymized. Inspect exports before publication and keep private case data out of issues, logs, and commits.

See [architecture](ARCHITECTURE.md), [verification](VERIFICATION.md), and [operations](OPERATIONS.md) for implementation scope, observed checks, and maintenance procedures.
