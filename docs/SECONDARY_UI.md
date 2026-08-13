# Áreas Secundárias — Fase 8

Central BETA, Configurações, Saves, telas técnicas (Admin/Banco de Dados),
Temporada, Clima e Auth. Ver `docs/MODAL_AUDIT.md` para a auditoria de
modais (tratada em separado, é transversal a todas essas telas).

## 1. Central BETA (`src/components/system/BetaTools.jsx`)

Continua sendo um modal global (`ModalShell size="lg"`, aberto pelo botão
"BETA" fixo no `FloatingUtilityRail`) — não virou uma página própria, para
não mudar como o testador já encontra a ferramenta.

**Preservado integralmente**: as 12 ferramentas (relatar bug, sugestão,
avaliação, changelog, checklist, proteção do save, saúde do mundo,
estatísticas do testador, insights, Save Inspector, sessão atual,
diagnóstico), toda a lógica de coleta/exportação, e os IDs de `mode` que
os testes `test:beta-analytics`, `test:beta-analytics-pro` e
`test:rc-beta-intelligence` já protegiam por string literal — nada foi
renomeado.

**Reorganizado** (seção 3 do brief): a barra de abas, antes uma fileira
única de 12 botões, agora é agrupada visualmente em 4 blocos com legenda e
divisor, na mesma barra "sticky" de sempre:

```
VISÃO GERAL   │ Estatísticas · Sessão atual · Checklist · Changelog
FEEDBACK      │ Relatar problema · Sugerir melhoria · Avaliar sistemas
DIAGNÓSTICO   │ Saúde do mundo · Save Inspector · Insights · Diagnóstico
EXPORTAÇÃO    │ Proteção do save
```

Os pares `[chave, rótulo]` de cada aba continuam exatamente os mesmos
literais de antes (só a ordem de exibição mudou) — é por isso que os três
testes de analytics continuam passando sem alteração.

**Severidade com `StatusBadge`** (seção 7): a classificação já existente
(`blocker/high/medium/low`, usada tanto no formulário de bug quanto nos
achados do Save Inspector) agora aparece como `StatusBadge` com rótulo em
português (Crítica/Alta/Média/Baixa) em vez de texto solto em inglês — não
foi criada nenhuma escala nova, só a apresentação da que já existia.

**Painel do testador**: mantido como estava (Perfil/Cobertura/Sessões/Tempo
total) — não foram adicionadas métricas de partidas/torneios/feedback
enviado porque **esses dados não existem** hoje em `betaAnalytics.js`
(só contadores de dias avançados, missões e comunicações). Inventá-los
violaria a regra de não fabricar métricas.

**Modal safety**: já usava `ModalShell` com o limite de altura por
viewport corrigido antes desta fase — nada a fazer aqui além de proteger
com teste (`test:modal-safety`).

## 2. Configurações (`/settings`, `src/pages/Settings.jsx`)

**Não existia antes desta fase** — não havia página, rota nem entrada de
menu. Construída do zero, só com dados reais:

- **Jogo**: carreira ativa (nome/id) + atalho para "Gerenciar carreiras".
- **Interface e áudio**: toggle real de sons da interface + volume —
  únicos dados que já existiam como preferência persistida
  (`src/lib/uiSound.js`, `localStorage`), só sem nenhuma UI até agora.
- **Performance e acessibilidade**: mostra o que `useMotionPolicy()` já
  detecta automaticamente (movimento reduzido, modo de economia, layout
  compacto) como informação, **não como switch** — não existe hoje uma
  forma de sobrepor manualmente essas preferências (`useAdaptivePerformance`
  só lê `matchMedia`/`navigator.connection`/`hardwareConcurrency`), então
  criar um toggle falso violaria a regra de "não inventar switches sem
  implementação funcional" (seção 11).
- **Dados**: aponta para a Central BETA (onde backup/exportação de save já
  vivem) em vez de duplicar essas ferramentas.
- **Sobre**: `BrandMark` + nome + versão real (`__APP_VERSION__`, definida
  em `vite.config.js` a partir do `package.json` — nunca hardcoded).

Roteada em `/settings`, adicionada ao `PAGE_LOADERS`/`ROUTE_MODULES`
(lazy-loading igual a todas as outras páginas) e ao grupo de navegação
"Mais" (`navigationConfig.js`) — não criou grupo novo, só um item a mais
onde Conquistas/Enciclopédia/Comunicações já vivem.

## 3. Saves (`/careers`, `src/pages/CareerManager.jsx`)

- **Metadata leve confirmada**: a lista de saves já lia só o índice leve
  (`career.season`, `career.ranking_position`, `career.last_played_at`
  etc.) sem carregar a carreira inteira — a seção 15 do brief já estava
  satisfeita antes desta fase, nenhuma mudança necessária aí.
- **Exclusão/arquivamento**: `window.confirm`/`window.prompt` →
  `ConfirmDialog` (ver `docs/MODAL_AUDIT.md`). A confirmação de exclusão
  agora nomeia a carreira e avisa sobre a remoção dos backups internos.
- **Diálogos "Carregar carreira" e "Nova carreira"**: migrados de
  `@/components/ui/dialog.jsx` (Radix cru, sem limite de viewport) para
  `ModalShell`.
- **Ordenar por**: select nativo → `Select` oficial (ver seção 6).
- **Logo**: "P" desenhado à mão → `BrandMark`.
- **Não alterado**: `CareerManager.js`, `CareerRepository.js`,
  `CareerProvider.jsx`, `CareerValidator.js` — nenhuma linha de
  persistência, schema ou migração foi tocada.
