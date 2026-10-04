import assert from 'node:assert/strict';
import { loadEnvConfig } from '@next/env';
import { Sandbox } from '@vercel/sandbox';
import { investigationPolicy, LIMITS } from '../lib/production-policy';

// Operator-only verification; never imported by the application. No runtime installers.
const image = 'kraxxdeceit-sandbox@sha256:b8f4700e87bbae6f5853bd21ef13184504caf2c1a4657fbd630de63c13f17aa2';
const controlledNavigation = String.raw`
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('/opt/kraxxdeceit/node_modules/playwright');
const metadata = require('/opt/kraxxdeceit/image-metadata.json');
(async () => {
  let browser;
  try {
    browser = await chromium.launch({ executablePath: metadata.chromium.executablePath, headless: true, timeout: 10000,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking'] });
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false });
    let requests = 0; let responses = 0;
    context.on('request', () => requests++); context.on('response', () => responses++);
    await context.route('**/*', route => new URL(route.request().url()).origin === 'https://example.com' ? route.continue() : route.abort());
    const page = await context.newPage();
    const response = await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
    assert.equal(response.status(), 200); assert.equal(new URL(page.url()).hostname, 'example.com');
    assert.ok(requests > 0 && responses > 0);
    assert.ok(fs.existsSync('/proc/self/stat') && fs.existsSync('/proc/net/tcp'));
    console.log(JSON.stringify({ navigation: true, status: 200, networkRequests: requests, networkResponses: responses, procfsAvailable: true }));
    await context.close();
  } finally { if (browser) await browser.close(); }
})().catch(() => { console.error('CONTROLLED_NAVIGATION_FAILED'); process.exitCode = 1; });
`;
const networkBoundary = String.raw`
const assert = require('node:assert/strict');
const http = require('node:http');
const { chromium } = require('/opt/kraxxdeceit/node_modules/playwright');
const metadata = require('/opt/kraxxdeceit/image-metadata.json');
function deniedRequest(host) {
  return new Promise(resolve => {
    // A TCP handshake may terminate at the gateway. Check a bounded HTTP HEAD instead;
    // consume no content and never request a metadata credential endpoint.
    const request = http.request({ hostname: host, port: 80, path: '/', method: 'HEAD', timeout: 3000 }, response => {
      const status = response.statusCode; response.destroy();
      resolve({ host, blocked: status === 403, status });
    });
    request.once('timeout', () => request.destroy(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })));
    request.once('error', error => resolve({ host, blocked: ['ECONNRESET','ECONNREFUSED','ENETUNREACH','EHOSTUNREACH','TIMEOUT'].includes(error.code), errorCode: error.code }));
    request.end();
  });
}
(async () => {
  const probes = [];
  for (const host of ['169.254.169.254', '10.0.0.1', '192.168.1.1', 'fd00::1', '::ffff:169.254.169.254']) {
    const result = await deniedRequest(host); probes.push(result);
  }
  let browser;
  let outsideAllowlistBlocked = false;
  try {
    browser = await chromium.launch({ executablePath: metadata.chromium.executablePath, headless: true, timeout: 10000, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking'] });
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false });
    const page = await context.newPage();
    // No Playwright request interception here: exercise the sandbox egress policy.
    try { const response = await page.goto('https://example.org', { timeout: 8000, waitUntil: 'domcontentloaded' }); outsideAllowlistBlocked = response?.status() === 403; }
    catch { outsideAllowlistBlocked = true; }
    // Print the bounded probe report even if a destination unexpectedly responded.
    await context.close();
  } finally { if (browser) await browser.close(); }
  console.log(JSON.stringify({ probes, outsideAllowlistBlocked }));
  assert.equal(outsideAllowlistBlocked, true); assert.ok(probes.every(probe => probe.blocked));
})().catch(() => { console.error('NETWORK_BOUNDARY_FAILED'); process.exitCode = 1; });
`;
async function main() {
  if (!process.argv.includes('--run')) throw new Error('Pass --run to create one disposable remote sandbox.');
  loadEnvConfig(process.cwd());
  if (!process.env.VERCEL_OIDC_TOKEN?.trim()) throw new Error('Sandbox authentication is unavailable.');
  const policy = investigationPolicy('example.com');
  let sandbox: Sandbox | undefined;
  let phase = 'create';
  const report: Record<string, unknown> = { checkedAt: new Date().toISOString(), image, passed: false, cleanup: 'not-created' };
  try {
    sandbox = await Sandbox.create({ name: `kraxx-image-gate-${Date.now()}`, image, persistent: false,
      timeout: LIMITS.sandboxMs, resources: { vcpus: 2 }, networkPolicy: policy,
      signal: AbortSignal.timeout(90_000) });
    report.sandboxName = sandbox.name;
    report.resolvedImage = sandbox.image;
    phase = 'network-policy';
    assert.deepEqual(sandbox.networkPolicy, policy);
    assert.ok(sandbox.image?.endsWith(image.split('@')[1]));
    report.policyMatches = true;
    phase = 'offline-browser';
    const result = await sandbox.runCommand({ cmd: 'node', args: ['/opt/kraxxdeceit/verify-browser.cjs'], signal: AbortSignal.timeout(30_000) });
    assert.equal(result.exitCode, 0);
    const output = await result.stdout();
    assert.ok(Buffer.byteLength(output) <= 8192);
    const verified = JSON.parse(output);
    report.browser = { nodeVersion: verified.nodeVersion, playwrightVersion: verified.playwrightVersion,
      chromiumRevision: verified.chromiumRevision, chromiumLaunch: verified.chromiumLaunch,
      aboutBlank: verified.aboutBlank, browserClosed: verified.browserClosed,
      externalRequests: verified.externalRequests, browserProvisioningPerformed: verified.browserProvisioningPerformed };
    assert.equal(verified.chromiumLaunch, true); assert.equal(verified.aboutBlank, true);
    assert.equal(verified.browserClosed, true); assert.equal(verified.externalRequests, 0);
    assert.equal(verified.browserProvisioningPerformed, false); assert.equal(verified.playwrightVersion, '1.63.0');
    assert.equal(verified.chromiumRevision, '1243');
    if (process.argv.includes('--controlled-navigation')) {
      phase = 'controlled-navigation';
      const navigation = await sandbox.runCommand({ cmd: 'node', args: ['-e', controlledNavigation], signal: AbortSignal.timeout(30_000) });
      assert.equal(navigation.exitCode, 0);
      const output = await navigation.stdout();
      assert.ok(Buffer.byteLength(output) <= 8192);
      report.controlledNavigation = JSON.parse(output);
    }
    if (process.argv.includes('--network-boundary')) {
      phase = 'network-boundary';
      const check = await sandbox.runCommand({ cmd: 'node', args: ['-e', networkBoundary], signal: AbortSignal.timeout(40_000) });
      assert.equal(check.exitCode, 0);
      const output = await check.stdout(); assert.ok(Buffer.byteLength(output) <= 8192);
      report.networkBoundary = JSON.parse(output);
    }
    report.passed = true;
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    report.error = /^[a-zA-Z0-9_-]{1,80}$/.test(code) ? code : 'IMAGE_VERIFICATION_FAILED';
    report.failedPhase = phase;
    process.exitCode = 1;
  } finally {
    if (sandbox) {
      try { await sandbox.stop(); report.cleanup = 'stopped'; }
      catch { report.cleanup = 'stop-failed'; report.passed = false; process.exitCode = 1; }
    }
    console.log(JSON.stringify(report, null, 2));
  }
}
void main().catch(() => { console.error('Image verification preflight failed. Check authentication and --run.'); process.exitCode = 1; });
