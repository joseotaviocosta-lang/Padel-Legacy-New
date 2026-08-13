# Mobile M2 — Shell / Header / Bottom Navigation

Segue `docs/MOBILE_AUDIT.md` → `docs/MOBILE_M1_FOUNDATION.md` →
`docs/MOBILE_M1_1_DEVICE_HOTFIX.md` (commitados como `v70` fora desta sessão,
junto com o Redesign Checkpoint Polish 2). M1/M1.1 foram validados em
dispositivo Android físico e permanecem intactos — este documento cobre
apenas os dois hotfixes adicionais encontrados nesse teste e o trabalho de
M2 propriamente dito (shell/header/bottom nav).

## 0. Baseline antes do M2

`git status` no início desta fase mostrava a árvore de trabalho limpa (M1/
M1.1/Polish 2 já commitados como `v70`). Todo o diff abaixo é exclusivo
desta sessão.

## 1. Hotfix A — sino sem resposta em landscape

### 1.1 Causa raiz

O sino (`CommunicationBell`) e o dock de utilidades
(`FloatingUtilityRail`, ex-rail de 3 ícones do M1.1) são os dois controles
mais à direita do shell em qualquer orientação — ambos ancorados na borda
direita da tela. A única coisa que impedia um sobrepor o outro era a folga
vertical entre o rodapé do header/barra e o topo do dock
(`calc(var(--pl-header-h) + var(--pl-safe-t) + 0.75rem)`).
Matematicamente essa folga é **idêntica** em portrait e landscape — o
`--pl-safe-t` se cancela dos dois lados da conta —, mas na prática só
sobravam 12px de margem real contra variação de fonte/borda entre
aparelhos. Não era mais um problema de "espaço vazio do rail roubando
toque" (o M1.1 já resolveu isso com `pointer-events-none` no `<aside>`):
agora o dock é um único botão, então o próprio botão do dock é que
encostava no próprio botão do sino, sem nenhuma margem de segurança real.

Por que só aparecia em landscape: em portrait, o header mobile some assim
que a largura cruza 768px (breakpoint `md`), trocando para a barra desktop
— mesmo breakpoint que reposiciona o dock e o dropdown do toast. A margem
teórica é a mesma, mas o header mobile tem padding-top de safe-area (status
bar) empurrando o conteúdo para baixo de um jeito que a barra desktop
(landscape, tipicamente sem `safe-area-inset-top`) não tem — reduzindo
ainda mais a tolerância a variações de renderização exatamente no cenário
sem essa folga extra.

### 1.2 Correção

`src/components/system/FloatingUtilityRail.jsx`: folga vertical aumentada
de `0.75rem` para `1.5rem` (dobrada), mantendo a fórmula derivada de
`--pl-header-h`/`--pl-safe-t` (não um número solto, não um ajuste de
z-index — a ordem de camadas continua igual). `pointer-events-none` no
`<aside>` + `pointer-events-auto` no botão continuam como defesa em
profundidade herdada do M1.1.

Adicionalmente, dois gaps de touch target foram encontrados na mesma
varredura (Parte 7) e corrigidos com o token já existente `pl-icon-tap`/
`pl-btn-tap` (M1), sem novos números mágicos:
- `CommunicationBell` compacto (`h-9 w-9` = 36px) no header mobile.
- Hamburguer/fechar do menu mobile em `AppLayout.jsx` (`p-2` sem `h-`/`w-`
  explícito, fora do alcance da rede de segurança do M1 porque não estão
  dentro de `.design-system-page-host`/`.pl-modal-panel`).
- Botão "Avançar" de `CareerDayControl.jsx` (sem altura explícita alguma;
  a real vinha só de `items-stretch` contra a caixa de data ao lado).

## 2. Hotfix B — notificação do Guia marca como lida mas não navega

### 2.1 Mapeamento do fluxo real