- **Backups**: o sistema de backup automático já existe
  (`CareerRepository.writeBackup`/`listBackupFiles`), mas continua sem UI
  de restauração na tela de saves — só existe um botão de criação manual
  dentro da Central BETA, restrito à carreira ativa. Construir uma UI de
  restauração por save é mudança de superfície maior (precisa de uma nova
  visão "Detalhes" por carreira) e ficou fora do escopo desta fase;
  registrado como pendência.

## 4. Telas secundárias migradas para o Design System

| Página | Antes | Depois |
|---|---|---|
| `Admin.jsx` | `LoadingScreen`/`PageHeader` legados, sem `Page` | `Page`/`PageContent`/`PageHeader` oficiais, `PageSkeleton`, `TabBar` preservado dentro de `Surface` |
| `DatabaseManager.jsx` | idem + cards de contagem escritos à mão | idem + `CardGrid`/`StatCard` para as 11 contagens de entidades, ações em `Surface` |
| `Season.jsx` | `PageContainer`/`GlassCard`/`EmptyStateCard` legados, spinner próprio | `Page`/`PageHeader`/`CardGrid`/`StatCard`/`EmptyState`/`PageSkeleton` |
| `Weather.jsx` | `LoadingScreen`/`PageHeader`/`EmptyStateCard` legados | `Page`/`PageHeader`/`PageSkeleton`/`EmptyState` no invólucro; abas internas (Previsão/Histórico/Impacto) mantêm `GlassCard`/`FilterPills` — só o invólucro da página mudou, não o conteúdo interno de cada aba |

Seguindo a seção 25 do brief: Admin e Banco de Dados continuam técnicas
(tabelas de números, ações de manutenção) — não foram "suavizadas" para
parecer tela de partida, só passaram a compartilhar tipografia, espaçamento,
loading e cabeçalho com o resto do jogo.

**`NavigationHub.jsx`**: confirmado como **não obsoleto** — ainda é o
destino real de `/development`, `/team-hub`, `/competitions`, `/management`
(os 3 grupos de navegação "Carreira", "Competir" e "Gestão" apontam para
ele). Já estava migrado ao Design System desde antes desta fase; nenhuma
mudança necessária.

**`SeasonDashboard.jsx`** (achado incidental): existe no repositório mas
**não está roteado em lugar nenhum** — é um arquivo órfão, diferente de
`Season.jsx` (que é a tela real em `/game/season`). Como já estava com um
`window.confirm`, foi corrigido junto com os outros 7 pontos (ver
`docs/MODAL_AUDIT.md`) só por higiene — não foi conectado a nenhuma rota,
e não é isso que o torna "vivo". Documentado aqui como candidato à limpeza
de código morto de uma fase futura (seção 27 do brief: documentar, não
apagar ainda).

## 5. Auth

`AuthLayout.jsx` (compartilhado por Login/Register/ForgotPassword/
ResetPassword) ganhou `BrandMark` + "PADEL LEGACY" acima do ícone de cada
tela — antes nenhuma das 4 telas mostrava qualquer identidade visual do
jogo. `Landing.jsx` e `CareerManager.jsx` também tiveram seus logotipos
"P" desenhados à mão trocados por `BrandMark`, terminando a substituição
que o próprio componente já dizia ter sido feita para ("substitui o antigo
P solto em `<span>`") mas que essas três telas nunca haviam adotado.

## 6. `Select` oficial (`src/components/design-system/Select.jsx`)

A ausência de um `Select` apareceu nas Fases 6 e 7 e de novo nesta. Havia
justificativa suficiente: o primitive acessível já existe no projeto
(`@/components/ui/select.jsx`, Radix, zero consumidores) — construir por
cima dele custou uma tela, sem biblioteca nova. `Select` segue o mesmo
padrão de composição do `Dropdown` já oficial (`value`/`onValueChange`/
`options=[{value,label}]`).

**Migração intencionalmente parcial** — 2 selects, ambos de baixo risco
(filtro simples, sem binding a formulário complexo):
- `WorldMarket.jsx` — filtro de categoria de treinador.
- `CareerManager.jsx` — ordenação da lista "Carregar carreira".

Os demais `<select>` nativos do projeto (Central BETA, filtros de outras
páginas) **não foram tocados** — "não substituir todos cegamente" (seção
33). Ficam registrados como candidatos de migração futura.

## Mobile e responsividade

- Grupos da barra de abas da Central BETA continuam em uma única linha
  com scroll horizontal — testado com os breakpoints do brief (360×800 a
  1920×1080); a legenda de grupo (`text-[9px]`) não quebra o scroll.
- `ConfirmDialog`/`ModalShell` no fluxo de saves respeitam
  `max-h-[calc(100dvh-1rem)]` e viram tela quase cheia em telas pequenas,
  como o resto do Design System.
- Formulário "Nova carreira" e diálogo "Carregar carreira" mantiveram os
  alvos de toque generosos que já tinham (botões `min-h-14`/`h-12`).

## Performance

- Nenhum polling novo. `Settings.jsx` lê `uiSound`/`useMotionPolicy` de
  forma síncrona (sem `setInterval`).
- Nenhuma leitura constante do save: Configurações não lê nenhuma carreira
  completa, só `activeCareer` (já em memória via `CareerProvider`).
- Central BETA continua coletando telemetria só pelo mecanismo já
  existente (`betaAnalytics.js`), sem novo canal, sem aumento de
  frequência.

## Dívidas técnicas registradas nesta fase

- Restauração de backup sem UI na tela de saves (só criação manual existe).
- `SeasonDashboard.jsx` órfão — candidato a remoção em uma fase de limpeza.
- `<select>` nativos restantes fora dos dois migrados.
- Nested-modal sem guard estrutural (ver `docs/MODAL_AUDIT.md`).
- Dependência `sonner` instalada e sem uso (ver `docs/MODAL_AUDIT.md`).
