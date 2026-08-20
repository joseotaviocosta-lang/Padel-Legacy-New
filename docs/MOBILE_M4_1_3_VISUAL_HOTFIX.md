# M4.1.3 — Physical Device Visual Hotfix

Fase visual/responsiva exclusiva sobre a base M4.1.2, testada em aparelho
Android físico real. Nenhuma lógica de gameplay, RNG, economia, progressão,
calendário, torneios, ranking, missões, save format ou persistência M3.7 foi
alterada — todas as mudanças abaixo são CSS/className/estrutura JSX em 8
arquivos de apresentação + 1 token novo em `index.css`.

## Parte 2/3 — Bottom Nav: fundo realmente opaco

**Causa real:** M4.1.2 já tinha corrigido o z-index (`--z-bottom-nav: 55`)
e subido a opacidade de 96%→98% (`bg-background/98` + `backdrop-blur-sm`).
QA físico num aparelho Android real provou que isso não bastava — os 2% de
transparência restantes ainda deixavam o card verde de Treinos "vazar"
através da barra, visível em Treinos/Torneios/Calendário.

**Correção:** novo token `--pl-bottom-nav-bg: var(--background)` (sem
canal alfa nenhum — aponta pro token de fundo real em vez de duplicar o
valor, nunca dessincroniza se a paleta mudar). `BottomNav.jsx` usa
`bg-[hsl(var(--pl-bottom-nav-bg))]` — 100% opaco. `backdrop-blur-sm`
removido (sem transparência, não há nada atrás para borrar). Gradiente de
separação de 12px acima da barra mantido (decorativo, nunca foi o que
escondia conteúdo). Estrutura de 5 itens (20% cada via `grid-cols-5`) e
estado ativo (ícone+label verde, pill discreta, sem glow) já estavam
corretos desde M4.1/M4.1.2 — auditados, nenhuma mudança necessária.

## Parte 2 — GuideButton × Bottom Nav

**Causa real:** `GuideButton` já ficava posicionado estruturalmente ACIMA
de toda a altura da bottom nav (`bottom: calc(nav-h + safe-area + gap)`) —
nunca havia sobreposição real —, mas o gap era de só 0.5rem (8px), lido
como "muito próximo" no QA físico, e seu z-index vinha de
`pl-floating-utilities` (`--z-floating: 50`), empatando por baixo da nav
(`--z-bottom-nav: 55`).

**Correção:** gap aumentado para 0.875rem (14px). z-index trocado para
`--z-dropdown` (60) — acima da nav numa camada dedicada, garantia extra
para qualquer cenário de transição/teclado, não o que evita a colisão (a
posição vertical já fazia isso).

## Parte 4/5 — Treinos: botão "Treinar" e altura do card

**Causa real:** mesmo após M4.1.2 remover o `w-full`, o botão ainda lia
como um segundo CTA de página inteira no aparelho físico — `size="touch"`
(48px + `px-5`/20px) combinado com a classe `pl-game-primary` do
`level="primary"` (uppercase, `letter-spacing: 0.04em`, sombra pensada
para UM CTA por tela) nunca foi desenhado para uma ação repetida em CADA
card de uma lista densa.

**Correção:** `size="default"` (ainda 44px no mobile via a mesma regra
`pl-btn-tap` que qualquer botão default já usa — nenhum token novo; 40px
no desktop) + `normal-case tracking-normal` para neutralizar apenas o
uppercase/letter-spacing herdados (utilities sempre vencem classes de
`@layer components` no Tailwind — cor/sombra "primary" do resto do design
system continuam intactas) + remoção do `min-w-[7.5rem]` artificial.
`CompactActionCard` (casca compartilhada) teve `gap-3→gap-2.5`,
`leading-relaxed→leading-snug` e `mt-3→mt-2` — compacta a altura fechada
sem remover nenhum dado (ícone/nome/duração/fadiga/energia/atributo/ganho/
botão continuam todos visíveis).

## Parte 6 — Tabs de treino cortadas

**Causa real:** `overflow-x-auto`/`min-w-max`/`scrollbar-none` já
existiam no primitive `Tabs.jsx`, mas nada tornava `flex-nowrap` explícito
nem reservava espaço depois da última aba — no aparelho físico, a última
aba ("Tático...") ficava encostada no canto arredondado do container e
lia como "cortada" mesmo quando tecnicamente scrollável.

**Correção:** `flex-nowrap` explícito na lista, `pr-3` de folga depois da
última aba, `whitespace-nowrap` explícito em cada trigger (defesa extra),
`-webkit-overflow-scrolling: touch` para rolagem por inércia no WebView
Android. Mudança no primitive compartilhado — beneficia toda tab horizontal
do app, não só Treinos.

## Parte 7/8 — Torneios: CareerStatusBar esmagado

**Causa real, estrutural (não de truncamento):** em 360px, uma única linha
`flex` com data+ícone, badge de lado, divisor e avatar do parceiro (todos
`shrink-0`, largura fixa) deixava pouquíssimo espaço para o nome/OVR/
química do parceiro (`flex-1 min-w-0`) — o texto virava "letra por letra"
porque não sobrava espaço algum, não porque faltava `truncate`.

**Auditoria de duplicação (Parte 8):** confirmado que data/lado NÃO se
repetem em nenhum outro elemento da página de Torneios (o HUD do cabeçalho
mostra dados do PRÓXIMO TORNEIO — nome/dias/status/tier —, não a data de
carreira nem o lado do atleta) — nenhuma informação foi removida.

