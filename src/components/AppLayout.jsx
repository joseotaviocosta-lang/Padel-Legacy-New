import { careerManager } from '@/local/careerDataStore.js';
import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ChevronDown, Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import BottomNav from './BottomNav';
import LogoutButton from './LogoutButton';
import { motion, AnimatePresence } from 'framer-motion';
import { preloadRoute } from '@/lib/routeModules';
import OnboardingGuide from '@/components/onboarding/OnboardingGuide';
import { ALL_NAVIGATION_ITEMS, NAVIGATION_AREAS, areaForPath } from '@/navigation/navigationConfig.js';

const EXPANDED_AREA_KEY = 'padel:navigation-expanded-area';
const COLLAPSED_SIDEBAR_KEY = 'padel:sidebar-collapsed';

function NavigationAreas({ expandedArea, onExpandedAreaChange, compact = false, onNavigate }) {
  return NAVIGATION_AREAS.map((area) => {
    const AreaIcon = area.icon;
    const expanded = expandedArea === area.id;
    const contentId = `navigation-area-${area.id}`;
    return (
      <section key={area.id} className="mb-1">
        <div className={`flex items-center rounded-xl ${expanded ? 'bg-secondary/55' : ''}`}>
          <NavLink
            to={area.to}
            title={compact ? area.label : undefined}
            onClick={onNavigate}
            onMouseEnter={() => preloadRoute(area.to)}
            onFocus={() => preloadRoute(area.to)}
            className={({ isActive }) => `flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <AreaIcon className="h-5 w-5 shrink-0" />
            {!compact && <span className="truncate">{area.label}</span>}
          </NavLink>
          {!compact && (
            <button
              type="button"
              aria-label={`${expanded ? 'Recolher' : 'Expandir'} ${area.label}`}
              aria-expanded={expanded}
              aria-controls={contentId}
              onClick={() => onExpandedAreaChange(expanded ? '' : area.id)}
              className="mr-1 rounded-lg p-2 text-muted-foreground hover:bg-background/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
        {!compact && expanded && (
          <div id={contentId} className="ml-5 mt-1 space-y-0.5 border-l border-border/70 pl-2">
            {area.items.map((item) => {
              const ItemIcon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  onMouseEnter={() => preloadRoute(item.to)}
                  onFocus={() => preloadRoute(item.to)}
                  className={({ isActive }) => `flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${isActive ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'}`}
                >
                  <ItemIcon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        )}
      </section>
    );
  });
}

export default function AppLayout() {
  const location = useLocation();
  const activeArea = areaForPath(location.pathname);
  const currentItem = useMemo(() => ALL_NAVIGATION_ITEMS.find(item => item.to === location.pathname), [location.pathname]);
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

  return (
    <div className="min-h-screen bg-background">
      <header className="glass fixed inset-x-0 top-0 z-50 flex h-14 items-center border-b border-border/60 px-3 md:hidden">
        <button type="button" onClick={() => setMobileOpen(true)} aria-label="Abrir navegação" aria-expanded={mobileOpen} aria-controls="mobile-navigation-drawer" className="rounded-lg p-2 focus-visible:ring-2 focus-visible:ring-primary"><Menu className="h-5 w-5" /></button>
        <div className="mx-auto flex items-center gap-2 pr-9"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/90 text-sm font-black text-primary-foreground">P</span><span className="text-sm font-bold">{currentTitle}</span></div>
      </header>

      <AnimatePresence>
        {mobileOpen && <>
          <motion.button aria-label="Fechar navegação" className="fixed inset-0 z-[60] bg-black/55 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} />
          <motion.aside id="mobile-navigation-drawer" aria-label="Navegação principal" className="glass fixed inset-y-0 left-0 z-[70] flex w-[min(88vw,20rem)] flex-col border-r border-border md:hidden" initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', stiffness: 380, damping: 36 }}>
            <div className="flex h-16 items-center justify-between border-b border-border/50 px-4"><span className="font-heading font-black">PADEL <span className="text-primary">LEGACY</span></span><button type="button" aria-label="Fechar navegação" onClick={() => setMobileOpen(false)} className="rounded-lg p-2"><X className="h-5 w-5" /></button></div>
            <nav className="flex-1 overflow-y-auto p-3"><NavigationAreas expandedArea={expandedArea} onExpandedAreaChange={setExpandedArea} onNavigate={() => setMobileOpen(false)} /></nav>
            <div className="border-t border-border/50 p-3"><LogoutButton variant="sidebar" /></div>
          </motion.aside>
        </>}
      </AnimatePresence>

      <aside aria-label="Navegação principal" className={`glass fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border/60 transition-[width] duration-300 md:flex ${sidebarCollapsed ? 'w-20' : 'w-72'}`}>
        <div className={`flex h-20 items-center border-b border-border/40 ${sidebarCollapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
          <NavLink to="/game" className="flex items-center gap-2"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/90 text-lg font-black text-primary-foreground">P</span>{!sidebarCollapsed && <span><strong className="block font-heading text-lg leading-none">PADEL</strong><small className="font-bold tracking-[.25em] text-primary">LEGACY</small></span>}</NavLink>
          {!sidebarCollapsed && <button type="button" onClick={() => setSidebarCollapsed(true)} aria-label="Recolher barra lateral" className="rounded-lg p-2 text-muted-foreground hover:bg-secondary"><PanelLeftClose className="h-5 w-5" /></button>}
        </div>
        {sidebarCollapsed && <button type="button" onClick={() => setSidebarCollapsed(false)} aria-label="Expandir barra lateral" className="mx-auto mt-3 rounded-lg p-2 text-muted-foreground hover:bg-secondary"><PanelLeftOpen className="h-5 w-5" /></button>}
        <nav className="scrollbar-none flex-1 overflow-y-auto px-3 py-4"><NavigationAreas expandedArea={expandedArea} onExpandedAreaChange={setExpandedArea} compact={sidebarCollapsed} /></nav>
        <div className="border-t border-border/40 p-3">{!sidebarCollapsed && <LogoutButton variant="sidebar" />}</div>
      </aside>

      <main className={`${sidebarCollapsed ? 'md:pl-20' : 'md:pl-72'} min-h-screen pb-20 pt-14 transition-[padding] duration-300 md:pb-0 md:pt-0`}>
        <AnimatePresence mode="wait"><motion.div key={location.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}><OnboardingGuide /><Outlet /><button onClick={async () => { await careerManager.close(); window.location.href = '/'; }} className="fixed bottom-20 right-4 z-40 rounded-full border bg-card px-3 py-2 text-xs shadow-lg">Trocar carreira</button></motion.div></AnimatePresence>
      </main>
      <BottomNav />
    </div>
  );
}
