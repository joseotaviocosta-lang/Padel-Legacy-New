// Playthrough 5.27-I — Stage 1 (45 carreiras) com a banda Silver escolhida no
// micro e a política v4, no MESMO pipeline da 5.27-D (manifest, checkpoint 90d,
// resume, hash, paralelismo ≤ 2). Só fixa o ambiente.
//   node scripts/run-stage1-v527i.mjs --init | --stage=1 --parallel=2 | --status
import { spawn } from 'node:child_process';
import { ENV_527I, FORBIDDEN_ENV } from './lib/v527iFreeze.mjs';

const env = { ...process.env, ...ENV_527I };
for (const k of [...FORBIDDEN_ENV, 'PL527_PRESET', 'PL527H']) delete env[k];
const child = spawn(process.execPath, ['scripts/run-balance-validation-v527d.mjs', ...process.argv.slice(2)], { stdio: 'inherit', env });
child.on('close', (code) => process.exit(code ?? 1));
