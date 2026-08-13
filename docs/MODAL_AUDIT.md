# Auditoria de Modais — Fase 8

Auditoria global de modais/overlays/toasts do Padel Legacy, e o que foi
corrigido. Nenhuma máquina de estado complexa foi reescrita — a mudança é
sempre a mesma: trocar um `window.confirm`/overlay solto por um componente
com as garantias já provadas do Design System.

## O que já estava certo

- 34 componentes já usavam `ModalShell` (design system), incluindo todos os
  12 arquivos `*Modal.jsx` (`InterviewModal`, `TournamentModal`,
  `SponsorNegotiationModal`, etc.). Nenhum modal "rogue" com sua própria
  implementação de overlay foi encontrado nessa lista.
- `ModalShell`, `DrawerShell` e `BottomSheet` compartilham
  `useOverlayBehavior` (scroll-lock, focus-trap, retorno de foco, ESC) — a
  proteção está implementada uma vez só, não em cada componente.
- `ModalShell` já limita a altura ao viewport (`max-h-[calc(100dvh-1rem)]` /
  `sm:max-h-[calc(100dvh-2rem)]`) e faz scroll interno do conteúdo
  (`overflow-y-auto overscroll-contain`) — a correção histórica que evitou a
  Central BETA "sair da tela" continua intacta e agora tem um teste
  (`test:modal-safety`) protegendo especificamente contra regressão.
- `BottomSheet` já trata safe-area móvel
  (`pb-[env(safe-area-inset-bottom)]`). `ModalShell`/`DrawerShell` não
  precisam — não são ancorados na borda inferior da tela.
- `TournamentModal.jsx` já usava `ModalShell` normalmente; a única
  particularidade é uma altura fixa (`h-[calc(100dvh-1rem)]`) durante a
  fase `match`, para a partida ao vivo não crescer/encolher o painel. **Não
  foi tocado** — confirmado como de baixo risco, mas mantido intocado por
  ser sensível desde a Fase 5.

## O que foi corrigido nesta fase

### 1. `window.confirm` → `ConfirmDialog`

8 pontos usavam o diálogo nativo do navegador (sem tema, sem
acessibilidade própria, capaz de empilhar de forma inconsistente sobre um
modal já aberto):

| Arquivo | Ação protegida |
|---|---|
| `src/pages/CareerManager.jsx` | Excluir / arquivar carreira |
| `src/components/matches/LiveMatch.jsx` | Simular até o fim da partida |
| `src/pages/Tournaments.jsx` | Cancelar inscrição em torneio |
| `src/pages/SeasonDashboard.jsx` | Encerrar temporada |
| `src/pages/CalendarPage.jsx` | Avançar dias até recuperação de lesão |
| `src/pages/CareerHub.jsx` | Avançar dias até recuperação de lesão |
| `src/components/system/BetaTools.jsx` | Limpar estatísticas locais da beta |

Todos migraram para o novo `ConfirmDialog`
(`src/components/design-system/ConfirmDialog.jsx`) — construído sobre
`ModalShell`, então herda as mesmas garantias de viewport/scroll/foco/ESC
sem introduzir uma quarta implementação de overlay. Padrão: `title` +
`description` (a pergunta) + `children` opcional (aviso adicional) + botão
secundário "Cancelar" + botão de ação com `tone="danger"` quando a ação é
destrutiva.

Para `CareerManager.jsx` especificamente (seção 17 do brief): a exclusão
agora mostra explicitamente qual carreira será excluída
(`Excluir definitivamente "{nome}"?`) e avisa que os backups internos
também serão removidos — informação que existia na lógica
(`CareerManager.js` já apaga a pasta de backups ao excluir) mas nunca
tinha sido comunicada ao jogador.

### 2. `CareerManager.jsx` — `Dialog` (Radix cru) → `ModalShell`

Os dois diálogos da tela de saves ("Carregar carreira" e "Nova carreira")
usavam `@/components/ui/dialog.jsx` diretamente, sem o limite de altura
por viewport nem o scroll-lock padronizado do resto do jogo. Convertidos
para `ModalShell`, preservando exatamente o mesmo conteúdo (busca,
ordenação, grade de cards, formulário de criação) — a busca/ordenação
agora fica em uma barra "sticky" dentro do conteúdo do modal (mesmo padrão
já usado pela Central BETA para sua barra de abas).

### 3. Onboarding sem ação de fechar — `useOverlayBehavior` direto

`PositionSelection.jsx` e `OnboardingAttributes.jsx` (etapas obrigatórias
da criação de personagem) eram `<div className="fixed inset-0 ...">`
com zero proteção: sem `role="dialog"`, sem trap de foco, sem scroll-lock,
sem retorno de foco ao fechar.

**Decisão deliberada: não usar `ModalShell` aqui.** `ModalShell` sempre
renderiza um botão "X" de fechar no cabeçalho — nessas duas telas não há
nada para "cancelar" (o jogador precisa escolher uma posição / distribuir
pontos para continuar o onboarding), então um X funcional seria enganoso e
um X decorativo sem efeito seria pior. Em vez disso, os dois componentes
passaram a chamar `useOverlayBehavior` diretamente (o mesmo hook que
`ModalShell`/`DrawerShell`/`BottomSheet` usam por baixo), com
`closeOnEscape: false` e `onClose: () => {}` — ganham scroll-lock,
trap de foco e retorno de foco ao desmontar, sem ganhar uma ação de fechar
que não deveria existir. `role="dialog"`/`aria-modal`/`aria-label` foram
adicionados manualmente ao contêiner. Também padronizado o z-index (as
duas telas usavam `z-[60]` e `z-[var(--z-modal)]` — só uma era a variável
oficial; ambas usam `z-[var(--z-modal)]` agora).

## Toasts — auditoria, sem mudança de código

- `useToast`/`<Toaster />` (shadcn/Radix) é o único sistema de toast
  realmente montado (`src/App.jsx`, `<Toaster />` no root) — 25 arquivos o
  consomem.
- `sonner` está instalado (`package.json`) e tem um wrapper
  (`src/components/ui/sonner.jsx`), mas **não é importado em lugar
  nenhum** além da própria definição — é dependência morta, não um
  segundo sistema ativo.
- `ActionFeedback` (design system) não é um toast — é um bloco de status
  inline, sem portal e sem timeout automático, usado em 2 telas
  (`Matches.jsx`, `Training.jsx`).

Nenhuma mudança foi feita aqui: não há dois sistemas competindo em
produção, só uma dependência não utilizada. Fica registrado para uma
eventual limpeza de dependências (fora do escopo desta fase — seção 43 do
brief pede para não misturar redesign com grande limpeza de código).

## Modais nested — risco estrutural (não corrigido, documentado)

Nenhum caso de um `ModalShell` renderizado dentro do JSX de outro
`ModalShell` já aberto foi encontrado. O risco real é outro: páginas com
múltiplas flags booleanas independentes, cada uma capaz de abrir um
overlay, sem uma garantia estrutural de "só um modal por vez" — só
disciplina manual em cada callback (`CalendarPage.jsx`, `Tournaments.jsx`,
`PartnerHub.jsx`). Nenhuma colisão real foi observada em uso normal, mas
fica documentado como dívida técnica: um guard central de "modal ativo"
resolveria isso de vez, só que é um refactor estrutural maior do que esta
fase comporta.

## `window.confirm` — verificação final

```bash
grep -rn "window.confirm(" src/
```

Zero ocorrências após esta fase (validado por `test:modal-safety`).