"Guia da Carreira" (`OnboardingGuide.jsx`/`HelpCenter`) não lista
notificações — mostra Ciclo principal/Tutorial/Glossário. A auditoria
completa do fluxo de notificações (sino → Central de Comunicações → Guia)
encontrou a causa raiz na **Central de Comunicações**
(`src/pages/Communications.jsx`, alcançada a partir do sino e de qualquer
outro ponto de entrada de notificações), no reload solicitado pelo
enunciado desta fase.

`Communications.jsx`'s `openMessage()` fazia:

```
markAsRead → setSelected(mensagem) → abre modal de detalhe
```

e **nunca chamava `navigate`**. A navegação só acontecia se o jogador desse
um SEGUNDO toque no botão "Abrir recurso" dentro do modal — e esse botão só
existe quando `resolveNotificationDestination(selected).actionable` é
verdadeiro. Ou seja: tocar numa notificação sempre marcava como lida, mas
só navegava com um toque a mais (e nunca, para notificações sem destino
específico).

`CommunicationBell.jsx` (sino), em contraste, já fazia
`markCareerCommunicationRead` + `navigate(destination.route)` no mesmo
toque desde antes desta fase.

### 2.2 Sino e Central possuíam handlers diferentes?

Sim — confirmado. `handleMessageClick` (sino) e `openMessage`
(Central/Comunicações) eram duas implementações **independentes** do
mesmo conceito ("tocar numa notificação"), resolvendo destino e marcando
como lida de formas parecidas mas com comportamentos finais diferentes
(navega vs. só abre modal). Essa duplicação — exatamente o padrão que o
enunciado pediu para procurar — é a causa raiz estrutural do bug.

### 2.3 Como ficou centralizado

Nova função única em `src/lib/careerCommunications.js`:

```js
export async function resolveAndOpenNotification(notification, { navigate, onBeforeNavigate } = {}) {
  const normalized = normalizeCareerMessage(notification);
  const destination = resolveNotificationDestination(normalized);
  if (isCareerMessageUnread(normalized)) {
    await markCareerCommunicationRead(normalized).catch(() => null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('padel:communications-updated'));
      window.dispatchEvent(new CustomEvent('padel:communications-refresh'));
    }
  }
  if (destination.actionable && typeof navigate === 'function') {
    onBeforeNavigate?.();
    navigate(destination.route);
  }
  return destination;
}
```

Fluxo conceitual implementado, igual ao proposto no enunciado:
`markAsRead → resolveNotificationDestination → (fecha overlay se pedido) →
navigate` — reaproveitando 100% da arquitetura existente
(`normalizeCareerMessage`, `isCareerMessageUnread`,
`markCareerCommunicationRead`, `resolveNotificationDestination`); nenhuma
tabela de rotas nova, nenhum campo inventado.

- **`CommunicationBell.jsx`**: `handleMessageClick` agora só faz a
  atualização otimista local da lista (isso é específico do dropdown, não
  regra de negócio) e delega o resto a `resolveAndOpenNotification`.
- **`Communications.jsx`**: `openMessage` passou a diferenciar dois casos:
  - Mensagem **com destino específico e sem decisão pendente** → chama
    `resolveAndOpenNotification` e navega no primeiro toque, igual ao sino.
  - Mensagem **sem destino** (`actionable: false`) **ou com decisão
    pendente** (`status === 'decisao_pendente'`) → continua abrindo o modal
    de detalhe (o jogador precisa ler o conteúdo completo e/ou escolher uma
    ação ali) — esse fluxo de duas etapas é intencional para decisões, não
    um bug.

### 2.4 Como os destinos são resolvidos

Sem mudança na lógica de resolução — `resolveNotificationDestination`
(`src/lib/notificationDestinations.js`) continua sendo a única fonte,
lendo campos já existentes no modelo (`related_entity_type`,
`related_entity_id`, `message_type`, `metadata.*`, `destination.*`).
Nenhum campo novo, nenhum ID inventado.

### 2.5 Notificações sem destino

