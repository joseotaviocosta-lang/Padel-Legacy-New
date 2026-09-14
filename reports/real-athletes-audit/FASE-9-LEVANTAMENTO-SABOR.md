# Fase 9 — Levantamento: o que já existe para "sabor"

> **COMPLETA — só levantamento, nada implementado**, conforme pedido.
> Panorama de 4 sistemas investigado em paralelo (rivalidade,
> aposentadoria visível, imprensa/notícias, dupla com real), mais um
> inventário adicional de "quase pronto" (item 5). Resultado principal:
> **a Fase 9 é majoritariamente trabalho de CONEXÃO, não de construção**
> — 3 dos 4 sistemas já existem e funcionam mecanicamente (2 deles já
> aplicam a reais sem restrição), mas nenhum tem tratamento
> narrativo/visibilidade proporcional ao "peso" de ser um nome real do
> circuito. O único item genuinamente ausente é a aposentadoria visível
> (nenhum evento é gerado hoje).

## 1 — Rivalidade: **já existe e funciona, já se aplica a reais**

Dois sistemas paralelos, ambos funcionais, nenhum com filtro que exclua
`real_*`:

- **Jogador-vs-atleta**: `src/lib/relationships.js` +
  `src/game-core/relationshipLifecycle.js`, sobre uma entidade real
  `Relationship` (`profile_id`, `target_athlete_id`, `score`,
  `shared_matches/wins/losses/finals`). Gatilho: `RIVALRY_MIN_MATCHES = 3`
  (`src/lib/careerStory.js:189`), com escalada em ≥5 partidas
  (`relationships.js:286-292`) e deriva semanal de score
  (`relationshipLifecycle.js:72-100`). `seedInitialRelationships`
  (`relationships.js:325-355`) semeia os top-5 por `overall_rating` de
  TODO o pool de `AthleteProfile` — reais incluídos, sem checagem de
  `is_real` em nenhum ponto do fluxo.
- **Bot-vs-bot**: `src/lib/athleteBehavior.js:154-195`
  (`generateRelationships`), criado a partir de fatos de confronto direto
  reais (`head_to_head`, ≥3 encontros) — não aleatório.
- **Substrato factual comum**: `WorldTourLifecycle.js:334-347,379,627,740`
  (`appendFinalHeadToHead`/`headToHeadByAthlete`) grava histórico de
  confronto direto após toda final resolvida, consumido por ambos os
  sistemas acima.
- **Exposição ao jogador**: já existe — página dedicada
  `src/pages/Relationships.jsx`, resumo no Legacy
  (`CareerIdentitySummary.jsx:45-48`), gatilho de entrevista de imprensa
  (`src/pages/Press.jsx:72-101`, `pressData.js:306-309,890-904`), seção
  "Rivalidades" no Journal (`Journal.jsx:80,144-152`), badge no
  `AthleteDetail.jsx:189-191`.

**Veredito: nada a construir aqui.** Se a Fase 9 quer rivalidade com
nomes reais especificamente, o mecanismo já entrega isso hoje — o
trabalho, se houver, é de CURADORIA/ênfase (ex.: garantir que o sistema
de seed/escalada priorize nomes reais de peso ao montar as rivalidades
iniciais do jogador), não de construção.

## 2 — Aposentadoria visível: **existe como dado silencioso; visibilidade ao jogador não existe**

- **O flip de estado**: `evolveAthleteCareerMonth`
  (`src/game-core/livingCircuitRules.js:164-173`) seta `retired: true`,
  `retirement_date`, `career_status: 'aposentado'` — idêntico pra real e
  bot. Nenhum evento/toast/notícia é criado nesse momento. O único efeito
  colateral é um contador interno (`cumulative_retired_athletes` em
  `PlayerProfile`, `athleteBehavior.js:334-351`) usado só para calibrar
  reposição de prospects — nunca exposto ao jogador.
