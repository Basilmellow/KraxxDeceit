import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import { createHash } from 'node:crypto';
import { studyBundle } from '../lib/study-export';
import { parseStudyFile, type ControlledStudy } from '../lib/controlled-study';
test('study bundle retains partial state and exact checksums with fixed filenames', async () => {
  const study: ControlledStudy = { version: '1.0', studyId: '11111111-1111-4111-8111-111111111111', createdAt: '2026-10-04T00:00:00Z', firstScenario: 'neutral-control', cases: [null, null, null, null] };
  const files = unzipSync(await studyBundle(study));
  assert.deepEqual(Object.keys(files).sort(), ['README.txt', 'SHA256SUMS.txt', 'observations.csv', 'report.md', 'study.json'].sort());
  assert.deepEqual(await parseStudyFile(new TextDecoder().decode(files['study.json'])), study);
  assert.match(new TextDecoder().decode(files['report.md']), /0\/4; partial study/);
  for (const line of new TextDecoder().decode(files['SHA256SUMS.txt']).trim().split('\n')) {
    const [digest, name] = line.split('  ');
    assert.equal(createHash('sha256').update(files[name]).digest('hex'), digest);
  }
  await assert.rejects(studyBundle({ ...study, cases: [null] }), /supported study protocol/);
});
