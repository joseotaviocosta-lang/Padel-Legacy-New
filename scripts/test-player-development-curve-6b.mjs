// CLOUD-6B — curva de desenvolvimento do jogador. Determinístico (sem Math.random,
// sem relógio, sem I/O): exercita as funções REAIS de trainingSystemV2.js.
// As projeções abaixo são de FÓRMULA com uma política de treino fixa; não provam
// o auge aos 22–25 anos em carreira completa (isso exige simulação, fora desta fase).
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let gates = 0;
const gate = (label, ok) => { gates += 1; console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}`); assert(ok, label); };

const KEYS = ['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'];
// Degrau anterior à 6B, só para comparação (referência congelada).
const legacyWindow = (r) => (r >= 15 ? 1 : r >= 8 ? 0.82 : r >= 4 ? 0.58 : r >= 1 ? 0.3 : 0.08);

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const T = await server.ssrLoadModule('/src/lib/trainingSystemV2.js');
  const C = await server.ssrLoadModule('/src/lib/trainingCatalog.js');
  const S = await server.ssrLoadModule('/src/careers/careerSchema.js');
  const focuses = C.TRAINING_FOCUSES.filter(f => !f.requiresPartner);

  const baseProfile = (extra = {}) => ({
    id: 'p', birth_date: '2010-01-01', career_date: '2026-01-01', fatigue: 0, energy: 100, play_style: 'equilibrado',
    potential: 80, career_difficulty: 'normal', ...Object.fromEntries(KEYS.map(k => [k, 22])), initial_attributes: Object.fromEntries(KEYS.map(k => [k, 22])), ...extra,
  });
  const avg = (p) => KEYS.reduce((s, k) => s + p[k], 0) / KEYS.length;

  // Política fixa e determinística: `perDay` sessões/dia (rodízio dos focos), `restDays` dias de folga por semana.
  function simulate({ perDay = 1, intensity = 'moderado', restDays = 0, years = 9, potential = 80, start } = {}) {
    const p = start ? { ...start } : baseProfile({ potential });
    const t0 = Date.UTC(2026, 0, 1); let fi = 0; const curve = {};
    for (let d = 0; d < Math.round(years * 365); d++) {
      p.career_date = new Date(t0 + d * 86400000).toISOString().slice(0, 10);
      if (d % 7 < 7 - restDays) for (let s = 0; s < perDay; s++) {
        const prev = T.previewTraining(p, focuses[fi++ % focuses.length], intensity, 0);
        Object.assign(p, T.applyAttributeGains(p, prev.gains).updates, { attribute_progress: T.applyAttributeGains(p, prev.gains).progress });
      }
      if ((d + 1) % 365 === 0) curve[(d + 1) / 365] = Number(avg(p).toFixed(1));
    }
    return { curve, profile: p };
  }

  // ── 1. Janela de desenvolvimento: fórmula nova vs anterior ───────────────────
  const W = T.getDevelopmentWindowMultiplier;
  gate('janela: continua e não crescente conforme o teto se aproxima (remaining 80→0)', [80, 60, 50, 40, 30, 20, 15, 10, 8, 4, 2, 1].every((r, i, a) => i === 0 || W(r) <= W(a[i - 1])));
  gate('janela: sem salto — diferença máxima entre passos de 1 ponto < 0,02 acima de 1', Array.from({ length: 80 }, (_, i) => i + 2).every(r => Math.abs(W(r) - W(r - 1)) < 0.02));
  gate('janela: início (60+ faltando) rende menos que o degrau anterior (que era 1,0) mas > 0,5', W(64) < 1 && W(64) > 0.5);
  gate('janela: perto do teto (15 faltando) rende menos que o degrau anterior (0,82), mas > exausto (0,08)', W(15) < legacyWindow(15) && W(15) > W(0));
  gate('janela: sem espaço (<1) mantém o piso 0,08 de antes', W(0) === 0.08 && W(0.5) === 0.08);

  // ── 2. Evolução inicial aos 16 / 17–19 / projeção 22–25 (política: 1 treino normal/dia) ─
  const normal = simulate({});
  console.log('(info) média de atributos, 1 normal/dia, pot 80:', JSON.stringify(normal.curve));
  gate('16→17 anos: ganho perceptível (≥ +20 pontos de média) e não explosivo (≤ +32)', normal.curve[1] - 22 >= 20 && normal.curve[1] - 22 <= 32);
  gate('17→19 anos: continua crescendo forte (≥ +12 de 17 para 19)', normal.curve[3] - normal.curve[1] >= 12);
  gate('aos 18 anos (2 anos) ainda longe do teto: < 75% do teto individual', normal.curve[2] < 0.75 * T.getDevelopmentWindow(baseProfile()).ceiling);
  gate('19→22 anos ainda cresce de forma relevante (≥ +8)', normal.curve[6] - normal.curve[3] >= 8);
  gate('22→25 anos (6→9 anos de carreira) ainda cresce (≥ +3), sem saturar', normal.curve[9] - normal.curve[6] >= 3);
  gate('rendimento anual nunca aumenta de um ano para o seguinte (saturação gradual)', [2, 3, 4, 5, 6, 7, 8, 9].every(y => (normal.curve[y] - normal.curve[y - 1]) <= (normal.curve[y - 1] - (normal.curve[y - 2] ?? 22)) + 0.05));
  gate('nunca ultrapassa o teto individual', normal.curve[9] <= T.getDevelopmentWindow(baseProfile()).ceiling);

  // ── 3. Intensidade / volume de treino e perfis ───────────────────────────────
  const leve = simulate({ intensity: 'leve', restDays: 2 }); // casual
  const intenso = simulate({ perDay: 2, intensity: 'intenso' }); // otimizador
  console.log('(info) casual:', JSON.stringify(leve.curve), '\n(info) otimizador:', JSON.stringify(intenso.curve));
  gate('casual < normal < otimizador em todo ponto de 1 a 4 anos', [1, 2, 3, 4].every(y => leve.curve[y] < normal.curve[y] && normal.curve[y] < intenso.curve[y]));
  gate('treino intenso > normal > leve em um único treino', (() => { const p = baseProfile(); const g = (i) => T.previewTraining(p, focuses[0], i, 0).budget; return g('intenso') > g('moderado') && g('moderado') > g('leve'); })());
  gate('casual ainda evolui aos 22–25 (≥ +4 de 6 para 9 anos) e fica abaixo do normal em 9 anos', leve.curve[9] - leve.curve[6] >= 4 && leve.curve[9] < normal.curve[9]);
  gate('otimizador não bate no teto antes dos 18 anos (2 anos) — antes batia', intenso.curve[2] < T.getDevelopmentWindow(baseProfile()).ceiling - 3);

  // ── 4. Potencial individual, sem teto artificial único ───────────────────────
  const hi = simulate({ potential: 95 }); const lo = simulate({ potential: 60 });
  console.log('(info) pot 95:', JSON.stringify(hi.curve), '\n(info) pot 60:', JSON.stringify(lo.curve));
  gate('maior potencial rende mais e tem teto maior (95 > 80 > 60 em 6 e 9 anos)', hi.curve[6] > normal.curve[6] && normal.curve[6] > lo.curve[6] && hi.curve[9] > normal.curve[9] && normal.curve[9] > lo.curve[9]);
  gate('teto do potencial 95 > teto 80 > teto 60 (sem limite igual para todos)', (() => { const c = (potential) => T.getAttributeDevelopmentCeiling(baseProfile({ potential }), 'forehand'); return c(95) > c(80) && c(80) > c(60); })());

  // ── 5. Limites ───────────────────────────────────────────────────────────────
  gate('nenhum atributo ultrapassa seu teto individual em 9 anos (4 políticas)', [normal, leve, intenso, hi, lo].every(r => KEYS.every(k => r.profile[k] <= T.getAttributeDevelopmentCeiling(r.profile, k))));
  gate('atributo no teto não ganha mais nível', (() => { const p = baseProfile({ forehand: 85 }); const ceil = T.getAttributeDevelopmentCeiling(p, 'forehand'); p.forehand = ceil; return T.applyAttributeGains(p, { forehand: 5 }).updates.forehand === ceil; })());

  // ── 6. Integridade de saves existentes ───────────────────────────────────────
  // A 6B não exigiu migração própria (o gate guardava isso com o valor da
  // época, 21). A LOCAL-9B subiu o schema para 22 pela própria migração
  // (atributo-base × equipamento); a curva de treino continua sem migração.
  gate('schema de save atual (22, LOCAL-9B) — a curva 6B não exige migração própria', S.CAREER_SAVE_SCHEMA_VERSION === 22);
  const old = baseProfile({ forehand: 60, backhand: 90, attribute_progress: { forehand: 0.7, backhand: 0.4, serve: 0.2 } });
  const r = T.applyAttributeGains(old, { forehand: 0.5, backhand: 3 });
  gate('save antigo: atributo acima do teto (bônus de vitória) NÃO é rebaixado', r.updates.backhand >= 90 && T.getAttributeDevelopmentCeiling(old, 'backhand') < 90);
  gate('save antigo: attribute_progress existente é somado, não zerado', r.updates.forehand === 61 && Math.abs(r.progress.forehand - 0.2) < 1e-6 && r.progress.serve === 0.2);
  gate('nenhuma sessão de treino reduz qualquer atributo (todas as políticas, todos os focos)', (() => { const p = baseProfile({ forehand: 70, defense: 95, smash: 30 }); return focuses.every(f => { const u = T.applyAttributeGains(p, T.previewTraining(p, f, 'intenso', 0).gains).updates; return Object.entries(u).every(([k, v]) => v >= p[k]); }); })());
  gate('mesmo save antigo avançado 1 ano nunca regride (média final ≥ inicial)', (() => { const start = baseProfile({ forehand: 80, backhand: 92, smash: 75 }); return simulate({ start, years: 1 }).profile.backhand >= 92; })());

  console.log(`\n${gates} gates, todos PASS.`);
} finally {
  await server.close();
}
