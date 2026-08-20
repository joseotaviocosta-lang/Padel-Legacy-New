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
                <NavLink key={item.to} to={item.to} onClick={onClose} className={({ isActive }) => `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-bold transition-colors ${isActive ? 'bg-primary/15 text-primary' : 'bg-secondary/45 text-muted-foreground hover:text-foreground'}`}>
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
                <NavLink key={item.to} to={item.to} onClick={onClose} className={({ isActive }) => `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-bold transition-colors ${isActive ? 'bg-primary/15 text-primary' : 'bg-secondary/45 text-muted-foreground hover:text-foreground'}`}>
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

// Mobile M3.5 (docs/MOBILE_M3_5_RENDER_STORM.md): memoizado — vive no shell
// global e antes re-renderizava a cada mudança de estado do AppLayout sem
// relação com navegação (perfil/ranking do header, etc.). Sua única prop
// (`hidden`) só muda quando o teclado Android realmente abre/fecha.
function BottomNav({ hidden = false }) {
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
        className={`fixed inset-x-0 bottom-0 z-[var(--z-bottom-nav)] border-t border-primary/15 bg-background/98 backdrop-blur-sm pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_hsl(230_35%_2%/0.4)] transition-transform duration-150 md:hidden ${hidden ? 'translate-y-full' : 'translate-y-0'}`}
      >
        {/* M4.1.2 (docs/MOBILE_M4_1_2_VISUAL_POLISH.md, Parte A/3): separação
            leve entre o conteúdo da página e a barra — não é a opacidade que
            esconde o conteúdo (isso já é bg-background/98), só reforça a
            transição visual sem virar um bloco pesado. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-3 h-3 bg-gradient-to-t from-background/70 to-transparent" />
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
                <div className={`relative flex min-w-[3.45rem] flex-col items-center justify-center gap-0.5 px-1 py-1 transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground active:text-foreground'}`}>
                  {isActive && (
                    <motion.div
                      layoutId="bottomNavPill"
                      className="absolute inset-x-2 top-0.5 h-8 rounded-lg bg-primary/15"
                      transition={{ duration: 0.15, ease: 'easeOut' }}
                    />
                  )}
                  <group.icon className={`relative h-[1.35rem] w-[1.35rem] transition-transform duration-150 ${isActive ? '-translate-y-px scale-110' : ''}`} strokeWidth={isActive ? 2.6 : 2} />
                  <span className={`relative text-[8.5px] font-bold leading-none ${isActive ? 'opacity-100' : 'opacity-75'}`}>{group.label}</span>
                  {isActive && <span className="absolute -top-px h-0.5 w-5 rounded-full bg-primary" />}
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
            <div className={`relative flex min-w-[3.45rem] flex-col items-center justify-center gap-0.5 px-1 py-1 transition-colors ${moreActive ? 'text-primary' : 'text-muted-foreground active:text-foreground'}`}>
              {moreActive && (
                <motion.div
                  layoutId="bottomNavPill"
                  className="absolute inset-x-2 top-0.5 h-8 rounded-lg bg-primary/15"
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                />
              )}
              <moreGroup.icon className={`relative h-[1.35rem] w-[1.35rem] transition-transform duration-150 ${moreActive ? '-translate-y-px scale-110' : ''}`} strokeWidth={moreActive ? 2.6 : 2} />
              <span className={`relative text-[8.5px] font-bold leading-none ${moreActive ? 'opacity-100' : 'opacity-75'}`}>{moreGroup.label}</span>
              {moreActive && <span className="absolute -top-px h-0.5 w-5 rounded-full bg-primary" />}
            </div>
          </button>
        </div>
      </nav>

      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}

export default React.memo(BottomNav);