**Correção:** no mobile, a linha 1 (data + badge de lado) e a linha 2
(botão do parceiro) empilham em coluna; o botão do parceiro passa a ocupar
uma linha inteira sozinho, com espaço real para nome/OVR/química. No
desktop, o wrapper da linha 1 vira `display:contents` (`md:contents`) —
seus filhos voltam a participar do mesmo flex row do container pai, na
MESMA ordem de antes — ou seja, o desktop é literalmente a mesma árvore
JSX de antes, não uma segunda implementação paralela.

## Parte 9 — Torneios: header operacional

Auditado especificamente: o `GameHud` usado no cabeçalho de Torneios já
usa, em mobile (`@media max-width:767px`, `index.css`), `display:grid`
com `grid-auto-flow:column`, `overflow-x:auto`, itens `flex:none` (nunca
encolhem) e `value`/`label` com `whitespace-nowrap` — o mesmo padrão
seguro que o Tabs.jsx usa, sem risco de texto letra-por-letra. Um nome de
torneio muito longo pode empurrar os outros 2 itens para fora da tela
inicial, mas isso é resolvido rolando a faixa (mesmo padrão já usado em
outros HUDs do app), não é o bug estrutural que a Parte 7 tinha. **Nenhuma
mudança feita aqui** — decisão deliberada, não esquecimento (Parte 12:
"não fazer redesign amplo... corrigir somente ocorrências objetivas").

## Parte 10/11 — Calendário: "+1 semana" cortado pela utility rail

**Causa real:** o grupo de 3 botões (`+1 dia`/`+3 dias`/`+1 semana`) usava
`flex` com `flex-1` em cada um — divisão IGUAL de espaço entre os três,
mesmo o rótulo mais longo (`+1 semana`) recebendo a mesma largura que o
mais curto (`+1 dia`). Além disso, a `FloatingUtilityRail` (BETA/
Carreiras/Som) flutua fixa perto do topo direito da tela — exatamente na
faixa vertical deste Surface, sem nenhuma zona de segurança reservada.

**Correção:** grid `1.15fr/1fr/1fr` (mais espaço pro rótulo mais longo,
sem abreviar "+1 semana" para "+1 sem."); `size="default"` em vez de
`"touch"` nos 3 botões (`px-4`/16px em vez de `px-5`/20px — ainda 44px de
altura no mobile via `pl-btn-tap`, mesmo alvo de toque de antes); novo
token `--pl-utility-rail-safe-zone: 3.5rem` aplicado como `margin-right`
só neste Surface (nunca padding global da página), revertido no desktop
(`md:mr-0`) onde a rail não colide.

## Parte 12 — Spot-check global

Auditadas as 13 páginas listadas (Home, Treinos, Torneios, Calendário,
Partidas, Ranking, Atletas, Dupla, Técnicos, Comissão, Objetivos,
Mensagens, Imprensa) contra a checklist de anti-padrões do briefing.
Achados adicionais além dos 4 já reportados: nenhum. Especificamente
verificado e descartado como falso-positivo: botão "Contratar" em
`StaffPanel.jsx` (mercado de profissionais) usa `w-full` mas mede 40px de
altura dentro de um card próprio num grid 2 colunas — não é o padrão
"botão gigante competindo em lista densa" da Parte 4 (esse padrão era
específico do `CompactActionCard` de Treinos, já corrigido); demais usos
de `size="touch"` no código são CTAs únicos de página/modal (Torneios
"Abrir evento", Partidas "Jogar agora", rodapés de modal de
inscrição/detalhes), não ações repetidas em lista — mantidos como estão.

## Parte 13 — Tokens novos

- `--pl-bottom-nav-bg: var(--background)` — fundo 100% opaco da bottom nav.
- `--pl-utility-rail-safe-zone: 3.5rem` — margem reservada só nos
  componentes que colidem com a FloatingUtilityRail.

Nenhum outro token novo — `--pl-touch-min` (44px, já existente) cobriu a
necessidade de altura mínima em todos os pontos desta fase.

## Regressão em testes pré-existentes (disclosed, não uma fraqueza)

3 testes pré-existentes tinham gates que verificavam literalmente os
valores ANTIGOS que esta fase corrigiu de propósito — atualizados com
comentário explicando a mudança, nunca removidos silenciosamente:
`test:mobile-visual-polish-m4-1-2` (3 gates: opacidade 98%→100%, presença
de `backdrop-blur`, `size="touch"`→`"default"` nos botões do calendário),
`test:mobile-game-feel-m4-1` (1 gate: gap do GuideButton 0.5rem→0.875rem).

Um 4º teste pré-existente (`test:onboarding-v3`) falha por um motivo
totalmente não relacionado a esta fase — auditado e confirmado: a
Tutorial 4.1 (fase anterior, fora do escopo aqui) expandiu o tutorial de
15→27 etapas deliberadamente, mas esse teste mais antigo (Onboarding V3)
ainda espera menos de 23 etapas (57×0.4). Esse conflito já existia antes
de qualquer mudança desta fase (confirmado via `git status`/`git log` —
nenhum arquivo de onboarding foi tocado aqui) e não foi corrigido, por ser
explicitamente fora de escopo ("NÃO mexer no tutorial novamente" — Parte 1
deste briefing e da Fase M4.1.3).
