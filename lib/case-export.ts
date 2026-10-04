import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import { zipSync } from 'fflate';
import type { InvestigationCase } from './case-schema';
import { caseReport, parseCaseFile } from './case-file';
import { verifyCaseIntegrity } from './case-integrity';

export const REPORT_TEXT_LIMIT = 100_000;
export const REPORT_PAGE_LIMIT = 40;
const encoder = new TextEncoder();
export const exportFilename = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100) || 'research-case';

/** Literal escapes preserve unsupported glyphs without fetching fonts or target assets. */
export function pdfText(text: string): string {
  return Array.from(text, char => {
    const code = char.codePointAt(0)!;
    return code >= 32 && code <= 126 ? char : `\\u{${code.toString(16).toUpperCase()}}`;
  }).join('');
}

async function checkedCase(result: InvestigationCase) {
  const data = parseCaseFile(JSON.stringify(result));
  const integrity = await verifyCaseIntegrity(data);
  if (integrity === 'mismatch') throw new Error('Case integrity mismatch. Reload an unchanged case before exporting.');
  return { data, integrity };
}

function reportText(data: InvestigationCase, integrity: string) {
  const text = caseReport(data);
  if (text.length > REPORT_TEXT_LIMIT) throw new Error('Report exceeds the 100,000 character limit. Download the JSON case instead.');
  return `# KraxxDeceit research report\n\nCase integrity: ${integrity === 'matched' ? 'Recorded digest matches normalized case.' : 'No integrity digest recorded.'} This does not verify authenticity.\n\nExported locally. Review target data before sharing. PDF is a text summary; the JSON case retains full evidence. Unsupported PDF glyphs appear as literal Unicode code point escapes.\n\n${text}`;
}

/** Linear wrapping, including long URLs and unbroken imported text. */
function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  let line = '', used = 0;
  for (const char of text) {
    const next = font.widthOfTextAtSize(char, size);
    if (used + next > width) {
      const space = line.lastIndexOf(' ');
      if (space > 0) { lines.push(line.slice(0, space)); line = line.slice(space + 1); used = font.widthOfTextAtSize(line, size); }
      else { lines.push(line); line = ''; used = 0; }
    }
    if (!line && char === ' ') continue;
    line += char; used += next;
  }
  if (line) lines.push(line);
  return lines;
}

async function renderReport(data: InvestigationCase, integrity: string): Promise<Uint8Array> {
  const text = reportText(data, integrity);
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(pdfText(`Research case ${data.caseId}`)); doc.setCreator('KraxxDeceit'); doc.setProducer('KraxxDeceit local report exporter');
  const ink = rgb(.12, .15, .19), accent = rgb(.65, 0, .26), muted = rgb(.38, .42, .47);
  let page = doc.addPage([595.28, 841.89]), y = 760;
  function newPage() {
    if (doc.getPageCount() >= REPORT_PAGE_LIMIT) throw new Error('Report exceeds the 40 page limit. Download the JSON case instead.');
    page = doc.addPage([595.28, 841.89]); y = 760;
  }
  for (const raw of text.split('\n')) {
    if (!raw) { y -= 8; continue; }
    const heading = /^(#{1,3}) /.exec(raw);
    const size = heading ? heading[1].length === 1 ? 17 : heading[1].length === 2 ? 13 : 11 : 10;
    const font = heading ? bold : regular, leading = size + 5;
    const plain = raw.replace(/^#{1,3} /, '').replace(/\\([\\`*_{}\[\]()#+.!|<>])/g, '$1');
    const lines = wrap(pdfText(plain), font, size, 491);
    if (heading && y - leading * (Math.min(lines.length, 3) + 2) < 65) newPage();
    for (const line of lines) {
      if (y - leading < 65) newPage();
      page.drawText(line, { x: 52, y, size, font, color: heading ? accent : ink }); y -= leading;
    }
    if (heading) y -= 4;
  }
  doc.getPages().forEach((item, index) => {
    item.drawText('KRAXXDECEIT / RESEARCH EVIDENCE', { x: 52, y: 800, size: 9, font: bold, color: accent });
    item.drawLine({ start: { x: 52, y: 786 }, end: { x: 543, y: 786 }, thickness: .6, color: muted });
    item.drawText('Bounded observations. No authenticity or causation guarantee.', { x: 52, y: 32, size: 8, font: regular, color: muted });
    const footer = `${index + 1} / ${doc.getPageCount()}`;
    item.drawText(footer, { x: 543 - regular.widthOfTextAtSize(footer, 8), y: 32, size: 8, font: regular, color: muted });
  });
  return doc.save();
}

export async function casePdf(result: InvestigationCase): Promise<Uint8Array> {
  const { data, integrity } = await checkedCase(result);
  return renderReport(data, integrity);
}

async function byteDigest(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
}

export async function caseBundle(result: InvestigationCase): Promise<Uint8Array> {
  const { data, integrity } = await checkedCase(result);
  const files: Record<string, Uint8Array> = {
    'case.json': encoder.encode(JSON.stringify(data, null, 2)),
    'report.md': encoder.encode(reportText(data, integrity)),
    'report.pdf': await renderReport(data, integrity),
    'README.txt': encoder.encode('KraxxDeceit local research export\n\nReview all evidence and target data before sharing. No automatic anonymization.\nOpen case.json in the case explorer to inspect recorded evidence without running a target.\nreport.pdf and report.md summarize this case; JSON retains full evidence.\nSHA256SUMS.txt hashes exact file bytes. Compare with Get-FileHash -Algorithm SHA256\nor sha256sum after extraction. Checksums detect changes, not authenticity.\nThe normalized case digest is separate from these file checksums.\nImported claims remain unverified. Associations do not prove causation or malicious intent.\n'),
  };
  const sums = await Promise.all(Object.entries(files).map(async ([name, bytes]) => `${await byteDigest(bytes)}  ${name}`));
  files['SHA256SUMS.txt'] = encoder.encode(sums.join('\n') + '\n');
  return zipSync(files, { level: 6 });
}
