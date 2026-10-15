// Playthrough 5.16, Parte J — MATRIZ de transições: o que volta a falar e o
// que só atualiza o relatório.
//
// A política não é uma lista nova de regras: ela já está codificada na
// ASSINATURA da decisão (competitiveStaffReview.js), que é o que decide entre
// reescrever a mensagem e ficar em silêncio. Este teste torna a matriz
// explícita e verificável, em vez de implícita no formato de uma string.
//
//   RECOMMENDED -> REGISTERED   NOTIFICA (estado muda: decision -> committed)
//   REGISTERED  -> DRAWN        NOTIFICA (sorteio: drawn muda)
//   trocou o torneio recomendado NOTIFICA (a decisão é outra)
//   nova semana, nada mudou     SILÊNCIO
//   mesmo dia reprocessado      SILÊNCIO
//   DRAWN -> MATCH_READY        só relatório (domínio da Federação: D-1/dia)
//   MATCH_READY -> COMPLETED    só relatório (resultado tem canal próprio)
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { installShims, makeRunner } from './lib/competitiveReviewGates.mjs';

const { check, finish } = makeRunner();
installShims('/staff');

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { resolveCompetitiveDecisionCta } = await vite.ssrLoadModule('/src/lib/competitiveWeeklyDecision.js');

// Mesma composição de assinatura usada por ensureWeeklyCompetitiveStaffReview.
function signatureOf(decision) {
  const target = decision.recommended || decision.committed;
  const cta = resolveCompetitiveDecisionCta(decision);
  return [decision.state, target?.id || 'none', cta?.id || 'none', target?.drawn ? 'drawn' : 'not-drawn'].join('|');
}

const recommended = (id = 'londres') => ({
  state: 'decision',
  recommended: { id, name: id, drawn: false, canRegisterNow: true, registrationAllowed: true },
  committed: null,
});
const registered = (id = 'londres') => ({
  state: 'committed',
  recommended: { id, name: id, drawn: false },
  committed: { id, name: id, drawn: false },
});
const drawn = (id = 'londres') => ({
  state: 'committed',
  recommended: { id, name: id, drawn: true },
  committed: { id, name: id, drawn: true },
});

const MATRIX = [
  { from: recommended(), to: registered(), label: 'RECOMMENDED -> REGISTERED', notifies: true },
  { from: registered(), to: drawn(), label: 'REGISTERED -> DRAWN', notifies: true },
  { from: recommended('londres'), to: recommended('dubai'), label: 'troca do torneio recomendado', notifies: true },
  { from: registered(), to: registered(), label: 'nova semana, nada mudou', notifies: false },
  { from: drawn(), to: drawn(), label: 'sorteada, reprocessada', notifies: false },
  { from: recommended(), to: recommended(), label: 'mesmo dia reprocessado', notifies: false },
];

console.log('=== PARTE J: matriz de transições ===');
console.log('transição                             assinatura muda?  notifica?');
for (const row of MATRIX) {
  const changed = signatureOf(row.from) !== signatureOf(row.to);
  console.log(`${row.label.padEnd(38)}${String(changed).padEnd(18)}${row.notifies}`);
}

for (const row of MATRIX) {
  await check(`Parte J: ${row.label} => ${row.notifies ? 'NOTIFICA' : 'SILÊNCIO'}`, () => {
    const changed = signatureOf(row.from) !== signatureOf(row.to);
    assert.equal(changed, row.notifies,
      `assinatura ${changed ? 'mudou' : 'não mudou'} quando deveria ${row.notifies ? 'mudar' : 'ficar igual'}`);
  });
}

await check('Parte J: a assinatura distingue SORTEADA de não sorteada', () => {
  // Guarda contra a regressão real da 5.14: `drawn` não existia no item de
  // planejamento, então esta metade da assinatura era constante e o sorteio
  // nunca era percebido como mudança.
  assert.match(signatureOf(drawn()), /\|drawn$/);
  assert.match(signatureOf(registered()), /\|not-drawn$/);
});

await check('Parte J: o CTA acompanha a transição', () => {
  assert.equal(resolveCompetitiveDecisionCta(recommended()).id, 'register');
  assert.equal(resolveCompetitiveDecisionCta(registered()).id, 'view_commitment');
  assert.equal(resolveCompetitiveDecisionCta(drawn()).id, 'view_bracket');
});

await vite.close();
finish('test-staff-state-transition-notification-policy-v516');
