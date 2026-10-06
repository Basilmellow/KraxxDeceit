# Architecture

KraxxDeceit separates application requests, remote execution, evidence assembly, and persistence.

## Request and execution boundary

The public demo accepts fixed scenario and research-mode values. Arbitrary URL investigations are disabled in the public configuration. Development URL inspection still passes the engine's URL, DNS, redirect, and destination checks.

Production uses shared Redis admission before creating compute. Per-client rate and concurrency limits combine with a global concurrency ceiling. Unavailable admission fails closed. Bounded sandbox lifetimes and cleanup limit abandoned work; leases provide recovery after a process crash.

Each investigation uses a disposable Vercel Sandbox and a verified browser-image manifest. Browser dependencies are provisioned when the image is built. Runtime checks reject a mismatched image and do not install packages or download browsers. Credentials remain outside the browser image.

## Evidence and research

Playwright observations and available process/socket samples become a structured case with provenance, execution budgets, completion state, timeline, evidence graph, and hypotheses. Partial evidence can survive research-provider failure. Missing observations remain limitations, not proof of absence.

Deterministic mode executes a fixed research sequence with zero model requests. Experimental free AI uses bounded provider turns and tools; the public demo rejects paid model configurations. Four-step studies compare deterministic fixture runs and preserve local progress through explicit import/export.

## Storage and export

Case JSON, Markdown, PDF, and ZIP exports are local browser operations. Studies additionally export CSV. A normalized case digest and exact bundle-file checksums serve different integrity purposes; neither is a signature or proof of authenticity.

Private storage requires an authenticated Supabase user. Server-side identity checks, explicit owner filters, and database row-level policies govern access. Cases are saved explicitly and immutably; updates are not granted. Delete removes the stored row. Quota checks serialize competing inserts. Provider backups and storage overhead are outside application payload accounting.

Public signup, public sharing links, automatic upload of demo results, and full-study cloud storage are not included.
