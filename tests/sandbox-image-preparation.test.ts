import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const metadata = require('../sandbox/image-metadata.json');
const runtime = require('../sandbox/runtime/package.json');
const lock = require('../sandbox/runtime/package-lock.json');
const { verify } = require('../sandbox/verify-browser.cjs');
const text = (name: string) => readFileSync(new URL('../sandbox/' + name, import.meta.url), 'utf8');

test('image preparation pins the installed Playwright manifest and lockfile', () => {
  assert.equal(runtime.dependencies.playwright, '1.63.0');
  assert.equal(lock.packages['node_modules/playwright'].version, '1.63.0');
  assert.equal(lock.packages['node_modules/playwright-core'].version, '1.63.0');
  assert.ok(lock.packages['node_modules/playwright'].integrity.startsWith('sha512-'));
  const manifest = JSON.parse(readFileSync(new URL('../node_modules/playwright-core/browsers.json', import.meta.url), 'utf8'));
  const browser = manifest.browsers.find((b: { name: string }) => b.name === metadata.chromium.name);
  assert.equal(browser.revision, metadata.chromium.revision);
  assert.equal(browser.browserVersion, metadata.chromium.browserVersion);
  assert.equal(metadata.platform, 'linux/amd64');
  assert.equal(metadata.nodeMajor, 24);
});
test('prepared image reference uses the verified project namespace, with no credentials', () => {
  assert.equal(metadata.image.reference, 'vcr.vercel.com/basil-mellows-projects/kraxxdeceit/kraxxdeceit-sandbox:playwright-1.63.0-v1');
  assert.equal(metadata.runtime.installerCommandsAllowed, false);
  assert.deepEqual(metadata.runtime.verificationCommand, ['node', '/opt/kraxxdeceit/verify-browser.cjs']);
  assert.ok(!/API_KEY|OIDC_TOKEN|VERCEL_TOKEN|Authorization|Bearer/.test(JSON.stringify(metadata)));
});
test('Docker build context copies only runtime manifests and verification files', () => {
  const docker = text('Dockerfile');
  const copies = docker.split('\n').filter(line => line.startsWith('COPY '));
  assert.deepEqual(copies, ['COPY runtime/package.json runtime/package-lock.json ./', 'COPY image-metadata.json verify-browser.cjs ./']);
  assert.ok(!/OPENROUTER|OPENAI|OIDC|UPSTASH|\.env/.test(docker));
  assert.equal(text('.dockerignore').split('\n')[0], '**');
  assert.match(docker, /RUN --network=none/);
  assert.match(docker, /USER ubuntu/);
});
test('offline verifier contains no runtime installer or download command', () => {
  const verifier = text('verify-browser.cjs');
  assert.ok(!/apt-get|npm install|playwright install|spawnSync|execSync|fetch\(/.test(verifier));
  assert.match(verifier, /fs.accessSync/);
  assert.match(verifier, /serviceWorkers: 'block'/);
  assert.match(verifier, /route => route.abort/);
});
function fixture(fail = false) {
  let closed = false; const navigations: string[] = []; let options: unknown;
  return { closed: () => closed, navigations, options: () => options,
    chromium: { launch: async (value: unknown) => { options = value; return {
      newContext: async () => ({ on: () => {}, route: async () => {}, close: async () => {},
        newPage: async () => ({ goto: async (url: string) => { navigations.push(url); if (fail) throw new Error('synthetic navigation failure'); }, url: () => 'about:blank' }) }),
      close: async () => { closed = true; }
    }; } }
  };
}
test('prepared verifier launches only the pinned executable, opens about:blank and closes', async () => {
  const f = fixture(); const result = await verify(f.chromium);
  assert.deepEqual(f.navigations, ['about:blank']);
  assert.equal((f.options() as { executablePath: string }).executablePath, metadata.chromium.executablePath);
  assert.equal(result.chromiumLaunch, true); assert.equal(result.aboutBlank, true);
  assert.equal(result.browserClosed, true); assert.equal(f.closed(), true);
  assert.equal(result.externalRequests, 0); assert.equal(result.browserProvisioningPerformed, false);
});
test('prepared verifier closes Chromium after failed navigation', async () => {
  const f = fixture(true); await assert.rejects(verify(f.chromium), /synthetic navigation failure/);
  assert.equal(f.closed(), true); assert.deepEqual(f.navigations, ['about:blank']);
});
