import test from 'node:test';
import assert from 'node:assert/strict';
import { CASE_FILE_BYTES, caseReport, parseCaseFile } from '../lib/case-file';
import { fixture } from './fixtures/case';

test('saved case import validates legacy cases, preserves inert text and discards raw logs',()=>{
  const value=parseCaseFile(JSON.stringify(fixture()));assert.equal(value.summary,'<script>alert(1)</script>');assert.deepEqual(value.raw,{stdout:'',stderr:''});assert.deepEqual(value.hypotheses,[]);
});
test('case import rejects malformed, oversized, deeply nested and prototype data',()=>{
  for(const value of ['broken','{}','{"__proto__":{}}',JSON.stringify({...fixture(),unknown:JSON.parse('{"constructor":{}}')}),JSON.stringify({...fixture(),deep:Array.from({length:40}).reduce(v=>({child:v}),{} as unknown)})])assert.throws(()=>parseCaseFile(value));
  assert.throws(()=>parseCaseFile(' '.repeat(CASE_FILE_BYTES+1)),/3 MiB/);
});
test('report escapes hostile markdown/HTML and preserves incomplete and unavailable evidence',()=>{
  const value=parseCaseFile(JSON.stringify(fixture()));const report=caseReport(value);assert.ok(!report.includes('<script>'));assert.ok(!report.includes('private raw log'));assert.match(report,/evidence insufficient/);assert.match(report,/Actual model: Not recorded/);assert.match(report,/Reproduction steps/);assert.match(report,/do not establish causation/);
});
