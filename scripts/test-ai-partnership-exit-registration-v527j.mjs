// Playthrough 5.27-J, Bloco I (itens 31/32) — duplas da IA: a dissolução é
// imediata (sem estado "separação pendente" que permita entrar em torneio novo)
// e só parcerias ativas entram na admissão do mundo; a identidade de dupla já
// sorteada fica no draw (imutável).
import { readFileSync } from 'node:fs';
import { makeSuite, assert, bootModules } from './lib/v526bTestKit.mjs';

const { check, finish } = makeSuite('test-ai-partnership-exit-registration-v527j');
try {
  await check('lifecycle da IA não tem estado de saída pendente: dissolução grava status encerrada na hora', () => {
    const s = readFileSync('src/game-core/aiPartnershipLifecycle.js', 'utf8');
    for (const st of ['encerra_apos_compromisso', 'encerrar_ao_final', 'nao_renovara']) assert.ok(!s.includes(`'${st}'`), `IA usa ${st}`);
    assert.match(s, /status: 'encerrada_parceiro', contract_status: 'encerrado', ended_career_date: currentDate/);
  });
  await check('admissão do mundo usa só parcerias ativas (dupla dissolvida não entra em campo novo)', async () => {
    const m = await bootModules();
    try {
      const W = await m.load('/src/gameplay/worldTour/WorldTourLifecycle.js');
      const athletes = ['a1', 'a2', 'b1', 'b2'].map((id) => ({ id, name: id, overall_rating: 60 }));
      const ps = [
        { id: 'p-ativa', status: 'ativa', athlete_a_id: 'a1', athlete_b_id: 'a2', partnership_type: 'npc' },
        { id: 'p-dissolvida', status: 'encerrada_parceiro', contract_status: 'encerrado', athlete_a_id: 'b1', athlete_b_id: 'b2', partnership_type: 'npc' },
      ];
      const pairs = W.buildCanonicalPairs(ps, athletes);
      assert.deepEqual(pairs.map((p) => p.partnershipId), ['p-ativa']);
    } finally { await m.close(); }
  });
  await check('IA não escreve TournamentRegistration (entra pela admissão do mundo, não pela inscrição)', () => {
    const s = readFileSync('src/game-core/aiPartnershipLifecycle.js', 'utf8') + readFileSync('src/gameplay/worldTour/WorldTourLifecycle.js', 'utf8');
    assert.ok(!/TournamentRegistration\.(upsert|create)\(/.test(s));
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
