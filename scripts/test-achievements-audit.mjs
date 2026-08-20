// Fase 12 — auditoria estrutural do catálogo de conquistas
// (docs/ACHIEVEMENTS_2_0.md / docs/ACHIEVEMENTS_AUDIT_V2.md).
//
// Prova: ids únicos; todo trigger_type presentável tem uma entrada real em
// EVALUABLE_TRIGGER_TYPES ou está documentado como C/D/F na auditoria;
// categorias válidas; nenhum objetivo impossível (future_system) aparece
// como presentável; os 15 placeholders "secret_N" vazios estão arquivados;
// nenhuma duplicata óbvia (mesmo trigger_type + mesmo threshold + mesma
// categoria, sinal de conteúdo redundante não documentado).
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  const { ACHIEVEMENT_CATALOG, CATEGORY_META } = await server.ssrLoadModule('/src/lib/achievementsData.js');
  const { EVALUABLE_TRIGGER_TYPES, presentableAchievements } = await server.ssrLoadModule('/src/lib/achievementEngine.js');

  // Fase 13 (Parte 3/10): 180 = 175 (Fase 12) + 5 novos degraus de reach_rank
  // (Top 500/250/30/20/5 — a ladder de ranking pedida pelo briefing).
  gate('Catálogo tem 180 entradas (175 da Fase 12 + 5 novos degraus de reach_rank da Fase 13)', ACHIEVEMENT_CATALOG.length === 180);
  gate('Todo id é único', new Set(ACHIEVEMENT_CATALOG.map((a) => a.id)).size === ACHIEVEMENT_CATALOG.length);
  gate('Toda entrada tem trigger_type, threshold, category, difficulty', ACHIEVEMENT_CATALOG.every((a) => a.trigger_type && a.threshold > 0 && a.category && a.difficulty));
  gate('Toda categoria usada existe em CATEGORY_META ou é "secreto"/"lendário" (categorias já existentes)', ACHIEVEMENT_CATALOG.every((a) => CATEGORY_META[a.category] || ['secreto', 'lendário'].includes(a.category)));

  // ── Placeholders vazios: arquivados, nunca escondidos como "secreta legítima" ──
  const secretPlaceholders = ACHIEVEMENT_CATALOG.filter((a) => /^secret_\d+$/.test(a.trigger_type));
  gate('Existem exatamente 15 placeholders "secret_N" (achado da auditoria)', secretPlaceholders.length === 15);
  gate('Todos os 15 placeholders estão arquivados (is_active:false) — nunca apresentados como segredo real (Parte 28)', secretPlaceholders.every((a) => a.is_active === false));
  gate('Placeholders arquivados NÃO aparecem em presentableAchievements()', !presentableAchievements().some((a) => /^secret_\d+$/.test(a.trigger_type)));

  // ── future_system: nunca presentável ──
  const futureSystem = ACHIEVEMENT_CATALOG.filter((a) => a.future_system);
  // 5 = retire(1) + generations(2) + multi_generation_champ(1) +
  // all_achievements(1, "O Inatingível" — achado durante a revisão da UI:
  // tinha visibility:'secreto' mas nenhum trigger funcional, o que a
  // deixaria como "???" impossível de sempre — Parte 28).
  gate('Existem entradas future_system (retire/generations/multi_generation_champ/all_achievements)', futureSystem.length === 5);
  gate('Nenhuma entrada future_system aparece em presentableAchievements() (Parte 26)', !presentableAchievements().some((a) => a.future_system));
  gate('"O Inatingível" (all_achievements) está future_system, não "???" impossível (Parte 28)', ACHIEVEMENT_CATALOG.find((a) => a.trigger_type === 'all_achievements')?.future_system === true);

  // ── Nenhum objetivo "impossível" apresentado como normal ──
  const presentable = presentableAchievements();
  gate('presentableAchievements() exclui exatamente as 15 arquivadas + 5 future_system (180-20=160)', presentable.length === 160);
  for (const achievement of presentable) {
    gate(`"${achievement.name}" presentável não é future_system nem arquivada`, !achievement.future_system && achievement.is_active !== false);
  }

  // ── Cobertura funcional real ──
  const functional = presentable.filter((a) => EVALUABLE_TRIGGER_TYPES.has(a.trigger_type));
  // Fase 13 (Parte 10): +5 dos novos degraus de reach_rank, +5 de
  // own_rackets/own_shoes/own_apparel/own_tech/all_rarities (reclassificadas
  // de C pra A — o dado já existia em fetchInventoryStats). 90 (Fase 12) + 10 = 100.
  gate('Ao menos 95 conquistas presentáveis têm trigger funcional (correção real, não marginal — piso atualizado pela Fase 13)', functional.length >= 95);
  gate('own_rackets/own_shoes/own_apparel/own_tech/all_rarities agora são funcionais (Fase 13, Parte 10 — dado já existia)', ['own_rackets', 'own_shoes', 'own_apparel', 'own_tech', 'all_rarities'].every((t) => EVALUABLE_TRIGGER_TYPES.has(t)));
  gate('EVALUABLE_TRIGGER_TYPES não contém play_match/win_match (nomes antigos — renomeados, Parte 6/7)', !EVALUABLE_TRIGGER_TYPES.has('play_match') && !EVALUABLE_TRIGGER_TYPES.has('win_match'));
  gate('EVALUABLE_TRIGGER_TYPES contém play_official_match/win_official_match', EVALUABLE_TRIGGER_TYPES.has('play_official_match') && EVALUABLE_TRIGGER_TYPES.has('win_official_match'));

  // ── max_attribute: todo entry tem attribute_key derivado corretamente ──
  const maxAttr = ACHIEVEMENT_CATALOG.filter((a) => a.trigger_type === 'max_attribute');
  gate('As 10 conquistas max_attribute têm attribute_key derivado (nenhuma ambígua)', maxAttr.length === 10 && maxAttr.every((a) => a.attribute_key));
  gate('Os 10 attribute_key são todos distintos (10 atributos diferentes, não uma escada fake)', new Set(maxAttr.map((a) => a.attribute_key)).size === 10);

  // ── Duplicatas óbvias (mesmo trigger_type + threshold, achado a documentar) ──
  const seen = new Map();
  let duplicateGroups = 0;
  for (const a of presentable) {
    const key = `${a.trigger_type}:${a.threshold}`;
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(a.name);
  }
  for (const [key, names] of seen) {
    if (names.length > 1 && !key.startsWith('max_attribute:')) { duplicateGroups += 1; console.log(`  (info) mesmo trigger+threshold: ${key} → ${names.join(', ')}`); }
  }
  gate('Nenhum grupo de duplicata óbvia não documentada (mesmo trigger_type+threshold fora de max_attribute)', duplicateGroups === 0);

  // ── Documentação existe e é consistente ──
  const auditDoc = readFileSync('docs/ACHIEVEMENTS_AUDIT_V2.md', 'utf8');
  gate('docs/ACHIEVEMENTS_AUDIT_V2.md existe e documenta o estado pós-Fase-12 (175) e o addendum da Fase 13 (180)', (auditDoc.includes('175 entradas') || auditDoc.includes('(175 conquistas)')) && auditDoc.includes('Fase 13'));
  gate('docs/ACHIEVEMENTS_AUDIT_V2.md documenta os placeholders arquivados', auditDoc.includes('placeholders vazios') || auditDoc.includes('placeholder vazio arquivado'));

  console.log(`\n${gates} gates executados, todos PASS — Auditoria estrutural do catálogo de conquistas (Fase 12).`);
} finally {
  await server.close();
}
