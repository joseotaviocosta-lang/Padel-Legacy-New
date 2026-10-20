import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { formatIndividualRankLabel, formatTeamRankLabel } from '../src/lib/rankingDisplay.js';

assert.equal(formatIndividualRankLabel({ rank: 123, displayRank: '123', unranked: false }), '#123');
assert.equal(formatIndividualRankLabel({ rank: 1001, displayRank: '1000+', unranked: true }), '#1000+');
assert.equal(formatIndividualRankLabel(null), '#1000+');
assert.equal(formatTeamRankLabel({ rank: 0, unranked: true }), 'Sem ranking');
assert.equal(formatTeamRankLabel({ rank: 12, displayRank: '12', unranked: false }), '#12');
const ranking = await readFile(new URL('../src/pages/Ranking.jsx', import.meta.url), 'utf8');
const season = await readFile(new URL('../src/pages/Season.jsx', import.meta.url), 'utf8');
const hud = await readFile(new URL('../src/components/career/CareerHud.jsx', import.meta.url), 'utf8');
const partner = await readFile(new URL('../src/components/partner/PartnerOverview.jsx', import.meta.url), 'utf8');
const tournament = await readFile(new URL('../src/components/tournaments/TournamentModal.jsx', import.meta.url), 'utf8');
const appLayout = await readFile(new URL('../src/components/AppLayout.jsx', import.meta.url), 'utf8');
assert.match(ranking, /buildWorldRankingSnapshot/);
// 5.32-A.1: a escada lê a população inteira com a MESMA autoridade
// (TEAM_BOARD_CAP = corte com que getTeamRank calcula a posição).
assert.match(ranking, /getTeamRankings\(TEAM_BOARD_CAP\)/);
assert.match(ranking, /export const TEAM_BOARD_CAP = 5000;/);
assert.match(season, /formatIndividualRankLabel\(worldRank\)/);
// CLOUD-2: desde a Playthrough 5.24 (Parte B) o ranking individual saiu do
// CareerHud e vive em HeaderRankShortcuts — a autoridade do rótulo é a mesma.
const headerRank = await readFile(new URL('../src/components/career/HeaderRankShortcuts.jsx', import.meta.url), 'utf8');
assert.match(headerRank, /formatIndividualRankLabel\(ranking\)/);
assert.doesNotMatch(hud, /displayRank|#\$\{/, 'CareerHud não deve voltar a montar um rótulo de ranking próprio');
assert.match(appLayout, /getWorldRank\(nextProfile\)/);
// CLOUD-2: no redesign 5.31 a variável virou partnerMember; a autoridade é a mesma.
assert.match(partner, /getTeamRank\(profile, partner(Bot|Member)\)/);
assert.match(partner, /getWorldRank\(profile\)/);
assert.match(tournament, /getTeamRank\(loadedProfile, loadedPartner\)/);
assert.match(tournament, /getCanonicalTeamWorldRank\(ids\)/);
console.log('test-ranking-ui-authority-v56: PASS');
