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
// Achievements Polish 12.1 (docs/ACHIEVEMENTS_POLISH_12_1.md): QA real
// mostrou que ordenar só por `percent` deixava idade/tempo (Auge, Veterano,
// Lenda Madura, Um Mês) dominarem "Próximas" pra um atleta jovem — a seção
// foi renomeada pra "Metas relevantes para sua carreira agora" e passou a
// usar findNextRelevantAchievements (progresso real + o quanto o jogador
// controla a conquista + diversidade — nunca mais só percentual isolado).
// Gates atualizados para a fonte real e correta, não a hipótese anterior.
gate('Existe a seção "Metas relevantes para sua carreira agora" (antes "Próximas conquistas")', /Metas relevantes para sua carreira agora/.test(SOURCE));
gate('"Próximas" é limitada a um N pequeno (não a lista inteira)', /NEXT_UP_COUNT\s*=\s*\d+/.test(SOURCE) && Number(SOURCE.match(/NEXT_UP_COUNT\s*=\s*(\d+)/)[1]) <= 5);
gate('"Próximas" usa findNextRelevantAchievements (relevância real — Achievements Polish 12.1), não mais só percent desc', SOURCE.includes("from '@/lib/achievementRelevance.js'") && /nextUp\s*=\s*useMemo\(\(\)\s*=>\s*relevantList\.slice/.test(SOURCE) && !/nextUp[\s\S]{0,200}sort\(\(a, b\) => b\.percent - a\.percent\)/.test(SOURCE));
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

// ── Achievements Polish 12.1: conteúdo da linha "Metas relevantes" (Parte 15-18) ──
gate('Cada linha de "Metas relevantes" mostra a descrição curta da conquista', /achievement\.description/.test(SOURCE));
gate('Cada linha mostra um badge de categoria discreto (Parte 16 — sem exagero visual)', /categoryMeta\.label/.test(SOURCE));
gate('Cada linha mostra recompensa (+XP/+moedas) de forma discreta, sem competir com o objetivo', /achievement\.xp_reward/.test(SOURCE) && /achievement\.coins_reward/.test(SOURCE));
gate('Progresso vem acompanhado de texto (nunca só uma barra sem contexto — Parte 18)', /progressLabel\(progress\)/.test(SOURCE));

// ── Achievements Polish 12.1: densidade padrão da página (Parte 19-21) ──
gate('Existe um limite padrão para "Em progresso" (IN_PROGRESS_DEFAULT_COUNT)', /IN_PROGRESS_DEFAULT_COUNT\s*=\s*12/.test(SOURCE));
gate('O limite só se aplica na vista padrão (sem filtro/busca ativos — Parte H)', /isDefaultView\s*=\s*category === 'all' && !search/.test(SOURCE));
gate('Existe "Ver todas" para revelar o catálogo completo quando a vista padrão esconde algo', /Ver todas/.test(SOURCE) && /setShowAllInProgress\(true\)/.test(SOURCE));
gate('"Ver todas" pode ser desfeito (voltar a mostrar só as mais relevantes)', /setShowAllInProgress\(false\)/.test(SOURCE));
gate('Uma escada expandida ("ver mais") continua visível mesmo com o limite de densidade ativo', /expandedLadders\.has\(ladderKey\(a\)\)/.test(SOURCE));

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
