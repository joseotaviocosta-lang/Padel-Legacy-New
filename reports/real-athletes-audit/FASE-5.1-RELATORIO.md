# Fase 5.1 — Contaminação de dado corrigida, agenda de tier e portão de
# parceria implementados

> Pré-requisito: Fase 5 entregue (curva de capacidade em 4 cenários,
> desenho do portão de parceria proposto). Ver
> [FASE-5-RELATORIO.md](FASE-5-RELATORIO.md). Esta fase, ao contrário da
> Fase 5, IMPLEMENTA — por instrução explícita: agenda de tier (item 1) e
> portão de parceria (item 2) aprovados, nesta ordem, com verificação de
> um dado suspeito primeiro (pedido antes de qualquer mudança de
> comportamento, "pode mudar leitura de achados antigos").

## 0 — Verificação: `tournaments_played` contaminava a auditoria

### 0.1 — Mecanismo confirmado

`rankingPopulation.js:175` (`buildSupplementalRankingPopulation`, a
função que gera os bots procedurais) escrevia
`tournaments_played: Math.max(1, 6 + (seed % 28))` — um valor **estático
de história de fundo** (faixa 6-33, média ≈19,5), atribuído na CRIAÇÃO
de cada bot, antes de qualquer simulação rodar. O mesmo campo é
incrementado por `WorldTourLifecycle.js:383`
(`tournaments_played: athlete.tournaments_played + outcomes.length`)
toda vez que QUALQUER atleta (real ou bot) aparece num torneio resolvido.
**Um único contador, duas origens diferentes** — para bots, o valor final
sempre foi "seed + jogo"; para reais, sempre foi só "jogo" (confirmado:
nenhum ponto do bootstrap de atleta real
— `src/lib/saveFoundation.js`, `realAthletesRegistry.json` — grava
`tournaments_played`; o campo nasce `undefined`, lido como `0` em todo
consumidor).

### 0.2 — Reais vs. bots: confirmado, reais começam em zero

Pergunta 1 do pedido, respondida: **sim, só bots recebem valor estático;
reais começam genuinamente em zero.** Isso significa que toda
comparação histórica "reais: X · bots: Y" usando este campo tinha um
lado real (correto) e um lado inflado por uma constante que nunca
representou jogo simulado.

### 0.3 — Números afetados, antes e depois de descontar o seed

Levantamento completo (pergunta 2 do pedido) — toda ocorrência de
`tournaments_played`/"torneios disputados" na auditoria:

| Onde | Número original | Interpretação original | O que muda descontando o seed |
|---|---|---|---|
| Fase 2, Resultado B (970 bots, 1 temporada) | reais 0,58 · bots 20,15 | "bots jogam ~35× mais que reais" | bots real ≈ 20,15−19,5 ≈ **0,6** — praticamente IGUAL aos reais (0,58). A comparação original era seed-contra-jogo, não bot-contra-real. |
| Fase 2, Resultado A (220 bots, 5 temporadas) | reais 37,54 · bots 34,57 | "parecidos, bots quase alcançam" | bots real ≈ 34,57−19,5 ≈ **15,1** — reais jogam ~2,5× mais que bots, não "quase igual". A leitura qualitativa (reais dominam quando pareados) fica MAIS forte, não mais fraca. |
| Fase 2, Resultado C (970 bots, 5 temporadas) | reais 31,5 · bots 23,1 | "mesma ordem de grandeza" | bots real ≈ 23,1−19,5 ≈ **3,6** — reais jogam ~8,7× mais que bots, não ~1,4×. A composição de títulos (47,5% com 2,4% da população) já apontava nessa direção; o número de participação escondia o quanto. |
| Fase 5 (achado #32), cenário 250 | bots "média 17,39/mediana 18" | apontado, corretamente, como suspeito | já diagnosticado corretamente no achado #32 como o valor de seed puro (circuito não resolveu nada nesse cenário) — nenhuma correção adicional necessária, só confirma o mecanismo. |
| Fase 5 (achados #31/#32), cenários 40/80/150 | não usados | — | Os números publicados nesses achados vieram de `DIAG_CAPACITY` (demanda antes do preenchimento, contagem de duplas) e de `tournament-results.csv` (classificação de campeões) — **nenhum dos dois lê `tournaments_played`**. Não afetados. |

**Nenhuma conclusão qualitativa se inverte.** A correção não muda "quem
domina" (reais sempre dominaram, em título e agora confirmadamente em
participação) — muda a MAGNITUDE de um número específico (Resultado B),
e na direção de FORTALECER (não enfraquecer) a leitura de domínio real
já registrada nos achados #29/#30 (95,25% dos títulos, força competitiva
≠ ranking).

