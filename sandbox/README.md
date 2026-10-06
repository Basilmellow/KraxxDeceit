# KraxxDeceit browser image

## Image status

The application uses a verified image manifest from a private Vercel Container Registry repository. Offline Docker and remote sandbox checks are recorded in the [release verification](../docs/VERIFICATION.md). Registry access is required; cloning this repository does not grant it. Clean-machine base-image reproducibility remains a follow-up.

## Image contract

- Platform: linux/amd64; Node 24 (observed v24.19.0).
- Playwright: 1.63.0; Chromium headless-shell: 153.0.8010.12, revision 1243.
- Executable: `/opt/kraxxdeceit/browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell`.
- Modules: `/opt/kraxxdeceit/node_modules`.
- Local tag: `kraxxdeceit-sandbox:playwright-1.63.0-v1`.
- Registry: `vcr.vercel.com/basil-mellows-projects/kraxxdeceit/kraxxdeceit-sandbox:playwright-1.63.0-v1`.
- Image index digest: `sha256:11bbfcda1c56b2c4debb634b74e521090914a101d96d22be90426561c89602b9`.
- Ready linux/amd64 manifest: `sha256:b8f4700e87bbae6f5853bd21ef13184504caf2c1a4657fbd630de63c13f17aa2`.

The application defaults to the verified manifest in `lib/sandbox-image.ts`.
The optional server-only `KRAXX_SANDBOX_IMAGE` must match that verified reference exactly.
Other tags/digests fail closed. To upgrade, verify a new image first, then update the reviewed contract.
Do not silently overwrite an immutable image tag.

## Build and verification

The Dockerfile currently uses the locally built `kraxxdeceit-node24-base:24.19.0` base.
Its observed local image ID is `sha256:b8d67466671adcbb03b1e4dc3e2f1d945a8cb332c323d63f1088ab1e2c1fcc6d`.
A clean-machine base build recipe and
immutable base reference remain a reproducibility follow-up. `image-metadata.json` retains
its original image-build contents; do not rewrite the verified image to update status notes.

Use ONLY `sandbox/` as build context. Its allowlist excludes application files, credentials,
case data, and host configuration. Dependencies are installed at build time only.

```sh
docker run --rm --network none --memory 1g --cpus 2 --pids-limit 256 --cap-drop ALL --security-opt no-new-privileges kraxxdeceit-sandbox:playwright-1.63.0-v1 node /opt/kraxxdeceit/verify-browser.cjs
```

Manual remote checks create bounded disposable sandboxes and require explicit `--run`:

```sh
node --import tsx scripts/verify-sandbox-image.ts --run --controlled-navigation
node --import tsx scripts/smoke-browser-image.ts --run
```

The first checks the image, requested policy, offline browser launch, fixed example.com navigation,
and basic browser/network/procfs availability. The second runs the integrated synthetic fixture
with the deterministic provider. Neither is part of the unit suite. Authentication remains
server-side and is never forwarded to the browser image.

## Runtime behavior

The engine creates the sandbox with the investigation allowlist and existing subnet denies.
It does not grant a browser-provisioning network phase. Runtime setup checks Node, Playwright,
the Chromium manifest, and executable access. It runs no npm/apt/browser installer and has
no download fallback. The existing per-request URL/DNS checks, bounded lifecycle, admission
controls, telemetry, and public investigation gate remain in place.

The runner launches the pinned executable explicitly and uses the preinstalled module path.
A failed runtime check returns a diagnostic failed case without dispatching browser actions.
Case provenance records the resolved image and browser contract version.

The offline verifier checks `about:blank` and closes the browser in `finally`; remote checks stop
the sandbox in `finally`. Application cleanup retains its existing bounded sandbox lifetime.

Official image behavior: https://vercel.com/kb/guide/how-to-use-vercel-container-registry
