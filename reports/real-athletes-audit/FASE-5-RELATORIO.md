# Fase 5 — Capacidade do circuito e portão de parceria

> Pré-requisito: Fase 4.4 entregue (o gargalo de capacidade em
> Bronze/Silver medido em 15,3-15,6× em regime, população decidida —
> 900 bots + 100 reais, sem corte). Ver
> [FASE-4.4-RELATORIO.md](FASE-4.4-RELATORIO.md). Esta fase mede a
> curva de capacidade em quatro tamanhos de calendário (sem escolher o
> número) e propõe — sem implementar — o desenho do portão de
> parceria. **Nada implementado nesta entrega**, conforme pedido; os
> dois itens aguardam aprovação antes de qualquer código.

## Método

Instrumentação temporária (`DIAG_CAPACITY`, mesmo padrão generalizado
da Fase 4.4/achado #31 — demanda por tier, não só Bronze/Silver desta
vez), harness de 2 temporadas (`scripts/audit-real-athletes-
simulation.mjs`), população oficial completa (900 procedurais + 100
reais = 1000, seed `official-900-100-s1`), quatro valores de
`TIER_EVENTS_PER_YEAR` (`circuitCatalog.js`) para Bronze+Silver — os
únicos tiers de acesso livre (`minRanking: 0`); Gold e acima
permanecem intocados em todos os quatro cenários, conforme instruído.
Instrumentação e configuração revertidas integralmente após medir —
confirmado por grep, zero ocorrências restantes de `DIAG_CAPACITY`/
`__diagCapacity` em `src/`/`scripts/`, e `git diff`/`git status` vazios
para os três arquivos tocados durante a medição.

| Cenário | Bronze | Silver | Base (Bronze+Silver) | Total/temporada (+38 tiers altos) |
|---|---|---|---|---|
| 40 (atual) | 24 | 16 | 40 | 78 |
| 80 | 48 | 32 | 80 | 118 |
| 150 | 90 | 60 | 150 | 188 |
| 250 | 150 | 100 | 250 | 288 |

O cenário 40 reaproveita os números já medidos e publicados na Fase 4.4
(mesma seed, mesma escala, regime-check de 5 temporadas) em vez de
rerodar — nenhum código mudou entre as duas medições.

## 1 — A curva de capacidade

### 1.1 — Razão demanda/capacidade e duplas nunca jogaram

| Cenário | Temporada 1 — razão | Temporada 2 — razão | Temporada 1 — nunca jogaram | Temporada 2 — nunca jogaram | Chaves incompletas |
|---|---|---|---|---|---|
| 40 (atual) | 9,99× | **15,29×** | 228/402 (56,7%) | **349/517 (67,5%)** | 0/80 (todas) |
| 80 | 7,44× | **10,97×** | 228/397 (57,4%) | **339/506 (67,0%)** | 0/239 (todas) |
| 150 | 3,99× | **5,93×** | 235/402 (58,5%) | **346/511 (67,7%)** | 0/379 (todas) |
| 250 | — | — | — | — | — |

(Temporada 2 é o número de regime — a 1 ainda tem a população/duplas se
formando, mesmo padrão já observado na Fase 4.4.) Cenário 250 não
produz linha: ver 1.3.

### 1.2 — O achado central: a razão cai, a exclusão não

A razão agregada demanda/capacidade cai de forma quase exatamente
proporcional ao aumento de vagas — dobrar a base de 40 para 80 corta a
razão de regime de 15,3× para 11,0× (-28%); quase dobrar de novo, para
150, corta para 5,9× (-46%). **Isso parece uma boa notícia até se
olhar pra métrica que realmente importa: a fração de duplas distintas
que tentaram Bronze/Silver e nunca entraram em nenhuma chave na
temporada fica **essencialmente parada em ~67%** nos três cenários
medidos — 67,5% → 67,0% → 67,7%.**

