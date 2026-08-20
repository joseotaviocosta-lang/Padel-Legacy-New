# M4.1.2 — Mobile Visual Polish, Bottom Nav, Density Normalization

Fase visual/UX exclusiva sobre a base M4.1.1 (revisão 44dd2f4), validada
fisicamente antes desta fase. Nenhuma lógica de gameplay, torneios,
calendário, RNG, economia, progressão, persistência M3.7 ou formato de save
foi alterada — todas as mudanças abaixo são CSS/className/estrutura JSX.

## Parte A — Bottom nav

**Causa real (não suposta — lida direto no código):** `BottomNav.jsx` já
era `fixed bottom-0 bg-background/96` e `AppLayout.jsx` já reservava
`pb-[calc(var(--pl-bottom-nav-h)+env(safe-area-inset-bottom)+3.5rem)]` no
`<main>` — a reserva de espaço já era generosa e correta, não era um bug de
padding ausente. Os gaps reais eram: (1) `z-50` era um valor hardcoded do
Tailwind, fora da própria escala de z-index do projeto
(`--z-header:40, --z-floating:50, --z-dropdown:60, --z-modal:100,
--z-toast:120`) — empatado com `--z-floating` (usado pelo botão flutuante do
Guia), dependendo só da ordem no DOM para ficar por cima; (2) 96% de
opacidade sem nenhum blur podia deixar os 4% restantes visíveis sob cores
de card muito claras em telas reais; (3) nenhuma transição visual entre
conteúdo e barra.

**Correção:** novo token `--z-bottom-nav: 55` (acima de `--z-floating`,
elimina o empate); opacidade subiu para 98% + `backdrop-blur-sm` leve
(decorativo — a opacidade, não o blur, é o que esconde o conteúdo);
gradiente de separação de 12px acima da barra. Reserva de espaço do
`<main>` não mudou — já estava correta.

## Parte B — HUD / informação desalinhada

**Causa #1 (`CareerStatusBar.jsx`, afeta Home e Torneios — mesmo
componente nas duas telas):** a linha "OVR X · Química Y" não tinha
`truncate`/`nowrap`, enquanto os irmãos do mesmo flex row (data, badge de
lado, avatar, cadeado/chevron) são todos `shrink-0` de largura fixa — em
360px sobra pouco espaço, e a linha quebra/espreme. Corrigido com
`truncate` (degrade correto para informação já secundária).

**Causa #2 (`Tournaments.jsx`, cabeçalho de torneios):** `GameHud`
(`icon → value → label`, ambos já `whitespace-nowrap`) estava correto — o
bug era de conteúdo: os 3 `hudItems` tinham value/label trocados (nome do
torneio no label, contagem de dias no value — lia "9d Los Angeles Cup") e
2 deles usavam labels genéricos redundantes com o próprio ícone ("Inscrito
status", "Silver nível"). Corrigido combinando nome+dias num value só e
removendo os labels genéricos — ícone + value já bastam.

Outras páginas com `hudItems` (Home, Ranking, Athletes, Matches, etc.)
foram verificadas pontualmente e já seguem o padrão correto
(value=dado, label=descritor) — o bug era específico de Torneios.

## Parte C — Botões grandes demais

A escala compartilhada de `Button` (`sm` 32px, `default` 40px, `lg` 44px,
`touch` 48px) já estava dentro da faixa pedida — não precisou de reescrita.
Os problemas eram de uso pontual:

- `TrainingActivityCard.jsx`: "Treinar" já usava `size="touch"` (48px,
  dentro da faixa), mas com `w-full` dentro de um card já compacto
  (~120-160px). Trocado por largura própria alinhada à direita.
- `CalendarPage.jsx`: 3 botões `size="touch"` independentes
  (+1 dia/+3 dias/+1 semana), cada um com borda/padding próprios,
  competindo visualmente, mais o título "Avançar carreira" ocupando uma
  coluna inteira em mobile. Título some em mobile (`hidden md:block`,
  mesmo padrão já usado pela descrição); os 3 botões ganharam um
  invólucro compartilhado (fundo + padding, comportamento de "grupo
  segmentado") em mobile, preservando o layout de 3 colunas do Polish 2.1
  em desktop.

Novos tokens `--pl-mobile-control-h`/`--pl-mobile-control-h-primary`
formalizam essa faixa (44px/48px) para uso fora do componente `Button`
(ex.: grupos segmentados feitos à mão), sem duplicar os tokens de
espaçamento que já existiam (`--mobile-card-padding`,
`--mobile-section-gap`, `--mobile-game-gap`, `--game-hud-gap`) —
consolidados, não recriados com outro prefixo.

## O que foi auditado e já estava correto

`GameHud.jsx` (nowrap já presente nos dois lados), a reserva de espaço do
shell (`AppLayout.jsx`), a escala de tamanhos de `Button`, os `hudItems` de
Home/Ranking (spot-check), o calendário semanal (Parte 25, preservado sem
alteração), e o botão flutuante do Guia (`FloatingUtilityRail`) — agora
garantidamente abaixo da bottom nav pelo novo token de z-index, sem
mudança funcional.

## O que não foi tocado

Match Engine, lógica de torneios/calendário/bracket, RNG, economia,
progressão, formato de save, persistência M3.7 — nenhum arquivo desses
sistemas foi editado.

## Teste

`test:mobile-visual-polish-m4-1-2` — estrutural/textual (padrão já
estabelecido nesta sessão), 19 gates. Não substitui a QA visual manual nos
5 viewports pedidos (360×800, 390×800, 412×915, landscape, desktop).
