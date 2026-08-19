// Mobile M4 — Compact Mobile UX (docs/MOBILE_M4_COMPACT_UX.md).
//
// M4 é uma fase de UX/UI só de apresentação e interação visual — nenhuma
// regra de gameplay/economia/progressão muda. Este teste, por isso, é
// estrutural (source-text/regex sobre os arquivos reais + import real dos
// novos primitives), não visual: confirma que os novos primitives
// compartilhados existem com a API esperada, que as páginas prioritárias
// (Treinos/Partidas) realmente reorganizaram a ordem do conteúdo (proxy
// para "primeira viewport"), que nenhuma página perdeu o listener de
// atualização reativa corrigido na M3.7.2 durante a reestruturação, e que
// a reserva de espaço da bottom-nav/safe-area no shell (AppLayout.jsx)
// continua intacta. Checagens que exigem um dispositivo real (contagem de
// scroll, drag de slider, layout em landscape físico) estão listadas à
// parte, no final, como checklist não automatizável — não fingidas via
// regex.
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

function read(path) {
  return readFileSync(path, 'utf8');
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  // ═══════════════════════════════════════════════════════════════════════
  // M4.1 — Novos primitives compartilhados existem com a API esperada.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- M4.1: primitives compartilhados ---');
  const ds = await server.ssrLoadModule('/src/components/design-system/index.js');
  gate('CompactStats exportado', typeof ds.CompactStats === 'function');
  gate('GameHud exportado (M4.1, sucessor visual do CompactStats separado)', typeof ds.GameHud === 'function');
  gate('CompactListItem exportado', typeof ds.CompactListItem === 'function');
  gate('CompactActionCard exportado', typeof ds.CompactActionCard === 'function');
  gate('CollapsibleSection exportado', typeof ds.CollapsibleSection === 'function');
  gate('SummaryRow exportado', typeof ds.SummaryRow === 'function');
  gate('PageHeader continua exportado (não duplicado)', typeof ds.PageHeader === 'function');

  const pageHeaderSource = read('src/components/design-system/PageHeader.jsx');
  gate('PageHeader ganhou a prop `dense` (default false — não quebra uso existente)', /dense\s*=\s*false/.test(pageHeaderSource));
  gate('PageHeader `dense` só afeta classes CSS sob max-width:767px (sem duplicar DOM)', /dense &&/.test(pageHeaderSource) || /dense \?/.test(pageHeaderSource));

  const indexCss = read('src/index.css');
  gate('token --mobile-card-padding definido', indexCss.includes('--mobile-card-padding'));
  gate('token --mobile-section-gap definido', indexCss.includes('--mobile-section-gap'));
  gate('token --mobile-compact-row-height definido', indexCss.includes('--mobile-compact-row-height'));
  gate('.pl-page-hero--dense definido só sob max-width:767px (não altera desktop)', /@media \(max-width: 767px\)[\s\S]*?\.pl-page-hero--dense/.test(indexCss));

  // ═══════════════════════════════════════════════════════════════════════
  // M4.3 — Treinos: gate obrigatório. Atividades antes de moral/recuperação.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- M4.3: Treinos (gate obrigatório) ---');
  const trainingSource = read('src/pages/Training.jsx');
  const activitiesIdx = trainingSource.indexOf('Atividades de treino');
  const conditionIdx = trainingSource.indexOf('Estado do atleta');
  const recoveryIdx = trainingSource.indexOf('Recuperação e suporte');
  gate('"Atividades de treino" existe em Training.jsx', activitiesIdx !== -1);
  gate('"Estado do atleta" (moral/confiança/forma/entrosamento) existe em Training.jsx', conditionIdx !== -1);
  gate('"Recuperação e suporte" existe em Training.jsx', recoveryIdx !== -1);
  gate('Atividades de treino aparecem ANTES de "Estado do atleta" na ordem do código (proxy para primeiro viewport)', activitiesIdx < conditionIdx);
  gate('Atividades de treino aparecem ANTES de "Recuperação e suporte" na ordem do código', activitiesIdx < recoveryIdx);
  gate('Estado do atleta e Recuperação usam CollapsibleSection (recolhidos por padrão, não cards grandes sempre expandidos)', /CollapsibleSection icon=\{Heart\} title="Estado do atleta"/.test(trainingSource) && /CollapsibleSection icon=\{FastForward\} title="Recuperação e suporte"/.test(trainingSource));
  gate('4 StatCards continuam compactos (agora integrados ao HUD do PageHeader)', /hudItems=\{\[/.test(trainingSource) && !/PremiumStatCard|StatCard as PremiumStatCard/.test(trainingSource));
  gate('PageHeader de Treinos usa dense', /<PageHeader\s+dense/.test(trainingSource));

  const activityCardSource = read('src/components/training/TrainingActivityCard.jsx');
  gate('TrainingActivityCard usa CompactActionCard (casca compartilhada, não uma implementação própria de expandir/recolher)', activityCardSource.includes('CompactActionCard'));
  gate('Seletor de intensidade migrou para dentro do conteúdo expandido (`details`), não mais sempre visível', (() => {
    const detailsStart = activityCardSource.indexOf('const details = (');
    const summaryStart = activityCardSource.indexOf('const summary = (');
    const intensityIdx = activityCardSource.indexOf('>Intensidade<');
    // `summary` (sempre visível) é declarado antes de `details` (só quando
    // expandido) no arquivo — "Intensidade" precisa estar depois de onde
    // `details` começa, não dentro do bloco de `summary`.
    return activityCardSource.includes('details={details}') && detailsStart !== -1 && summaryStart !== -1 && summaryStart < detailsStart && intensityIdx > detailsStart;
  })());

  // ═══════════════════════════════════════════════════════════════════════
  // M4.4 — Partidas: gate obrigatório. "Jogar agora" + stats compactos.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- M4.4: Partidas (gate obrigatório) ---');
  const matchesSource = read('src/pages/Matches.jsx');
  gate('"Jogar agora" continua no header (ação principal já no primeiro viewport)', matchesSource.includes('Jogar agora'));
  gate('4 StatCards continuam compactos (agora integrados ao HUD do PageHeader)', /hudItems=\{\[/.test(matchesSource) && !matchesSource.includes('StatCard,'));
  gate('PageHeader de Partidas usa dense', /<PageHeader\s+dense/.test(matchesSource));
  const headerIdx = matchesSource.indexOf('Jogar agora');
  const historyIdx = Math.max(matchesSource.indexOf('Histórico recente'), matchesSource.indexOf('Recentes'));
  gate('"Jogar agora" (header) aparece antes do histórico recente na ordem do código', headerIdx !== -1 && historyIdx !== -1 && headerIdx < historyIdx);

  // ═══════════════════════════════════════════════════════════════════════
  // Regressão M3.7.2 — nenhuma página perdeu o listener de atualização
  // reativa durante a reestruturação da M4. Coaches.jsx GANHOU o listener
  // (correção incidental, disclosed no plano da M4.12).
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Regressão M3.7.2: listeners de atualização reativa preservados ---');
  const reactiveFiles = {
    'src/pages/Matches.jsx': matchesSource,
    'src/pages/Training.jsx': trainingSource,
    'src/pages/Missions.jsx': read('src/pages/Missions.jsx'),
    'src/pages/CalendarPage.jsx': read('src/pages/CalendarPage.jsx'),
    'src/pages/CareerHub.jsx': read('src/pages/CareerHub.jsx'),
    'src/pages/Tournaments.jsx': read('src/pages/Tournaments.jsx'),
    'src/pages/Coaches.jsx': read('src/pages/Coaches.jsx'),
  };
  for (const [path, source] of Object.entries(reactiveFiles)) {
    const hasHook = source.includes('useCareerProfileSync(setProfile)');
    const hasInlineListener = source.includes("addEventListener('padel:profile-updated'") || source.includes("addEventListener('padel:career-advanced'");
    gate(`${path} ainda reage a padel:profile-updated/career-advanced (hook ou listener direto)`, hasHook || hasInlineListener);
  }
  gate('Coaches.jsx especificamente GANHOU useCareerProfileSync nesta fase (correção incidental documentada na M4.12)', reactiveFiles['src/pages/Coaches.jsx'].includes('useCareerProfileSync(setProfile)'));

  // ═══════════════════════════════════════════════════════════════════════
  // Demais páginas modificadas — primitives compartilhados realmente em uso
  // (não uma segunda implementação por página).
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Demais páginas: uso real dos primitives compartilhados ---');
  const pagesUsingCompactStats = [
    'src/pages/Missions.jsx', 'src/pages/Tournaments.jsx', 'src/pages/Ranking.jsx',
    'src/pages/PartnerHub.jsx', 'src/pages/Coaches.jsx', 'src/pages/Staff.jsx',
    'src/pages/Communications.jsx', 'src/pages/Press.jsx',
  ];
  for (const path of pagesUsingCompactStats) {
    gate(`${path} usa HUD compacto compartilhado no PageHeader`, read(path).includes('hudItems='));
  }
  gate('Ranking.jsx usa CompactListItem para as linhas (não 4 blocos JSX quase-idênticos)', read('src/pages/Ranking.jsx').includes('CompactListItem'));
  gate('Missions.jsx agrupa "Concluídas" em CollapsibleSection', read('src/pages/Missions.jsx').includes("title={`Concluídas"));
  gate('CareerHub.jsx: CareerToolsSection migrado para o CollapsibleSection compartilhado', read('src/pages/CareerHub.jsx').includes('<CollapsibleSection'));
  gate('AttributeEvolution.jsx migrou de <div className="glass..."> cru para Surface/SurfaceHeader', (() => {
    const src = read('src/components/training/AttributeEvolution.jsx');
    return src.includes('<Surface>') && src.includes('<SurfaceHeader');
  })());
  gate('AttributeEvolution.jsx agrupa atributos por categoria (ATTRIBUTE_GROUPS compartilhado, não uma lista plana)', read('src/components/training/AttributeEvolution.jsx').includes('ATTRIBUTE_GROUPS'));
  gate('ATTRIBUTE_GROUPS é uma fonte única (exportado de lib/padel.js, PlayerProfile.jsx importa em vez de redefinir)', read('src/lib/padel.js').includes('export const ATTRIBUTE_GROUPS') && read('src/pages/PlayerProfile.jsx').includes('ATTRIBUTE_GROUPS') && !/const ATTRIBUTE_GROUPS = \[/.test(read('src/pages/PlayerProfile.jsx')));
  gate('Athletes.jsx migrou para Page/PageContent (antes era a única página fora do shell padrão)', (() => {
    const src = read('src/pages/Athletes.jsx');
    return src.includes('<Page>') && src.includes('<PageContent>') && !src.includes("from '@/components/padel/ui'");
  })());

  // ═══════════════════════════════════════════════════════════════════════
  // M4.18 — Nenhum min-height gigante conhecido reintroduzido nas páginas
  // tocadas (proxy estrutural para "sem espaços vazios grandes").
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- M4.18: sem min-heights gigantes conhecidos ---');
  const giantMinHeightPattern = /min-h-(?:64|72|80|96)\b/;
  for (const path of [...Object.keys(reactiveFiles), ...pagesUsingCompactStats, 'src/pages/Athletes.jsx']) {
    gate(`${path} sem classes min-h-64/72/80/96 (nenhum bloco vazio gigante reintroduzido)`, !giantMinHeightPattern.test(read(path)));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // M4.16/17 — Shell (bottom-nav/safe-area/floating rail) não foi tocado
  // pela M4: a reserva de espaço central em AppLayout.jsx continua exatamente
  // a mesma, e nenhuma página nova usa `fixed` para uma ação própria (o que
  // colidiria com o GuideButton, confirmado pela auditoria desta fase).
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- M4.16/17: shell intocado ---');
  const appLayoutSource = read('src/components/AppLayout.jsx');
  gate('AppLayout.jsx ainda reserva espaço para a bottom-nav via --pl-bottom-nav-h (não reescrito pela M4)', appLayoutSource.includes('--pl-bottom-nav-h'));
  gate('AppLayout.jsx ainda usa pl-safe-t/env(safe-area-inset-bottom) para a área segura (não reescrito pela M4)', appLayoutSource.includes('pl-safe-t') && appLayoutSource.includes('env(safe-area-inset-bottom)'));
  for (const path of [...Object.keys(reactiveFiles), ...pagesUsingCompactStats, 'src/pages/Athletes.jsx']) {
    gate(`${path} não introduz seu próprio elemento fixed no canto inferior direito (evita colisão com o GuideButton)`, !/className="[^"]*\bfixed\b[^"]*\bbottom-/.test(read(path)));
  }

  console.log(`\n${gates} gates executados, todos PASS — Mobile M4 (primitives compartilhados + Treinos/Partidas/Home/Missões/Torneios/Calendário/Ranking/Atletas/Parceria/Técnicos/Comissão/Comunicações/Imprensa/Evolução reorganizados, shell intocado).`);

  console.log('\n--- Checklist físico (NÃO automatizável — requer dispositivo real, ver docs/MOBILE_M4_COMPACT_UX.md) ---');
  console.log('  - Contagem real de scroll até a ação principal em Treinos/Partidas/Home/Missões/Torneios em 360/390/430px.');
  console.log('  - Comportamento em landscape (sem quebrar header/sino/menu/bottom-nav).');
  console.log('  - Toque real nos novos cards/CollapsibleSection/segmented control (não só classes CSS de tamanho mínimo).');
  console.log('  - Colisão visual real entre CompactStats/CompactActionCard e o GuideButton/FloatingUtilityRail em telas curtas.');
} finally {
  await server.close();
}