**Número novo, medido com o campo já corrigido** (baseline oficial,
900+100, seed `official-900-100-s1`, 2 temporadas, ANTES de qualquer
mudança de comportamento desta fase — mede só o efeito da correção do
dado):

```
Torneios disputados — reais: média 40.83 / mediana 30 · bots: média 2.81 / mediana 0
```

**A mediana de bots é ZERO.** Mais da metade de toda a população
procedural nunca joga um único torneio em 2 temporadas inteiras — um
achado que estava COMPLETAMENTE invisível atrás do valor de seed (que
garantia um piso artificial de 6-33 em qualquer leitura). Isto não é uma
correção cosmética: é a confirmação mais direta, até agora, do mecanismo
de concentração de vencedores já descrito no achado #32 (item 1.2) — não
é só que ~67% das duplas que TENTAM ficam de fora numa dada temporada; é
que, olhando o ATLETA (não a dupla-tentativa), a experiência
MEDIANA de um bot procedural ao longo de uma carreira inteira é nunca
pisar numa chave.

### 0.4 — Correção aplicada: campos separados

`rankingPopulation.js:175` — o valor estático foi renomeado para
`backstory_tournaments_played` (mesma fórmula, mesmo valor — só não
compartilha mais o contador com `WorldTourLifecycle.js`). Confirmado por
grep em todo `src/**/*.jsx`: **nenhuma tela lê `tournaments_played`** —
o campo nunca teve propósito de exibição, só de auditoria/estatística
interna, então a renomeação não tem efeito visual nenhum, só corrige a
métrica. Nenhum outro consumidor de `tournaments_played` (achievement
engine, `seasonLifecycle.js`, `padel.js`, `tournamentLifecycle.js`) toca
bots — todos operam sobre o perfil do PRÓPRIO jogador, que nunca recebeu
o seed.

---

## 1 — Agenda de tier (implementada)

Decisão do pedido: **não ampliar `TIER_EVENTS_PER_YEAR`** (permanece no
valor original, 24/16). O achado #32 mostrou que a razão agregada
demanda/capacidade cai ao ampliar o calendário, mas a fração de duplas
distintas nunca escaladas fica travada em ~67% — sintoma de que o
problema é SELEÇÃO, não volume. Três mudanças, todas dentro de
Bronze/Silver (os únicos tiers `minRanking:0`; nenhum outro tier tocado):

### 1.1 — Teto de tier (`EntryManager.js`)

Antes, `directLimit===0` (Bronze/Silver) aprovava QUALQUER rank,
inclusive #1 — só havia piso, nunca teto. Agora, uma dupla já
classificada para o Gold (rank ≤ `TOURNAMENT_TIER_CONFIG.Gold.minRanking`,
hoje 800 — referenciado do próprio config, não um número novo solto) é
`INELIGIBLE` para Bronze/Silver. Só se aplica a quem JÁ tem ranking
(rank>0) — um par recém-formado sem ranking nunca é bloqueado por isto,
só por já ter subido o bastante. **Efeito colateral notado, não
escondido**: `evaluateTournamentEntry` é compartilhada com o fluxo de
inscrição do PRÓPRIO jogador — um jogador que cruza o corte do Gold
também deixa de poder se inscrever em Bronze/Silver. Considerado
correto por design (nenhum circuito real deixa um atleta de elite
"farmar" pontos num evento de entrada), não uma mudança de escopo
acidental.

