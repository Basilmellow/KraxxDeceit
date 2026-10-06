# KraxxDeceit project profile

Use the descriptions below for a portfolio, project listing or resume. Update links
and recorded validation when the product changes; do not imply production-scale use
or AI reliability that has not been demonstrated.

Live project: https://kraxxdeceit.kraxxsec.com
Source: https://github.com/Basilmellow/KraxxDeceit
Demo: https://kraxxdeceit.kraxxsec.com/demo
Guide: https://kraxxdeceit.kraxxsec.com/guide

## Short description

KraxxDeceit is a security research platform for controlled browser experiments. It
runs synthetic fixtures in disposable sandboxes, correlates browser and system
observations, and exports inspectable evidence with explicit provenance and limits.

## Resume bullets

- Built and deployed a TypeScript/Next.js security research platform using Playwright
  and disposable Vercel sandboxes to collect browser, network and system observations
  into evidence graphs, timelines and bounded behavioral hypotheses.
- Implemented restricted navigation, distributed Redis admission, evidence integrity
  checks, Supabase authentication with database ownership policies, and local
  PDF/JSON/CSV/Markdown/ZIP exports for individual cases and repeated studies.
- Validated deterministic injection/neutral experiments, private case ownership and
  concurrent storage quotas through automated tests and live deployment checks.

## Portfolio description

I built KraxxDeceit to make security research observations easier to inspect and
share. Its controlled demo runs fixed injection and neutral pages inside disposable
browser sandboxes. Researchers can trace findings through timelines and evidence
graphs, compare recorded behavior, export cases, and explicitly save evidence to an
authenticated private workspace. A four-run counterbalanced study workflow preserves
compatible execution metadata and validates each recorded case.

The public release defaults to deterministic research with zero model calls. Free
AI is an optional experimental mode. Evidence digests detect changes rather than
authenticate a source, and results describe bounded observations rather than prove
maliciousness or causation.

## Technology

TypeScript, Next.js, React, Playwright/Chromium, Vercel Sandbox, Upstash Redis,
Supabase Authentication/PostgreSQL row-level security, Zod, pdf-lib and fflate.

## Claims to avoid

Do not describe this as an unrestricted production URL scanner, a proven AI defense,
a malware classifier, a statistical causal experiment, a signed forensic evidence
system or an enterprise service with an uptime guarantee. Do not invent users,
customers, performance improvements, detection accuracy or security certifications.
Public signup, team collaboration, public case publishing, multiple browsers/regions
and whole-study cloud storage remain future roadmap features.
