'use strict';
// Runs offline: no installers, credentials, environment dumps, screenshots, or external pages.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const metadata = require('./image-metadata.json');
function checkRuntime() {
  assert.equal(process.platform, 'linux', 'Image must run Linux');
  assert.equal(process.arch, 'x64', 'Image must run linux/amd64');
  assert.equal(Number(process.versions.node.split('.')[0]), metadata.nodeMajor, 'Node major mismatch');
  const packagePath = require.resolve('playwright/package.json');
  assert.equal(require(packagePath).version, metadata.playwrightVersion, 'Playwright version mismatch');
  const corePath = path.dirname(require.resolve('playwright-core/package.json'));
  const manifest = JSON.parse(fs.readFileSync(path.join(corePath, 'browsers.json'), 'utf8'));
  const chromium = manifest.browsers.find(browser => browser.name === metadata.chromium.name);
  assert.ok(chromium, 'Pinned browser missing from manifest');
  assert.equal(chromium.revision, metadata.chromium.revision, 'Chromium revision mismatch');
  assert.equal(chromium.browserVersion, metadata.chromium.browserVersion, 'Chromium version mismatch');
  fs.accessSync(metadata.chromium.executablePath, fs.constants.X_OK);
  assert.ok(fs.existsSync('/proc/net/tcp'), 'Procfs socket interface unavailable');
  return require('playwright').chromium;
}
async function verify(chromium) {
  let browser;
  let requests = 0;
  const result = { nodeVersion: process.version, playwrightVersion: metadata.playwrightVersion,
    chromiumRevision: metadata.chromium.revision, executablePath: metadata.chromium.executablePath,
    browserInstalled: true, chromiumLaunch: false, aboutBlank: false, browserClosed: false,
    externalRequests: 0, browserProvisioningPerformed: false };
  try {
    browser = await chromium.launch({ executablePath: metadata.chromium.executablePath, headless: true, timeout: 10000,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-component-update',
        '--disable-sync', '--no-first-run', '--no-default-browser-check', '--host-resolver-rules=MAP * ~NOTFOUND'] });
    result.chromiumLaunch = true;
    const context = await browser.newContext({ serviceWorkers: 'block' });
    context.on('request', () => { requests += 1; });
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    await page.goto('about:blank', { timeout: 5000 });
    assert.equal(page.url(), 'about:blank');
    result.aboutBlank = true;
    await context.close();
  } finally {
    if (browser) { await browser.close(); result.browserClosed = true; }
  }
  assert.equal(requests, 0, 'External browser request attempted');
  result.externalRequests = requests;
  return result;
}
if (require.main === module) {
  Promise.resolve().then(() => verify(checkRuntime())).then(result => console.log(JSON.stringify(result))).catch(error => {
    const message = String(error.message).replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
      .replace(/sk-[\w-]+/g, '[redacted]').replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[redacted]').slice(0,800);
    console.error(JSON.stringify({ verification: 'FAIL', message })); process.exitCode = 1;
  });
}
module.exports = { checkRuntime, verify };
