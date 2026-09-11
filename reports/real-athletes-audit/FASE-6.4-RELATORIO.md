# Fase 6.4 — Por que reais COM parceiro ficam uma temporada inteira sem jogar

> Pré-requisito: Fase 6.3 achou que 55-65% dos reais ociosos por
> temporada JÁ TÊM parceiro — a loteria de formação (Fase 6.2) não é a
> causa deles. Ver [FASE-6.3-RELATORIO.md](FASE-6.3-RELATORIO.md). Esta
> fase é só diagnóstico — nenhuma correção aplicada, como pedido.

## Resumo executivo

O mecanismo tem duas causas, não uma, e as duas batem em toda a
população (reais e bots) — os reais só são onde a auditoria mede.
**45% de toda semana de toda dupla real não tem NENHUM torneio elegível
pra escolher** (calendário esparso, achado #32). Dos 55% restantes,
**quase a metade é cortada depois de escolher** — em Gold, 79% de quem
escolhe é cortado. É a mesma classe de bug da Fase 4.3
(`entrants.sort(pairScore).slice(0, drawSize)`, sem fila, sem segunda
chance), mas numa localização que o piso da Fase 5.1 nunca alcançou: os
tiers de ranking fechado (Gold e acima), não só Bronze/Silver. Sobre a
prioridade por espera (Fase 6.2, item 3): não satura a zero, mas o
throughput fixo (3-4 resgates/mês) compete contra centenas de atletas
livres — o pior caso do POOL INTEIRO se estabiliza perto de 335-365
dias em regime, não indefinidamente, mas é quase um ano de espera
POSSÍVEL, todo ano, pra quem tiver azar.

## 1 — O caso principal: ocioso COM parceiro

Instrumentação temporária (`DIAG_SELECT`, `WorldTourLifecycle.js`) —
rastreia toda dupla com pelo menos um atleta real, toda semana: a
decisão (`play`/`rest`), quantas opções elegíveis existiam, e se
sobreviveu ao corte de tamanho de chave do torneio escolhido. Regime-
check de 5 temporadas, mesma seed.

### 1.1 — Os números: 45% sem opção nenhuma, 22% cortada, só 19% joga

| Resultado da semana | Ocorrências (5 temporadas) | % do total |
|---|---|---|
| **Sem opção elegível nenhuma** (`eligibleOptions=0`) | 7.705 | **45,2%** |
| **Escolheu, foi CORTADA** | 3.794 | 22,2% |
| Escolheu, jogou | 3.228 | 18,9% |
| Tinha opção, descansou por escolha | 2.340 | 13,7% |

Só **18,9%** das semanas de uma dupla real terminam com ela realmente
jogando. O caso principal do pedido (escolheu Masters/Elite, foi
cortada) é real e mensurável — **22,2%**, quase tão grande quanto "jogou
de verdade" — mas o maior bloco sozinho é não ter NADA pra escolher,
quase a metade de toda semana. Isso é o sintoma do calendário esparso
que o achado #32 já registrou (~78-80 torneios/ano ÷ 52 semanas ÷ 7-9
tiers ≈ pouco mais de 1 torneio "cabível" por semana pra qualquer faixa
de rank) — não é o mecanismo NOVO desta fase, mas explica mais da
metade do problema.

### 1.2 — Sim, eles escolhem — e o corte é dramático em Gold

Por tier, agregando todos os torneios das 5 temporadas (contagem = quem
ESCOLHEU aquele torneio, todo o campo — reais e bots juntos, não só
reais):

| Tier | Razão demanda/capacidade | Cortados / escolheram | Taxa de corte |
|---|---|---|---|
| **Gold** | **4,69×** | 3.539 / 4.498 | **79%** |
| Masters | 2,59× | 1.907 / 3.107 | 61% |
| Platinum | 2,54× | 1.477 / 2.434 | 61% |
| Crown | 2,00× | 401 / 801 | 50% |
| Elite | 1,79× | 787 / 1.787 | 44% |

