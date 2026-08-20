// Fase 13 (docs/FASE_13_CAREER_DEPTH.md, Parte 2/17).
//
// O briefing pede uma classificação de estágio de carreira (Início/Ascensão/
// Profissional/Elite/Lenda) — IMPORTANTE: "não necessariamente criar campo
// persistido career_stage — verificar se pode ser DERIVADO dos dados atuais
// primeiro." Auditoria encontrou `getCareerEconomyStage` (sportsEconomyV26.js)
// já fazendo exatamente essa classificação (5 estágios, derivada de
// career_level/ranking/reputação), já usada pra graduar o mercado de
// patrocinadores (STAGE_MARKET_LIMITS) e o mercado de treinadores
// (coaches.js). A Fase 13 não duplica essa taxonomia — só adiciona um mapa
// de RÓTULOS em português por cima do mesmo id de sempre
// (CAREER_STAGE_LABELS/getCareerStageLabel, achievementRelevance.js).
//
// Este teste prova: (1) nenhum campo novo persistido é necessário — os
// rótulos são 100% derivados de profile+context, síncronos, sem storage;
// (2) os 5 estágios têm rótulo em português coerente com o briefing; (3) a
// progressão de estágio é monotônica conforme level/rank/reputação sobem
// (nunca regride com melhora, nunca pula pra frente sem os requisitos); (4)
// getCareerStageLabel usa a MESMA fonte que já gate-keeps mercado de
// patrocinadores/treinadores — nunca uma segunda taxonomia paralela.
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  const { CAREER_STAGE_LABELS, getCareerStageLabel, getCareerRelevanceStage } = await server.ssrLoadModule('/src/lib/achievementRelevance.js');
  const { getCareerEconomyStage } = await server.ssrLoadModule('/src/lib/sportsEconomyV26.js');

  // ── Nenhum campo novo persistido: função pura, síncrona, sobre profile+context ──
  gate('getCareerStageLabel é uma função pura síncrona (não retorna Promise)', typeof getCareerStageLabel({ career_level: 5 }, {})?.then !== 'function');
  gate('CAREER_STAGE_LABELS é um objeto estático simples (5 chaves, sem I/O)', Object.keys(CAREER_STAGE_LABELS).length === 5);

  // ── Os 5 rótulos em português do briefing ─────────────────────────────────
  const expectedLabels = ['Início', 'Ascensão', 'Profissional', 'Elite', 'Lenda'];
  for (const label of expectedLabels) {
    gate(`Rótulo "${label}" existe em CAREER_STAGE_LABELS`, Object.values(CAREER_STAGE_LABELS).includes(label));
  }
  gate('CAREER_STAGE_LABELS mapeia exatamente os 5 ids de getCareerEconomyStage (nenhum id órfão, nenhum rótulo órfão)',
    ['beginner', 'regional', 'professional', 'international', 'elite'].every((id) => typeof CAREER_STAGE_LABELS[id] === 'string'));

  // ── getCareerStageLabel usa a MESMA fonte que já gate-keia mercado (Parte 5) ──
  const fixtures = [
    { name: 'iniciante puro', profile: { career_level: 1, ranking_position: 2000, reputation: 0 }, expectedId: 'beginner' },
    { name: 'regional (nível 5+)', profile: { career_level: 6, ranking_position: 1500, reputation: 5 }, expectedId: 'regional' },
    { name: 'profissional (nível 12+, rank<=500, rep>=15)', profile: { career_level: 14, ranking_position: 300, reputation: 20 }, expectedId: 'professional' },
    { name: 'internacional/elite-do-briefing (nível 22+, rank<=150, rep>=35)', profile: { career_level: 25, ranking_position: 90, reputation: 40 }, expectedId: 'international' },
    { name: 'elite/lenda-do-briefing (nível 35+, rank<=40, rep>=65)', profile: { career_level: 38, ranking_position: 15, reputation: 70 }, expectedId: 'elite' },
  ];
  for (const { name, profile, expectedId } of fixtures) {
    const rawStage = getCareerEconomyStage(profile);
    gate(`Fixture "${name}": getCareerEconomyStage retorna "${expectedId}"`, rawStage === expectedId);
    const label = getCareerStageLabel(profile, {});
    gate(`Fixture "${name}": getCareerStageLabel retorna "${CAREER_STAGE_LABELS[expectedId]}" (mesma fonte, nunca uma segunda taxonomia)`, label === CAREER_STAGE_LABELS[expectedId]);
    gate(`Fixture "${name}": getCareerRelevanceStage (já usada pela Fase 12) concorda com getCareerEconomyStage`, getCareerRelevanceStage(profile, {}) === rawStage);
  }

  // ── Progressão monotônica: subir level/rank/reputação nunca REGRIDE o estágio ──
  const STAGE_ORDER = ['beginner', 'regional', 'professional', 'international', 'elite'];
  const progressionSteps = [
    { career_level: 1, ranking_position: 2000, reputation: 0 },
    { career_level: 6, ranking_position: 1500, reputation: 5 },
    { career_level: 14, ranking_position: 300, reputation: 20 },
    { career_level: 25, ranking_position: 90, reputation: 40 },
    { career_level: 38, ranking_position: 15, reputation: 70 },
  ];
  let previousIdx = -1;
  for (const [i, profile] of progressionSteps.entries()) {
    const idx = STAGE_ORDER.indexOf(getCareerEconomyStage(profile));
    gate(`Passo ${i + 1} da progressão: estágio nunca regride (idx ${idx} >= anterior ${previousIdx})`, idx >= previousIdx);
    previousIdx = idx;
  }
  gate('Progressão completa atinge o estágio final "elite" (Lenda)', STAGE_ORDER[previousIdx] === 'elite');

  // ── context.worldRank (fonte canônica de ranking) sobrepõe ranking_position bruto ──
  // (mesma regra já usada por getCareerRelevanceStage — Fase 12, nunca usar
  // profile.ranking_position desatualizado quando o context já buscou o rank real).
  const staleProfile = { career_level: 38, ranking_position: 2000, reputation: 70 }; // profile "bruto" desatualizado
  const freshContext = { worldRank: { rank: 15 } }; // rank real e atual
  gate('Com rank canônico no context (#15), o estágio reflete o rank REAL, não o ranking_position desatualizado do profile', getCareerRelevanceStage(staleProfile, freshContext) === 'elite');
  // getCareerEconomyStage só exige rank baixo para os degraus "professional"+
  // pra cima — o piso "regional" só depende de career_level>=5, então um
  // ranking_position bruto ruim (2000) ainda cai em "regional" (não
  // "beginner") quando o level já é alto, mesmo sem o rank canônico.
  gate('Sem context.worldRank, cai no ranking_position bruto do profile (2000 barra os degraus altos, mas level 38 ainda garante ao menos "regional")', getCareerRelevanceStage(staleProfile, {}) === 'regional');

  // ── Robustez: profile nulo/vazio nunca lança exceção ────────────────────────
  gate('getCareerStageLabel(null, {}) não lança exceção e retorna um rótulo válido (fallback beginner)', Object.values(CAREER_STAGE_LABELS).includes(getCareerStageLabel(null, {})));
  gate('getCareerStageLabel({}, {}) não lança exceção e retorna um rótulo válido (fallback beginner)', Object.values(CAREER_STAGE_LABELS).includes(getCareerStageLabel({}, {})));

  console.log(`\n${gates} gates executados, todos PASS — Classificação de estágio de carreira (Fase 13, Parte 2), derivada sem campo novo persistido.`);
} finally {
  await server.close();
}
