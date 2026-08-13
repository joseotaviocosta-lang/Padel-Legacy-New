# Mundo Vivo — Fase 7 (Notícias, Comunidade, Imprensa, Mercado, Universo Vivo)

Redesign de UI das cinco páginas ligadas ao mundo externo da carreira.
Nenhuma mudança em geração do Universo Vivo, regras de eventos,
popularidade, economia, ranking, IA, entrevistas, contratos, saves ou
Match Engine — apenas UI, hierarquia, descoberta, integração entre
sistemas e responsividade. A única exceção é uma correção de leitura (ver
"Bug corrigido" abaixo), que não altera geração/regras, só o que a tela lê.

## Objetivo

Fazer as cinco páginas parecerem um ecossistema, não cinco sistemas
independentes:

```
TORNEIO → RESULTADO → NOTÍCIA → REAÇÃO DA COMUNIDADE → IMPRENSA →
POPULARIDADE/REPUTAÇÃO → NOVAS OPORTUNIDADES
```

## 1. Notícias (`/journal`)

- `Journal.jsx` mantém as duas abas existentes: **Jornal** (agregados de
  `generateJournal()` — campeões, rivalidades, resultados, top duplas, já
  com manchete em destaque) e **Mundo** (`WorldFeed.jsx`, o feed real de
  notícias vindo de `src/lib/world.js`/`worldEvents.js`).