`destination.actionable === false` → `resolveAndOpenNotification` marca
como lida e **não chama `navigate`**. Não há fallback para Home nem para
nenhuma rota "inventada" — o comportamento é literalmente "marcar como
lida e parar", como pedido.

### 2.6 Destinos inválidos/obsoletos

Já cobertos pela arquitetura existente (`resolveNotificationDestination`
retorna `actionable: false` para `status: 'expirada'`/`'invalidada'`, sem
lançar exceção) — meu acréscimo foi só envolver a chamada de
`markCareerCommunicationRead` num `.catch(() => null)` dentro do handler
central, para o caso de uma notificação sem registro real em storage
(ID obsoleto) não derrubar o clique. Testado de ponta a ponta no cenário 20
de `test-notification-system-audit-rc.mjs` (sem exceção, sem navegação).

## 3. Por que a suíte de testes anterior não pegou os dois bugs

Ambos os testes existentes (`test:notification-deep-links`,
`test:notification-system-audit`) passavam 100% e mesmo assim os bugs
existiam em produção — porque eram checks **estruturais**
(`arquivo.includes('resolveNotificationDestination(message)')`,
`arquivo.includes('markCareerCommunicationRead')`), nunca checks de
**comportamento** (a função de verdade executando com um `navigate` falso
capturando chamadas). `Communications.jsx` literalmente continha as
strings certas (`markCareerCommunicationRead`, `resolveNotificationDestination(selected)`)
— só nunca as conectava a um `navigate()`.

Correção: `scripts/test-notification-system-audit-rc.mjs` ganhou os
cenários 17-20, que chamam `resolveAndOpenNotification` de verdade (via
`server.ssrLoadModule`, mesma técnica já usada no arquivo) com um
`navigate` fake, e verificam as chamadas capturadas — não só o texto do
código-fonte.

## 4. M2 — Mudanças no App Shell

### 4.1 Header mobile

Nenhuma mudança estrutural de layout (título + hamburguer + data/avançar +
sino já eram compactos e mantiveram sua hierarquia). Dois gaps de touch
target corrigidos (hamburguer/fechar do menu — seção 1.2).

### 4.2 Informações que somem no mobile (Parte 3)

Classificação:

| Informação | Classe | Onde já está / para onde foi |
|---|---|---|
| Ranking | C — redundante no mobile | Já visível no `IdentityHeader` da Home |
| Moedas | B — segundo nível | Agora no dock de utilidades (novo) |
| Energia | D — contextual | Já visível em Calendário/Treinos/CareerCalendar (Home) |
| Fadiga | D — contextual | Já visível em Calendário/Treinos |

Em vez de espremer 4 pills a mais no header compacto (recongestionando o
que o Polish 2 acabou de descongestionar), o `CareerHud` — o mesmo
componente que já mostra essas 4 métricas na barra desktop — passou a
também renderizar dentro do `BottomSheet` do dock de utilidades
(`FloatingUtilityRail`), a um toque de distância do header mobile, sem
nenhum widget novo. `CareerHud` ganhou uma prop `showSoundToggle` (default
`true`, comportamento antigo preservado na barra desktop) para não duplicar
o toggle de som que o dock já tem na sua própria linha.

### 4.3 Bottom navigation

Já estava correta (achado do M1: safe-area, touch targets ≥44px via
`h-[4.35rem]`/`min-w-[3.6rem]`, sem scroll horizontal, `BottomSheet` para
"Mais"). Nenhuma mudança necessária — auditoria confirmada, não alterado.

### 4.4 Safe-area

Nenhuma regressão: `pl-safe-t`/`pl-safe-b`/`env(safe-area-inset-*)` em
header, barra desktop, `BottomNav`, `DrawerShell`, `ModalShell`, `toast`,
dock — todos re-verificados por `test:mobile-m2-shell` (que trava contra
regressão, não reimplementa nada).

### 4.5 FloatingUtilityRail

Ver seção 1 (hotfix do sino) — folga vertical aumentada — e seção 4.2
(CareerHud agora dentro do dock).

## 5. Testes executados e resultados

