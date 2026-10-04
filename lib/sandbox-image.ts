import type { Sandbox } from '@vercel/sandbox';

/** Verified in a disposable sandbox on 2026-10-04; new images require the same gate. */
export const VERIFIED_SANDBOX_IMAGE = 'kraxxdeceit-sandbox@sha256:b8f4700e87bbae6f5853bd21ef13184504caf2c1a4657fbd630de63c13f17aa2';
export const BROWSER_EXECUTABLE = '/opt/kraxxdeceit/browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
export const BROWSER_MODULE_PATH = '/opt/kraxxdeceit/node_modules';
export const PLAYWRIGHT_VERSION = '1.63.0';

export function configuredSandboxImage(): string {
  const configured = process.env.KRAXX_SANDBOX_IMAGE?.trim() || VERIFIED_SANDBOX_IMAGE;
  // Fail closed instead of silently running an unverified tag or a different runtime.
  if (configured !== VERIFIED_SANDBOX_IMAGE) throw new Error('Sandbox image has not passed the browser verification gate.');
  return configured;
}

// Independently check the contract, rather than trusting self-reported image metadata.
export const CHECK_BROWSER_RUNTIME = String.raw`
const assert = require('node:assert/strict');
const fs = require('node:fs');
const root = '/opt/kraxxdeceit/node_modules/';
assert.equal(process.platform, 'linux'); assert.equal(process.arch, 'x64');
assert.equal(process.versions.node.split('.')[0], '24');
assert.equal(require(root + 'playwright/package.json').version, '1.63.0');
const browser = require(root + 'playwright-core/browsers.json').browsers.find(b => b.name === 'chromium-headless-shell');
assert.equal(browser.revision, '1243'); assert.equal(browser.browserVersion, '153.0.8010.12');
fs.accessSync('/opt/kraxxdeceit/browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell', fs.constants.X_OK);
console.log('KRAXX_BROWSER_RUNTIME_OK');
`;

export async function verifyBrowserRuntime(sandbox: Sandbox): Promise<void> {
  const check = await sandbox.runCommand({ cmd: 'node', args: ['-e', CHECK_BROWSER_RUNTIME], signal: AbortSignal.timeout(10_000) });
  if (check.exitCode !== 0 || (await check.stdout()).trim() !== 'KRAXX_BROWSER_RUNTIME_OK') {
    throw new Error('Preinstalled browser runtime is missing or does not match the verified image.');
  }
}