- `WorldFeed.jsx` ganhou **destaque principal**: a notícia não-macro de
  maior relevância (URGENTE > DESTAQUE > mais recente) renderiza em
  `WorldEventCard` com `variant="hero"` (maior, sem `line-clamp`); as
  demais viram uma grade compacta, paginada em lotes de 10 ("Carregar
  mais"), em vez de renderizar tudo de uma vez.
- Categorias continuam as 12 já existentes em `EVENT_TYPE_META`
  (notícia, entrevista, rivalidade, redes sociais, rumor, transferência,
  aposentadoria, jovem promessa, lesão, escândalo, ranking, histórico) —
  nenhuma taxonomia nova.
- `WorldEventCard` (compartilhado com Universo Vivo e Eventos Mundiais)
  ganhou:
  - Data relativa (Hoje/Ontem/Esta semana, `src/lib/worldTime.js`) em vez
    de só "13 ago".
  - Selo discreto **"Relacionado a você"** quando `related_players`
    contém o nome do jogador (`profile.sport_name`).
  - Avatares (`PlayerAvatar`) nos chips de atletas relacionados, conectando
    visualmente Ranking ↔ Notícias ↔ Mundo ↔ Mercado.

## 2. Comunidade (`/community`)

- `Community.jsx` continua a experiência principal (posts reais via
  `Post` entity) com um alternador para **"Rede do circuito"**
  (`Social.jsx`, incorporado via `embedded`). `/social` continua
  redirecionando para `/community` — nenhuma segunda rede social paralela
  foi reintroduzida.
- Ambos os feeds (Comunidade e Rede do circuito) agora usam
  `PlayerAvatar` no lugar de círculos de iniciais escritos à mão, e
  paginam o que já foi buscado (10 e 8 por lote, "Carregar mais") em vez
  de renderizar 50/30 posts de uma vez.
- **Reação por evento (👍/🔥/😐/👎) não foi implementada.** O modelo de
  dados atual só tem uma contagem de curtidas — não existe uma quebra
  real em quatro sentimentos. Fabricar essa quebra violaria a regra de
  "não criar métricas falsas" (seção 10 do brief), então a página
  continua mostrando curtidas reais.
- **Dívida conhecida, não tratada nesta fase** (é conteúdo/dado, não
  camada de UI): `TRENDING_TOPICS` em `src/lib/socialNetwork.js` é uma
  lista estática com contagens fixas, e `Social.jsx` calcula seguidores
  como `fan_appeal * 120` e gera posts de bots automaticamente a cada
  visita. Nenhuma dessas heurísticas foi alterada — mexer nelas é
  trabalho de dados/lógica, fora do escopo "apenas UI" desta fase.

## 3. Imprensa (`/press`) — prioridade alta

- Banner **"🎙 Entrevista disponível"** no topo da página (antes do grid
  de estatísticas), visível sempre que `pendingInterviews.length > 0`,
  com CTA "Dar entrevista" que abre a entrevista mais relevante
  diretamente — sem exigir trocar de aba primeiro.
- A mesma entrevista (mesmo `CareerMessage` com
  `related_entity_type: 'PressInterview'`, resolvido por
  `resolveNotificationDestination`) agora aparece de forma coerente em
  **quatro lugares**, todos apontando para o mesmo recurso:
  1. Home (`CareerHub.jsx`, já existia — `buildPriorityActions`);
  2. Sino (`CommunicationBell.jsx`, já existia);
  3. **Assistente da carreira (`CareerAssistant.jsx`, novo nesta fase)**
     — mesmo cálculo de `CareerHub`, mesma fonte de dados, nenhuma
     lógica de entrevista duplicada;
  4. Página de Imprensa (banner acima).
- Deep link `/press?tab=interviews&interview=...&source=...` preservado
  byte a byte (`searchParams.get('interview')`/`get('source')`,
  `tab === 'interviews'`) — é o contrato validado por
  `test:notification-deep-links`.
- `ArticleCard.jsx` agora mostra a data (`career_date`) e o impacto
  completo (reputação **+** fãs **+** patrocinadores), não só reputação,
  usando campos que já existiam no artigo.
- Expiração de entrevista ("Disponível por mais N dias") **não foi
  adicionada** — o modelo de dados não tem TTL/validade armazenada, só
  recomputa "há entrevista pendente" a cada render. Mostrar um prazo
  seria inventar um dado que não existe.

## 4. Mercado (`/world-market`)

- A página já era especificamente o mercado de **atletas livres, duplas
  ranqueadas e treinadores** (não mistura equipamentos/patrocínios, que
  vivem em `Shop`/`Economy`). As quatro abas (`athletes`, `teams`,
  `coaches`, `movements`) foram mantidas.
- Linhas de atleta e cartões de treinador agora usam `PlayerAvatar` (e
  `CountryFlag` no atleta) em vez de divs de iniciais escritas à mão —
  mesma linguagem visual do Ranking.
- Aba **Movimentações** ganhou identidade visual: ícone e cor por tipo de
  movimento (dupla, treinador, aposentadoria, mercado), lendo as tags que
  o snapshot já retorna (`recentMovements`), sem inventar categoria nova.
- Filtro de treinadores continua um `<select>` nativo — não existe
  componente `Select` oficial no Design System ainda (só um `Dropdown` de
  menu, que não serve para esse caso), e esta fase não cria uma
  biblioteca paralela só para isso. Fica documentado aqui como pendência
  de evolução do Design System.

## 5. Universo Vivo (`/world`, hub) e Eventos Mundiais (`/world-events`)

`WorldHub.jsx` é o hub ("Universo Vivo"); `WorldEvents.jsx` é a lista
plana secundária ("Eventos mundiais" no menu) que reaproveita o mesmo
`WorldEventCard`.

### Bug corrigido (leitura, não geração)

`getLivingWorldSnapshot` (`src/lib/livingWorldEngine.js`) sempre devolveu
`categories: { circuito, mercado, saude }` (chaves em português).
`WorldHub.jsx` lia `categories.circuit`/`categories.market` (inglês) —
chaves que nunca existiram — então as abas **Circuito** e **Mercado**
sempre ficavam vazias, mesmo com dados reais no snapshot. Corrigido para
ler `categories.circuito`/`categories.mercado`. Nenhuma linha de
`livingWorldEngine.js` foi tocada; é puramente uma correção de leitura no
lado da UI, dentro do escopo "integração entre sistemas" da Fase 7.

### Aba "Hoje" reestruturada

Antes: bulletim semanal + destaque + uma lista genérica de 12 eventos.
Agora, seguindo a seção 21 do brief:

- **Agora no circuito** — bulletim semanal + o evento de maior impacto em
  destaque (`variant="hero"`).
- **Ranking** — movimentos de ranking (`event_type === 'ranking'`).
- **Torneios** — resultados/campeões/torneios (resto do balde `circuito`).
- **Mercado** — duplas, treinadores, aposentadorias, promessas (balde
  `mercado` do snapshot).
- **Tendências** — resíduo: histórias editoriais (rumor, redes sociais,
  escândalo etc.) que não caem em nenhum dos três baldes anteriores.

Cada grupo é uma lista compacta de até 4 linhas (não outra grade de
`WorldEventCard`, para não duplicar visualmente as abas Circuito/Mercado)
com um "Ver tudo" que troca de aba internamente (Ranking/Torneios →
Circuito; Mercado → Mercado) ou linka para `/world-events`
(Tendências) — sem introduzir parâmetro de URL novo não lido por
ninguém.

### Paginação

- Abas Circuito e Mercado: lotes de 8 (`EVENT_PAGE_SIZE`), "Carregar
  mais", em vez de renderizar toda a lista de uma vez.
- `WorldEvents.jsx`: lotes de 12, mesma convenção.
- Nenhuma das duas abas provoca nova geração ao abrir — só leem o
  snapshot já carregado no mount (`getLivingWorldSnapshot`); a única
  escrita condicional é o "ensure" idempotente de eventos/macroeventos
  que já existia antes desta fase.

### `WorldEvents.jsx`

Migrado do `PageHeader`/`LoadingScreen` legados (`padel/ui`) para o
Design System oficial (`Page`/`PageHeader`/`PageSkeleton`), mantendo
intactos o deep link (`?event=`), o `ModalShell`, o ticker de breaking
news e o resumo de efeitos de macroeventos.

## Mobile

- Notícia principal (`WorldEventCard variant="hero"`) empilha em coluna
  única abaixo de `sm`; grade de cards secundários vira 1 coluna.
- Filtros (`FilterPills`) continuam scroll horizontal por toque.
- Banner de entrevista em Imprensa empilha verticalmente com o CTA em
  largura total abaixo de `sm`.
- Grupos temáticos de "Hoje" (Ranking/Torneios/Mercado/Tendências)
  empilham em coluna única abaixo de `lg`.
- Nenhum novo componente de overlay foi introduzido — `ModalShell`,
  `DrawerShell` e `BottomSheet` já tratam mobile/desktop.

## Limites de listas e decisões de performance

| Superfície | Lote inicial | Mecanismo |
|---|---|---|
| WorldFeed (Notícias → Mundo) | 1 destaque + 10 | `visibleCount` + "Carregar mais" |
| Community (posts) | 10 de 50 buscados | `visibleCount` + "Carregar mais" |
| Social (posts) | 8 de 30 buscados | `visibleCount` + "Carregar mais" |
| WorldHub → Circuito/Mercado | 8 | `EVENT_PAGE_SIZE` + "Carregar mais" |
| WorldHub → Hoje (grupos temáticos) | 4 por grupo | fixo, com "Ver tudo" |
| WorldEvents | 12 | `visibleCount` + "Carregar mais" |
| WorldMarket (já existia) | 50 | `visibleCount` + "Carregar mais" |

Nenhuma página processa o mundo inteiro para se exibir: todas leem
snapshots já computados (`getLivingWorldSnapshot`,
`getGlobalMarketSnapshot`, `getRecentWorldEvents`) e usam `useMemo` para
filtragem/ordenação derivada. Nenhum polling novo foi introduzido em
nenhuma das páginas tocadas.

## Testes

- `npm run test:world-ui-v2` (novo) — protege as decisões acima:
  Design System oficial nas cinco páginas, paginação presente, destaque
  principal, banner/deep link/impacto de entrevista intactos, correção
  do bug de categorias, ausência de polling/simulação nova.
- Suítes existentes reexecutadas sem alterações: `test:living-world`,
  `test:global-market`, `test:career-systems`, `test:world-auditor-v35`,
  `test:notification-deep-links`, `test:post-match-interviews`,
  `test:ui-redesign`, `test:ui-performance`.

## Dívidas técnicas restantes (fora do escopo desta fase)

- `TRENDING_TOPICS` (`src/lib/socialNetwork.js`) continua fabricado —
  precisa de trending real derivado de atividade, não uma lista fixa.
- Contagem de seguidores em `Social.jsx` (`fan_appeal * 120`) é uma
  fórmula sintética, não um contador real de alcance.
- Geração automática de posts de bots a cada visita a `Social.jsx`
  (~50% de chance) permanece — candidata a mover para o avanço de dia
  em vez de acontecer ao abrir a página, mas é mudança de lógica, não de
  UI.
- Não existe componente `Select` oficial no Design System — o filtro de
  treinadores em Mercado continua um `<select>` nativo estilizado.
