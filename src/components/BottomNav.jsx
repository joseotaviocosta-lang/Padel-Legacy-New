import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { NAV_GROUPS, groupForPath } from '@/navigation/navigationConfig.js';
import { BottomSheet } from '@/components/design-system';
import { preloadRoute } from '@/lib/routeModules';
import { useRenderCounter } from '@/dev/performanceProbe.js';

// Paridade conceitual desktop/mobile (docs/NAVIGATION_ARCHITECTURE.md):
// os mesmos 6 grupos existem nos dois, só que "Gestão" fica agrupada dentro
// de "Mais" na barra inferior em vez de ocupar uma 6ª aba — 5 é o máximo
// recomendável para bottom nav, e nada fica inalcançável (ver MoreSheet abaixo).
const TAB_GROUP_IDS = ['home', 'career', 'competition', 'world'];
const tabGroups = TAB_GROUP_IDS.map((id) => NAV_GROUPS.find((group) => group.id === id));
const moreGroup = NAV_GROUPS.find((group) => group.id === 'more');
const managementGroup = NAV_GROUPS.find((group) => group.id === 'management');

function MoreSheet({ open, onClose }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Mais" description="Estatísticas, histórico, gestão e utilidades da carreira.">
      <div className="space-y-5">
        <section>
          <h3 className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">{moreGroup.label}</h3>
          <div className="grid grid-cols-2 gap-2">
            {moreGroup.items.map((item) => {
              const ItemIcon = item.icon;
              return (
                <NavLink key={item.to} to={item.to} onClick={onClose} className={({ isActive }) => `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-bold transition-colors ${isActive ? 'bg-primary/12 text-primary' : 'bg-secondary/45 text-muted-foreground hover:text-foreground'}`}>
                  <ItemIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </section>
        <section>
          <h3 className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">{managementGroup.label}</h3>
          <div className="grid grid-cols-2 gap-2">
            {managementGroup.items.map((item) => {
              const ItemIcon = item.icon;
              return (
                <NavLink key={item.to} to={item.to} onClick={onClose} className={({ isActive }) => `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-bold transition-colors ${isActive ? 'bg-primary/12 text-primary' : 'bg-secondary/45 text-muted-foreground hover:text-foreground'}`}>
                  <ItemIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </section>
      </div>
    </BottomSheet>
  );
}

export default function BottomNav({ hidden = false }) {
  useRenderCounter('BottomNav');
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const activeGroupId = groupForPath(location.pathname)?.id;
  const moreActive = activeGroupId === 'more' || activeGroupId === 'management';

  return (
    <>
      {/* M3.2 (docs/MOBILE_M3_2_ANDROID_UX_STABILITY.md, Problema E): oculta
          (sem desmontar) enquanto o teclado Android está aberto, para
          devolver a faixa inferior da tela ao formulário/onboarding em vez de
          competir com o teclado por espaço. */}
      <nav
        aria-label="Navegação rápida"
        aria-hidden={hidden}
        inert={hidden ? '' : undefined}
        className={`fixed inset-x-0 bottom-0 z-50 border-t border-primary/10 bg-card/92 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_40px_hsl(230_35%_2%/0.48)] backdrop-blur-xl transition-transform duration-200 md:hidden ${hidden ? 'translate-y-full' : 'translate-y-0'}`}
      >
        <div className="mx-auto grid h-[var(--pl-bottom-nav-h)] max-w-lg grid-cols-5 items-center px-1.5">
          {tabGroups.map((group) => (
            <NavLink
              key={group.id}
              to={group.to}
              onMouseEnter={() => preloadRoute(group.to)}
              onFocus={() => preloadRoute(group.to)}
              className="relative flex h-full items-center justify-center"
            >
              {({ isActive }) => (
                <div className={`relative flex min-w-[3.6rem] flex-col items-center justify-center gap-1 rounded-2xl px-2 py-1.5 transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground active:text-foreground'}`}>
                  {isActive && (
                    <motion.div
                      layoutId="bottomNavPill"
                      className="absolute inset-x-1 inset-y-1 rounded-2xl border border-primary/10 bg-primary/10"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    />
                  )}
                  <group.icon className={`relative h-5 w-5 transition-transform duration-200 ${isActive ? '-translate-y-0.5 scale-110' : ''}`} strokeWidth={isActive ? 2.5 : 2} />
                  <span className={`relative text-[9px] font-bold leading-none ${isActive ? 'opacity-100' : 'opacity-80'}`}>{group.label}</span>
                  {isActive && <span className="absolute bottom-0.5 h-0.5 w-4 rounded-full bg-primary" />}
                </div>
              )}
            </NavLink>
          ))}

          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className="relative flex h-full items-center justify-center"
          >
            <div className={`relative flex min-w-[3.6rem] flex-col items-center justify-center gap-1 rounded-2xl px-2 py-1.5 transition-colors ${moreActive ? 'text-primary' : 'text-muted-foreground active:text-foreground'}`}>
              {moreActive && (
                <motion.div
                  layoutId="bottomNavPill"
                  className="absolute inset-x-1 inset-y-1 rounded-2xl border border-primary/10 bg-primary/10"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                />
              )}
              <moreGroup.icon className={`relative h-5 w-5 transition-transform duration-200 ${moreActive ? '-translate-y-0.5 scale-110' : ''}`} strokeWidth={moreActive ? 2.5 : 2} />
              <span className={`relative text-[9px] font-bold leading-none ${moreActive ? 'opacity-100' : 'opacity-80'}`}>{moreGroup.label}</span>
              {moreActive && <span className="absolute bottom-0.5 h-0.5 w-4 rounded-full bg-primary" />}
            </div>
          </button>
        </div>
      </nav>

      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
