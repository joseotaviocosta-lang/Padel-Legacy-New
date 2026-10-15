// Playthrough 5.27-F, Blocos B/C — RASTRO DE FORÇA antes do RNG, para a MESMA
// entrada nos dois lados (jogador × adversário), e mapa das aplicações de
// energia. Usa normalizePlayer/createTeams e os métodos reais do RallyEngine.
//   node scripts/diag-strength-trace-v527f.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';
import { installBrowserShim } from './lib/v526CareerSim.mjs';

installBrowserShim();
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom', logLevel: 'error' });
const load = (p) => server.ssrLoadModule(p);
const { createTeams } = await load('/src/engine/match/playerModel.js');
const { RallyEngine } = await load('/src/engine/match/RallyEngine.js');
const { getMatchTactic } = await load('/src/engine/match/MatchTactics.js');
const padel = await load('/src/lib/padel.js');
const rally = new RallyEngine();
const KEYS = ['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'];
const SLOPE = 0.2; // RallyEngine CONDITION_SLOPE / inclinação da habilidade

function preRng(player, shot, tactic, servingSide, side) {
  const rawSkill = rally.skill(player, shot);
  const skill = 50 + (rawSkill - 50) * 0.2;
  const confidence = (player.confidence - 50) * 0.14 * SLOPE;
  const energyPenalty = (100 - player.energy) * 0.12 * SLOPE;
  const risk = rally.risk(shot, tactic, true, player, {});
  const serviceInitiative = side === servingSide ? 2 : -2;
  return { rawSkill, skill: +skill.toFixed(3), confidence: +confidence.toFixed(3), energyPenalty: +energyPenalty.toFixed(3), risk: +risk.toFixed(3), serviceInitiative, executionBeforeNoise: +(skill + confidence - energyPenalty - risk + serviceInitiative).toFixed(3) };
}
function trace(label, raw) {
  // Mesmo atleta-base nos dois lados; no lado A entram os campos que o modal
  // do jogo monta (TournamentModal.jsx), no lado B o snapshot da chave.
  const playerSide = { ...raw, _chemistryBonus: padel.getChemistryBonus(raw.partner_chemistry ?? 50), _energyPenalty: padel.getEnergyPenalty(raw.energy ?? 100) };
  const teams = createTeams([playerSide, { ...raw, id: 'pA2' }], [{ ...raw, id: 'oB1' }, { ...raw, id: 'oB2' }]);
  const tactic = getMatchTactic('equilibrado');
  const shots = ['serve', 'drive', 'volley', 'smash', 'lob'];
  return {
    label,
    input: raw,
    normalized: { A0: { overall: teams.A[0].overall, energy: teams.A[0].energy, confidence: teams.A[0].confidence }, B0: { overall: teams.B[0].overall, energy: teams.B[0].energy, confidence: teams.B[0].confidence } },
    perShot: Object.fromEntries(shots.map((s) => [s, { A: preRng(teams.A[0], s, tactic, 'A', 'A'), B_receiving: preRng(teams.B[0], s, tactic, 'A', 'B'), B_serving: preRng(teams.B[0], s, tactic, 'B', 'B') }])),
    identicalPreRng: shots.every((s) => preRng(teams.A[0], s, tactic, 'A', 'A').executionBeforeNoise === preRng(teams.B[0], s, tactic, 'B', 'B').executionBeforeNoise),
  };
}
const base = (ovr, extra = {}) => ({ id: 'pA1', name: 'p', ...Object.fromEntries(KEYS.map((k) => [k, ovr])), ...extra });
const strength = {
  at: new Date().toISOString(),
  note: 'execução antes do ruído (random±14) — mesmo atleta nos dois lados; lado A recebe os campos do modal (_chemistryBonus/_energyPenalty), lado B o snapshot da chave. Serviço comparado na posição equivalente (A sacando × B sacando).',
  pipeline: ['atributos-base', 'baseOverallRating (attributes.js)', '+ _chemistryBonus/_coachMatchBonus/_partnerBondBonus (só lado do jogador; contexto de dupla/coach)', 'clamp 1–100', 'skill = 50 + (atributo do golpe − 50) × 0,2', '+ confiança (moral−50)×0,14×0,2', '− energia (100−e)×0,12×0,2', '− risco do golpe × riskModifier da tática', '± iniciativa de saque (2 nas 4 primeiras bolas)', '+ ruído uniforme ±14', '× pressão/dificuldade (iguais para os dois lados)'],
  cases: [trace('OVR 50, energia 100, moral 70', base(50, { energy: 100, morale: 70 })), trace('OVR 50, energia 55, moral 70', base(50, { energy: 55, morale: 70 })), trace('OVR 35, energia 80, moral 100', base(35, { energy: 80, morale: 100 }))],
  sideSpecificFindings: {
    before527F: ['_energyPenalty somado ao OVR só do jogador (2ª aplicação da energia)', 'troca automática de tática só no lado B, com táticas não neutras', 'energia/confiança sem a inclinação calibrada (×0,2)'],
    after527F: 'nenhum modificador de fórmula exclusivo de lado; diferenças restantes são de ESTADO de entrada (jogador leva energia/moral reais; snapshot do adversário não leva → 100/70) e de contexto da dupla do jogador (química/coach), documentadas como dívida de design',
  },
};
const energy = {
  at: new Date().toISOString(),
  inputs: { player: 'profile.energy (real) via TournamentModal → playerForMatch.energy', partner: 'perfil do parceiro (energy do AthleteProfile, se existir no objeto)', opponents: 'snapshot da chave sem energy → normalizePlayer default 100' },
  applications: [
    { where: 'playerModel.overallRating: rating += _energyPenalty', kind: 'força (OVR)', sides: 'só jogador', status527F: 'REMOVIDA — duplicava a aplicação por golpe' },
    { where: 'RallyEngine: energyPenalty = (100−e)×0,12 × inclinação', kind: 'força (execução por golpe)', sides: 'todos', status527F: 'mantida; inclinação 0,2 (antes 1)' },
    { where: 'FatigueEngine.consume/recover', kind: 'consumo durante a partida', sides: 'todos', status527F: 'inalterada' },
    { where: 'RallyEngine: dupla falta (fatigueFactor)', kind: 'chance mínima (≤0,1%)', sides: 'todos', status527F: 'inalterada' },
    { where: 'RallyEngine.chooseTargetPlayer: peso 1+(100−e)/200', kind: 'comportamento (alvo)', sides: 'todos', status527F: 'inalterada' },
    { where: 'PositionEngine / TeamCoordination / DecisionEngine', kind: 'comportamento (posição, cobertura, decisão)', sides: 'todos', status527F: 'inalterada' },
    { where: 'MatchTactics.chooseBotTactic: energia < 38 → defensivo', kind: 'tática da IA', sides: 'só B (adaptativo)', status527F: 'desligada por padrão com opponentAdaptive=false' },
  ],
  duplication: 'confirmada: OVR (−2/−5/−10 por faixa) e execução por golpe medem o mesmo conceito; a do OVR era pré-processamento só do jogador',
  cliff: 'a aplicação por golpe não usava a inclinação calibrada da habilidade: 10 pontos de energia = 6 de OVR (E90×E100 = 24%)',
};
await server.close();
mkdirSync('reports/rebalance-527f', { recursive: true });
writeFileSync('reports/rebalance-527f/strength-trace.json', `${JSON.stringify(strength, null, 2)}\n`);
writeFileSync('reports/rebalance-527f/energy-trace.json', `${JSON.stringify(energy, null, 2)}\n`);
for (const c of strength.cases) console.log(`${c.label}: A.overall ${c.normalized.A0.overall} B.overall ${c.normalized.B0.overall} · pré-RNG idêntico por lado: ${c.identicalPreRng}`);
