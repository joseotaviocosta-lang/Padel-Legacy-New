import { careerManager } from '@/local/careerDataStore.js';
import React, { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ChevronDown, Coins, Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import BottomNav from './BottomNav';
import { motion, AnimatePresence } from 'framer-motion';
import { preloadRoute, preloadRoutes } from '@/lib/routeModules';
import OnboardingGuide from '@/components/onboarding/OnboardingGuide';
import BetaAnalyticsTracker from '@/components/system/BetaAnalyticsTracker.jsx';
import CareerHud from '@/components/career/CareerHud';
import CommunicationBell from '@/components/communications/CommunicationBell';
import CareerHeaderContext from '@/components/career/CareerHeaderContext';
import CareerDayControl from '@/components/career/CareerDayControl';
import { NAV_GROUPS, groupForPath } from '@/navigation/navigationConfig.js';
import { useAdaptivePerformance } from '@/hooks/useAdaptivePerformance';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';
import { MotionPolicyProvider } from '@/components/design-system/MotionPolicy';
import { BrandMark } from '@/components/design-system/BrandMark';
import FeedbackSoundController from '@/components/system/FeedbackSoundController';
import BetaWelcome from '@/components/system/BetaWelcome.jsx';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile, getWorldRank } from '@/lib/padel';
import FloatingUtilityRail from '@/components/system/FloatingUtilityRail.jsx';
import { useOverlayBehavior } from '@/components/design-system/useOverlayBehavior';
import MobilePerformanceMonitor from '@/dev/MobilePerformanceMonitor.jsx';
import { recordAction, useRenderCounter, mark, measure } from '@/dev/performanceProbe.js';
import { formatCoinBalance } from '@/lib/numberFormat.js';
import { APP_ROUTES } from '@/navigation/routes.js';

const EXPANDED_GROUP_KEY = 'padel:navigation-expanded-area';
const COLLAPSED_SIDEBAR_KEY = 'padel:sidebar-collapsed';

