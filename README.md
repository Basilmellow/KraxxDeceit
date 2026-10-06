# KraxxDeceit

KraxxDeceit is my browser security research project. I built it to make controlled web experiments inspectable: run a scenario in an isolated browser, record what happened, and keep the evidence together in a portable case.

[Try the demo](https://kraxxdeceit.kraxxsec.com/demo) · [Run a study](https://kraxxdeceit.kraxxsec.com/experiments) · [Read the guide](https://kraxxdeceit.kraxxsec.com/guide)

## What it does

- Runs fixed prompt-injection and neutral-control scenarios in disposable Vercel Sandboxes with a pinned Playwright/Chromium image.
- Combines browser observations, available process/socket telemetry, timelines, evidence graphs, and bounded hypotheses in one case.
- Compares repeated runs through a four-step, counterbalanced study with explicit execution and resumable local progress.
- Exports case JSON, Markdown, PDF, and ZIP bundles; studies also support CSV. Case digests and bundle checksums help detect changes to exported data.
- Provides an invite-only workspace for explicitly saving, opening, and deleting private cases, with Supabase authentication and PostgreSQL row-level access controls.

The public release is **v4.1.0**. Its default research sequence is deterministic and makes no model requests. It collects real browser evidence from synthetic fixtures. Optional free AI research is experimental and may fail when its provider is unavailable.

Public investigations accept fixed scenarios, not arbitrary visitor-supplied URLs. Private accounts are provisioned by the project owner. Anyone can try the controlled demo and download local exports without an account.

## How it works

```text
Fixed scenario → validation and shared admission → disposable sandbox
              → pinned browser + bounded evidence collection
              → case assembly and integrity digest
              → local inspection/export or explicit private save
```

The application uses Next.js, React, and TypeScript. Vercel Sandbox isolates browser execution; Upstash Redis coordinates production admission; Supabase handles private accounts and case storage. PDF and ZIP exports are generated in the browser.

I chose a controlled public scope so the experiment inputs and execution limits are visible. The engine separates recorded observations from hypotheses, checks URLs and destinations, limits work before allocating compute, and retains partial evidence when a provider fails. A hypothesis is not a verdict that a site is malicious, and a checksum does not establish that an observation is true.

See [architecture](docs/ARCHITECTURE.md) for the boundaries and [verification](docs/VERIFICATION.md) for recorded checks and their limits.

## Run locally

Use **Node.js 24.x** and npm.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). Copy [.env.example](.env.example) to a local `.env.local` and configure only the services you intend to use. Never commit credentials.

The UI and local case import/export are separate from remote investigation execution. Running an investigation requires Vercel Sandbox authentication and access to the pinned browser image. The deployed image is in a private registry; a fresh clone does not grant access. See the [browser image contract](sandbox/README.md) for verification and the remaining clean-machine build limitation.

For an authorized Vercel project, use `vercel link` and `vercel env pull .env.local` to configure local access. Private storage additionally requires a Supabase project, the [database migration](supabase/migrations/202610040001_private_cases.sql), and an owner-provisioned test account. Use a publishable/anon key, never a service-role key. Production admission requires Upstash Redis. Deterministic research does not need a model API key.

## Development checks

```sh
npm run typecheck
npm run test:experiment
npm run build
```

Remote verification scripts create resources or use external services and are separate from these checks. Read [operations](docs/OPERATIONS.md) before running them.

## Scope and limitations

- This is a controlled research application, not a malware verdict service or a general-purpose public scanner.
- The repeated study exercises deterministic behavior; it does not measure model susceptibility or establish statistical causality.
- Telemetry is bounded. Browser events and process/socket samples do not provide complete kernel visibility; eBPF attachment is not established.
- Free AI reliability remains unresolved. Failures are surfaced as incomplete research.
- Exports can contain evidence supplied by their owner. Review them before sharing; automatic anonymization and public case links are not provided.
- Hourly monitoring checks application liveness, not successful investigations or upstream service readiness.

[Current status and follow-ups](docs/STATUS.md) · [Security boundaries](docs/production-hardening.md) · [Operations](docs/OPERATIONS.md)

## Maintainer

Created and maintained by [Mohamed Basil](https://github.com/Basilmellow) as part of my KRAxx security projects. For reproducible, non-sensitive bugs or suggestions, open a repository issue. Do not include credentials or private case evidence in public issues.