**Gold é o pior — quase 4 de cada 5 duplas que escolhem Gold são
cortadas, sem exceção real ou bot.** A razão de regime (4,69×) bate,
dentro do esperado pela diferença de método, com a razão de 4,99× já
medida na Fase 5.6 — confirma que é o MESMO gargalo de capacidade, só
que agora rastreado até a CONSEQUÊNCIA pra cada dupla individualmente,
não só a razão agregada.

*Nota de instrumentação*: Bronze/Silver aparecem com "0 cortados" nesta
medição — não porque não sejam cortados, mas porque meu ponto de
captura ficou DEPOIS de `applyOpenTierEntryPriority` já ter truncado o
campo desses dois tiers (a única correção de piso que já existe, Fase
5.1). Não mede nada de novo sobre a base — o achado #32 já documentou a
exclusão de lá.

### 1.3 — Existe fallback de tier? Não — perde a semana inteira

Confirmado por leitura de código, não só pelo dado: `chooseTournament`
escolhe UM torneio por semana (`TournamentSelectionAI.js`); se a dupla é
cortada na montagem do campo (`WorldTourLifecycle.js`, loop separado que
roda DEPOIS da escolha), não há segunda tentativa na mesma semana, nem
um tier abaixo, nem um sinal de volta pra `chooseTournament` saber que
foi cortada. A redistribuição de excedente (Fase 5.4) existe, mas só
para tiers de acesso livre (`minRanking === 0`, Bronze/Silver) — o laço
inteiro de redistribuição roda ANTES do loop de montagem de campo dos
tiers fechados e nunca os toca. Uma dupla cortada de Gold não vira
candidata a Platinum, Masters ou nada — simplesmente não joga aquela
semana.

### 1.4 — É específico dos reais? Não — é onde a auditoria olha primeiro

O "escolheram" agregado por tier (tabela 1.2) conta TODO o campo, não só
reais — Gold sozinho teve 4.498 escolhas ao longo de 5 temporadas contra
no máximo ~50 pares reais existentes a qualquer momento; a esmagadora
maioria de quem escolhe (e é cortado) é bot. **O mecanismo atinge todo
mundo igualmente — reais só são o grupo que esta auditoria rastreia
individualmente, e por isso é onde a exclusão vira uma linha de
relatório.** Confirma o item 1.4 do pedido: a métrica "reais ociosos"
não é causa nem efeito específico de reais, é o instrumento de medição.

## 2 — Por que a prioridade por espera não alcança os casos extremos

Instrumentação temporária (`DIAG_WAIT`, `aiPartnershipLifecycle.js`) —
uma linha por mês: `free.length`, `targetPairs`, `reservedTarget`,
`reservedFormed`, e quem é o atleta com MAIS tempo livre no pool inteiro
(rank, dias esperando, se é real).

### 2.1 — Não satura a zero, mas o throughput é pequeno e fixo

`reservedTarget` (`round(targetPairs × 0,2)`) NUNCA chegou a 0 nas 60
leituras mensais — se estabiliza em **3-4 pares resgatados/mês** durante
o regime (temporadas 3-5), depois do pool livre encolher do pico inicial
de bootstrap (~900) pra uma faixa de 230-280. **O piso funciona, não
está desligado** — mas resgata só 6-8 atletas/mês (3-4 pares) contra um
pool de ~250 atletas livres competindo pela vaga. Não é "sobreposto por
outro termo do peso" — é simplesmente pequeno demais pra drenar rápido
um pool desse tamanho.

### 2.2 — Quem são: mistura de reais e bots, sem padrão único de rank

O atleta mais antigo ainda livre a cada mês (amostra completa nas 60
leituras) alterna entre reais e bots, e entre ranks MUITO diferentes —
de 150-166 (Pol Hernández Álvarez, Hugo Martínez) a 900+ (vários bots).
**Não há um padrão único de rank, OVR ou nacionalidade que torne um
atleta sistematicamente pouco atraente** — o fator dominante parece ser
simplesmente COMPETIÇÃO POR VOLUME: com ~250-280 atletas livres típicos
e só 3-4 vagas reservadas/mês, qualquer atleta específico tem só uma
fração pequena de chance de ser um dos 6-8 (de ~250-280) escolhidos
naquele mês — não porque tenha algo "errado" com ele, mas porque a fila
é comprida e o piso é curto.

