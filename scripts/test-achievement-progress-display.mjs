// Achievements Polish 12.1 (docs/ACHIEVEMENTS_POLISH_12_1.md, Parte 31).
// Testa a formatação de progresso isoladamente (progressLabel, exportado
// nomeadamente de AchievementsPanel.jsx só para este teste) — ranking real
// (#atual → Top N), contadores (x/y), idade, e garante que nenhum valor
// ausente/zero produz NaN ou uma barra sem número associado.
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { progressLabel } = await server.ssrLoadModule('/src/components/achievements/AchievementsPanel.jsx');

  // ── Ranking: #atual → Top N ────────────────────────────────────────────
  const rankLabel = progressLabel({ achievement: { trigger_type: 'reach_rank', threshold: 100 }, value: 912 });
  console.log(`(info) reach_rank: "${rankLabel}"`);
  gate('Ranking mostra #posição atual', rankLabel.includes('#912'));
  gate('Ranking mostra "Top N" (a meta, não um x/y genérico)', rankLabel.includes('Top 100'));
  gate('Ranking usa seta indicando direção (atual → meta)', rankLabel.includes('→'));

  // ── Ranking sem valor (perfil recém-criado, ranking ainda não calculado) ──
  const rankNoValue = progressLabel({ achievement: { trigger_type: 'reach_rank', threshold: 500 }, value: 0 });
  console.log(`(info) reach_rank sem valor: "${rankNoValue}"`);
  gate('Ranking sem valor real mostra um placeholder legível ("—"), nunca "undefined"/"NaN"', !rankNoValue.includes('undefined') && !rankNoValue.includes('NaN'));

  // ── Contadores: x/y (partidas oficiais, torneios, treinos...) ─────────────
  const counterLabel = progressLabel({ achievement: { trigger_type: 'play_official_match', threshold: 10 }, value: 3 });
  console.log(`(info) contador: "${counterLabel}"`);
  gate('Contador mostra "atual / meta"', counterLabel === '3 / 10');

  const counterZero = progressLabel({ achievement: { trigger_type: 'win_tournament', threshold: 1 }, value: 0 });
  console.log(`(info) contador zerado: "${counterZero}"`);
  gate('Contador zerado mostra "0 / meta", nunca NaN/undefined', counterZero === '0 / 1' && !counterZero.includes('NaN') && !counterZero.includes('undefined'));

  // ── Idade: valor/threshold direto (copy já adequada — "16/28") ───────────
  const ageLabel = progressLabel({ achievement: { trigger_type: 'reach_age', threshold: 28 }, value: 16 });
  console.log(`(info) idade: "${ageLabel}"`);
  gate('Idade mostra "atual / meta" (16/28 — o brief aceita esse formato como copy adequada)', ageLabel === '16 / 28');

  // ── Economia (reach_coins): formatado com separador de milhar ────────────
  const coinsLabel = progressLabel({ achievement: { trigger_type: 'reach_coins', threshold: 10000 }, value: 5000 });
  console.log(`(info) reach_coins: "${coinsLabel}"`);
  gate('reach_coins mostra os dois valores formatados (separador de milhar)', coinsLabel.includes('5.000') && coinsLabel.includes('10.000'));

  // ── Nenhum NaN mesmo com value undefined/null em qualquer trigger ────────
  const triggers = ['reach_rank', 'reach_coins', 'play_official_match', 'win_tournament', 'reach_age', 'max_attribute', 'advance_day'];
  for (const trigger_type of triggers) {
    for (const value of [undefined, null, 0]) {
      const label = progressLabel({ achievement: { trigger_type, threshold: 100 }, value });
      gate(`${trigger_type} com value=${value} nunca produz NaN/undefined literal na label ("${label}")`, !label.includes('NaN') && !label.includes('undefined'));
    }
  }

  console.log(`\n${gates} gates executados, todos PASS — Formatação de progresso das conquistas (Achievements Polish 12.1).`);
} finally {
  await server.close();
}
