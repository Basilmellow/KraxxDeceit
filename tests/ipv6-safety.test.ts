import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as net from 'node:net';
import { isForbiddenAddress, validatePublicHttpUrl, FORBIDDEN_IPV6_SUBNETS, DENIED_SANDBOX_SUBNETS } from '../lib/url-safety';
import { PROVISIONING_POLICY, investigationPolicy } from '../lib/production-policy';

const forbidden = ['::1', '::', 'fc00::1', 'fdff:ffff::1', 'fe80::1', 'febf:ffff::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:169.254.169.254', '0:0:0:0:0:ffff:7f00:1', '::127.0.0.1'];
for (const address of forbidden) test('IPv6 URL and DNS safety rejects ' + address, async () => {
  assert.equal(isForbiddenAddress(address), true);
  await assert.rejects(validatePublicHttpUrl('http://[' + address + ']/'));
  await assert.rejects(validatePublicHttpUrl('https://public-looking.com', async () => [{ address, family: 6 }]));
});
test('valid public IPv6 passes without DNS or external requests', async () => {
  const address = '2606:4700:4700::1111';
  assert.equal(isForbiddenAddress(address), false);
  const resolve = async () => { throw new Error('must not resolve an IP literal'); };
  assert.equal((await validatePublicHttpUrl('https://[' + address + ']/', resolve)).hostname, '[' + address + ']');
  await validatePublicHttpUrl('https://public-looking.com', async () => [{ address, family: 6 }]);
  assert.equal(isForbiddenAddress('8.8.8.8'), false);
});
test('browser request validation rejects the same IPv6 and metadata addresses', () => {
  const source = readFileSync(new URL('../lib/browser-investigator.ts', import.meta.url), 'utf8');
  const start = source.indexOf('const forbidden = new net.BlockList();');
  const end = source.indexOf('function safeUrl(value)', start);
  assert.ok(start >= 0 && end > start);
  const check = runInNewContext(source.slice(start, end) + '; isForbiddenAddress', { net, URL });
  for (const address of [...forbidden, '169.254.169.254', '10.0.0.1', '127.0.0.1']) assert.equal(check(address), true, address);
  assert.equal(check('2606:4700:4700::1111'), false);
  assert.equal(check('8.8.8.8'), false);
});
test('IPv6 validation ranges are explicit and firewall remains restrictive', () => {
  for (const cidr of ['::/128', '::1/128', 'fc00::/7', 'fe80::/10', '::ffff:0:0/96']) assert.ok(FORBIDDEN_IPV6_SUBNETS.includes(cidr));
  assert.ok(!FORBIDDEN_IPV6_SUBNETS.includes('::/96'));
  for (const cidr of ['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16']) assert.ok(DENIED_SANDBOX_SUBNETS.includes(cidr));
  for (const policy of [PROVISIONING_POLICY, investigationPolicy('example.com')]) {
    assert.ok(!policy.allow.includes('*'));
    assert.ok(policy.subnets.deny.every(cidr => net.isIP(cidr.split('/')[0]) === 4));
    assert.ok(!policy.subnets.deny.includes('::/96'));
    assert.ok(!policy.subnets.deny.includes('::/0'));
  }
});
