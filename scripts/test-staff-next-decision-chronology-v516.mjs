// Playthrough 5.16, Partes B/C/D/E — a comissão precisa apresentar a PRÓXIMA
// decisão competitiva, não a melhor decisão de qualquer semana do horizonte.
//
// Reprodução do playtest: Los Angeles a D-7, elegível, inscrição aberta, foi
// PULADO; Dubai a D-14 foi recomendado. Causa medida em
// getTournamentPlanningRecommendation: a ordenação era puramente por
// qualidade (fit/retorno/risco) e a data só desempatava score exatamente
// igual — o que nunca acontece na prática.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { installShims, makeRunner } from './lib/competitiveReviewGates.mjs';

const { check, finish } = makeRunner();
installShims('/staff');

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { getTournamentPlanningRecommendation, planningQualityScore } = await vite.ssrLoadModule('/src/lib/weeklyCareerReview.js');

// Item de planejamento mínimo, com só os campos que a recomendação lê.
function item(id, name, startDate, { fit, expectedNet, expectedPoints, risk = 0, open = true }) {
  return {
    id, name, startDate,
    canRegisterNow: open, registrationAllowed: open, conflictWith: null,
    fit, choice: { expectedNet, expectedPoints, risk },
  };
}

// Cenário exato da Parte E. Dubai é DELIBERADAMENTE o melhor evento em
// qualidade — é isso que tornava o bug invisível como "preferência".
const losAngeles = item('la', 'Los Angeles Cup', '2026-02-05', { fit: 70, expectedNet: 8000, expectedPoints: 250 });
const dubai = item('dubai', 'Dubai Rising Cup', '2026-02-12', { fit: 95, expectedNet: 20000, expectedPoints: 600 });

await check('pré-condição: Dubai realmente pontua MAIS que Los Angeles', () => {
  const la = planningQualityScore(losAngeles);
  const db = planningQualityScore(dubai);
  console.log(`   [registro] score Los Angeles=${la.toFixed(1)} | Dubai=${db.toFixed(1)}`);
  assert.ok(db > la, 'cenário inválido: Dubai precisa ser o melhor em qualidade');
});

await check('Parte E: com LA em D-7 e Dubai em D-14, a comissão recomenda LOS ANGELES', () => {
  const rec = getTournamentPlanningRecommendation([dubai, losAngeles]);
  assert.ok(rec, 'nenhuma recomendação produzida');
  assert.equal(rec.tournamentId, 'la', `recomendou ${rec.tournamentId} em vez de Los Angeles`);
});

await check('Parte E: a ordem de entrada da lista não muda a resposta', () => {
  const a = getTournamentPlanningRecommendation([losAngeles, dubai]);
  const b = getTournamentPlanningRecommendation([dubai, losAngeles]);
  assert.equal(a.tournamentId, 'la');
  assert.equal(b.tournamentId, 'la');
});

await check('Parte C/3: dentro da MESMA janela, a qualidade volta a mandar', () => {
  // Dois eventos na mesma semana competitiva são alternativas da mesma
  // decisão — aí o score é o critério certo, e o melhor deve vencer mesmo
  // começando um pouco depois.
  const terca = item('t', 'Evento Fraco', '2026-02-05', { fit: 30, expectedNet: 1000, expectedPoints: 50 });
  const quinta = item('q', 'Evento Forte', '2026-02-07', { fit: 90, expectedNet: 15000, expectedPoints: 500 });
  const rec = getTournamentPlanningRecommendation([terca, quinta]);
  assert.equal(rec.tournamentId, 'q', 'dentro da janela, o melhor evento deveria vencer');
});

await check('Parte D: urgência é CONSTRAINT — score altíssimo não fura a ordem', () => {
  const absurdo = item('x', 'Masters Absurdo', '2026-02-20', { fit: 100, expectedNet: 999999, expectedPoints: 5000 });
  const rec = getTournamentPlanningRecommendation([absurdo, losAngeles]);
  assert.equal(rec.tournamentId, 'la', 'um score enorme furou a janela cronológica');
});

await check('Parte B/3: evento sem inscrição aberta NÃO segura a janela', () => {
  // Um evento anterior que o jogador não pode disputar não é uma decisão
  // pendente — ele não deve bloquear a recomendação do próximo possível.
  const fechado = item('f', 'Evento Fechado', '2026-02-02', { fit: 80, expectedNet: 9000, expectedPoints: 300, open: false });
  const rec = getTournamentPlanningRecommendation([fechado, dubai]);
  assert.equal(rec.tournamentId, 'dubai', 'evento inelegível bloqueou a janela');
});

await check('sem candidatos elegíveis, não inventa recomendação', () => {
  const fechado = item('f', 'Fechado', '2026-02-02', { fit: 80, expectedNet: 9000, expectedPoints: 300, open: false });
  assert.equal(getTournamentPlanningRecommendation([fechado]), null);
});

await vite.close();
finish('test-staff-next-decision-chronology-v516');