- **`AthleteCareerLegacy`**: não é uma entidade com schema fixo
  (`base44/entities/`) — é uma coleção dinâmica do jogo local, criada e
  gravada corretamente toda vez que um atleta (real ou bot) se aposenta
  (`athleteBehavior.js:297,329`, via `buildRetirementLegacyRow`). **Mas é
  essencialmente write-only**: o único leitor em todo o repositório é um
  script de diagnóstico (`scripts/diag-retirement-legacy-check.mjs:88`) —
  nenhuma página ou componente de jogo consulta isso.
- **`HallOfFame.jsx`**: renderiza exclusivamente `HOF_LEGENDS`, um array
  estático hardcoded (`src/lib/hallOfFameData.js:29+`, bios/stats/
  timelines escritos à mão) — zero relação com `AthleteCareerLegacy`,
  `AthleteProfile`, ou qualquer estado vivo do jogo. Existe também um
  schema real `HallOfFameEntry` (`base44/entities/HallOfFameEntry.jsonc`)
  com 1 linha de seed (`src/local/localSeed.js:240`) — confirmado por
  busca em todo `src/`: **zero leitores**, nem a própria página de Hall
  da Fama consulta essa entidade.
- **Sinal ao jogador quando um real se aposenta**: não existe nenhum.
  Buscas por "aposentad" no sistema de imprensa só encontram uma pergunta
  de entrevista GENÉRICA e especulativa sobre o PRÓPRIO jogador
  considerar se aposentar (`pressData.js:464-468`) — sem relação com
  eventos de terceiros. **O jogador só percebe pela ausência do atleta
  nos rankings/torneios.**

**Veredito: dado existe e é gravado corretamente (`AthleteCareerLegacy`),
mas não há NENHUMA superfície de visibilidade — nem evento, nem consulta,
nem tela.** Este é o único item dos 4 que precisa de construção real
(ainda que pequena): conectar o momento da aposentadoria a um
`WorldEvent` (categoria `aposentadoria` já existe no schema, item 3) e/ou
fazer alguma tela ler `AthleteCareerLegacy` de verdade — o dado já está
lá, só falta o cano até a tela.

## 3 — Imprensa/notícias: **schema rico já existe; geração trata reais e bots igual; há uma tela dedicada pouco conectada**

- **Schema `WorldEvent`** (`base44/entities/WorldEvent.jsonc`): `event_type`
  já tem 20 categorias, incluindo `rivalidade`, `aposentadoria`,
  `promessa`, `lesao`, `escandalo`, `transferencia`, `ranking`,
  `historico` — não é só "ambientação genérica". Tem `related_players`
  (array) e `tier`/`impact_level`. O schema já foi desenhado pensando em
  eventos específicos de atleta.
- **Geração real**: `worldMarketLifecycle.js:202-213,230-239`,
  `circuitLifecycle.js:74`, `athletePersonalityLifecycle.js:86`,
  `aiPartnershipLifecycle.js:504`, `worldSimulationLifecycle.js:289,383`
  já geram eventos nomeando atletas específicos (aposentadoria, promessa,
  lesão) com `related_players` preenchido. **Mas tratam reais e bots
  identicamente** — confirmado por comentário explícito em
  `livingCircuitRules.js:93-96`: "vale igual para reais e bots (não olha
  `is_real`)". Nenhuma ponderação/raridade maior para um nome real.
- **Corte de -71% (Fase 2.7/2.8)**: mirava especificamente o gerador de
  AMBIENTAÇÃO editorial (`livingWorldEngine.js:224-237` — 1-2/dia de só 3
  templates genéricos, sem categoria, competindo pelo mesmo widget de 3
  itens que notícia de torneio/ranking/lesão de verdade) — reduzido pra
  1/3 dias. **Não mexeu nos geradores de evento por-atleta** (que já
  ficam em código separado, acima). O corte libera espaço no WIDGET de 3
  itens (menos ruído genérico competindo por slot), mas não foi pensado
  como orçamento de conteúdo pra eventos raros — é um efeito colateral
  favorável, não a intenção original.
