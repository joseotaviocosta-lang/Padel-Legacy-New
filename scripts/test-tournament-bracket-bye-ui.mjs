import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  const { describeBracketEntry } = await vite.ssrLoadModule('/src/lib/tournamentBracketView.js');

  const byeState = describeBracketEntry('Dupla 1', new Set(['Dupla 1']));
  assert.equal(byeState.kind, 'bye', 'um nome em round.byes deve ser identificado como BYE');
  assert.equal(byeState.badge, 'BYE', 'o rótulo do BYE deve ser explícito na UI');

  const unresolvedState = describeBracketEntry('Vencedor Jogo 3');
  assert.equal(unresolvedState.kind, 'unresolved', 'um vencedor ainda não conhecido deve continuar como pendente');

  const absentState = describeBracketEntry('Participante a definir');
  assert.equal(absentState.kind, 'absent', 'slot sem entrada real precisa distinguir ausente do BYE');

  console.log('test-tournament-bracket-bye-ui: PASS');
} finally {
  await vite.close();
}