// Grupos da nova arquitetura de navegação (docs/NAVIGATION_ARCHITECTURE.md).
// "Início" não tem itens (link direto, sem expandir). "Mais" não tem `to`
// (nenhuma rota própria) — funciona como alternador puro: no desktop expande
// inline; recolhida, o clique reabre a sidebar para que o grupo continue
// alcançável mesmo sem espaço para a lista de itens.
function NavigationGroups({ expandedGroup, onExpandedGroupChange, compact = false, onNavigate = undefined, onRequestExpandSidebar = undefined }) {
  return NAV_GROUPS.map((group) => {
    const GroupIcon = group.icon;
    const expandable = group.items.length > 0;
    const expanded = expandable && expandedGroup === group.id;
    const contentId = `navigation-group-${group.id}`;

    const iconBadge = (
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors ${expanded ? 'bg-primary/12 text-primary' : 'bg-secondary/55'}`}>
        <GroupIcon className="h-4.5 w-4.5" />
      </span>
    );
    const label = !compact && (
      <span className="min-w-0">
        <span className="block truncate leading-tight">{group.label}</span>
        <span className="mt-0.5 block truncate text-[10px] font-medium leading-tight text-muted-foreground/70">{group.description}</span>
      </span>
    );

    return (
      <section key={group.id} className="mb-1.5">
        <div className={`group flex items-center rounded-2xl border transition-colors ${expanded ? 'border-primary/10 bg-primary/[0.045]' : 'border-transparent hover:bg-secondary/45'}`}>
          {group.to ? (
            <NavLink
              to={group.to}
              title={compact ? `${group.label} — ${group.description}` : undefined}
              onClick={onNavigate}
              onMouseEnter={() => preloadRoute(group.to)}
              onFocus={() => preloadRoute(group.to)}
              className={({ isActive }) => `relative flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`}
            >
              {iconBadge}
              {label}
            </NavLink>
          ) : (
            <button
              type="button"
              title={compact ? `${group.label} — ${group.description}` : undefined}
              aria-expanded={expanded}
              aria-controls={contentId}
              onClick={() => (compact ? onRequestExpandSidebar?.(group.id) : onExpandedGroupChange(expanded ? '' : group.id))}
              className="relative flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-bold text-muted-foreground transition-colors group-hover:text-foreground"
            >
              {iconBadge}
              {label}
            </button>
          )}

          {!compact && expandable && group.to && (
            <button
              type="button"
              aria-label={`${expanded ? 'Recolher' : 'Expandir'} ${group.label}`}
              aria-expanded={expanded}
              aria-controls={contentId}
              onClick={() => onExpandedGroupChange(expanded ? '' : group.id)}
              className="mr-1.5 rounded-xl p-2 text-muted-foreground transition-colors hover:bg-background/55 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>

        {!compact && expanded && (
          <div id={contentId} className="relative ml-7 mt-1 space-y-0.5 border-l border-border/65 pl-3">
            {group.items.map((item) => {
              const ItemIcon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  onMouseEnter={() => preloadRoute(item.to)}
                  onFocus={() => preloadRoute(item.to)}
                  className={({ isActive }) => `group/item relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${isActive ? 'bg-primary/12 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.08)]' : 'text-muted-foreground hover:bg-secondary/55 hover:text-foreground'}`}
                >
                  <ItemIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        )}
      </section>
    );
  });
}

async function openCareerManager() {
  await careerManager.close();
  window.location.href = '/careers';
}

function useCareerHeaderData() {
  const [profile, setProfile] = useState(null);
  const [ranking, setRanking] = useState(null);

  // Mobile M3.5 (docs/MOBILE_M3_5_RENDER_STORM.md): antes disparava setProfile
  // (síncrono) e setRanking (dentro de um .then() assíncrono) em dois commits
  // separados — dois re-renders de AppLayout (e de tudo que não está
  // memoizado abaixo dele) por evento de perfil, em vez de um só. Aguardar
  // getWorldRank antes de gravar os dois estados deixa as duas atualizações
  // no mesmo "tick" de continuação da Promise, que o React já agrupa num
  // único commit.
  const applyProfile = useCallback(async (nextProfile) => {
    if (!nextProfile) return;
    const nextRanking = await getWorldRank(nextProfile).catch(() => null);
    setProfile(nextProfile);
    setRanking(nextRanking);
  }, []);

  const load = useCallback(async () => {
    try {
      const user = await localGame.auth.me();
      const nextProfile = await ensureMyProfile(user);
      applyProfile(nextProfile);
    } catch {
      // O cabeçalho é complementar e nunca deve impedir o carregamento da rota.
    }
  }, [applyProfile]);

  useEffect(() => {
    void load();
    // O avanço de um único dia publica padel:profile-updated duas vezes (fase
    // rápida + fase secundária em segundo plano). Um pequeno debounce evita
    // duas rodadas de auth.me()/getWorldRank para o mesmo clique.
    let pendingEvent = null;
    let timer = null;
    const flush = () => {
      timer = null;
      if (pendingEvent?.detail?.profile) applyProfile(pendingEvent.detail.profile);
      else void load();
      pendingEvent = null;
    };
    const refresh = (event) => {
      if (event?.detail?.source === 'player-adapter-balance' && event.detail.profile) {
        if (timer) clearTimeout(timer);
        timer = null;
        pendingEvent = null;
        void applyProfile(event.detail.profile);
        return;
      }
      pendingEvent = event;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, 150);
    };
    window.addEventListener('padel:profile-updated', refresh);
    window.addEventListener('padel:career-advanced', refresh);
    window.addEventListener('padel:onboarding-refresh', refresh);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('padel:profile-updated', refresh);
      window.removeEventListener('padel:career-advanced', refresh);
      window.removeEventListener('padel:onboarding-refresh', refresh);
    };
  }, [applyProfile, load]);

  return { profile, ranking, applyProfile };
}

export default function AppLayout() {
  useRenderCounter('AppLayout');
  const location = useLocation();
  const performanceProfile = useAdaptivePerformance();
  const keyboardOpen = useKeyboardInset();
  const activeGroup = groupForPath(location.pathname);
  const [expandedGroup, setExpandedGroup] = useState(() => localStorage.getItem(EXPANDED_GROUP_KEY) || activeGroup?.id || 'career');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem(COLLAPSED_SIDEBAR_KEY) === 'true');
  const [mobileOpen, setMobileOpen] = useState(false);
  const { profile: headerProfile, ranking: headerRanking } = useCareerHeaderData();
  // M2.1 (docs/MOBILE_M2_1_DEVICE_HOTFIX.md): este drawer sempre foi uma
  // implementação própria (motion.aside), nunca o DrawerShell do design
  // system — por isso o safe-area/Android-Back que o DrawerShell ganhou no
  // M1.1 nunca chegou aqui. Reaproveita o mesmo hook em vez de duplicar
  // scroll-lock/focus-trap/Back — sem migrar para o DrawerShell em si, que é
  // ancorado à direita e exigiria uma refatoração maior do componente
  // compartilhado só para este consumidor à esquerda.
  const { closeRef: mobileDrawerCloseRef, panelRef: mobileDrawerPanelRef } = useOverlayBehavior({
    open: mobileOpen,
    onClose: () => setMobileOpen(false),
  });

  useEffect(() => {
    if (activeGroup?.id) setExpandedGroup(activeGroup.id);
    setMobileOpen(false);
  }, [activeGroup?.id, location.pathname]);

  // M3.4 (docs/MOBILE_M3_4_DEVICE_PERFORMANCE.md, Parte 6): mede
  // tap → navigate() → primeira pintura útil da nova rota. Duplo rAF é a
  // aproximação padrão de "o navegador já pintou o commit anterior" sem
  // depender de uma API de paint timing que a WebView Android pode não
  // implementar. O vão atravessa dois rAF (não é uma chamada síncrona/
  // assíncrona só), por isso usa `recordAction` (duração já medida) em vez
  // de `profileAction` (que mede o tempo da própria chamada de fn()).
  useEffect(() => {
    const start = performance.now();
    // Mobile M3.5 (docs/MOBILE_M3_5_RENDER_STORM.md, item 8): o total já era
    // medido (recordAction abaixo, ativo no bundle release); estes marks
    // DEV-only dividem o mesmo vão em dois sub-trechos (até o commit do
    // frame anterior vs. até a pintura da nova rota), para não depender só
    // do total ao investigar onde o tempo é gasto — mark/measure já são
    // eliminados do bundle release (import.meta.env.DEV), então isto não
    // adiciona custo nenhum fora de `npm run dev`.
    mark('navigate:start');
    let raf1 = null;
    let raf2 = null;
    raf1 = requestAnimationFrame(() => {
      mark('navigate:raf1');
      measure('navigate: até commit do frame anterior', 'navigate:start', 'navigate:raf1');
      raf2 = requestAnimationFrame(() => {
        mark('navigate:raf2');
        measure('navigate: pintura da nova rota', 'navigate:raf1', 'navigate:raf2');
        recordAction('navigate-route', performance.now() - start, { to: location.pathname });
      });
    });
    return () => {
      if (raf1 != null) cancelAnimationFrame(raf1);
      if (raf2 != null) cancelAnimationFrame(raf2);
    };
  }, [location.pathname]);

  useEffect(() => { localStorage.setItem(EXPANDED_GROUP_KEY, expandedGroup); }, [expandedGroup]);
  useEffect(() => { localStorage.setItem(COLLAPSED_SIDEBAR_KEY, String(sidebarCollapsed)); }, [sidebarCollapsed]);

  useEffect(() => {
    if (!performanceProfile.allowRoutePreload) return undefined;
    const commonRoutes = performanceProfile.lowPower
      ? [APP_ROUTES.TRAINING]
      : [APP_ROUTES.TRAINING, APP_ROUTES.CALENDAR];
    const run = () => preloadRoutes(commonRoutes);
    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(run, { timeout: 3500 });
      return () => window.cancelIdleCallback?.(idleId);
    }
    const timerId = globalThis.setTimeout(run, 2500);
    return () => globalThis.clearTimeout(timerId);
  }, [performanceProfile.allowRoutePreload, performanceProfile.lowPower]);

  // Ícone "Mais" clicado com a sidebar recolhida: não há rota própria para
  // navegar direto, então reabre a sidebar já com o grupo expandido em vez
  // de deixar o clique sem efeito visível.
  const requestExpandSidebar = useCallback((groupId) => {
    setSidebarCollapsed(false);
    setExpandedGroup(groupId);
  }, []);

  return (
    <MotionPolicyProvider value={performanceProfile}>
    <div className="app-shell min-h-screen bg-background">
      <header className="pl-layer-header pl-safe-t fixed inset-x-0 top-0 flex h-[calc(var(--pl-header-h)+env(safe-area-inset-top))] items-center overflow-hidden border-b border-border/45 bg-background/95 pl-[calc(0.375rem+var(--pl-safe-l))] pr-[calc(0.375rem+var(--pl-safe-r))] md:hidden">
        <button type="button" onClick={() => setMobileOpen(true)} aria-label="Abrir navegação" aria-expanded={mobileOpen} aria-controls="mobile-navigation-drawer" className="pl-icon-tap rounded-xl p-2 transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary">
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 px-0.5 min-[390px]:px-1.5">
          {/* Hotfix hierarquia de páginas (docs/PAGE_HIERARCHY_ATHLETES_HOTFIX.md):
              este cabeçalho global não deve mais reimprimir o título da rota —
              cada página já tem seu próprio PageHeader (fonte única de
              identidade). Aqui só cabe contexto operacional. */}
          <CareerHeaderContext profile={headerProfile} compact />
        </div>
        <NavLink
          to={APP_ROUTES.ECONOMY}
          title="Abrir Economia"
          aria-label={`Abrir Economia. Saldo: ${formatCoinBalance(headerProfile?.coins)} moedas`}
          className="pl-icon-tap mr-0.5 inline-flex max-w-[4.8rem] shrink-0 items-center justify-center gap-1 overflow-hidden rounded-lg border border-premium/25 bg-premium/10 px-1 text-[9px] font-black tabular-nums text-premium transition-colors hover:bg-premium/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary min-[390px]:px-1.5 min-[390px]:text-[10px]"
        >
          <Coins className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 truncate">{formatCoinBalance(headerProfile?.coins)}</span>
        </NavLink>
        <CareerDayControl profile={headerProfile} compact />
        <CommunicationBell compact />
      </header>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.button aria-label="Fechar navegação" className="pl-layer-dropdown fixed inset-0 bg-black/60 backdrop-blur-[2px] md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} />
            <motion.aside ref={mobileDrawerPanelRef} id="mobile-navigation-drawer" role="dialog" aria-modal="true" aria-label="Navegação principal" className="glass pl-safe-t pl-safe-b fixed inset-y-0 left-0 z-[70] flex w-[min(88vw,20rem)] flex-col border-r border-border pl-[var(--pl-safe-l)] md:hidden" initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={performanceProfile.lowPower ? { duration: 0.16 } : { type: 'spring', stiffness: 380, damping: 36 }}>
              <div className="flex h-16 shrink-0 items-center justify-between border-b border-border/50 px-4">
                <NavLink to={APP_ROUTES.HOME} onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5">
                  <BrandMark size={36} className="shadow-[0_0_22px_hsl(var(--primary)/0.22)]" />
                  <span className="font-heading font-black">PADEL <span className="text-primary">LEGACY</span></span>
                </NavLink>
                <button ref={mobileDrawerCloseRef} type="button" aria-label="Fechar navegação" onClick={() => setMobileOpen(false)} className="pl-icon-tap rounded-xl p-2 hover:bg-secondary"><X className="h-5 w-5" /></button>
              </div>
              <nav className="scrollbar-premium flex-1 overflow-y-auto p-3"><NavigationGroups expandedGroup={expandedGroup} onExpandedGroupChange={setExpandedGroup} onNavigate={() => setMobileOpen(false)} /></nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <aside aria-label="Navegação principal" className={`glass fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border/60 transition-[width] duration-300 md:flex ${sidebarCollapsed ? 'w-[4.5rem]' : 'w-[16rem]'}`}>
        <div className={`flex h-20 items-center border-b border-border/40 ${sidebarCollapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
          <NavLink to={APP_ROUTES.HOME} className="flex min-w-0 items-center gap-2.5">
            <BrandMark size={40} className="shadow-[0_0_24px_hsl(var(--primary)/0.2)]" />
            {!sidebarCollapsed && <span className="min-w-0"><strong className="block truncate font-heading text-lg leading-none">PADEL</strong><small className="font-bold tracking-[.24em] text-primary">LEGACY</small></span>}
          </NavLink>
          {!sidebarCollapsed && <button type="button" onClick={() => setSidebarCollapsed(true)} aria-label="Recolher barra lateral" className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"><PanelLeftClose className="h-5 w-5" /></button>}
        </div>

        {sidebarCollapsed && <button type="button" onClick={() => setSidebarCollapsed(false)} aria-label="Expandir barra lateral" className="mx-auto mt-3 rounded-xl p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"><PanelLeftOpen className="h-5 w-5" /></button>}
        <nav className="scrollbar-none flex-1 overflow-y-auto px-2.5 py-4"><NavigationGroups expandedGroup={expandedGroup} onExpandedGroupChange={setExpandedGroup} compact={sidebarCollapsed} onRequestExpandSidebar={requestExpandSidebar} /></nav>
      </aside>

      <BetaAnalyticsTracker />
      <FeedbackSoundController />
      <BetaWelcome />
      <FloatingUtilityRail onOpenCareers={openCareerManager} />
      <MobilePerformanceMonitor />

      {/* M3.2 (docs/MOBILE_M3_2_ANDROID_UX_STABILITY.md, Problema D): a reserva
          inferior agora deriva de --pl-bottom-nav-h (mesmo token que
          BottomNav.jsx usa para sua própria altura) em vez de um "5.6rem"
          solto — qualquer mudança futura na altura da nav não pode mais
          descasar dos dois lugares. A folga sobre a altura real da nav subiu
          de 1.25rem para 1.75rem como margem de segurança extra. */}
      <main className={`${sidebarCollapsed ? 'md:pl-[4.5rem]' : 'md:pl-[16rem]'} min-h-screen overflow-x-hidden pb-[calc(var(--pl-bottom-nav-h)+env(safe-area-inset-bottom)+3.5rem)] pt-[calc(var(--pl-header-h)+env(safe-area-inset-top))] transition-[padding] duration-300 md:pb-0 md:pt-0`}>
        <div className="app-desktop-bar pl-layer-header pl-safe-t sticky top-0 hidden min-h-16 items-center gap-3 border-b border-border/50 bg-background/80 pl-[calc(1rem+var(--pl-safe-l))] pr-[calc(1rem+var(--pl-safe-r))] backdrop-blur-xl md:flex lg:pl-[calc(1.25rem+var(--pl-safe-l))] lg:pr-[calc(1.25rem+var(--pl-safe-r))]">
          {/* Hotfix hierarquia de páginas: idem ao cabeçalho mobile — sem
              reimprimir breadcrumb/título da rota aqui, só contexto
              operacional (a identidade da página já está no PageHeader). */}
          <div className="flex min-w-0 flex-1 items-center">
            <CareerHeaderContext profile={headerProfile} />
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 xl:flex-none">
            <CareerHud profile={headerProfile} ranking={headerRanking} compact className="min-w-0" />
            <CareerDayControl profile={headerProfile} />
            <CommunicationBell />
          </div>
        </div>

        <OnboardingGuide />
        {performanceProfile.allowDecorativeMotion ? (
          <motion.div key={location.pathname} className="app-route-stage design-system-page-host min-w-0 max-w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.08 }}>
            <Outlet />
          </motion.div>
        ) : (
          <div className="app-route-stage design-system-page-host min-w-0 max-w-full">
            <Outlet />
          </div>
        )}
      </main>

      <BottomNav hidden={keyboardOpen} />
    </div>
    </MotionPolicyProvider>
  );
}
