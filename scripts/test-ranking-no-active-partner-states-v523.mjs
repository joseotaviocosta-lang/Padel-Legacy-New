// Playthrough 5.23, Partes U/V — estados sem dupla ativa e de 0 pontos, com
// World e Race independentes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTeamRankingModules, installEntityStore, check, finish } from './lib/v522eTeamRankingHarness.mjs';

const source = readFileSync(new URL('../src/pages/Ranking.jsx', import.meta.url), 'utf8');

// Sem dupla ativa: as duas views de Duplas mostram o mesmo empty state.
assert.match(source, /Sem dupla ativa/);
assert.match(source, /Forme uma parceria para aparecer no ranking de duplas/);
const noPartnerStates = (source.match(/Sem dupla ativa/g) || []).length;
assert.equal(noPartnerStates, 2, 'World e Race de Duplas devem ter o estado sem dupla');

// 0 pontos: World = "Ainda sem ranking" (5.32-A); Race = "Ainda sem pontos na Race".
assert.match(source, /pairRank\.unranked \? \(\s*<UnrankedHeadline/, 'World 0 + 0 => cartão sem posição');
assert.match(source, /function UnrankedHeadline[\s\S]*?Ainda sem ranking/, 'o cartão sem posição diz "Ainda sem ranking"');
assert.match(source, /Ainda sem pontos na Race/, 'Race 0 + 0 => ainda sem pontos');

// A dupla atual vem da parceria ATIVA, nunca de uma parceria antiga.
assert.match(source, /status: 'ativa'/, 'deve resolver a parceria ativa');
assert.match(source, /partner_bot_id/, 'id canônico do parceiro');

const mods = await loadTeamRankingModules();
try {
  const race = await mods.vite.ssrLoadModule('/src/lib/teamRaceRanking.js');
  installEntityStore(mods.localGame, { PlayerProfile: [{ id: 'p', name: 'P', race_points: 50 }], AthleteProfile: [], TeamRanking: [] });
  const noPartner = await race.getTeamRaceRank({ id: 'p', race_points: 50 }, null);
  check('getTeamRaceRank sem parceiro => Sem ranking', () => {
    assert.equal(noPartner.unranked, true);
    assert.equal(noPartner.points, 0);
  });
} finally {
  await mods.vite.close();
}
finish('test-ranking-no-active-partner-states-v523');
