import { investigateUrl } from '../lib/engine';

const [, , command, target] = process.argv;

if (command !== 'inspect' || !target) {
  console.error('Usage: npm run cli -- inspect <url>');
  process.exit(1);
}

try {
  console.log('[KraxxDeceit] starting investigation...');
  const result = await investigateUrl(target);
  console.log(`Case: ${result.caseId}`);
  console.log(`Status: ${result.status}`);
  console.log(`Target: ${result.target.submittedUrl}`);
  console.log(`Final: ${result.target.finalUrl ?? 'not observed'}`);
  console.log(`Indicators: ${result.indicators.length}`);
  console.log(result.summary);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Investigation failed.');
  process.exit(1);
}
