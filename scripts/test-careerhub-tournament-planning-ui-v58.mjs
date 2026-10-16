import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/pages/CareerHub.jsx', import.meta.url), 'utf8');
// Playthrough 5.13 (continuação) — o guard fixava o JSX ESTÁTICO
// `title="Planejamento da Semana"`. O título passou a alternar: com
// inscrição confirmada, a seção vira "Compromisso da Semana" (antes ela
// sumia do topo justamente depois da inscrição). As duas variantes são
// verificadas, então o guard continua pegando a remoção do heading e ainda
// cobre o estado novo.
// Fase 5.30 — a "Planejamento/Compromisso da Semana" virou dois blocos de
// lugar fixo: "O que vem agora" (compromisso → próxima oportunidade) e a
// Agenda imediata (os mesmos itens do planejamento). A chave e a campanha
// abrem a partir do cartão de competição de Torneios (5.29); na Home o
// atalho é o detalhe do torneio.
const lib = await readFile(new URL('../src/lib/homeDashboard.js', import.meta.url), 'utf8');
assert.ok(source.includes('<HomeNextCommitment') && lib.includes("eyebrow: 'Próxima oportunidade'"),
  'a Home precisa manter o bloco de decisão de torneio');
assert.ok(lib.includes("eyebrow: 'Seu próximo torneio'"),
  'o bloco precisa ter o rótulo de compromisso pós-inscrição');
assert.ok(source.includes('<HomeAgenda') && lib.includes('weeklyReview?.upcomingTournaments'),
  'a agenda da Home precisa listar o planejamento semanal');
assert.ok(source.includes('TournamentRegistrationModal'), 'CTA de inscrição deve usar o modal canônico no Hub');
assert.ok(source.includes('onRegistered={handleTournamentRegistered}'), 'confirmação precisa atualizar o snapshot local');
assert.ok(source.includes('mode=details') && lib.includes('mode=details'), 'atalhos levam ao detalhe do torneio');
console.log('test-careerhub-tournament-planning-ui-v58: PASS');
