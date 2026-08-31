import React from 'react';
import { Link } from 'react-router-dom';
import { BriefcaseBusiness, Building2 } from 'lucide-react';
import BetaTools from '@/components/system/BetaTools';
import { APP_ROUTES } from '@/navigation/routes.js';

// Polish 2.1 (docs/REDESIGN_POLISH_2_1.md, objetivo 12-15): o Polish 2 tinha
// consolidado Guia/Carreiras/Som/BETA num único gatilho + BottomSheet — o QA
// visual real rejeitou essa UX (uma ação que antes era 1 clique virou 2).
// Revertido para botões individuais, mas SEM voltar ao código antigo cego:
// as correções de posicionamento/colisão do M1.1 e do hotfix do sino do M2
// (offset derivado de --pl-header-h/--pl-safe-t, folga de 1.5rem, container
// pointer-events-none + botões pointer-events-auto) continuam aqui, agora
// protegendo os 3 botões utilitários preservados: BETA, Carreiras e (a
// partir desta alteração) Centro de Treinamento.
// Hotfix page chrome (docs/PAGE_CHROME_TUTORIAL_HOTFIX.md, item 6): o botão
// "Guia" saiu daqui — o Guia da carreira agora tem seu próprio botão
// flutuante verde no canto inferior direito (OnboardingGuide.jsx), no
// mesmo espaço que o antigo Assistente de carreira (removido) ocupava, em
// vez de dividir posição com BETA/Carreiras/Som aqui em cima.
// A central de atenção da carreira vive exclusivamente no sino do header.
// Mobile M3.5 (docs/MOBILE_M3_5_RENDER_STORM.md): memoizado porque vive no
// shell global (AppLayout) e antes re-renderizava a cada mudança de estado
// não relacionada do layout (header de perfil/ranking, sidebar, etc.) — sua
// única prop real (`onOpenCareers`) já é uma referência estável de módulo.
//
// UX — atalho do Centro de Treinamento: o antigo toggle de som (Volume2/
// VolumeX, estado local + loadUiSoundPreferences/saveUiSoundPreferences)
// era pouco usado nesta posição e ocupava o mesmo espaço nobre que os
// outros 2 atalhos. Removido SÓ o botão visual daqui — o sistema de áudio
// (uiSound.js), sua persistência e o controle equivalente em
// Configurações → Áudio (src/pages/Settings.jsx, que já tinha seu próprio
// estado e nunca dependeu deste componente) continuam 100% intactos. No
// mesmo lugar, um atalho direto para a página principal do Centro de
// Treinamento (APP_ROUTES.TRAINING_CENTER — a mesma rota/ícone
// (Building2) já usados pela navegação principal, navigationConfig.js),
// via <Link> do react-router-dom: troca só o componente renderizado pela
// rota, sem tocar em CareerProvider/activeCareerAdapter — carreira, perfil,
// data, fadiga, atributos e comissão técnica continuam exatamente como
// estavam. A rota já é pré-carregada em tempo ocioso por AppLayout.jsx
// (preloadRoutes com APP_ROUTES.TRAINING, que normaliza para o mesmo
// módulo) — nenhum preload novo foi necessário.
function FloatingUtilityRail({ onOpenCareers }) {
  return (
    <aside
      data-floating-utility-rail
      aria-label="Ferramentas auxiliares"
      className="pl-floating-utilities pointer-events-none fixed right-[max(0.75rem,env(safe-area-inset-right))] top-[calc(var(--pl-header-h)+var(--pl-safe-t)+1.5rem)] flex flex-col gap-2"
    >
      <div className="pointer-events-auto rounded-2xl border border-amber-400/20 bg-background/88 p-1 shadow-xl backdrop-blur-xl" title="Central BETA">
        <BetaTools compact />
      </div>
      <button
        type="button"
        onClick={onOpenCareers}
        aria-label="Gerenciar carreiras"
        title="Carreiras"
        className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-background/88 text-muted-foreground shadow-xl backdrop-blur-xl transition-colors hover:border-primary/30 hover:text-primary"
      >
        <BriefcaseBusiness className="h-4.5 w-4.5" />
      </button>
      <Link
        to={APP_ROUTES.TRAINING_CENTER}
        aria-label="Centro de treinamento"
        title="Centro de treinamento"
        className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-background/88 text-muted-foreground shadow-xl backdrop-blur-xl transition-colors hover:border-primary/30 hover:text-primary"
      >
        <Building2 className="h-4.5 w-4.5" />
      </Link>
    </aside>
  );
}

export default React.memo(FloatingUtilityRail);
