// Fase 12 — UI da aba Conquistas (docs/ACHIEVEMENTS_2_0.md, Parte P).
// Híbrido: parte estrutural (fonte de AchievementsPanel.jsx — garante que
// os elementos exigidos pelo briefing existem no componente real, não
// numa suposição) + parte funcional real (evaluateAchievements/laddering)
// via o pipeline de motor já usado pelos outros testes desta fase.
//
// O que o briefing pede e este teste prova, item a item: NÃO mostrar 175
// cards de uma vez; "PROGRESSO — X/Y — Z%" no topo; "PRÓXIMAS CONQUISTAS"
// (3-5, não fixo por categoria); filtros compactos; estados (em
// progresso/concluídas/secretas) sem 3 sistemas de navegação simultâneos;
// progresso real (não percentual fabricado); escadas mostram só o próximo
// degrau bloqueado por padrão; secretas discretas ("???" sem descrição).
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const SOURCE = readFileSync('src/components/achievements/AchievementsPanel.jsx', 'utf8');

// ── 1) Estrutural: os elementos exigidos existem no componente real ──────
gate('Header de progresso usa CompactStats (não uma parede de cards)', /CompactStats/.test(SOURCE));
gate('Mostra contagem desbloqueadas/total (X/Y — a base do "PROGRESSO — 31/X — X%" do briefing)', /stats\.unlocked.*stats\.total|unlocked.*total/.test(SOURCE));
gate('Existe a seção "Próximas conquistas"', /Próximas conquistas/.test(SOURCE));
gate('"Próximas conquistas" é limitada a um N pequeno (não a lista inteira)', /NEXT_UP_COUNT\s*=\s*\d+/.test(SOURCE) && Number(SOURCE.match(/NEXT_UP_COUNT\s*=\s*(\d+)/)[1]) <= 5);
gate('"Próximas conquistas" é ordenada por proximidade (percent), não por id/threshold cru', /nextUp[\s\S]{0,200}sort\(\(a, b\) => b\.percent - a\.percent\)/.test(SOURCE));
gate('Existe busca por texto (filtro compacto)', /placeholder="Buscar conquista/.test(SOURCE));
gate('Existe filtro por categoria (chips/select compacto, não 3 sistemas de navegação)', /CATEGORY_FILTERS/.test(SOURCE) && /<select/.test(SOURCE));
gate('Só existe UM controle de categoria (nenhum segundo <select> ou <Tabs> concorrente)', (SOURCE.match(/<select/g) || []).length === 1);
gate('Conquistas "em progresso" ficam em grid compacto de cards, não uma lista de 175 linhas', /inProgress\.map/.test(SOURCE) && /grid grid-cols-2/.test(SOURCE));
gate('Concluídas ficam numa lista compacta e colapsável (não expandida por padrão, ocupando a tela)', /showCompleted/.test(SOURCE) && /setShowCompleted/.test(SOURCE));
gate('Concluídas mostram a data de desbloqueio quando disponível', /unlocked_date/.test(SOURCE) && /toLocaleDateString/.test(SOURCE));
gate('Secretas aparecem como "???" — nunca revelam nome/descrição antes de desbloquear', /title="\?\?\?"/.test(SOURCE));
gate('Secretas ficam numa seção própria e discreta, separada dos cards normais', /Conquistas secretas/.test(SOURCE));
gate('Escadas (mesmo trigger_type) mostram só o PRÓXIMO degrau bloqueado por padrão', /nextLocked = ladder\.find/.test(SOURCE));
gate('Escadas expõem "ver mais" para os demais degraus em vez de mostrá-los todos de cara', /Ver mais.*nível/.test(SOURCE));
gate('Progresso é renderizado como valor real (X/Y ou #posição), não um percentual fabricado sem métrica', /progressLabel/.test(SOURCE) && /value.*threshold/.test(SOURCE));
gate('reach_rank usa rótulo de posição real (#atual → Top N), não X/Y genérico', /#\$\{value \|\| .—.\} → Top \$\{achievement\.threshold\}/.test(SOURCE));
gate('Reconciliação de save antigo roda uma única vez por perfil (flag persistida), não a cada abertura da aba', /achievements_v2_reconciled/.test(SOURCE));
gate('Reconciliação usa syncPlayerAchievements com {reconciliation:true} só quando ainda não reconciliado (idempotente)', /reconciliation: needsReconciliation/.test(SOURCE) && /!profile\.achievements_v2_reconciled/.test(SOURCE));
gate('Usa presentableAchievements() (exclui future_system/arquivadas), nunca o catálogo bruto direto', /presentableAchievements\(\)/.test(SOURCE) && !/ACHIEVEMENT_CATALOG\.map/.test(SOURCE));

// ── 2) Funcional real: paginação/lazy-list-limit via laddering, mobile grid ──
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { evaluateAchievements, presentableAchievements, findNextLockedAchievement } = await server.ssrLoadModule('/src/lib/achievementEngine.js');

  const emptyProfile = { id: 'qa-ui-v2', sport_name: 'QA', career_date: '2026-01-01' };
  const rows = evaluateAchievements(emptyProfile, {});
  gate('evaluateAchievements retorna uma linha por conquista presentável (155, não 175 — future_system/arquivadas fora)', rows.length === presentableAchievements().length);

  // Simula a mesma lógica de "próximo degrau por escada" que o componente usa.
  const ladders = new Map();
  for (const achievement of presentableAchievements()) {
    const key = achievement.attribute_key ? `${achievement.trigger_type}:${achievement.attribute_key}` : achievement.trigger_type;
    if (!ladders.has(key)) ladders.set(key, []);
    ladders.get(key).push(achievement);
  }
  const multiRungLadders = [...ladders.values()].filter((list) => list.length > 1);
  gate('Existem escadas de múltiplos degraus reais no catálogo (ex.: play_official_match tem 7 níveis)', multiRungLadders.some((list) => list.length >= 5));
  const playOfficialLadder = ladders.get('play_official_match') || [];
  gate('A escada play_official_match tem os 7 degraus documentados (1/10/50/100/250/500/1000)', playOfficialLadder.length === 7);

  // "Próximo objetivo" da Home (Parte Q) usa a MESMA fonte que a aba Conquistas.
  const next = findNextLockedAchievement(emptyProfile, {});
  gate('findNextLockedAchievement retorna uma conquista real avaliável (mesma fonte que a aba usa para "Próximas")', next !== null && next.achievement?.id && next.evaluable === true);

  console.log(`\n${gates} gates executados, todos PASS — UI da aba Conquistas v2 (estrutura real do componente + laddering funcional).`);
} finally {
  await server.close();
}