Mais que o dobro de vagas (40→150 de base, 640→2400 vagas/temporada) e
a fração de duplas excluídas não se move um ponto percentual. A leitura
mais direta: **o gargalo não é (só) volume de vagas — é o mecanismo de
seleção.** `WorldTourLifecycle.js` ordena todo o pool de duplas que
escolheu um torneio por `pairScore` (peso dominante:
`overall_rating` médio da dupla) e trunca em `drawSize`, toda semana,
sem rotação nem memória de quem ficou de fora da vez anterior. Cada
vaga nova criada pela expansão do calendário tende a ser preenchida
pela MESMA fatia de duplas de `overall_rating` mais alto que já
preenchia as vagas antigas — a razão agregada melhora porque a demanda
"sobra" por vaga fica menor, mas a IDENTIDADE de quem sobra continua
sendo, na prática, a mesma metade inferior da população, temporada
após temporada.

Isso conecta direto com o desenho de piso já proposto no achado #30/#31
(Fase 4.3/4.4): **reservar fração das vagas por prioridade — não
`pairScore` puro — para quem não tem outra opção elegível na semana**
ataca a causa (quem é escolhido), enquanto simplesmente aumentar o
calendário ataca só o sintoma agregado (quanta sobra existe). Os dados
desta fase não provam que aumentar capacidade é inútil — a fração pode
ceder em escalas maiores que as testadas — mas nas três escalas onde
foi possível medir, **o ganho marginal da expansão de calendário sobre
a exclusão real (não a razão agregada) é, até aqui, zero.**

### 1.3 — Cenário 250: não é um quarto ponto da curva, é um teto de código descoberto

A 150 de base (188 torneios/temporada) o circuito resolve normalmente
— 190 e 189 torneios por temporada, 379 no total, 0 chaves incompletas.
A 250 de base (288 torneios/temporada), com a MESMA população, o
circuito **para de resolver qualquer torneio, em qualquer tier, nas
duas temporadas — 0 resolvidos, sem nenhum erro ou aviso no log.**

Investigação da causa (leitura de código, não suposição):
`resolveCompletedWorldTourEvents` (`WorldTourLifecycle.js:156`) busca
os torneios pendentes assim:

```js
const [allTournaments, ...] = await Promise.all([
  entities.Tournament.list('-start_date', 300),
  ...
]);
```

— **limite fixo de 300 linhas, ordenado pelas datas MAIS RECENTES
primeiro.** `ensureFutureTournamentsInternal` (`career.js:419`) cria o
calendário com **15 meses de antecedência** (`horizon.setMonth(...+
15)`) a cada virada de mês. Com 288 torneios/temporada, 15 meses de
horizonte mantêm **~360 torneios simultaneamente existentes** (288 ×
15/12) — todos os torneios FUTUROS (ainda não pendentes) têm
`start_date` mais recente que qualquer torneio pendente (já encerrado,
aguardando resolução), então ocupam sozinhos as 300 posições da
consulta e **empurram para fora da janela os torneios que realmente
precisam ser resolvidos** — que nunca aparecem na lista, nunca entram
em `pending`, e a função retorna `{resolved: 0}` silenciosamente, todo
santo dia, pro resto da simulação. Não há chake incompleta nem erro
porque a função nunca chega a montar campo nenhum — retorna antes
(`WorldTourLifecycle.js:165`, `if (!pending.length) return`).

Isso também explica um número que, à primeira vista, parecia contradizer
o "0 resolvidos": o resumo cumulativo do cenário 250 reporta bots com
"média 17,39 / mediana 18" torneios jogados. Esse número **não vem da
simulação** — é o valor estático de história de fundo atribuído a cada
bot procedural na CRIAÇÃO do elenco (`rankingPopulation.js:175`:
`tournaments_played: Math.max(1, 6 + (seed % 28))`, faixa 6-33, média
≈19,5 — mesma ordem de grandeza do número relatado), nunca incrementado
porque a resolução real de torneios nunca rodou uma vez sequer neste
cenário.

**Conclusão sobre 250**: não é um dado de capacidade válido — é a
descoberta de um teto estrutural pré-existente no código (não
introduzido por esta fase), independente da pergunta de dimensionamento
que este item pretendia responder. Pela conta acima, o teto atual (300
linhas ÷ 1,25 de horizonte) fica em torno de **240 torneios/temporada
no total — aproximadamente 200 eventos de base (Bronze+Silver)/ano**,
dado o total fixo de 38 dos tiers mais altos. Cenário 150 (188/ano)
fica abaixo dessa linha e funciona limpo; cenário 250 (288/ano) fica
muito acima e quebra por completo. **Não corrigido nesta entrega** — é
código de produção, fora do "nada implementado até aprovar os dois"
combinado para este ciclo — mas é informação necessária para decidir
qualquer tamanho de calendário perto ou acima desse teto: hoje, ele
não é só um limite teórico, é uma parede que já foi tocada.

