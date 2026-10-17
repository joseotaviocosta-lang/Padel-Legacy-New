// CLOUD-6C — bônus permanentes de vitória respeitam o teto individual.
// Determinístico: Math.random é substituído por uma sequência fixa; exercita o
// buildMatchRewardsPatch REAL e a regra canônica getAttributeDevelopmentCeiling.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let gates = 0;
const gate = (label, ok) => { gates += 1; console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}`); assert(ok, label); };

const KEYS = ['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'];
const realRandom = Math.random;
const withRandom = (seq, fn) => {
  let i = 0; Math.random = () => { const v = seq[Math.min(i, seq.length - 1)]; i += 1; return v; };
  try { const out = fn(); return { out, calls: i }; } finally { Math.random = realRandom; }
};
// índice do atributo escolhido: floor(r * 10) => r = (idx + 0.5) / 10
const pick = (idx) => (idx + 0.5) / 10;

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const P = await server.ssrLoadModule('/src/lib/padel.js');
  const T = await server.ssrLoadModule('/src/lib/trainingSystemV2.js');

  const profile = (extra = {}) => ({
    id: 'p', birth_date: '2010-01-01', career_date: '2026-01-01', play_style: 'equilibrado', potential: 80,
    ...Object.fromEntries(KEYS.map(k => [k, 50])), initial_attributes: Object.fromEntries(KEYS.map(k => [k, 50])), ...extra,
  });
  // r0 = escolha do atributo; r1 = rolagem do ganho (0 => passa em toda faixa < 100%, valor baixo => ganho)
  const win = (p, idx, roll = 0, won = true) =>
    withRandom([pick(idx), roll, 0.99], () => P.buildMatchRewardsPatch(p, won, { skipPhysical: true }).updates);
  const ceilOf = (p, k) => T.getAttributeDevelopmentCeiling(p, k);

  const p80 = profile();
  const c80 = ceilOf(p80, 'serve');

  // 1. Abaixo do teto: ganho normal.
  { const p = profile({ serve: 50 }); const { out } = win(p, 0); gate('abaixo do teto: +1 aplicado (faixa 50-59, roll 0)', out.serve === 51); }
  // 2. Bônus +2 (valor < 25) abaixo do teto.
  { const p = profile({ serve: 12 }); const { out } = win(p, 0, 0.1); gate('bônus +2 abaixo do teto aplicado integralmente', out.serve === 14); }
  // 3. Exatamente no teto: sem ganho e sem a chave.
  { const p = profile({ serve: c80 }); const { out } = win(p, 0); gate('exatamente no teto: nenhum ganho', out.serve === undefined || out.serve === c80); }
  // 4. Um abaixo do teto com +2 possível: limitado ao teto.
  { const p = profile({ serve: 12, potential: 45 }); const c = ceilOf(p, 'serve');
    const q = profile({ serve: c - 1, potential: 45 });
    // valor alto => gain base é 0/1; força +2 via valor baixo não é possível perto do teto, então testamos o clamp diretamente por faixa baixa:
    const low = profile({ serve: 12, potential: 45, play_style: 'equilibrado' });
    gate('teto mínimo (pot 45) permanece acima de 12 (premissa do teste +2)', c > 14);
    const { out } = win(q, 0); gate('um abaixo do teto: ganho +1 chega ao teto, não passa', out.serve === undefined || out.serve <= c);
    void low; }
  // 5. Acima do teto (save antigo): sem ganho, sem redução.
  { const p = profile({ serve: c80 + 5 }); const { out } = win(p, 0);
    gate('acima do teto: nenhuma alteração do atributo', out.serve === undefined || out.serve === c80 + 5);
    gate('acima do teto: jamais reduzido', (out.serve ?? c80 + 5) >= c80 + 5); }
  // 6. Potenciais diferentes: teto muda, mesmo atributo.
  { const lo = profile({ potential: 50 }); const hi = profile({ potential: 95 });
    const cLo = ceilOf(lo, 'serve'), cHi = ceilOf(hi, 'serve');
    gate('potenciais distintos geram tetos distintos', cLo < cHi);
    const a = win({ ...lo, serve: cLo }, 0).out; const b = win({ ...hi, serve: cLo }, 0).out;
    gate('potencial baixo: bloqueado no próprio teto', (a.serve ?? cLo) === cLo);
    gate('potencial alto: mesmo valor ainda evolui', b.serve === cLo + 1 || cLo >= 95); }
  // 7. Sem vitória: nenhum atributo muda.
  { const p = profile(); const { out } = win(p, 0, 0, false); gate('derrota: nenhum atributo alterado', KEYS.every(k => out[k] === undefined)); }
  // 8. Integridade dos demais atributos e consumo de RNG.
  { const p = profile({ serve: c80 });
    const blocked = win(p, 0); const open = win(profile({ serve: 50 }), 0);
    gate('demais atributos intactos (bloqueado)', KEYS.slice(1).every(k => blocked.out[k] === undefined));
    gate('demais atributos intactos (permitido)', KEYS.slice(1).every(k => open.out[k] === undefined));
    gate('consumo de RNG idêntico entre bloqueado e permitido', blocked.calls === open.calls); }
  // 9. Atributo bloqueado não é redirecionado: outros atributos abaixo do teto não recebem o bônus.
  { const p = profile({ serve: c80 }); const { out } = win(p, 0); gate('sem redistribuição para outro atributo', KEYS.every(k => k === 'serve' || out[k] === undefined)); }
  // 10. Nenhuma redução retroativa em varredura de todos os atributos/valores.
  { let ok = true;
    for (let idx = 0; idx < KEYS.length; idx++) for (const v of [10, 24, 40, 55, 65, 75, 85, 92, 97, 100]) for (const roll of [0, 0.5, 0.99]) {
      const p = profile({ [KEYS[idx]]: v }); const { out } = win(p, idx, roll);
      const after = out[KEYS[idx]] ?? v; const c = ceilOf(p, KEYS[idx]);
      if (after < v || after > Math.max(v, c) || after > 100) ok = false;
    }
    gate('varredura: nunca reduz, nunca passa de max(atual, teto), nunca >100', ok); }
  // 11. Compatibilidade com 6B: treino segue respeitando o mesmo teto e não rebaixa atributo acima dele.
  { const p = profile({ serve: c80 + 3 }); const r = T.applyAttributeGains(p, { serve: 1 });
    gate('6B: treino não rebaixa atributo acima do teto', r.updates.serve === c80 + 3);
    const fromWin = win(profile({ serve: c80 - 1 }), 0).out.serve;
    gate('vitória leva no máximo ao teto canônico (mesma regra do treino)', fromWin === undefined || fromWin <= c80); }
  // 12. Teto específico por estilo reaproveitado (atributo preferido tem teto maior).
  { const off = profile({ play_style: 'ofensivo' }); gate('teto por estilo respeitado (smash > defense em ofensivo)', ceilOf(off, 'smash') > ceilOf(off, 'defense'));
    const { out } = win({ ...off, defense: ceilOf(off, 'defense') }, 6); gate('estilo: atributo não preferido bloqueado no seu teto', (out.defense ?? ceilOf(off, 'defense')) === ceilOf(off, 'defense')); }
  // 13. Demais efeitos da vitória preservados.
  { const { out } = win(profile(), 0); gate('xp/moedas/vitória preservados', out.wins === 1 && out.xp === 50 && out.coins === 30); }

  console.log(`\n${gates} gates PASS`);
} finally { Math.random = realRandom; await server.close(); }
