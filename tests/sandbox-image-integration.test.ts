import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import type { Sandbox } from '@vercel/sandbox';
import { CHECK_BROWSER_RUNTIME, configuredSandboxImage, VERIFIED_SANDBOX_IMAGE, verifyBrowserRuntime } from '../lib/sandbox-image';
import { runBrowserInvestigation } from '../lib/browser-investigator';

function runtime(overrides: { version?: string; revision?: string; executable?: boolean; platform?: string } = {}) {
  return {
    process: { platform: overrides.platform ?? 'linux', arch: 'x64', versions: { node: '24.19.0' } },
    console: { log() {} },
    require(name: string) {
      if (name === 'node:assert/strict') return assert;
      if (name === 'node:fs') return { constants: { X_OK: 1 }, accessSync() { if (overrides.executable === false) throw new Error('missing executable'); } };
      if (name.endsWith('/playwright/package.json')) return { version: overrides.version ?? '1.63.0' };
      if (name.endsWith('/playwright-core/browsers.json')) return { browsers: [{ name: 'chromium-headless-shell', revision: overrides.revision ?? '1243', browserVersion: '153.0.8010.12' }] };
      throw new Error('Unexpected module');
    },
  };
}
test('runtime verification rejects wrong package, browser revision, platform, and missing executable', () => {
  assert.doesNotThrow(() => runInNewContext(CHECK_BROWSER_RUNTIME, runtime()));
  for (const variant of [{ version: '1.62.0' }, { revision: '1234' }, { executable: false }, { platform: 'win32' }]) {
    assert.throws(() => runInNewContext(CHECK_BROWSER_RUNTIME, runtime(variant)));
  }
});
test('image configuration accepts only the remotely verified immutable image', () => {
  const previous = process.env.KRAXX_SANDBOX_IMAGE;
  try {
    delete process.env.KRAXX_SANDBOX_IMAGE; assert.equal(configuredSandboxImage(), VERIFIED_SANDBOX_IMAGE);
    process.env.KRAXX_SANDBOX_IMAGE = VERIFIED_SANDBOX_IMAGE; assert.equal(configuredSandboxImage(), VERIFIED_SANDBOX_IMAGE);
    for (const invalid of ['latest', 'kraxxdeceit-sandbox:playwright-1.63.0-v1', 'repo@sha256:' + 'a'.repeat(64)]) {
      process.env.KRAXX_SANDBOX_IMAGE = invalid; assert.throws(configuredSandboxImage);
    }
  } finally { if (previous === undefined) delete process.env.KRAXX_SANDBOX_IMAGE; else process.env.KRAXX_SANDBOX_IMAGE = previous; }
});
test('runtime gate requires both a successful command and the exact completion marker', async () => {
  for (const [exitCode, output, success] of [[0, 'KRAXX_BROWSER_RUNTIME_OK\n', true], [1, 'KRAXX_BROWSER_RUNTIME_OK', false], [0, '', false], [0, 'untrusted output', false]] as const) {
    const sandbox = { runCommand: async () => ({ exitCode, stdout: async () => output }) } as unknown as Sandbox;
    if (success) await verifyBrowserRuntime(sandbox); else await assert.rejects(verifyBrowserRuntime(sandbox));
  }
});
test('failed browser runtime gate preserves a diagnostic result without installation or target navigation', async () => {
  const commands: unknown[] = [];
  const sandbox = { runCommand: async (command: unknown) => { commands.push(command); return { exitCode: 1, stdout: async () => 'private diagnostic' }; } } as unknown as Sandbox;
  const result = await runBrowserInvestigation(sandbox, 'https://example.com');
  assert.equal(result.launchFailed, true); assert.equal(result.agent.actions.length, 0);
  assert.equal(commands.length, 1); assert.equal((commands[0] as {cmd: string}).cmd, 'node');
  assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
  assert.ok(!JSON.stringify(result).includes('private diagnostic'));
});
