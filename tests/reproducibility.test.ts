import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, verifyCaseIntegrity } from '../lib/case-integrity';
import { withReproducibility } from '../lib/reproducibility';
import { controlledExperiment } from '../lib/controlled-demos';
import { parseCaseFile } from '../lib/case-file';
import { fixture } from './fixtures/case';
test('canonicalization ignores object insertion order but preserves evidence array order',()=>{
  assert.equal(canonicalJson({b:2,a:[1,2],absent:undefined}),canonicalJson({a:[1,2],b:2}));
  assert.notEqual(canonicalJson([1,2]),canonicalJson([2,1]));
});
test('manifest covers redacted case and configuration, survives file roundtrip and rejects tampering',async()=>{
  const record = await withReproducibility(parseCaseFile(JSON.stringify(fixture())),controlledExperiment('neutral-control'));
  assert.equal(await verifyCaseIntegrity(record),'matched');
  assert.equal(await verifyCaseIntegrity(parseCaseFile(JSON.stringify(record))),'matched');
  assert.deepEqual(record.raw,{stdout:'',stderr:''});assert.equal(record.reproducibility?.scenario,'neutral-control');
  assert.equal(record.reproducibility?.fixtureSha256?.length,64);
  assert.equal(await verifyCaseIntegrity({...record,summary:'altered'}),'mismatch');
  const altered=structuredClone(record);altered.reproducibility!.networkPolicy.allowedHosts.push('evil.example');
  assert.equal(await verifyCaseIntegrity(altered),'mismatch');
  const reordered=Object.fromEntries(Object.entries(record).reverse());assert.equal(await verifyCaseIntegrity(parseCaseFile(JSON.stringify(reordered))),'matched');
});
test('legacy missing digests are explicit; distinct fixed fixture definitions have distinct hashes',async()=>{
  const old=parseCaseFile(JSON.stringify(fixture()));assert.equal(await verifyCaseIntegrity(old),'unavailable');
  const neutral=await withReproducibility(old,controlledExperiment('neutral-control'));
  const injection=await withReproducibility(old,controlledExperiment('prompt-injection'));
  assert.notEqual(neutral.reproducibility?.fixtureSha256,injection.reproducibility?.fixtureSha256);
  assert.notEqual(neutral.reproducibility?.experimentSha256,injection.reproducibility?.experimentSha256);
});