### 2.3 — O `rankGapWeight` não é o mecanismo aqui — a fase reservada não o usa

A pergunta do pedido pressupõe um "bônus de espera" somado ao peso do
sorteio ponderado (`selectPair`, dominado por `rankGapWeight =
exp(-gap×0,01)`). **Minha implementação (Fase 6.2) não funciona assim**:
a fase reservada pareia os DOIS atletas com mais tempo de espera ENTRE
SI, ignorando compatibilidade e proximidade de rank por completo —
`rankGapWeight` nunca entra na conta pra essa fração. Não existe "bônus"
a calcular, então a pergunta numérica do pedido (que bônus compensaria
um gap de 600 posições) não se aplica ao desenho atual — ela seria
relevante se a correção fosse "somar um termo ao peso do sorteio
normal" (a variante que o próprio relatório da Fase 6.2 já tinha
rejeitado em favor do piso reservado, por não GARANTIR nada). O piso
reservado garante ENTRAR na fila de prioridade; o que ele não garante é
velocidade de saída, que é puramente aritmética: 6-8 saídas/mês contra
~250-280 na fila.

### 2.4 — Nota: discrepância com o número da Fase 6.3, não totalmente reconciliada

A Fase 6.3 mediu espera MÁXIMA de até 1.429 dias pra um real específico
(classificação de fim de temporada). Esta instrumentação, que rastreia
o atleta mais antigo do POOL INTEIRO uma vez por mês, viu esse valor
**nunca passar de ~365 dias** em nenhuma das 60 leituras — o "mais
antigo do pool" se estabiliza oscilando entre 300-365 dias em regime,
não crescendo sem limite. As duas medições usam pontos de captura
diferentes (uma vez por mês, pool inteiro vs. classificação por
temporada, só reais ociosos) e não foram reconciliadas numa terceira
passada dedicada a rastrear UM indivíduo específico por toda sua
história de dissolução/reformação — registrado como pergunta em aberto,
não resolvida nesta fase.

## 3 — Reincidência confirmada do padrão da Fase 4.3

**Sim — é o mesmo mecanismo, em um contexto diferente, e merece linha
própria.** A Fase 4.3 (achado da própria auditoria) diagnosticou
exatamente este código —

```js
const ordered = entrants.sort((a, b) => pairScore(b, tournament) - pairScore(a, tournament)).slice(0, drawSize);
```

— descartando o excesso silenciosamente, sem fila, pra Bronze/Silver (na
época, os únicos tiers que um atleta de rank baixo podia escolher).
**Medido então**: 92 decisões de jogar, 0 pontos ganhos, pra 2 reais
específicos. A Fase 5.1 respondeu com `applyOpenTierEntryPriority` —
mas só para tiers de acesso livre (`minRanking === 0`). **O MESMO trecho
de código, intocado, continua sendo a via de corte para Gold, Platinum,
Masters, Elite e Crown** — tiers que em 2026 (Fase 4.3) praticamente
não existiam como destino de quem tinha rank baixo, mas que hoje (com a
escada do Candidato B alargando quem é elegível pra eles) recebem
disputa mais acirrada do que o desenho original antecipava. **A correção
da Fase 5.1 resolveu a instância que existia então; uma nova instância
do MESMO padrão nasceu num lugar que ninguém olhou de novo.**

Registro para a tabela de achados: quinta ocorrência da classe "corte
por capacidade disfarçado de corte por mérito, sem fila" — mas, ao
contrário das instâncias numeradas #16/#33/#37 desta série (leitura
errada de um dado que existia certo em outro lugar), esta é uma
REINCIDÊNCIA LITERAL — o mesmo código, a mesma ausência de fila, um
alcance que a correção anterior não cobriu.

