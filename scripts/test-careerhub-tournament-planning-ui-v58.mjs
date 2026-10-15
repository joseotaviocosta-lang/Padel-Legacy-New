import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/pages/CareerHub.jsx', import.meta.url), 'utf8');
// Playthrough 5.13 (continuação) — o guard fixava o JSX ESTÁTICO
// `title="Planejamento da Semana"`. O título passou a alternar: com
// inscrição confirmada, a seção vira "Compromisso da Semana" (antes ela
// sumia do topo justamente depois da inscrição). As duas variantes são
// verificadas, então o guard continua pegando a remoção do heading e ainda
// cobre o estado novo.
assert.ok(source.includes("'Planejamento da Semana'") || source.includes('title="Planejamento da Semana"'),
  'a seção precisa manter o heading de planejamento');
assert.ok(source.includes('Compromisso da Semana'),
  'a seção precisa ter o heading de compromisso pós-inscrição');
assert.ok(source.includes('TournamentRegistrationModal'), 'CTA de inscrição deve usar o modal canônico no Hub');
assert.ok(source.includes('onRegistered={handleTournamentRegistered}'), 'confirmação precisa atualizar o snapshot local');
assert.ok(source.includes('openBracket=true'));
assert.ok(source.includes("mode=run"));
console.log('test-careerhub-tournament-planning-ui-v58: PASS');