- **`Press.jsx`**: não é feed de notícias — consulta `PressArticle`/
  `PressJournalist` (gestão de mídia/entrevistas DO PRÓPRIO jogador, abas
  Feed/Entrevistas/Jornalistas). Sistema separado.
- **`WorldEvents.jsx` — a tela dedicada que EXISTE**: rota real
  (`/world-events`, `App.jsx:136`), alcançável por navegação de verdade
  (`WorldHub.jsx:313`, link "ver mais"), lê `getRecentWorldEvents(50)` e
  filtra por `EVENT_TYPES`/`EVENT_TYPE_META` — ou seja, **já é capaz de
  mostrar TODAS as 20 categorias**, incluindo aposentadoria/rivalidade.
  Não é órfã (tem rota + entrada de navegação), mas é uma tela
  secundária (alcançada via "ver mais" do WorldHub, não um item de menu
  principal) — baixa visibilidade, não zero.
- **`CareerHub` (3 itens)**: `CareerHub.jsx:803-826`
  (`WorldHighlights`), `.slice(0,3)` confirmado literal — mistura
  `getLivingWorldSnapshot` com `Post` genéricos, sem prioridade pra
  marco de atleta específico.

**Veredito: existe e funciona tecnicamente (schema rico, geração
por-atleta real, tela dedicada roteada) — mas nunca foi CONECTADO com
peso extra pra reais.** Trabalho de conexão: (a) ligar o momento de
aposentadoria (item 2) a uma criação de `WorldEvent` categoria
`aposentadoria` com `related_players`; (b) dar prioridade/raridade maior
a eventos envolvendo `is_real` no `CareerHub` (3 itens) e no widget de
destaque, já que a tela dedicada existe mas tem baixa visibilidade
sozinha.

## 4 — Dupla com atleta real: **já existe e funciona — só por um caminho, não pelo outro**

- **`calculatePartnershipInterest`** (`src/players/teamCompatibility.js:82-104`):
  função de pontuação pura (compatibilidade×0,35 + reputação×0,30 +
  progresso de ranking×0,35 − demanda de elite×0,15), com limiares
  `PARTNERSHIP_INTEREST_THRESHOLDS` (`low:30, high:55`). Não escolhe o
  pool sozinha — quem chama é que decide de onde vêm os candidatos.
- **Dois caminhos distintos, resultados diferentes**:
  - **Aba "Buscar parceiro"** (`PartnerHub.jsx` → `getAvailablePartners`,
    `career.js:324-333`): pool vem só de `BOTS_BY_DIFFICULTY` (catálogo
    fictício de oponentes, `src/lib/bots.js`) — **reais NUNCA aparecem
    aqui**.
  - **Ofertas espontâneas de mercado** (`partnerOffers.js:120-152`,
    `partnerLifecycle.js`, `marketNegotiationLifecycle.js`): pool vem de
    `AthleteProfile.filter({market_status:'livre'})` — reais ESTÃO
    nessa tabela com seu `id` real preservado (`real_arturo_coello` etc.,
    confirmado via `saveFoundation.js`), e atletas reais desemparelhados
    default pra `market_status:'livre'`. **Reais SÃO alcançáveis aqui,
    tecnicamente.**
- **Nenhuma trava específica**: busca por `is_real`/lista hardcoded em
  toda a cadeia do jogador (`partnershipSystem.js`, `partnerOfferRules.js`,
  `partnerOffers.js`, `partnerLifecycle.js`) não encontra NENHUMA
  exclusão — só os checks genéricos de status
  (`career_status!=='aposentado'`, `market_status!=='livre'`).
  `partnershipSystem.js:358-361` documenta isso como decisão deliberada:
  "grava legado sempre, sem checar `is_real`".