`lint` ✅ · `typecheck` 2528 linhas (baseline Polish 2: 2526 — 2-3 novas
ocorrências, mesma categoria pré-existente de parâmetros desestruturados
sem tipo, nenhuma categoria nova) · `build` web ✅ · `app:build`
Windows/Tauri — ver seção 8 · `test:mobile-foundation` 68/68 ·
`test:mobile-m1-hotfix` 27/27 · `test:performance-responsive-v36` 5/5 ·
`test:viewport-overlays-rc1` 9/9 · `test:global-overlays` 88/88 ·
`test:ui-quality` ✅ · `test:global-header-calendar` 18/18 ·
`test:global-header-overlay` 19/19 · `test:modal-safety` 34/34 ·
`test:notification-deep-links` 25/25 (1 asserção atualizada para o handler
central) · `test:notification-system-audit` 41/41 (8 cenários novos,
comportamentais) · `test:missions` ✅ · `test:onboarding-v2` ✅ ·
`test:secondary-ui-v2` 57/57 · `test:world-ui-v2` 72/72 ·
`test:ui-redesign` 181/181 · `test:home-redesign` 37/37 ·
`test:core-gameplay-ui` 73/73 · `test:mobile-m2-shell` 38/38 (novo).

Descoberta durante a varredura ampla (não desta fase):
`test:premium-home-v33` falha procurando `PremiumQuickStats` em
`CareerHub.jsx` — componente removido pela Fase 4 (Home redesign), muito
antes desta sessão; teste obsoleto de uma versão anterior, não coberto pela
lista de testes pedida nesta fase, não corrigido (fora de escopo).

## 6. Regressões encontradas

Nenhuma.

## 7. Bugs pré-existentes encontrados (não corrigidos, fora de escopo)

- `test:premium-home-v33` obsoleto (seção 5).
- `test:tutorial-chronology` continua com o mesmo diff (8 !== 6) documentado
  como baseline desde a Fase 8.

## 8. Build

Web (`npm run build`): sucesso, 30s. Windows/Tauri (`npm run app:build`):
sucesso — `Padel Legacy_0.9.0_x64_en-US.msi` e
`Padel Legacy_0.9.0_x64-setup.exe` gerados (3m23s, só o warning
pré-existente de `linker_messages`).

## 9. Arquivos/páginas deliberadamente não alterados

`LiveMatch.jsx`, `StaffPanel.jsx`, `PartnerOffersPanel.jsx`,
`TrainingCenter.jsx`, `Ranking.jsx`, páginas legadas, persistência de
partida — nenhuma alteração necessária no Shell tocou essas áreas.
`OnboardingGuide.jsx`/`HelpCenter` (Guia da carreira em si) não foi
redesenhado — só ganhou o listener `padel:open-career-guide` no Polish 2
(sessão anterior); nesta fase não foi tocado.

## 10. Limitações

Nenhum teste estático substitui o teste físico em Android real — em
especial a confirmação definitiva de que o sino responde ao toque em
landscape depende do teste físico do checklist (seção 11). A causa raiz do
hotfix A foi deduzida por análise geométrica cuidadosa (CSS calc, ordem de
z-index, breakpoints) sem acesso a um dispositivo físico nesta sessão —
documentado com transparência, não apresentado como certeza absoluta.

## 11. Checklist Android físico

Ver relatório de encerramento (chat) para o checklist completo — reproduz
exatamente a estrutura pedida na Parte 21 do enunciado.

## 12. Pendências para M3+

- Confirmação física dos dois hotfixes (sino landscape, deep-link).
- `CareerMomentStrip`/`NextEventCard`/briefing diário como fontes
  independentes (dívida já registrada no Polish 2).
- `test:premium-home-v33` obsoleto — decidir se atualiza ou remove.
- Redesign específico de `LiveMatch`/`StaffPanel`/`PartnerOffersPanel`/
  `TrainingCenter`/páginas legadas/persistência de partida — todos fora do
  escopo do M2 por definição.
