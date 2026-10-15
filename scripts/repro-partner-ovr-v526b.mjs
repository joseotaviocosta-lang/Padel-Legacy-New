// Playthrough 5.26-B — reprodução do P0 "parceiro com OVR 1 no motor".
// Monta jogador e parceiro com OVR conhecido e passa pela MESMA autoridade da
// partida (createMatch → normalizePlayer). Grava o resultado em
// reports/progression-integrity-526b/repro-partner-ovr-<tag>.json.
//   node scripts/repro-partner-ovr-v526b.mjs --tag=before|after
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { installBrowserShim } from './lib/v526CareerSim.mjs';

const tag = process.argv.find((a) => a.startsWith('--tag='))?.split('=')[1] || 'run';
installBrowserShim();
const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', logLevel: 'error' });
try {
  const engine = await server.ssrLoadModule('/src/lib/matchEngine.js');
  const padel = await server.ssrLoadModule('/src/lib/padel.js');
  const ATTRS = ['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'];
  const flat = (v) => Object.fromEntries(ATTRS.map((k) => [k, v]));
  // Jogador: entidade treinável (atributos planos completos).
  const player = { id: 'player-1', sport_name: 'Jogador', preferred_side: 'right', ...flat(40) };
  // Parceiro persistente materializado (formato real de partnerAthlete.js:
  // só overall/overall_rating, atributos de origem em source_attributes).
  const partner = { id: 'player-fictional-x', name: 'Parceiro 35', preferred_side: 'left', overall: 35, overall_rating: 35, source_attributes: { serve: 33, volley: 38 } };
  const elite = { id: 'athlete-elite', name: 'Elite 88', overall: 88, overall_rating: 88 };
  const weak = { id: 'athlete-weak', name: 'Fraco 9', overall: 9, overall_rating: 9 };
  // Template legado parcial: 6 de 10 atributos (oponente típico da chave).
  const partial = { id: 'bot-partial', name: 'Parcial', overall_rating: 31, serve: 30, forehand: 32, backhand: 29, volley: 33, bandeja: 31, smash: 31 };
  const cases = { partner, elite, weak, partial };
  const out = { tag, cases: {} };
  for (const [name, p] of Object.entries(cases)) {
    const state = engine.createMatch([player, p], [elite, weak], { seed: `repro-${name}` });
    const engPartner = state.teams.A[1];
    out.cases[name] = {
      uiOvr: padel.overallRating(p),
      engineOvr: engPartner.overall,
      engineAttributes: engPartner.attributes,
      teamStrengthEngine: (state.teams.A[0].overall + engPartner.overall) / 2,
      playerEngineOvr: state.teams.A[0].overall,
    };
  }
  const dir = resolve('reports/progression-integrity-526b');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, `repro-partner-ovr-${tag}.json`), JSON.stringify(out, null, 2));
  for (const [k, v] of Object.entries(out.cases)) console.log(`${tag} ${k.padEnd(8)} UI ${v.uiOvr} · motor ${v.engineOvr} · força da dupla no motor ${v.teamStrengthEngine}`);
} finally {
  await server.close();
}