- **Fim a fim, é alcançável**: `processSpontaneousPartnerMarket`
  (mensal) pontua candidatos reais com a mesma função, cria
  `PartnerOffer` + mensagem de inbox que aparece nas abas
  "Propostas"/inbox do `PartnerHub.jsx`, aceitável via
  `acceptPartnerOffer`→`formPartnerContract` sem gate adicional. A
  penalidade de "demanda de elite" torna reais de topo estatisticamente
  difíceis de atrair cedo — mas não é um bloqueio, é fricção de
  pontuação, do mesmo jeito que seria pra um bot de elite.
- **Tratamento narrativo**: nenhum. Mensagens/termos de contrato usam os
  mesmos templates genéricos independente de quem é o candidato — 100%
  idêntico mecânica e narrativamente a formar dupla com um bot.

**Veredito: já existe e funciona pro objetivo original do jogo — mas só
por metade dos caminhos (mercado espontâneo, não busca manual), e sem
NENHUM momento narrativo que marque "você acabou de formar dupla com
[nome real]".** Trabalho de conexão: (a) opcionalmente estender a busca
manual pra incluir reais elegíveis (hoje é bot-only por construção); (b)
o item de maior valor por menor esforço aqui é puramente narrativo — uma
mensagem/evento especial quando `partner.id` começa com `real_`, sem
mexer em nenhuma regra de elegibilidade.

## 5 — Inventário adicional de "quase pronto"

Além dos 4 pedidos, dois candidatos claros ao mesmo padrão do
`image_url` (schema pronto antes do uso):

- **`AthleteCareerLegacy`** (já citado no item 2) — gravado
  corretamente a cada aposentadoria, zero leitores fora de um script de
  diagnóstico. É literalmente um "hall da fama" de verdade já
  alimentado, só sem nenhuma tela.
- **`HallOfFameEntry`** (`base44/entities/HallOfFameEntry.jsonc`) —
  schema real, 1 linha de seed, **zero referências de leitura em todo o
  `src/`** (confirmado por busca cruzada nas 46 entidades de
  `base44/entities/`, a entidade com menos referências no projeto
  inteiro, empatada com `User`). A própria página `HallOfFame.jsx` nem
  chega a consultá-la — usa só o array estático `HOF_LEGENDS`.

Não foram encontrados outros candidatos fortes fora desses dois na
varredura desta fase (outras entidades com poucas referências —
`Achievement`, `CircuitSeason`, `CoachTenure`, `EncyclopediaEntry`,
`Sponsor` — foram checadas por amostragem e são sistemas conectados,
só com baixo volume de uso de código, não desconectados).

## Conclusão: conexão, não construção

| Área | Status |
|---|---|
| Rivalidade | ✅ Já existe e funciona, já aplica a reais, já tem exposição de UI |
| Aposentadoria visível | ⚠️ Dado existe e é gravado (`AthleteCareerLegacy`), mas **nenhuma visibilidade ao jogador** — precisa construir a ponte (pequena) |
| Imprensa/notícias | ✅ Schema rico + geração por-atleta + tela dedicada já existem; **nunca ponderado pra reais**, tela pouco visível |
| Dupla com real | ✅ Já existe e funciona pelo caminho de mercado espontâneo; busca manual é bot-only; **zero tratamento narrativo** |

**3 de 4 sistemas já funcionam mecanicamente hoje.** O trabalho real da
Fase 9, na maior parte, é: (1) construir a única ponte que falta
(aposentadoria → `WorldEvent`/alguma tela lendo `AthleteCareerLegacy`);
(2) dar peso/prioridade extra a eventos envolvendo `is_real` nos
sistemas que já geram conteúdo mas tratam tudo igual (imprensa); (3)
adicionar camadas narrativas pontuais (evento especial ao formar dupla
com um real) sem tocar em nenhuma regra de elegibilidade já validada.
Não há necessidade de construir nenhum sistema do zero.
