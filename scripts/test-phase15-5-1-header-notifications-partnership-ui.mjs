import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const read = (path) => readFileSync(path, 'utf8');
const failures = [];
let gates = 0;
function gate(label, condition) {
  gates += 1;
  if (!condition) failures.push(`${gates}. ${label}`);
}

const source = {
  layout: read('src/components/AppLayout.jsx'),
  headerContext: read('src/components/career/CareerHeaderContext.jsx'),
  dayControl: read('src/components/career/CareerDayControl.jsx'),
  bell: read('src/components/communications/CommunicationBell.jsx'),
  overlayHook: read('src/components/design-system/useOverlayBehavior.js'),
  overlayStack: read('src/components/design-system/overlayBackStack.js'),
  communications: read('src/pages/Communications.jsx'),
  inbox: read('src/components/partner/InboxPanel.jsx'),
  partnerHub: read('src/pages/PartnerHub.jsx'),
  partnerOverview: read('src/components/partner/PartnerOverview.jsx'),
  partnerLifecycle: read('src/game-core/partnerLifecycle.js'),
  destinations: read('src/lib/notificationDestinations.js'),
  numberFormat: read('src/lib/numberFormat.js'),
  css: read('src/index.css'),
};

const hotfixSources = [
  source.layout,
  source.bell,
  source.communications,
  source.inbox,
  source.partnerHub,
  source.partnerOverview,
  source.partnerLifecycle,
  source.destinations,
].join('\n');

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { APP_ROUTES } = await server.ssrLoadModule('/src/navigation/routes.js');
  const { formatCoinBalance } = await server.ssrLoadModule('/src/lib/numberFormat.js');
  const { resolveNotificationActionDestination, resolveNotificationDestination } = await server.ssrLoadModule('/src/lib/notificationDestinations.js');
  const { resolvePartnerOverall } = await server.ssrLoadModule('/src/components/partner/PartnerOverview.jsx');

  // Header financeiro e atualização reativa.
  gate('Header mostra o texto do saldo em qualquer largura', source.layout.includes('<span className="min-w-0 truncate">{formatCoinBalance(headerProfile?.coins)}</span>'));
  gate('Saldo usa o PlayerProfile já carregado pelo header', source.layout.includes('formatCoinBalance(headerProfile?.coins)'));
  gate('Saldo 5038 usa agrupamento pt-BR', formatCoinBalance(5038) === '5.038');
  gate('Saldo 15000 usa agrupamento pt-BR', formatCoinBalance(15000) === '15.000');
  gate('Saldo nunca exibe fração', formatCoinBalance(5038.4) === '5.038' && formatCoinBalance(5038.6) === '5.039');
  gate('Header reage ao evento profile-updated', source.layout.includes("addEventListener('padel:profile-updated', refresh)"));
  gate('Evento com perfil aplica o objeto em memória', source.layout.includes('pendingEvent?.detail?.profile') && source.layout.includes('applyProfile(pendingEvent.detail.profile)'));
  gate('Atalho financeiro usa rota canônica', source.layout.includes('to={APP_ROUTES.ECONOMY}') && APP_ROUTES.ECONOMY === '/game/economy');
  gate('Valor não volta a ficar hidden abaixo de 400px', !source.layout.includes('hidden truncate min-[400px]:inline'));

  // Drawer rápido do sino.
  gate('Sino abre drawer lateral de 88vw limitado a 380px', source.bell.includes('w-[min(88vw,380px)]'));
  gate('Painel não usa largura mobile full-screen', !source.bell.includes('w-full max-w-sm'));
  gate('Drawer continua em Portal', source.bell.includes('createPortal(') && source.bell.includes('document.body'));
  gate('Drawer monta somente quando aberto', source.bell.includes("const center = open && typeof document !== 'undefined'"));
  gate('Camada de notificação é 80', source.css.includes('--z-notification: 80'));
  gate('Drawer fica acima da BottomNav', source.css.includes('--z-bottom-nav: 55') && source.css.includes('--z-notification: 80'));
  gate('Drawer fica acima da FloatingUtilityRail', source.css.includes('--z-floating: 50') && source.css.includes('--z-notification: 80'));
  gate('Backdrop bloqueia e escurece o restante', source.bell.includes('absolute inset-0 cursor-default bg-black/65'));
  gate('Drawer possui scroll interno', source.bell.includes('data-notification-scroll') && source.bell.includes('overflow-y-auto'));
  gate('Body lock permanece declarado', source.bell.includes('data-scroll-lock="body"'));
  gate('Android Back usa o stack canônico', source.bell.includes('useOverlayBehavior') && source.overlayHook.includes('registerOverlay'));
  gate('Overlay stack remove primeiro o drawer superior', source.overlayStack.includes('stack.pop()'));
  gate('X fecha o drawer', source.bell.includes('aria-label="Fechar notificações"') && source.bell.includes('onClick={closeCenter}'));
  gate('Rodapé abre a Central completa', source.bell.includes('to={APP_ROUTES.COMMUNICATIONS}') && source.bell.includes('Abrir Central de Notificações'));
  gate('Deep-link comum continua resolvido pelo centralizador', resolveNotificationDestination({ notification_type: 'TRAINING' }).actionable);

  // Ação contratual e contexto da dupla.
  const futureAction = { id: 'talk_future', type: 'view_partnership', payload: { partnershipId: 'partnership-qa' } };
  const futureDestination = resolveNotificationActionDestination({ id: 'message-qa', message_type: 'partner_contract_expiry' }, futureAction);
  gate('Conversar sobre o futuro mantém action válida', source.partnerLifecycle.includes("id: 'talk_future'") && source.partnerLifecycle.includes("type: 'view_partnership'"));
  gate('Action usa resolvedor canônico compartilhado', source.communications.includes('resolveNotificationActionDestination(selected, action)'));
  gate('Action leva à parceria', futureDestination.route.startsWith(APP_ROUTES.PARTNERS));
  gate('Destino abre a aba Contrato', futureDestination.route.includes('view=contract'));
  gate('Destino carrega foco contract-future', futureDestination.route.includes('focus=contract-future'));
  gate('Destino preserva o id da parceria', futureDestination.route.includes('partnership=partnership-qa'));
  gate('PartnerHub consome o foco automaticamente', source.partnerHub.includes("focus === 'contract-future'") && source.partnerHub.includes('setShowConverse(true)'));
  gate('Visualizar contrato não resolve a pendência', source.inbox.includes("['view_partner_offer', 'view_partnership']") && source.communications.includes('if (destination.actionable)'));
  gate('Renovação/negociação existente continua ligada', source.partnerHub.includes('onRenew={handleRenewContract}') && source.partnerHub.includes('Confirmar novo contrato'));

  // OVR canônico e layout mobile robusto.
  gate('Card consulta AthleteProfile atual', source.partnerOverview.includes('athleteProfiles.get(partnership.partner_bot_id)'));
  gate('OVR principal lê overall_rating do AthleteProfile', resolvePartnerOverall({ overall_rating: 18 }, 77) === 18);
  gate('Fallback legado só ocorre sem AthleteProfile', resolvePartnerOverall(null, 77) === 77 && resolvePartnerOverall({}, 77) === '—');
  gate('OVR 9 permanece completo', resolvePartnerOverall({ overall_rating: 9 }, null) === 9);
  gate('OVR 10 não vira 1', resolvePartnerOverall({ overall_rating: 10 }, null) === 10);
  gate('OVR 18 permanece completo', resolvePartnerOverall({ overall_rating: 18 }, null) === 18);
  gate('OVR 99 permanece completo', resolvePartnerOverall({ overall_rating: 99 }, null) === 99);
  gate('OVR 100 permanece completo', resolvePartnerOverall({ overall_rating: 100 }, null) === 100);
  gate('Idade continua visível', source.partnerOverview.includes('${partnerAge} anos'));
  gate('Metadados foram divididos em duas linhas compactas', source.partnerOverview.includes('space-y-0.5 text-xs') && source.partnerOverview.includes('OVR {partnerOverall}'));
  gate('OVR isolado não encolhe nem quebra', source.partnerOverview.includes('shrink-0 whitespace-nowrap font-black tabular-nums'));
  gate('Linha inteira de metadados não força nowrap', !/partner_country[^\n]+whitespace-nowrap/.test(source.partnerOverview));

  // Auditoria rápida do header e invariantes de performance/escopo.
  gate('Menu preserva touch target global', source.layout.includes('aria-label="Abrir navegação"') && source.layout.includes('pl-icon-tap'));
  gate('Torneio preserva rota canônica e touch target', source.headerContext.includes('APP_ROUTES.TOURNAMENTS') && source.headerContext.includes('pl-icon-tap'));
  gate('Economia preserva touch target', /to=\{APP_ROUTES\.ECONOMY\}[\s\S]{0,500}pl-icon-tap/.test(source.layout));
  gate('Data preserva rota canônica e 44px', source.dayControl.includes('navigate(APP_ROUTES.CALENDAR)') && source.dayControl.includes('w-11 shrink-0'));
  gate('Avançar preserva coordenador e 44px', source.dayControl.includes('advanceCareerDayOnce(profile)') && source.dayControl.includes("'pl-btn-tap"));
  gate('Sino preserva touch target global', source.bell.includes('pl-icon-tap relative inline-flex'));
  gate('Header protege 360px com elementos encolhíveis', source.layout.includes('min-w-0 flex-1') && source.headerContext.includes('min-w-0'));
  gate('Header mantém safe-area lateral', source.layout.includes('var(--pl-safe-l)') && source.layout.includes('var(--pl-safe-r)'));
  gate('AppLayout continua instrumentado para render count', source.layout.includes("useRenderCounter('AppLayout')"));
  gate('CommunicationBell continua instrumentado para render count', source.bell.includes("useRenderCounter('CommunicationBell')"));
  gate('Hotfix não adiciona polling', !/setInterval\s*\(/.test(hotfixSources));
  gate('Hotfix não adiciona observer', !/MutationObserver|ResizeObserver|IntersectionObserver/.test(hotfixSources));
  gate('Saldo não lê storage no render', !/formatCoinBalance[\s\S]{0,120}(localStorage|sessionStorage|getItem\()/.test(source.layout));
  gate('Hotfix não altera save/schema', !/save_schema|format_version|schemaVersion|CareerMigration/.test(hotfixSources));
  gate('Hotfix não altera valores de economia', !/coins\s*[:=]\s*[^=]|economyMultiplier|rewardCoins/.test(source.bell + source.communications + source.partnerHub + source.partnerOverview + source.destinations));
  gate('Hotfix não altera progressão', !/xp\s*[:=]|level_up|attribute_gain/.test(hotfixSources));
  gate('Hotfix não altera RNG', !/Math\.random\s*\(|seededChance\s*\(/.test(source.layout + source.bell + source.communications + source.inbox + source.partnerHub + source.partnerOverview + source.destinations));
  gate('Persistência M3.7 não foi acoplada', !/GameStorage|flushQueue|commitDay|writeLocks/.test(hotfixSources));
  gate('Suíte possui pelo menos 30 gates', gates >= 30);

  if (failures.length) {
    failures.forEach((failure) => console.error(`FAIL — ${failure}`));
    assert.fail(`Fase 15.5.1 falhou: ${failures.length}/${gates} gate(s)`);
  }
  console.log(`test:phase15-5-1-header-notifications-partnership-ui OK — ${gates} gates`);
} finally {
  await server.close();
}
