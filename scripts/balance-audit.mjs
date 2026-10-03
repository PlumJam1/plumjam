import { createServer } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const server = await createServer({ server: { middlewareMode: true }, logLevel: 'error' });
try {
  const { auditBalance, auditChapters } = await server.ssrLoadModule('/scripts/balanceSimulation.ts');
  const result = process.argv.includes('--chapters') ? auditChapters() : auditBalance();
  const hash = value => createHash('sha256').update(value).digest('hex');
  const helper = await readFile(new URL('./balanceSimulation.ts', import.meta.url), 'utf8');
  const files = ['src/game/BattleSession.ts', 'src/game/battle/balance.ts', 'src/game/progression/stages.ts', 'src/game/progression/ProfileService.ts'];
  const sources = await Promise.all(files.map(file => readFile(new URL('../' + file, import.meta.url), 'utf8')));
  result.provenance = { referenceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    productSourceSha256: hash(files.map((file, index) => file + '\n' + sources[index]).join('\n')),
    simulationPolicySha256: hash(helper.slice(helper.indexOf('export function simulateBattle('), helper.indexOf('export function simulateFreshCampaign('))),
    productFiles: files, policyVersion: 'two-chapter-five-core-role-quota-v2', productWorkingTree: true };
  const report = JSON.stringify(result, null, 2);
  const argument = process.argv.indexOf('--output');
  if (argument >= 0 && process.argv[argument + 1]) {
    await writeFile(process.argv[argument + 1], report + '\n');
    process.stdout.write(`Balance audit saved to ${process.argv[argument + 1]}\n`);
  } else process.stdout.write(report + '\n');
} finally { await server.close(); }
