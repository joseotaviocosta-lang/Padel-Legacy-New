// Playthrough 5.27-G, Bloco A (item 13) — AMOSTRADOR de mercados de parceiro.
// Carrega saves reais já existentes (checkpoints arquivados e saves finais das
// auditorias), monta o pool da Busca com as MESMAS funções do jogo
// (buildSearchPool) e grava o mercado — sem decidir nem alterar nada.
//   PL527G_PARTNER_DUMP=<prefixo> node scripts/sample-partner-markets-v527g.mjs
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryStorage, bootRuntime, installDeterminism } from './lib/v526CareerSim.mjs';
import * as act from './lib/v526Actions.mjs';

globalThis.__PL527_PRESET = process.env.PL527_PRESET || 'balanced-e';
const sources = [];
const CKPT = 'reports/rebalance-527d/seed-checkpoints';
if (existsSync(CKPT)) for (const f of readdirSync(CKPT).filter((x) => x.endsWith('.ckpt'))) {
  sources.push({ label: f, load: () => { const t = readFileSync(join(CKPT, f), 'utf8'); return JSON.parse(t.slice(0, t.lastIndexOf('\n#sha256:'))).files; } });
}
for (const tag of ['current', 'after']) for (const sc of ['wr0', 'wr25', 'wr50', 'wr75']) {
  const file = `reports/rebalance-527f/ranking/${tag}/${sc}/normal-001.save.json`;
  if (existsSync(file)) sources.push({ label: `527f-${tag}-${sc}`, load: () => JSON.parse(readFileSync(file, 'utf8')) });
}
installDeterminism('partner-market-sampler');
let total = 0;
for (const src of sources) {
  const files = new Map(Object.entries(src.load()));
  const rt = await bootRuntime(new MemoryStorage(files));
  const A = await act.loadActionModules(rt);
  const index = JSON.parse(files.get('careers-index.json') || '{}');
  const careerId = index.last_career_id || (index.careers || [])[0]?.career_id || [...files.keys()].find((k) => k.startsWith('careers/'))?.slice(8, -5);
  const career = await rt.careerManager.loadCareer(careerId);
  rt.runtime.activeCareerAdapter.setActiveCareer(career);
  const profile = (await rt.localGame.entities.PlayerProfile.list(null, 1))[0];
  const n = await act.samplePartnerMarket(rt, A, profile, `search-sample:${src.label}`);
  total += 1;
  console.log(`${src.label}: ${n} candidatos (OVR do jogador ${act.ovrOf(profile)}, ${profile.career_date})`);
  await rt.close();
}
console.log(`${total} mercados amostrados`);
process.exit(0);
