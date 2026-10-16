import { readFile } from 'node:fs/promises';

// Fase 5.31: a tela de Dupla deixou de traduzir `contract_status` cru
// (o mapa com 'encerra_apos_compromisso' saiu do PartnerHub). A situação do
// contrato vem de getContractDecisionState (lifecycle) e é apresentada por
// src/lib/partnerScreen.js — o estado "encerra após compromissos" continua
// distinto e visível.
const hub = await readFile(new URL('../src/pages/PartnerHub.jsx', import.meta.url), 'utf8');
const screen = await readFile(new URL('../src/lib/partnerScreen.js', import.meta.url), 'utf8');
const required = [
  [hub, 'getContractDecisionState'],
  [hub, 'ENDING_AFTER_COMMITMENTS'],
  [screen, "decisionState === 'ENDING_AFTER_COMMITMENTS'"],
  [screen, 'Encerra após compromissos'],
];

const missing = required.filter(([source, token]) => !source.includes(token)).map(([, token]) => token);
if (missing.length) {
  console.error(`partner-decision-state-ui: FAIL missing ${missing.join(', ')}`);
  process.exit(1);
}

console.log('partner-decision-state-ui: PASS');