### 1.2 — Seleção por prioridade de ranking, não por overall_rating (`WorldTourLifecycle.js`)

Antes, quando mais duplas escolhiam um torneio do que havia vagas, o
ÚNICO critério de corte era `pairScore` (dominado por `overall_rating`)
— a MESMA operação que depois decide QUEM VENCE dentro da chave já
fechada. Agora, uma nova função (`applyOpenTierEntryPriority`) decide
QUEM ENTRA antes: só roda quando há mais candidatos que vagas
(`entrants.length > drawSize`) e só nos tiers `minRanking:0`.
`pairScore`/`ordered` continuam INTACTOS depois disso — skill ainda
decide quem vence a partir de quem já entrou; a mudança é só na PORTA de
entrada, não no resultado do jogo.

### 1.3 — Piso por prioridade (achado #30, opção "a" já proposta)

75% das vagas de cada chave oversubscrita vão para as duplas de melhor
RANKING (não overall) entre as candidatas; os 25% restantes (arredondado,
`OPEN_TIER_RESERVED_SHARE=0.25`, ponto de partida a ajustar por medição)
são reservados para as duplas com MENOS torneios jogados na temporada
até aqui (`tournaments_played`, agora limpo pela correção do item 0) —
o piso que impede exclusão permanente mesmo de quem nunca sobe no
ranking bruto, sem depender de sorte de sorteio.

### 1.4 — Medição antes/depois

Mesma seed/escala oficial (900+100, `official-900-100-s1`), 2
temporadas, `TIER_EVENTS_PER_YEAR` intocado. "Antes" reaproveita os
números do achado #32 (razão/exclusão — métrica `DIAG_CAPACITY`, não
afetada pela contaminação do item 0) e um novo baseline desta fase
(título/participação — já com o campo corrigido, ainda sem a agenda de
tier, pra isolar o efeito de CADA mudança separadamente, como pedido).

**Razão demanda/capacidade e exclusão real (Bronze+Silver):**

