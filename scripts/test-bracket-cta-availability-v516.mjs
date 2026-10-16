// Playthrough 5.16, Partes K/L/M/N — "Ver chave" não pode existir antes da
// chave.
//
// Playtest: dentro dos detalhes do torneio o botão "Ver chave" aparecia a ~8
// dias do sorteio; clicar entregava "Chave ainda não sorteada". Causa: o
// botão era renderizado incondicionalmente, sem NENHUMA checagem de estado.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { installShims, makeRunner } from './lib/competitiveReviewGates.mjs';

const { check, finish } = makeRunner();
installShims('/tournaments');

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const {
  hasViewableTournamentBracket, getTournamentDrawCountdownLabel,
} = await vite.ssrLoadModule('/src/lib/tournamentBracketView.js');

const START = '2026-02-12';
const base = { id: 't1', name: 'Toronto Champions Masters', start_date: START, end_date: '2026-02-16' };
// Chave canônica = bracket_schema_version >= 2 + bracket_history não vazio.
const withDraw = {
  ...base,
  bracket_schema_version: 2,
  bracket_history: [{ round: 'Oitavas', matches: [{ team_a: 'A/B', team_b: 'C/D' }] }],
};

await check('Parte N: D-10 (sem sorteio) NÃO oferece "Ver chave"', () => {
  assert.equal(hasViewableTournamentBracket(base, '2026-02-02'), false);
});

await check('Parte N: D-4 (ainda sem sorteio) NÃO oferece "Ver chave"', () => {
  assert.equal(hasViewableTournamentBracket(base, '2026-02-08'), false);
});

await check('Parte N: D-3 com chave sorteada OFERECE "Ver chave"', () => {
  assert.equal(hasViewableTournamentBracket(withDraw, '2026-02-09'), true);
});

await check('Parte L: durante e depois do torneio a chave continua visível', () => {
  assert.equal(hasViewableTournamentBracket(withDraw, '2026-02-14'), true);
  assert.equal(hasViewableTournamentBracket({ ...withDraw, champion: 'A/B' }, '2026-02-20'), true);
});

await check('Parte L: torneio cancelado nunca oferece chave', () => {
  assert.equal(hasViewableTournamentBracket({ ...withDraw, status: 'cancelado' }, '2026-02-14'), false);
});

await check('Parte L: no lugar do botão, o jogador recebe QUANDO é o sorteio', () => {
  const d10 = getTournamentDrawCountdownLabel(base, '2026-02-02', 3);
  console.log(`   [registro] D-10 -> "${d10}"`);
  assert.match(d10, /Sorteio em 7 dias/);
  assert.equal(getTournamentDrawCountdownLabel(base, '2026-02-08', 3), 'Sorteio amanhã');
  assert.equal(getTournamentDrawCountdownLabel(base, '2026-02-09', 3), 'Sorteio hoje');
});

// ---------------------------------------------------------------------------
// Parte M — as SUPERFÍCIES. Estes gates são estruturais: garantem que nenhuma
// tela voltou a renderizar o CTA incondicionalmente. Asserem comportamento
// (o botão está sob uma guarda de estado de sorteio), não texto exato.
// ---------------------------------------------------------------------------
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

await check('Parte M: TournamentDetailsModal só mostra "Ver chave" sob guarda', () => {
  const src = read('src/components/tournaments/TournamentDetailsModal.jsx');
  assert.ok(src.includes('hasViewableTournamentBracket'), 'modal não consulta a autoridade de sorteio');
  // Âncora no BOTÃO, não no texto: "Ver chave" também aparece em comentário.
  const idx = src.indexOf('onClick={onViewBracket}');
  assert.ok(idx > 0, 'botão de chave não encontrado no modal');
  const before = src.slice(Math.max(0, idx - 200), idx);
  assert.ok(before.includes('bracketReady'),
    '"Ver chave" do modal não está sob a guarda bracketReady');
});

await check('Parte M: TODO CTA de chave da página de Torneios está sob guarda', () => {
  // Não basta checar um botão: a página tem várias superfícies (card, modo
  // foco, bloco de campeão). Cada `onClick={onViewBracket}` precisa estar
  // sob ALGUMA guarda de existência de chave.
  const src = read('src/pages/Tournaments.jsx');
  const GUARDS = ['drawHappened', 'bracketReady', 'tournament.champion'];
  const anchors = [];
  let from = 0;
  // Fase 5.29: o cartão de competição chama `onViewBracket(tournament)` e o
  // cartão de agenda fundiu "Ver chave" + o atalho do bloco de campeão num
  // único CTA — as superfícies passaram a ser 2 (competição + agenda), cada
  // uma ainda sob guarda. Os dois formatos de chamada contam.
  for (const needle of ['onClick={onViewBracket}', 'onClick={() => onViewBracket(']) {
    from = 0;
    for (;;) {
      const idx = src.indexOf(needle, from);
      if (idx < 0) break;
      anchors.push(idx);
      from = idx + 1;
    }
  }
  assert.ok(anchors.length >= 2, `esperava >=2 superfícies de chave, achei ${anchors.length}`);
  const unguarded = anchors.filter((idx) => {
    const before = src.slice(Math.max(0, idx - 260), idx);
    return !GUARDS.some((guard) => before.includes(guard));
  });
  console.log(`   [registro] superfícies de chave: ${anchors.length} | sem guarda: ${unguarded.length}`);
  assert.equal(unguarded.length, 0, `${unguarded.length} CTA(s) de chave sem guarda de sorteio`);
});

await check('Parte M: o CTA da comissão só vira "Ver chave" quando drawn', async () => {
  const { resolveCompetitiveDecisionCta } = await vite.ssrLoadModule('/src/lib/competitiveWeeklyDecision.js');
  const committed = (drawn) => ({
    state: 'committed',
    recommended: { id: 't1', name: 'X', drawn },
    committed: { id: 't1', name: 'X', drawn },
  });
  assert.equal(resolveCompetitiveDecisionCta(committed(false)).id, 'view_commitment');
  assert.equal(resolveCompetitiveDecisionCta(committed(true)).id, 'view_bracket');
});

await check('Parte J/L: o item de planejamento EXPÕE `drawn` (antes era undefined)', async () => {
  // Sem este campo o CTA da comissão nunca virava "Ver chave" e a transição
  // INSCRITO -> SORTEADO não mudava a assinatura de dedupe.
  const src = read('src/lib/weeklyCareerReview.js');
  assert.ok(/\n\s*drawn: \[/.test(src), 'o item de planejamento não define `drawn`');
});

await vite.close();
finish('test-bracket-cta-availability-v516');