## 4 — Correções propostas, não implementadas

Duas frentes independentes, nenhuma aplicada:

**(a) Estender uma prioridade/piso aos tiers fechados.** A forma mais
direta seria generalizar `applyOpenTierEntryPriority` (ou uma variante)
pra qualquer tier, não só `minRanking === 0`. Risco: nos tiers fechados,
"quem entra" hoje é decidido só por `pairScore` (skill) — introduzir
prioridade por ranking ou por menos-torneios-jogados muda quem disputa
Gold/Masters/Elite, e esses tiers deveriam continuar sendo o campo mais
forte disponível (fidelidade ao circuito real: Masters não é loteria de
acesso). Precisaria de desenho próprio, não uma cópia do piso da base.

**(b) Fallback de tier na mesma semana.** Se uma dupla é cortada do tier
escolhido, ela tenta o tier imediatamente abaixo (se elegível e se
houver um torneio rodando essa semana) antes de perder a semana de vez.
Mais fiel ao princípo "melhor jogar um tier abaixo que não jogar nada" já
usado pela redistribuição da Fase 5.4 — mas exigiria reestruturar
`resolveCompletedWorldTourEvents` pra um pipeline em duas passadas
(monta campo do tier preferido → identifica cortados → tenta realocar
antes da resolução final), mais complexo que a redistribuição atual
(que só move ENTRE tiers livres concorrentes na mesma rodada, nunca
entre tiers de ranking diferente).

**(c) Aumentar o throughput absoluto do piso de espera** (item 2) — hoje
`MARKET_WAIT_RESERVED_SHARE` é uma FRAÇÃO de `targetPairs` (que já é uma
fração do pool livre) — um piso ABSOLUTO mínimo (ex.: nunca menos que N
pares/mês, independente do tamanho do pool) escalaria melhor contra um
pool de centenas. Risco: precisa de medição própria de N — um valor
grande demais desloca vagas do sorteio ponderado normal, que também
serve a um propósito (compatibilidade).

Nenhuma implementada — o pedido pede diagnóstico nesta rodada.

## 5 — Validação

Toda instrumentação (`DIAG_SELECT` em `WorldTourLifecycle.js`,
`DIAG_WAIT` em `aiPartnershipLifecycle.js`, classificação `hasPartner`/
`rank` no harness) foi temporária e revertida antes deste commit —
`git status`/`git diff` vazios em `src/`/`scripts/`, grep zero
ocorrências de `DIAG_SELECT`/`DIAG_WAIT`.

- `npm run lint` — limpo.
- `npm run build` — OK.
- Suíte de regressão — 33/36, score 92/100, as mesmas 3 falhas
  pré-existentes, nenhuma relacionada a esta fase.
- `src-tauri/` intocado.

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | Rastreio dos ociosos com parceiro, mecanismo identificado | ✅ dois mecanismos: 45% sem opção elegível (calendário esparso, achado #32), 22% escolhida e cortada (Gold 79% de taxa de corte) — sem fallback de tier, atinge reais e bots igualmente |
| 2 | Resposta sobre a prioridade por espera | ✅ não satura a zero (3-4/mês em regime) mas throughput pequeno contra pool de ~250-280; `rankGapWeight` não se aplica à fase reservada (pergunta do pedido pressupõe um desenho diferente do implementado); discrepância com o máximo de 1.429 dias da Fase 6.3 não totalmente reconciliada |
| 3 | Reincidência do padrão da Fase 4.3 | ✅ confirmada — mesmo código (`sort+slice` sem fila), Fase 5.1 corrigiu só pra tiers abertos, tiers fechados nunca receberam a mesma correção |
| 4 | Correções propostas, não implementadas | ✅ três frentes (piso nos tiers fechados / fallback de tier / piso absoluto na espera), riscos registrados, nenhuma aplicada |
| 5 | Suíte, lint, build OK | ✅ lint 0 · build OK · suíte 33/36 (92/100) · `src-tauri/` intocado |
