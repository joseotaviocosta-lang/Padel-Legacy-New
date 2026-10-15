// Playthrough 5.27-H — Stage 1 completo (45 carreiras: 5 seeds × 3 perfis × 3
// presets-E × 2 anos) com o pipeline da 5.27-D SEM reescrevê-lo: manifest,
// checkpoint de 90 dias, resume, heartbeat, watchdog, RNG do Vite isolado,
// hash de resultado e recuperação de RUNNING obsoleto são os mesmos. Este
// lançador só fixa o ambiente (raiz, presets -E, Stage 1, política v3, sonda de
// qualidade de parceiro) para que nenhuma execução rode com outro estado.
//   node scripts/run-stage1-v527h.mjs --init
//   node scripts/run-stage1-v527h.mjs --stage=1 --parallel=2
//   node scripts/run-stage1-v527h.mjs --status
import { spawn } from 'node:child_process';
import { ENV_527H, FORBIDDEN_ENV } from './lib/v527hFreeze.mjs';

const env = { ...process.env, ...ENV_527H };
for (const k of [...FORBIDDEN_ENV, 'PL527_PRESET']) delete env[k];
const child = spawn(process.execPath, ['scripts/run-balance-validation-v527d.mjs', ...process.argv.slice(2)], { stdio: 'inherit', env });
child.on('close', (code) => process.exit(code ?? 1));
