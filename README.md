# KraxxDeceit

**KraxxDeceit** is Kraxx's security-research engine for executing hostile web environments in isolated sandboxes and turning observed behavior into portable, reproducible security cases.

Public product surface: **KraxxDeceit.kraxxsec.com**

Current controlled release: **v4.0.0**. `/demo` runs fixed synthetic scenarios with
deterministic research by default; free AI remains experimental. `/workspace` provides
authenticated private case storage with explicit save/delete and owner isolation.
`/experiments` records four counterbalanced deterministic runs with local study
JSON/CSV/Markdown/ZIP exports. Public rate limits can require waiting between runs;
download partial studies to retain progress. Accounts are provisioned by the project
owner. Arbitrary public URL investigations remain disabled.
See [delivery status](docs/STATUS.md), [operations](docs/OPERATIONS.md), and
[v4 verification](docs/v4-verification.md) for observed checks and limits.

## Stage 1 — working target

```text
URL
 ↓
Vercel Sandbox (Firecracker microVM)
 ↓
Controlled HTTP execution
 ↓
Observed redirects / content / indicators
 ↓
Portable case-shaped result
```

This scaffold intentionally starts with a small, testable vertical slice. It does **not** claim to decide whether a URL is malicious.

## What is included

- Next.js web interface
- `POST /api/investigate`
- `@vercel/sandbox` integration
- Disposable Vercel Sandbox per investigation
- URL validation
- controlled HTTP fetch inside the sandbox
- redirect/final-URL observation
- basic public-IOC extraction
- portable case data model
- CLI: `npm run cli -- inspect <url>`

## Local setup

Vercel Sandbox's current SDK is `@vercel/sandbox` 3.5.1. Sandboxes run as isolated Firecracker microVMs. The default runtime includes Node.js 24 and Python 3.14. See Vercel's current Sandbox docs for limits and authentication.

1. Install Node.js 24+.
2. Install the Vercel CLI and authenticate.
3. From this repository:

```bash
vercel link
vercel env pull .env.local
npm install
npm run dev
```

4. Open `http://localhost:3000`.

The CLI uses the same engine:

```bash
npm run cli -- inspect https://example.com
```

## Important security note

**Do not expose the public URL endpoint to arbitrary internet users yet.** The Stage 1 endpoint is a research scaffold. Before a public launch, add strict egress controls, SSRF protections, rate limiting, request budgets, case-size limits, browser isolation and a controlled target allow/deny policy.

Vercel Sandbox supports host/CIDR egress policies and dynamic policy updates; use those controls when we move to public deployment.

## Roadmap

### Stage 1
URL → sandbox → controlled fetch → case

### Stage 2
URL → Playwright/Chromium → DOM, redirects, network, screenshots, browser trace

### Stage 3
URL → controlled AI-browser agent → agent observations/actions

### Stage 4
OS + network telemetry → process, DNS, socket, filesystem events

### Stage 5
Evidence graph → supported causal relationships → confidence + evidence links

### Stage 6
Replayable `.kraxxcase` format + portable investigation packages

### Stage 7
Research platform, CLI distribution, and Kraxxsec integration

## Current design principle

AI may generate hypotheses. **Observed telemetry remains the source of truth.**
