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
// Playthrough 5.20-B, Partes AB/AP — A BARRA COBRIA CONTEUDO NO MOBILE.
//
// Medido com screenshot em 360/390: a barra, fixa no topo direito, cortava o
// titulo da pagina ("Construa sua proxima dup...") e a linha de status da Home
// ("1/50 nivel"), e a bolha de ajuda cobria o CTA primario. A Parte AP lista
// sobreposicao e CTA fora da tela como falha de gate.
//
// Duas mudancas, nenhuma de gameplay:
//  1. no mobile a barra desce para junto do rodape (acima do BottomNav), onde
//     nao disputa espaco com titulo nem com acao principal; no desktop
//     (md:) ela volta ao topo, como era;
//  2. os atalhos "Gerenciar carreiras" e "Centro de treinamento" somem no
//     mobile: ambos sao redundantes com a navegacao consolidada da 5.20-A
//     (Centro de treinamento virou aba em Carreira > Treinos e equipamentos),
//     e a Parte AB manda remover atalho redundante. A Central BETA fica,
//     porque e o caminho de reportar bug durante o playtest.
//
// No mobile a barra vai para o canto inferior ESQUERDO. A primeira tentativa
// a colocou no canto direito, onde a bolha de ajuda (OnboardingGuide) ja e
// fixa — as duas se sobrepuseram, e a Central BETA sumiu atras da bolha. O
// lado esquerdo esta livre em todas as telas auditadas.
//
// Playthrough 5.24-C — OS DOIS ATALHOS VOLTAM A SER VISÍVEIS NO MOBILE.
//
// Decisão de produto após o playtest em APK: o acesso pelo drawer ☰ (5.24-B)
// funciona, mas 1 toque visível era mais prático. O `hidden md:flex` da
// 5.20-B saiu; o motivo dele (barra cobrindo título/CTA no topo) continua
// resolvido porque a rail segue no rodapé esquerdo. No mobile ela vira uma
// LINHA (flex-row): 46px de altura com 0.5rem de folga cabem dentro dos
// 3.5rem que a <main> já reserva acima do BottomNav, então no fim da
// rolagem nenhum conteúdo fica embaixo dela. Do lado oposto ao Floating
// Guide (direita), sem formar coluna com ele. No desktop (md:) nada muda.
// O "Acesso rápido" do drawer permanece como fallback.
//
// Playthrough 5.25 — NOVA DISPOSIÇÃO NO MOBILE (decisão de UX do playtest):
//  - canto inferior esquerdo: SÓ "Gerenciar carreiras";
//  - direita, logo abaixo do header, alinhado ao botão Avançar:
//    "Centro de treinamento" (fora do header — ele continua em 2 faixas);
//  - BETA sai da superfície flutuante; a Central de testes é aberta pelo
//    item "Beta testers" do menu ☰ (AppLayout controla `betaOpen`). A
//    instância continua aqui, montada uma vez, só com o gatilho oculto no
//    mobile — dentro do drawer o modal morreria junto com ele.
// No mobile a <aside> é `display: contents` e cada atalho se posiciona
// sozinho (com a própria camada pl-floating-utilities). No desktop (md:) a
// coluna do topo direito continua igual: BETA, Carreiras, Centro.
const SHORTCUT_CLASS = 'pointer-events-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-background/88 text-primary shadow-xl backdrop-blur-xl transition-colors hover:border-primary/30 hover:text-primary md:static md:text-muted-foreground';

function FloatingUtilityRail({ onOpenCareers, betaOpen, onBetaOpenChange }) {
  return (
    <aside
      data-floating-utility-rail
      aria-label="Ferramentas auxiliares"
      className="pl-floating-utilities pointer-events-none contents md:fixed md:right-[max(0.75rem,env(safe-area-inset-right))] md:top-[calc(var(--pl-header-h)+var(--pl-safe-t)+1.5rem)] md:flex md:flex-col md:items-stretch md:gap-2"
    >
      <div className="pointer-events-auto md:rounded-2xl md:border md:border-amber-400/20 md:bg-background/88 md:p-1 md:shadow-xl md:backdrop-blur-xl" title="Central BETA">
        <BetaTools compact open={betaOpen} onOpenChange={onBetaOpenChange} triggerClassName="hidden md:inline-flex" />
      </div>
      <button
        type="button"
        onClick={onOpenCareers}
        aria-label="Gerenciar carreiras"
        title="Carreiras"
        data-quick-action="careers"
        className={`pl-floating-utilities fixed left-[max(0.75rem,env(safe-area-inset-left))] bottom-[calc(var(--pl-bottom-nav-h)+env(safe-area-inset-bottom)+0.5rem)] ${SHORTCUT_CLASS}`}
      >
        <BriefcaseBusiness className="h-4.5 w-4.5" />
      </button>
      <Link
        to={APP_ROUTES.TRAINING_CENTER}
        aria-label="Centro de treinamento"
        title="Centro de treinamento"
        data-quick-action="training"
        className={`pl-floating-utilities fixed right-[calc(0.375rem+var(--pl-safe-r))] top-[calc(var(--pl-header-h-mobile)+env(safe-area-inset-top)+0.5rem)] ${SHORTCUT_CLASS}`}
      >
        <Building2 className="h-4.5 w-4.5" />
      </Link>
    </aside>
  );
}

export default React.memo(FloatingUtilityRail);