### 1.4 — Custo (item 2 do pedido)

| Cenário | Tempo de parede, 2 temporadas | vs. cenário anterior |
|---|---|---|
| 80 | 17min44s (1064s) | — |
| 150 | 18min34s (1114s) | +4,7% (quase o dobro de eventos de base) |
| 250 | n/a (circuito não resolveu nada — ver 1.3) | — |

Confirma, nesta dimensão específica, o mesmo padrão já registrado na
Fase 4.4 para população (cortar população pela metade só economizava
8,9% do tempo): **o custo por temporada não escala com o tamanho do
calendário base** dentro da faixa testada — quase dobrar Bronze+Silver
(80→150) custou generosamente menos de 5% a mais de tempo de parede. O
custo do harness é dominado pelo laço diário sobre a população inteira
(`processGameStateDay`), não pela contagem de torneios resolvidos numa
semana.

### 1.5 — Chaves incompletas e distribuição de títulos

Chaves incompletas: **0 em todos os cenários que resolveram** (40, 80,
150 — 0/80, 0/239, 0/379 respectivamente) — o preenchimento de reserva
(achado #22, Fase 3) nunca é o fator limitante; sobra dupla de sobra em
todos os tamanhos testados, é só uma questão de quem a chave escolhe.

Distribuição de títulos por classificação (2 temporadas, todos os
tiers, via `tournament-results.csv`):

| Cenário | 100% reais | 100% bots | Mistas | % reais |
|---|---|---|---|---|
| 80 | 227/239 | 8/239 | 4/239 | 95,0% |
| 150 | 365/379 | 10/379 | 4/379 | 96,3% |

Reais continuam vencendo entre 95% e 96% dos títulos em qualquer
tamanho de calendário testado, inclusive em Bronze/Silver isoladamente
(95/96 títulos de Bronze a 80; 179/180 a 150) — confirma, com números
novos, a leitura do próprio achado #30 que abre o item 3 do pedido:
força competitiva e presença/capacidade são eixos diferentes. Ampliar o
calendário não muda quem vence; muda (um pouco, na agregação — não na
identidade de quem é excluído, ver 1.2) quantas duplas conseguem tentar.

### 1.6 — Resposta ao pedido: onde a curva estabiliza

**Não estabiliza, nas escalas onde foi possível medir.** A razão
agregada cai de forma aproximadamente proporcional ao aumento de
capacidade (sem sinal de cotovelo entre 40, 80 e 150) — mas a métrica
que decide se uma dupla consegue jogar (duplas distintas nunca
escaladas) fica travada perto de 67% nas três. Ampliar mais o
calendário base, nesta arquitetura, esbarra num teto de código
concreto em torno de ~200 eventos de base/ano (1.3) antes de haver
qualquer chance de observar se a fração de exclusão eventualmente cede
em escala ainda maior. **Não escolhido nenhum número — os dados dizem
que a alavanca de calendário sozinha, na faixa seguramente testável
hoje, não resolve a exclusão; resolver o teto de código é um
pré-requisito técnico separado, não uma decisão de calibração; e a
alavanca de seleção por prioridade (piso, achado #30) continua sendo o
candidato mais provável para mover a métrica que realmente importa.**

---

## 2 — Desenho do portão de parceria (proposta — não implementada)

### 2.1 — O que já existe

`calculatePartnershipInterest` (`src/players/teamCompatibility.js:67`)
já calcula, corretamente, um `score` de interesse: compatibilidade
tática (35%), reputação do jogador (30%), progresso de ranking do
jogador (35%), menos a dificuldade de atrair um candidato de elite
(-15%). Mas o único campo que `buildInitialPartnerOffers`
(`src/lib/partnerOfferRules.js:14`) lê para decidir se um candidato
aparece como opção é:

```js
available: athlete?.career_status !== 'aposentado'
```

— ignora o `score` inteiro. Confirmado nesta fase, ao mapear os
caminhos de contratação, que existe um **segundo gate, pré-existente e
já ativo, totalmente independente**: `getAvailablePartners`/
`getLockedPartners` (`src/lib/career.js:309`/`320`) filtram o catálogo
por **nível de XP** do jogador (`LEVELS = ['Iniciante', 'Amador',
'Competitivo', 'Avançado', 'Elite', 'Lenda']`, limiares em
`levelForXp` — `src/lib/padel.js:162` — 0/500/3.000/10.000/25.000/
50.000 XP). Qualquer desenho novo baseado em `score` precisa conviver
com este gate de XP já em produção, não substituí-lo às cegas — os
dois medem coisas diferentes (progresso geral de carreira vs.
reputação/ranking específicos) e um jogador pode estar alto num eixo e
baixo no outro.

Achado adicional, relevante para calibrar qualquer novo gate: **o
catálogo de candidatos do PartnerHub é estático e separado do mundo
simulado.** `buildAthleteCatalog` (`src/players/athleteCatalog.js:11`)
combina os 100 reais com 240 atletas fictícios
(`athleteGenerator.js`, `ranking_position`/`world_rank` fixos em
`25 + índice`, nunca atualizados pela simulação) — os números de
`athlete.world_rank`/`ranking_position` que `calculatePartnershipInterest`
lê para um candidato do PartnerHub **não** são o ranking dinâmico de
~1000 atletas medido na Fase 4/4.4; são valores estáticos de catálogo.
O `score` calculado ainda é válido matematicamente (usa a posição do
jogador, que É dinâmica, contra a posição do candidato, que não é),
mas isso importa para não prometer, na calibração, um comportamento que
dependa do ranking do candidato mudar ao longo da carreira — ele não
muda.

### 2.2 — Três caminhos de contratação, hoje inconsistentes entre si

Mapeados nesta fase, os três lugares onde uma parceria pode se formar
não usam a mesma regra de termos:

| Caminho | Onde | Termos do contrato |
|---|---|---|
| Onboarding | `PartnerSelection.jsx` → `formPartnerContract` → `getSuggestedPartnerTerms` (`partnerLifecycle.js:45`/`57`) | **Já tem fricção por diferença de nível**: `gap = overall(bot) − overall(jogador)`; duração 30/45/60 dias conforme o gap; `prizeSplit` de 45% a 65% |
| PartnerHub → convite direto | `PartnerHub.jsx:handleInvite` → `startPartnership(profile, bot, 60, 50)` | Termos **fixos**, ignora o gap — bypassa a fricção que o caminho 1 já implementa |
| PartnerHub → aceitar oferta | `PartnerHub.jsx` → `acceptPartnerOffer` (`partnerOffers.js:75`) → `formPartnerContract` com os termos pré-definidos de `buildInitialPartnerOffers` (`partnerOfferRules.js:14`) | Termos **fixos por posição no array de ofertas** (`[60,45,90,60][index]`, `prizeSplit: 50`), não usa o gap |

Ligar o portão ao `score` sem tocar nesses três caminhos deixaria o
convite direto e a oferta pré-formatada sem a fricção que o próprio
pedido descreve ("contrato mais caro" como alternativa ao corte
rígido) — a peça que já sabe fazer isso (`getSuggestedPartnerTerms`) só
é usada em um dos três.

### 2.3 — Desenho proposto (sem corte rígido, conforme pedido)

Três faixas por `score` (reaproveitando o `score` já calculado, sem
mudar a fórmula):

| Faixa | `score` | Comportamento |
|---|---|---|
| **Invisível** | `< T_low` | Candidato não aparece na lista de ofertas/convite — não é "não existe", é "fora de alcance ainda"; mensagem no PartnerHub explicando o eixo que falta (reaproveita `reasons`/`requirements`, já existentes no retorno de `calculatePartnershipInterest`) |
| **Acessível com fricção** | `T_low` ≤ `score` < `T_high` | Aparece, mas com termos piores — reusa `getSuggestedPartnerTerms` (gap-based: duração mais curta, `prizeSplit` mais desfavorável ao jogador) em vez dos termos fixos atuais dos dois caminhos do PartnerHub; opcionalmente, exige um resultado recente mínimo (ex.: um título ou semifinal nas últimas N semanas) antes de aceitar — trata "exigência de resultados" do pedido como uma condição de ENTRADA da oferta, não como corte binário |
| **Aberto** | `score` ≥ `T_high` | Termos normais (o comportamento de hoje) |

Isso cobre as três alternativas que o pedido pediu para não ignorar:
oferta recusada/invisível (faixa 1), contrato mais caro (faixa 2, termos
via gap), exigência de resultados (faixa 2, condição adicional
opcional) — nenhuma delas é "invisibilidade" pura abaixo de um corte
único.

**Unificação necessária para o desenho funcionar de verdade** (não é
parte da calibração, é pré-requisito de implementação, registrado
aqui para quando for aprovado): os três caminhos do item 2.2 precisam
convergir para `getSuggestedPartnerTerms` (ou equivalente) como única
fonte de termos de contrato — do contrário a faixa "acessível com
fricção" é furada por qualquer um dos dois caminhos do PartnerHub que
ainda usam termos fixos.

### 2.4 — Calibração proposta (números de partida, a verificar após implementar)

Usando a fórmula real e os valores de perfil inicial reais (jogador
novo: `careerRank ≈ 1000`, `reputation ≈ 10`, defaults de
`localSeed.js`/`careerDefaults.js`; jogador de meio de carreira:
`careerRank ≈ 200`, `reputation ≈ 50`, estimativa):

| Perfil do jogador | `score` vs. candidato de nível equivalente | `score` vs. candidato top 20-50 |
|---|---|---|
| Novo (#1000, reputação 10) | ≈ 36 | ≈ 23-24 |
| Meio de carreira (#200, reputação 50) | ≈ 66 | ≈ 53-55 |

Alvo declarado no pedido: **#1000 no dia 1 consegue parceiro compatível
com o nível dele, mas nenhum do top 50; um real do top 20 é meta de
meio de carreira, não escolha de menu.** Com `T_low ≈ 30` e
`T_high ≈ 55`:

- Jogador novo vs. candidato equivalente (≈36) → faixa **acessível com
  fricção** — consegue, com termos piores. Correto.
- Jogador novo vs. top 20-50 (≈23-24) → abaixo de `T_low` (30) →
  **invisível**. Correto — não deveria conseguir.
- Meio de carreira vs. equivalente (≈66) → **aberto**. Correto.
- Meio de carreira vs. top 20-50 (≈53-55) → bem perto de `T_high` (55),
  do lado **acessível com fricção** ou já **aberto**, dependendo do
  candidato exato — bate com "meta de meio de carreira", não trivial
  nem impossível.

**Estes números são um ponto de partida por cálculo manual contra a
fórmula real, não uma simulação** — precisam ser verificados rodando o
harness com o portão ligado, DEPOIS de aprovado e implementado (é
exatamente o item 2.4 do pedido original, explicitamente adiado para
depois da aprovação).

### 2.5 — Pergunta em aberto, não resolvida nesta entrega

`ensureInitialPartnerOffers` (`partnerOffers.js:56`) só gera ofertas
novas quando `existing.length === 0 && !profile.partner_id` — não foi
confirmado nesta fase se linhas de oferta expiradas (`expires_career_date`,
10 dias) são removidas de forma a essa condição voltar a disparar. Isso
é uma dependência direta da narrativa "meio de carreira desbloqueia o
top 20": se ofertas expiradas nunca são limpas, um jogador que
melhorou reputação/ranking depois da primeira leva de ofertas pode não
ver candidatos novos e melhores aparecerem sem uma ação explícita (ex.:
visitar o PartnerHub) — precisa ser confirmado antes ou durante a
implementação, não é um risco do desenho do gate em si.

### 2.6 — O que fica para depois da aprovação (item 2.4 do pedido)

Medir o efeito do portão na velocidade de ascensão — **é o controle que
substitui a ideia de cortar população**, nas palavras do pedido — só
depois de implementado e aprovado. Não medido nesta entrega.

---

## 3 — Agenda dos reais

Fora de escopo desta entrega, por instrução explícita do pedido: "Isto
vem depois do item 1. Ampliar a base já reduz a competição dos reais
por vagas de Bronze naturalmente; medir a agenda antes disso mede o
mundo errado." Não iniciado.

---

## 4 — Suíte, lint, build, Tauri

- Instrumentação temporária revertida integralmente — confirmado por
  grep (`DIAG_CAPACITY`, `__diagCapacity`, `reportAndResetDiagCapacity`),
  zero ocorrências em `src/`/`scripts/`; `TIER_EVENTS_PER_YEAR` restaurado
  ao valor original (`Bronze: 24, Silver: 16, ...`); `git status`/`git diff`
  vazios para os três arquivos tocados durante a medição.
- `npm run lint` (`eslint . --quiet`) — limpo, sem avisos, em todo o
  repositório.
- `npm run build` — OK (`vite build`, 35,4s; único aviso é o já
  existente de chunk >500kB pós-minificação, não relacionado a esta
  fase).
- Suíte de regressão (`node scripts/rc-qa-suite-v36.mjs`, perfil core,
  36 suítes) — **33/36 aprovadas.** 3 falhas — `test:beta`,
  `test:sports-economy`, `test:match-integrity` — **pré-existentes e
  sem relação com esta fase**, confirmado por duas evidências
  independentes: (1) os três arquivos tocados durante a medição desta
  fase (`circuitCatalog.js`, `WorldTourLifecycle.js`,
  `audit-real-athletes-simulation.mjs`) voltam a diff zero contra o
  commit anterior; (2) as duas causas raiz são de resolução de módulo,
  em código nunca tocado por esta fase — `scripts/hashUtils.js`,
  importado por `scripts/.sportsEconomyV26.test.mjs`, **nunca existiu
  no histórico do repositório** (`git log` vazio para o caminho); e
  `src/engine/match/random.js` importa via alias `@/lib`, que só o
  Vite resolve — rodar `node scripts/test-match-integrity.mjs`
  diretamente (fora da suíte) reproduz o mesmo erro, isolado, sem
  qualquer participação do código desta fase. `test:beta` falha só
  porque compõe `test:match-integrity` internamente. Não investigado
  além disso (fora do escopo dos itens 1/2 pedidos); os relatórios
  `reports/rc-qa-latest.{json,md}` gerados por esta rodada foram
  revertidos (`git checkout`) para não misturar um problema de
  ambiente pré-existente com o diff desta entrega.
- `git status --short -- src-tauri/` — vazio, nenhum arquivo tocado.

---

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | Curva de capacidade nos 4 cenários, sem escolher o número | ✅ razão agregada cai de 15,3×→11,0×→5,9× (40/80/150), mas exclusão real de duplas fica travada em ~67% nos três — sem cotovelo visível na faixa segura; cenário 250 revelou um teto de código (~200 eventos base/ano), não um 4º ponto de capacidade |
| 2 | Desenho do portão de parceria, antes de implementar | ✅ 3 faixas por `score` (invisível/fricção/aberto), sem corte rígido; reaproveita `getSuggestedPartnerTerms` já existente; calibração de partida `T_low≈30`/`T_high≈55`; unificação dos 3 caminhos de contratação identificada como pré-requisito |
| 3 | Nada implementado até aprovação dos itens 1 e 2 | ✅ `circuitCatalog.js` e instrumentação revertidos, zero diff; nenhuma mudança de gate de parceria aplicada |

**Resumo executivo**: a curva de capacidade não estabiliza dentro da
faixa que dá para testar hoje — aumentar o calendário melhora a razão
agregada quase na mesma proporção do aumento, mas não move a fração de
duplas que efetivamente nunca joga, porque a seleção continua sendo
puro `pairScore` sem rotação. Um quarto cenário maior não deu um quarto
ponto de dado: deu a descoberta de que o código tem um teto real perto
de 200 eventos de base/ano (consulta de 300 linhas × horizonte de 15
meses), que precisaria ser resolvido separadamente antes de qualquer
calendário próximo desse tamanho. O portão de parceria continua sendo
a alavanca mais barata e mais promissora — a fórmula já existe e já é
boa; falta só ligá-la, com um desenho de três faixas (não corte
binário) calibrado para o alvo declarado (#1000 não chega ao top 50 no
dia 1; top 20 é meta de meio de carreira). Nenhuma das duas mudanças
foi implementada — ambas aguardam aprovação, como pedido.
