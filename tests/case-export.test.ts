import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFName } from 'pdf-lib';
import { unzipSync, strFromU8 } from 'fflate';
import { createHash } from 'node:crypto';
import { caseBundle, casePdf, exportFilename, pdfText } from '../lib/case-export';
import { parseCaseFile } from '../lib/case-file';
import { withReproducibility } from '../lib/reproducibility';
import { controlledExperiment } from '../lib/controlled-demos';
import { fixture } from './fixtures/case';

test('PDF export keeps hostile text inert and contains no active actions or attachments', async () => {
  const value = parseCaseFile(JSON.stringify({ ...fixture(), summary: '<script>fetch("https://evil.example")</script> العربية 😀' }));
  const bytes = await casePdf(value), doc = await PDFDocument.load(bytes);
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), '%PDF-');
  assert.ok(doc.getPageCount() >= 2);
  for (const key of ['OpenAction', 'AA', 'Names', 'AcroForm']) assert.equal(doc.catalog.has(PDFName.of(key)), false);
  for (const page of doc.getPages()) assert.equal(page.node.Annots()?.size() ?? 0, 0);
  assert.equal(value.raw.stdout, '');
  assert.equal(pdfText('A😀\u0000'), 'A\\u{1F600}\\u{0}');
});

test('bundle checksums cover exact contents and JSON round-trips without altering evidence', async () => {
  const value = parseCaseFile(JSON.stringify(fixture()));
  const files = unzipSync(await caseBundle(value));
  assert.deepEqual(Object.keys(files).sort(), ['README.txt', 'SHA256SUMS.txt', 'case.json', 'report.md', 'report.pdf']);
  assert.deepEqual(parseCaseFile(strFromU8(files['case.json'])), value);
  for (const line of strFromU8(files['SHA256SUMS.txt']).trim().split('\n')) {
    const [hash, name] = line.split('  ');
    assert.equal(createHash('sha256').update(files[name]).digest('hex'), hash);
  }
  assert.match(strFromU8(files['report.md']), /No integrity digest recorded/);
  assert.match(strFromU8(files['README.txt']), /No automatic anonymization/);
  assert.ok(!strFromU8(files['case.json']).includes('private raw log'));
});

test('both export formats reject a modified case with a recorded digest', async () => {
  const value = await withReproducibility(parseCaseFile(JSON.stringify(fixture())), controlledExperiment());
  value.summary = 'modified';
  await assert.rejects(casePdf(value), /integrity mismatch/);
  await assert.rejects(caseBundle(value), /integrity mismatch/);
});

test('large reports fail visibly instead of silently dropping evidence', async () => {
  const value = parseCaseFile(JSON.stringify({ ...fixture(), summary: 'x'.repeat(100001) }));
  await assert.rejects(casePdf(value), /character limit/);
  const pages = parseCaseFile(JSON.stringify({ ...fixture(), summary: '😀'.repeat(40000) }));
  await assert.rejects(casePdf(pages), /40 page limit/);
});

test('download names cannot introduce paths and long fields wrap across pages', async () => {
  assert.equal(exportFilename('../../evil'), '______evil');
  assert.equal(exportFilename(''), 'research-case');
  assert.equal(exportFilename('x'.repeat(200)).length, 100);
  const value = parseCaseFile(JSON.stringify({ ...fixture(), summary: 'https://example.com/' + 'long'.repeat(1200) }));
  const doc = await PDFDocument.load(await casePdf(value));
  assert.ok(doc.getPageCount() > 2 && doc.getPageCount() < 40);
});
