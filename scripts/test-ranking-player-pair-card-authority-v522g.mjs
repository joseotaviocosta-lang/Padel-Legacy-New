// Playthrough 5.22-G, Parte Q — a UI NÃO calcula o total por conta própria.
// Ranking.jsx consome a autoridade TeamRanking (getTeamRank) para TOTAL,
// POSIÇÃO e STATUS; o breakdown individual é só exibição. Também resolve o
// parceiro canônico pela parceria ativa (partner_bot_id), não pelo template.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/pages/Ranking.jsx', import.meta.url), 'utf8');

assert.match(source, /ensurePlayerTeamRanking/, 'Ranking deve garantir a linha canônica antes de ler');
assert.match(source, /getTeamRank\s*\(/, 'Ranking deve ler a autoridade TeamRanking');
assert.match(source, /playerPairRank/, 'o TOTAL deve vir da linha canônica');
assert.match(source, /pairRank\.points/, 'o card exibe o total canônico');
assert.match(source, /activePartnership\?\.partner_bot_id/, 'o parceiro canônico vem da parceria ativa');
assert.match(source, /Partnership[\s\S]{0,120}status:\s*'ativa'/, 'deve consultar a parceria ativa');

// O total NÃO pode ser uma soma feita na UI (ex.: playerPoints + partnerPoints).
const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
assert.doesNotMatch(stripped, /playerPoints\s*\+\s*partnerPoints/, 'a UI somou os membros por conta própria');
assert.doesNotMatch(stripped, /rankingSnapshot\?\.playerPoints\s*\+\s*Number\(playerPartner/, 'a UI somou os membros por conta própria');

// O breakdown individual pode aparecer, mas rotulado e separado do TOTAL.
assert.match(source, /rankingSnapshot\?\.playerPoints/, 'breakdown do jogador deve existir');
assert.match(source, /playerPartner\?\.world_ranking_points/, 'breakdown do parceiro deve existir');
assert.match(source, /Total/, 'deve rotular o total');

console.log('test-ranking-player-pair-card-authority-v522g: PASS');