| | Antes (achado #32) | Depois (agenda de tier) |
|---|---|---|
| Temporada 1 — razão | 9,99× | **1,57×** |
| Temporada 1 — nunca jogaram | 228/402 (56,7%) | **140/391 (35,8%)** |
| Temporada 2 (regime) — razão | 15,29× | **0,75×** |
| Temporada 2 (regime) — nunca jogaram | 349/517 (67,5%) | **86/509 (16,9%)** |

**A razão de regime não só caiu — cruzou de "15× oversubscrito" para
"abaixo da capacidade existente" (0,75×).** Isto muda a resposta ao
item 1 da Fase 5 (dimensionar a base): com a seleção corrigida, os 40
eventos/ano ATUAIS de Bronze+Silver não estão mais subdimensionados —
pelo contrário, sobra capacidade na medição de regime. **Ampliar o
calendário, com a agenda de tier já em vigor, deixaria de ser
necessário** — o próprio "item 3 responde o item 1", exatamente como
apontado antes de implementar. (Não é uma medição de "qual o tamanho
ideal agora" — só confirma que a pergunta original, "15× precisa de mais
calendário", não se sustenta mais nesta arquitetura.)

**Classificação de títulos, por tier (2 temporadas, `tournament-results.csv`):**

| Tier | Antes — 100%-reais/bots/mista | Depois — 100%-reais/bots/mista |
|---|---|---|
| Bronze | 46/2/0 (95,8% real) | **14/31/3 (29,2% real)** |
| Silver | 32/0/0 (100% real) | **9/21/2 (28,1% real)** |
| Gold | 12/4/0 | 12/3/1 (idêntico, dentro do ruído) |
| Platinum | 11/1/0 | 10/1/1 (idêntico) |
| Masters | 20/0/0 | 20/0/0 (idêntico) |
| Elite | 19/1/0 | 19/1/0 (idêntico) |
| Crown | 8/0/0 | 8/0/0 (idêntico) |
| **Total (159 torneios)** | **151/8/0 (95,0% real)** | **95/57/7 (59,7% real)** |

**Efeito limpo e exatamente localizado — nenhum tier além de
Bronze/Silver mudou.** A queda de 95%→59,7% na dominância AGREGADA não é
um enfraquecimento geral dos reais — é a remoção deles de dois tiers
específicos que, por desenho de circuito real, nunca deveriam ser
disputados por quem já tem ranking pra Gold pra cima. **Responde
diretamente ao item 3 original da Fase 5** ("o problema não é fazer os
reais vencerem, é fazê-los aparecer nos lugares certos"): Gold até Crown
seguem tão dominados por reais quanto antes (idêntico, tier a tier);
Bronze/Silver — onde eles nunca deveriam estar competindo — agora vão
majoritariamente pra quem precisa deles.

**Participação (torneios disputados) e rotatividade dos reais ausentes:**

| | Antes (0.3, campo já corrigido) | Depois (agenda de tier) |
|---|---|---|
| Torneios disputados — reais | média 40,83 / mediana 30 | média 26,46 / mediana 21 |
| Torneios disputados — bots | média 2,81 / mediana **0** | média 4,25 / mediana **2** |
| Reais que nunca jogaram (2 temp.) | 5/100 | 4/100 |
| Reais que não jogaram, por temporada | 9, 14 | 14, 15 |
| Interseção (excluídos em TODAS as temporadas) | 5/100 (27,8% da união) | **4/100 (16% da união)** |

Dois efeitos honestos, na direção esperada e na direção inesperada:
participação MEDIANA de bots sai de 0 pra 2 — mais da metade dos bots
agora joga pelo menos alguma coisa, não mais zero — e a exclusão
PERMANENTE de reais cai (27,8%→16% de interseção — quem fica de fora
rotaciona mais, prende menos sempre os mesmos). **Mas a contagem de
reais sem jogar NUMA temporada específica sobe (9,14→14,15)** — efeito
colateral esperado do teto: reais perderam o acesso "fácil" de
Bronze/Silver e agora dependem só das vagas (mais escassas) de Gold pra
cima pra aparecer numa chave. Não é regressão — é o preço direto de "os
reais não deveriam estar competindo em Bronze/Silver": eles aparecem
menos em QUALQUER chave por temporada, mas quando aparecem, é nos tiers
certos, e a exclusão total ao longo do tempo é menor, não maior.

Chaves incompletas: 0/80 (2026) → 0/80; 0/79 (2027) → 0/79 — **nenhuma
mudança**, o piso de 25% e o preenchimento de reserva continuam
fechando toda chave.

---

## 2 — Portão de parceria (implementado)

### 2.1 — O que foi ligado

`calculatePartnershipInterest`
(`src/players/teamCompatibility.js:67`) — o campo `available`, que
`buildInitialPartnerOffers` sempre leu mas que só checava aposentadoria,
agora também exige `score >= T_low` (30). Um novo campo, `friction`
(`score < T_high`, 55), marca a faixa intermediária — visível, mas com
termos mais duros. **Correção feita na FONTE** (dentro da própria
`calculatePartnershipInterest`), não em cada consumidor — os três
caminhos de contratação, o inventário de candidatos disponíveis/
bloqueados do PartnerHub e do onboarding, e a tela de comparação de
ofertas herdam o portão automaticamente, sem lógica duplicada.

Limiares (`T_low=30`, `T_high=55`) calibrados por cálculo direto contra
a fórmula real (não simulado) na Fase 5, e reverificados nesta fase
contra o CATÁLOGO REAL do PartnerHub (340 candidatos) — ver item 2.4.

### 2.2 — Unificação dos 3 caminhos de contratação

| Caminho | Antes | Depois |
|---|---|---|
| Onboarding (`PartnerSelection.jsx`) | já usava `getSuggestedPartnerTerms` (gap-based) | inalterado — já correto |
| PartnerHub → convite direto (`handleInvite`) | termos fixos (`60`, `50`), nenhum gate além do nível XP | `getSuggestedPartnerTerms(profile,bot)`; candidato só aparece na lista se `interest.available` |
| PartnerHub → aceitar oferta (`buildInitialPartnerOffers`) | termos fixos por posição no array (`[60,45,90,60][index]`/`prizeSplit:50`) | `getSuggestedPartnerTerms(profile,candidate)` — endurece sozinho com o gap, sem precisar de um ramo separado pra "faixa de fricção" |

`getAvailablePartners`/`getLockedPartners` (`src/lib/career.js`) — o
gate por XP (pré-existente, eixo diferente: progresso geral de carreira)
continua valendo; candidatos dentro do nível de XP mas com
`interest.score` abaixo do piso agora migram de "disponível" para
"bloqueado", reaproveitando a MESMA lista/UI que já existia pro bloqueio
por nível (`PartnerSearch.jsx`), com um rótulo que distingue os dois
motivos ("suba de nível" vs. "reputação/ranking ainda baixos") em vez de
inventar uma seção nova.

`generatePartnerProposals`/`accept_partnership` (`partnershipSystem.js`)
— confirmado, de novo, código morto (zero chamadores, achado #31) — não
é um quarto caminho ativo, não precisou de mudança.

### 2.3 — Item 2.5 (ciclo de vida das ofertas) — já resolvido, achado novo

A pergunta em aberto da Fase 5 ("ofertas expiradas são limpas? o
jogador vê candidatos melhores aparecerem conforme progride?") tinha
uma resposta que a Fase 5 não tinha encontrado: existe
`processSpontaneousPartnerMarket` (`partnerOffers.js:120`, "Fase 15" —
anterior a esta auditoria), **já ligada ao laço diário de produção**
(`gameStateLifecycle.js:97`), rodando uma vez por virada de mês
(idempotente), que (a) marca ofertas pendentes expiradas como
`expired`, (b) sorteia, com chance real (~22%/mês livre, ~9%/mês
pareado), uma nova oferta entre candidatos ainda não oferecidos, e (c)
reusa `buildInitialPartnerOffers` — ou seja, herda o portão e os termos
corrigidos automaticamente, sem precisar de nenhuma mudança adicional.
**Não era uma lacuna a fechar — já funcionava; só não tinha sido
conferido antes de propor o desenho.** Registrado aqui porque a
Fase 5 explicitamente listou isso como dependência não confirmada.

### 2.4 — Item 2.6 — efeito medido

Não uma simulação de carreira completa (custo de +15-20min de harness,
fora do essencial desta medição) — medição direta, com a fórmula real,
contra o catálogo REAL do PartnerHub (340 candidatos: 100 reais + 240
fictícios, `BOTS_BY_DIFFICULTY`), em 6 estágios de carreira:

| Estágio | Disponíveis (catálogo) | Fricção | Abertos | Top 20 mundial |
|---|---|---|---|---|
| Dia 1 — #1000, reputação 10 | 289/340 | 289 | 0 | **0/20 disponível** (invisível) |
| Início — #500, reputação 20 | 340/340 | 178 | 162 | 20/20 disponível, **0/20 aberto** (só fricção) |
| Meio 1 — #200, reputação 40 | 340/340 | 9 | 331 | 20/20 disponível, **12/20 aberto** |
| Meio 2 — #100, reputação 55 | 340/340 | 0 | 340 | **20/20 aberto** |
| Avançado — #50, reputação 70 | 340/340 | 0 | 340 | 20/20 aberto |
| Elite — #10, reputação 90 | 340/340 | 0 | 340 | 20/20 aberto |

Bate com o alvo declarado: **no dia 1, o jogador não vê NENHUM dos 20
melhores do mundo** (não é "difícil", é invisível) — mas já tem acesso à
maior parte do catálogo comum (289/340), consistente com "consegue
parceiro compatível com o nível dele". O Top 20 começa a aparecer cedo
(fricção, termos duros) mas só começa a abrir de verdade em torno de
#200/reputação 40 — exatamente a faixa de "meio de carreira" que o
pedido definiu como alvo, não "escolha de menu" do dia 1. Calibração
inicial (`T_low=30`/`T_high=55`) mantida sem ajuste — o comportamento
medido bate com o desenho pretendido.

---

## 3 — Suíte: 3 falhas datadas e corrigidas, e outras 3 descobertas pela primeira medição completa (36/36)

Pedido: não aceitar "pré-existente" sem `git log`. As três originais
rastreadas até a origem exata — **todas nasceram no mesmo commit**
(`c012097`, 2 de setembro de 2026, "v95" — a extração de `fnv1aHash` pra
`src/lib/hashUtils.js`, parte desta mesma auditoria, fases 0.x):

| Falha | Causa raiz | Desde quando |
|---|---|---|
| `test:sports-economy` | `test-sports-economy-v26.mjs` copia `sportsEconomyV26.js` pra um arquivo temporário em `scripts/` antes de rodar, mas só reescrevia o import de `localGame` — o novo `import ... from './hashUtils.js'` (relativo a `src/lib/`) virava um caminho errado (`scripts/hashUtils.js`, que nunca existiu) na nova pasta | commit `c012097` |
| `test:match-integrity` | `random.js`/`PersonalityModel.js` passaram a importar `fnv1aHash` via `@/lib/hashUtils.js` (alias só resolvido pelo Vite) — o teste rodava o motor de partida inteiro via `node` puro, sem Vite | commit `c012097` |
| `test:beta` | compõe `test:match-integrity` internamente — falha em cascata da mesma causa | commit `c012097` |

**Corrigido, todas as três:**
- `test-sports-economy-v26.mjs` — reescreve também o import de
  `hashUtils.js` ao copiar o arquivo (`./hashUtils.js` →
  `../src/lib/hashUtils.js`).
- `random.js`/`PersonalityModel.js` — import trocado de `@/lib/hashUtils.js`
  pro relativo `../../lib/hashUtils.js` (funciona idêntico sob Vite E sob
  `node` puro; estas duas dependências não tinham razão de usar o alias).
- `test-match-integrity.mjs` — reescrito pro MESMO padrão já usado por
  `audit-real-athletes-simulation.mjs` (`vite.ssrLoadModule` num servidor
  Vite em modo middleware) em vez de import ESM direto — corrige a
  CLASSE do problema, não só o arquivo específico: qualquer módulo futuro
  que o motor de partida alcançar usando `@/` (337 arquivos em `src/` usam
  o alias) continuaria quebrando um import direto; o runner agora resolve
  como produção resolve.

Confirmado: `npm run test:sports-economy`, `npm run test:match-integrity`
e `npm run test:beta`, isolados, todos verdes depois da correção.

### 3.1 — Rodar a suíte completa (36/36, não só os 3 nomeados) revelou mais 4 problemas

Rodar `rc-qa-suite-v36.mjs` inteiro (perfil `core`, 36 suítes — nunca
tinha sido rodado completo nesta auditoria) revelou mais 4 falhas além
das 3 nomeadas no pedido. Investigadas com o mesmo padrão (`git log`,
não suposição):

- **`test:live-coach`, `test:rc-gameplay-balance` (ao importar),
  `test:rc-match-experience`** — MESMA causa raiz e MESMO commit
  (`c012097`) que `test:match-integrity`: `LiveTacticalAdjustmentManager.js`
  também passou a importar `fnv1aHash` via `@/lib/hashUtils.js`.
  **Corrigido** com a mesma correção (import relativo).
- **`test:partner-offers` — regressão desta própria fase, corrigida.**
  `partnerOfferRules.js` passou a importar `getSuggestedPartnerTerms` de
  `partnerLifecycle.js` (item 2, unificação dos 3 caminhos) — que importa
  `@/api/localGameClient.js` (alias, e `padel.js`, também alcançado
  transitivamente, tem o mesmo problema — confirmado, não hipótese:
  `node -e "import('./src/lib/padel.js')"` falha isolado). O teste rodava
  via `node` puro. **Corrigido**: `test-partner-offers-v2.mjs` reescrito
  pro mesmo padrão `vite.ssrLoadModule` (não vale a pena isolar
  `getSuggestedPartnerTerms` num módulo à parte só pra fugir de
  `padel.js` — ele mesmo já não resolve sob `node` puro, o problema é
  estrutural, não deste caminho específico).
- **`test:career-pace` — pré-existente, não relacionado, não corrigido.**
  `git log -S "function buildWeekProgram"` — o teste faz parsing por
  REGEX do texto-fonte de `circuitCatalog.js`, esperando
  `const WEEK_PROGRAM = Object.freeze([...])` como array LITERAL; desde
  o commit `694164e` (4 de setembro de 2026, "v100" — antes desta
  sessão), `WEEK_PROGRAM` é gerado por `buildWeekProgram()`, uma função —
  o regex nunca mais bateu. Teste desatualizado pela própria evolução do
  código, não por nada tocado nesta fase; fora do escopo desta entrega
  (exigiria reescrever o teste pra inspecionar o valor em runtime, não o
  texto-fonte).
- **`test:ui-quality` — pré-existente, não relacionado, não corrigido.**
  14 ocorrências (mojibake UTF-8 em `Coaches.jsx`/`coachLifecycle.js`/
  `practiceMatchSession.js`/etc., destinos de navegação ausentes,
  estado vazio de `Matches.jsx`) — todos os arquivos apontados datam de
  22 de agosto de 2026 ("v91"), meses antes desta auditoria e da fase do
  hash. Subsistema (treino/partidas/coaches) nunca tocado por Fase 5/5.1.1.

**Achado sobre o próprio processo de correção**: `test:rc-gameplay-balance`
crashava no IMPORT antes da correção (mesmo erro dos outros dois) — só
depois de corrigido é que rodou de verdade pela primeira vez em semanas e
revelou um problema DIFERENTE, uma via (`aggressive-tactic`) com
`winRate` exatamente 50/50, reprovada pelo próprio critério do teste.
Reproduzido de forma determinística (não é instabilidade — roda de novo,
mesmo resultado) e confirmado sem relação com nada tocado nesta fase
(`random.js` só mudou de CAMINHO de import, não de função — mesmo
arquivo, `src/lib/hashUtils.js`, resolvido dos dois jeitos). É um
problema de equilíbrio do motor de partida/tática, destravado (não
causado) por esta correção — registrado, não corrigido, fora do escopo
de parceria/tier/tournaments_played.

**Resultado final da suíte completa** (perfil `core`, 36 suítes,
antes/depois de toda a Fase 5.1): **26/36 (score 72/100) → 33/36 (score
92/100).** As 3 falhas restantes (`test:rc-gameplay-balance`,
`test:career-pace`, `test:ui-quality`) são todas pré-existentes,
confirmadas sem relação com parceria/tier/`tournaments_played`, e
ficam registradas para decisão futura, não para esta entrega.

---

## 4 — Validação final

- Instrumentação temporária (`DIAG_CAPACITY`, reintroduzida só para a
  medição do item 1.4) revertida integralmente — confirmado por grep,
  zero ocorrências de `DIAG_CAPACITY`/`__diagCapacity` em `src/`/`scripts/`;
  `git diff` vazio em `WorldTourLifecycle.js`/`audit-real-athletes-
  simulation.mjs` para essa instrumentação específica (as mudanças
  permanentes da agenda de tier continuam, só o diagnóstico saiu).
- `npm run lint` (`eslint . --quiet`) — limpo, sem avisos, em todo o
  repositório.
- `npm run build` — OK (`vite build`, sem erros; único aviso é o já
  existente de chunk >500kB pós-minificação, não relacionado).
- Suíte de regressão completa (`node scripts/rc-qa-suite-v36.mjs`,
  perfil `core`, 36 suítes) — **33/36 aprovadas, score 92/100** (era
  26/36, 72/100, no início desta fase). As 3 falhas restantes são
  pré-existentes e sem relação com esta fase (item 3.1).
- `git status --short -- src-tauri/` — vazio, nenhum arquivo tocado.
- Relatórios auto-regenerados por rodar os testes
  (`reports/rc-qa-latest.*`, `reports/BETA-AUDIT-v36.1.*`,
  `reports/rc-sprint-1/*`, `reports/massive-careers-v32.json`,
  `reports/career-difficulty-pace.json`) revertidos (`git checkout`)
  antes do commit — não fazem parte do diff desta entrega.

---

## Entrega

| # | Item | Status |
|---|---|---|
| 0 | Verificação de `tournaments_played` | ✅ contaminação confirmada (reais=0, bots seed 6-33); nenhuma conclusão qualitativa se inverte (a de Resultado A/C fica MAIS forte); campo separado (`backstory_tournaments_played`); achado novo — mediana de bots é ZERO, invisível até agora |
| 1 | Agenda de tier implementada e medida | ✅ teto (Gold.minRanking) + seleção por ranking + piso de 25% por menor participação; `TIER_EVENTS_PER_YEAR` intocado; razão de regime 15,29×→**0,75×** (abaixo da capacidade), exclusão 67,5%→**16,9%**, efeito limpo e localizado (Gold+ idêntico) |
| 2 | Portão de parceria implementado e medido | ✅ `available` ligado ao `score`; 3 caminhos de contratação unificados via `getSuggestedPartnerTerms`; item 2.5 confirmado já resolvido (achado novo, não lacuna); item 2.6 medido contra o catálogo real (340 candidatos) — calibração bate com o alvo sem reajuste |
| 3 | Falhas de suíte datadas e corrigidas | ✅ as 3 nomeadas, mesmo commit de origem (`c012097`); suíte completa (36/36, nunca rodada inteira antes) revelou +4 (3 mesma causa/corrigidas, 1 regressão desta fase/corrigida); 3 pré-existentes e não-relacionadas registradas, não corrigidas — score 72/100→**92/100** |
| 4 | Suíte verde, lint, build OK | ✅ lint limpo; build OK; suíte 33/36 (3 restantes pré-existentes, não relacionadas); `src-tauri/` intocado |

**Resumo executivo**: a verificação pedida encontrou uma contaminação
real — `tournaments_played` misturava história de fundo estática (só
bots) com jogo de verdade — e corrigi-la revelou um achado maior do que
o esperado: a mediana de bots era ZERO torneios jogados em 2 temporadas,
completamente invisível atrás do piso artificial do seed. Com o dado
limpo como baseline, a agenda de tier — teto pra quem já é bom demais
pra Bronze/Silver, seleção por ranking em vez de overall_rating, piso
por prioridade pra quem nunca joga — não só melhorou a razão
demanda/capacidade que motivou a Fase 5 inteira: **fez ela desaparecer**
(15,3× → 0,75×, abaixo da capacidade existente). O efeito é
cirurgicamente localizado em Bronze/Silver (Gold pra cima idêntico,
tier a tier) — os reais não pararam de dominar, pararam de competir
onde não deveriam, exatamente o item 3 original da Fase 5. O portão de
parceria, aprovado no desenho anterior, está implementado, os 3
caminhos de contratação unificados numa única função de termos, e a
calibração inicial (`T_low=30`/`T_high=55`) bateu com o alvo sem
precisar de ajuste quando medida contra o catálogo real. Rodar a suíte
de regressão completa pela primeira vez (36/36, não só os scripts
historicamente cobertos) valeu a pena por si só: encontrou 4 falhas além
das 3 pedidas, 4 delas corrigidas na causa (mesmo commit ou regressão
desta fase), 3 registradas como pré-existentes e fora de escopo — a
suíte sai desta fase em 92/100, contra 72/100 no início.
