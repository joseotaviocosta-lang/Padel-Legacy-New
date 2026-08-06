import { careerManager } from '@/local/careerDataStore.js';
import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BriefcaseBusiness, ChevronDown, Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import BottomNav from './BottomNav';
import LogoutButton from './LogoutButton';
import { motion, AnimatePresence } from 'framer-motion';
import { preloadRoute, preloadRoutes } from '@/lib/routeModules';
import OnboardingGuide from '@/components/onboarding/OnboardingGuide';
import BetaTools from '@/components/system/BetaTools';
import CareerHud from '@/components/career/CareerHud';
import CommunicationBell from '@/components/communications/CommunicationBell';
import CareerAssistant from '@/components/career/CareerAssistant';
import CareerHeaderContext from '@/components/career/CareerHeaderContext';
import { ALL_NAVIGATION_ITEMS, NAVIGATION_AREAS, areaForPath } from '@/navigation/navigationConfig.js';
import { useAdaptivePerformance } from '@/hooks/useAdaptivePerformance';
import FeedbackSoundController from '@/components/system/FeedbackSoundController';

const EXPANDED_AREA_KEY = 'padel:navigation-expanded-area';
const COLLAPSED_SIDEBAR_KEY = 'padel:sidebar-collapsed';

function NavigationAreas({ expandedArea, onExpandedAreaChange, compact = false, onNavigate }) {
  return NAVIGATION_AREAS.map((area) => {
    const AreaIcon = area.icon;
    const expanded = expandedArea === area.id;
    const contentId = `navigation-area-${area.id}`;

    return (
      <section key={area.id} className="mb-1.5">
        <div className={`group flex items-center rounded-2xl border transition-colors ${expanded ? 'border-primary/10 bg-primary/[0.045]' : 'border-transparent hover:bg-secondary/45'}`}>
          <NavLink
            to={area.to}
            title={compact ? `${area.label} — ${area.description}` : undefined}
            onClick={onNavigate}
            onMouseEnter={() => preloadRoute(area.to)}
            onFocus={() => preloadRoute(area.to)}
            className={({ isActive }) => `relative flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`}
          >
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors ${expanded ? 'bg-primary/12 text-primary' : 'bg-secondary/55'}`}>
              <AreaIcon className="h-4.5 w-4.5" />
            </span>
            {!compact && (
              <span className="min-w-0">
                <span className="block truncate leading-tight">{area.label}</span>
                <span className="mt-0.5 block truncate text-[10px] font-medium leading-tight text-muted-foreground/70">{area.description}</span>
              </span>
            )}
          </NavLink>

          {!compact && (
            <button
              type="button"
              aria-label={`${expanded ? 'Recolher' : 'Expandir'} ${area.label}`}
              aria-expanded={expanded}
              aria-controls={contentId}
              onClick={() => onExpandedAreaChange(expanded ? '' : area.id)}
              className="mr-1.5 rounded-xl p-2 text-muted-foreground transition-colors hover:bg-background/55 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>

        {!compact && expanded && (
          <div id={contentId} className="relative ml-7 mt-1 space-y-0.5 border-l border-border/65 pl-3">
            {area.items.map((item) => {
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

export default function AppLayout() {
  const location = useLocation();
  const performanceProfile = useAdaptivePerformance();
  const activeArea = areaForPath(location.pathname);
  const currentItem = useMemo(
    () => ALL_NAVIGATION_ITEMS.find(item => item.to === location.pathname),
    [location.pathname],
  );
  const currentTitle = currentItem?.label || activeArea?.label || 'Padel Legacy';
  const [expandedArea, setExpandedArea] = useState(() => localStorage.getItem(EXPANDED_AREA_KEY) || activeArea?.id || 'career');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem(COLLAPSED_SIDEBAR_KEY) === 'true');
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (activeArea?.id) setExpandedArea(activeArea.id);
    setMobileOpen(false);
  }, [activeArea?.id, location.pathname]);

  useEffect(() => { localStorage.setItem(EXPANDED_AREA_KEY, expandedArea); }, [expandedArea]);
  useEffect(() => { localStorage.setItem(COLLAPSED_SIDEBAR_KEY, String(sidebarCollapsed)); }, [sidebarCollapsed]);

  useEffect(() => {
    if (!performanceProfile.allowRoutePreload) return undefined;
    const commonRoutes = performanceProfile.lowPower
      ? ['/game/training', '/game/calendar']
      : ['/game/training', '/game/calendar', '/tournaments', '/ranking', '/partners'];
    const run = () => preloadRoutes(commonRoutes);
    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(run, { timeout: 1800 });
      return () => window.cancelIdleCallback?.(idleId);
    }
    const timerId = window.setTimeout(run, 900);
    return () => window.clearTimeout(timerId);
  }, [performanceProfile.allowRoutePreload, performanceProfile.lowPower]);

  return (
    <div className="app-shell min-h-screen bg-background">
      <header className="glass fixed inset-x-0 top-0 z-50 flex h-14 items-center border-b border-border/60 px-3 md:hidden">
        <button type="button" onClick={() => setMobileOpen(true)} aria-label="Abrir navegação" aria-expanded={mobileOpen} aria-controls="mobile-navigation-drawer" className="rounded-xl p-2 transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary">
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 px-3">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.16em] text-primary/80">{activeArea?.label || 'Carreira'}</p>
          <p className="truncate text-sm font-extrabold leading-tight">{currentTitle}</p>
        </div>
        <CareerHeaderContext compact />
        <CareerHud compact className="mr-1 hidden min-[430px]:flex" />
        <CommunicationBell compact />
        <button type="button" onClick={openCareerManager} aria-label="Gerenciar carreiras" className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
          <BriefcaseBusiness className="h-5 w-5" />
        </button>
        <BetaTools compact />
      </header>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.button aria-label="Fechar navegação" className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-[2px] md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} />
            <motion.aside id="mobile-navigation-drawer" aria-label="Navegação principal" className="glass fixed inset-y-0 left-0 z-[70] flex w-[min(88vw,20rem)] flex-col border-r border-border md:hidden" initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={performanceProfile.lowPower ? { duration: 0.16 } : { type: 'spring', stiffness: 380, damping: 36 }}>
              <div className="flex h-16 items-center justify-between border-b border-border/50 px-4">
                <NavLink to="/game" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-base font-black text-primary-foreground shadow-[0_0_22px_hsl(var(--primary)/0.22)]">P</span>
                  <span className="font-heading font-black">PADEL <span className="text-primary">LEGACY</span></span>
                </NavLink>
                <button type="button" aria-label="Fechar navegação" onClick={() => setMobileOpen(false)} className="rounded-xl p-2 hover:bg-secondary"><X className="h-5 w-5" /></button>
              </div>
              <nav className="scrollbar-premium flex-1 overflow-y-auto p-3"><NavigationAreas expandedArea={expandedArea} onExpandedAreaChange={setExpandedArea} onNavigate={() => setMobileOpen(false)} /></nav>
              <div className="space-y-2 border-t border-border/50 p-3">
                <button type="button" onClick={openCareerManager} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                  <BriefcaseBusiness className="h-4.5 w-4.5" /> Gerenciar carreiras
                </button>
                <LogoutButton variant="sidebar" />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <aside aria-label="Navegação principal" className={`glass fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border/60 transition-[width] duration-300 md:flex ${sidebarCollapsed ? 'w-[4.5rem]' : 'w-[17rem]'}`}>
        <div className={`flex h-20 items-center border-b border-border/40 ${sidebarCollapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
          <NavLink to="/game" className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-lg font-black text-primary-foreground shadow-[0_0_24px_hsl(var(--primary)/0.2)]">P</span>
            {!sidebarCollapsed && <span className="min-w-0"><strong className="block truncate font-heading text-lg leading-none">PADEL</strong><small className="font-bold tracking-[.24em] text-primary">LEGACY</small></span>}
          </NavLink>
          {!sidebarCollapsed && <button type="button" onClick={() => setSidebarCollapsed(true)} aria-label="Recolher barra lateral" className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"><PanelLeftClose className="h-5 w-5" /></button>}
        </div>

        {sidebarCollapsed && <button type="button" onClick={() => setSidebarCollapsed(false)} aria-label="Expandir barra lateral" className="mx-auto mt-3 rounded-xl p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"><PanelLeftOpen className="h-5 w-5" /></button>}
        <nav className="scrollbar-none flex-1 overflow-y-auto px-2.5 py-4"><NavigationAreas expandedArea={expandedArea} onExpandedAreaChange={setExpandedArea} compact={sidebarCollapsed} /></nav>
        <div className="space-y-1 border-t border-border/40 p-2.5">
          {!sidebarCollapsed && (
            <button type="button" onClick={openCareerManager} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
              <BriefcaseBusiness className="h-4.5 w-4.5" /> Gerenciar carreiras
            </button>
          )}
          {!sidebarCollapsed && <LogoutButton variant="sidebar" />}
        </div>
      </aside>

      <FeedbackSoundController />

      <main className={`${sidebarCollapsed ? 'md:pl-[4.5rem]' : 'md:pl-[17rem]'} min-h-screen overflow-x-hidden pb-[calc(5.6rem+env(safe-area-inset-bottom))] pt-14 transition-[padding] duration-300 md:pb-0 md:pt-0`}>
        <div className="app-desktop-bar sticky top-0 z-30 hidden h-16 items-center justify-between border-b border-border/50 bg-background/80 px-5 backdrop-blur-xl md:flex lg:px-7">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              <span>{activeArea?.label || 'Carreira'}</span><span className="text-border">/</span><span className="truncate text-primary/85">{currentTitle}</span>
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-3"><p className="truncate text-lg font-black leading-tight">{currentTitle}</p><CareerHeaderContext /></div>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <CareerHud className="hidden xl:flex" />
            <CommunicationBell />
            <BetaTools />
            <button type="button" onClick={openCareerManager} className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-card/70 px-3 py-2 text-xs font-bold text-muted-foreground transition-colors hover:border-primary/25 hover:text-foreground">
              <BriefcaseBusiness className="h-4 w-4" /> Carreiras
            </button>
          </div>
        </div>

        {performanceProfile.allowDecorativeMotion ? (
          <AnimatePresence mode="wait">
            <motion.div key={location.pathname} className="app-route-stage design-system-page-host min-w-0 max-w-full" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}>
              <OnboardingGuide />
              <CareerAssistant />
              <Outlet />
            </motion.div>
          </AnimatePresence>
        ) : (
          <div key={location.pathname} className="app-route-stage design-system-page-host min-w-0 max-w-full">
            <OnboardingGuide />
            <CareerAssistant />
            <Outlet />
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
