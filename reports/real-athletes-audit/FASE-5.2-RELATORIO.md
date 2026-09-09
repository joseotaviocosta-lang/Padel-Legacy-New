# Fase 5.2 — Calibrar o teto de tier e fechar duas brechas

> Pré-requisito: Fase 5.1 entregue (agenda de tier implementada e
> medida — razão de regime 15,29×→0,75×, exclusão 67,5%→16,9%). Ver
> [FASE-5.1-RELATORIO.md](FASE-5.1-RELATORIO.md). Esta fase calibra o
> teto (item 1, medição), confirma ou refuta o mecanismo do item 2
> (implementa SE confirmado E a correção prevista se aplicar), e mede o
> preenchimento de reserva (item 3, proposta sem implementar).

## Ordem de execução (diferente da ordem do pedido, justificada)

O pedido lista item 1 → item 2 → item 3. Investiguei o item 2 PRIMEIRO,
por um motivo prático: se o mecanismo do item 2 fosse confirmado e
corrigido, a curva do item 1 medida DEPOIS da correção seria a curva
real (o que vai pro jogo); medida ANTES, seria uma curva contaminada por
um vazamento que não vai sobreviver. Como o item 2 acabou REFUTADO como
hipotetizado — mas revelou um mecanismo relacionado, real, e que também
alimenta o item 3 — a ordem de investigação (não a ordem de entrega)
mudou; a curva do item 1 abaixo já reflete essa descoberta.

---

## 2 — O mecanismo do `rank > 0` é diferente do hipotetizado — refutado como escrito, mas achado real por trás

### 2.1 — Confirmação/refutação

**A hipótese específica — "dupla recém-formada, sem ranking de dupla,
não é bloqueada" — está REFUTADA.** Instrumentação temporária
(`DIAG_RANK_LEAK`) no passo de ESCOLHA (`chooseTournament`, onde
`representative = {...pair.athletes[0], ...}` só olha um atleta da
dupla): **zero** duplas 100%-reais escolheram Bronze ou Silver em teto=150
(temporada 1 completa, antes de redirecionar a instrumentação) nem em
teto=800 (2 temporadas inteiras). Isso faz
sentido ao reler o código — um real elegível pra Gold/Masters/Elite/
Crown SEMPRE pontua mais alto nesses tiers no `chooseTournament`
(mais prêmio, mais pontos, mais prestígio) — a IA nunca "escolhe"
Bronze/Silver pra uma dupla que tem opção melhor. A porta larga do
`hasRanking` no passo de escolha existe no código, mas está,
na prática, morta — nenhuma dupla real cai nela porque nenhuma dupla
real tenta entrar por ali.

### 2.2 — O mecanismo real: o preenchimento de reserva ignora elegibilidade quando o pool elegível não basta — e favorece exatamente quem o teto queria excluir

Instrumentação redirecionada pro PREENCHIMENTO DE RESERVA
(`WorldTourLifecycle.js`, ramo `usingBelowCutoffFallback`) — o mesmo
ramo já documentado no código: quando as duplas REALMENTE elegíveis não
bastam pra completar a chave, o preenchimento recorre a `remaining`
(TODAS as duplas restantes, SEM filtro de elegibilidade), ordenadas por
`pairScore` decrescente. `pairScore` é dominado por `overall_rating` —
ou seja, **quando o pool elegível fica curto, o preenchimento busca
especificamente as duplas MAIS FORTES disponíveis, sem checar se
deveriam estar ali** — exatamente as duplas que o teto foi desenhado
pra excluir.

Medido (teto=800, seed oficial, 2 temporadas, mesma escala):
**176 entradas de chave em Bronze/Silver vieram desse ramo com uma
dupla JÁ INELEGÍVEL (rank ≤ teto)** — 19 duplas 100%-reais distintas
(42 duplas distintas no total, incluindo mistas e 100%-bots fortes).
Entre elas, repetidamente: **Arturo Coello & Agustín Tapia — a #2 dupla
do mundo (`pairEntryRank=2`) — entrando em Bronze E Silver várias vezes
ao longo das 2 temporadas**, junto com Galán/Chingotto (rank 4),
Lebrón/Augsburger (rank 6), e outras duplas historicamente fortes.
Cruzado com a idade da parceria no momento (pedido explícito, item
2.1): **sem correlação** — parcerias de 2026-01-01 (as mais antigas
possíveis no harness) aparecem tanto quanto parcerias formadas em
2027-04 (poucos dias antes do evento). A idade da dupla não é fator;
o gatilho é puramente "o pool elegível ficou curto nesta semana, e
`pairScore` buscou a dupla mais forte disponível pra fechar a chave".

### 2.3 — Por que a correção prevista (individual vs. dupla) não se aplica

`pairEntryRank(pair)` — a função que calcula o rank da dupla pra fins
de elegibilidade — JÁ faz o que o pedido descreveria como correto: é a
média dos ranks INDIVIDUAIS de cada atleta (filtrando quem não tem
rank), não um "ranking de dupla" separado que começa do zero. Coello/
Tapia aparecem no log com `pairEntryRank=2` — o mecanismo de cálculo
está correto e já reconhece a dupla como elite. **O problema não é que
a checagem de elegibilidade erre o rank — é que o preenchimento de
reserva DELIBERADAMENTE ignora o resultado dessa checagem quando não
sobra gente elegível o bastante.** Trocar "ranking de dupla" por
"ranking individual" não mudaria nada, porque não é isso que está
quebrado.

**Por instrução do pedido ("a única coisa que pode ser implementada...
é a correção do item 2, se o mecanismo se confirmar e a correção for a
troca de ranking de dupla por ranking individual") — como nem o
mecanismo hipotetizado se confirmou, nem a correção prevista se
aplicaria ao mecanismo real encontrado, NADA foi implementado aqui.**
O achado real (preenchimento de reserva ignorando elegibilidade) é
estrutural do item 3, não do item 2 — a correção dele é uma decisão de
DESENHO do item 3 (abaixo), explicitamente não autorizada pra
implementar nesta rodada.

---

## 1 — Curva do teto (medição, sem escolher o número)

Mesma seed/escala oficial (900+100, `official-900-100-s1`), 2 temporadas,
`TIER_EVENTS_PER_YEAR` intocado, para cada valor de teto. Os três
valores pedidos (50/100/150) mais o valor atual (800, referência —
já era a Fase 5.1) **mais um ponto intermediário (350)**, adicionado
porque os três valores pedidos, sozinhos, não revelam onde a curva
realmente se move (ver 1.4).

### 1.2/1.3 — Razão demanda/capacidade (Bronze+Silver e Gold+), exclusão, reais por temporada

| Teto | S1 razão BS | S1 excl. BS | S2 (regime) razão BS | S2 excl. BS | Gold+ S1 | Gold+ S2 | reais s/jogar (S1,S2) | reais nunca (2t) | interseção |
|---|---|---|---|---|---|---|---|---|---|
| 50 | 9,21× | 40,3% (160/397) | 13,90× | 43,5% (218/501) | 2,59× | 3,78× | 12, 19 | 6/100 | 6 (24,0%) |
| 100 | 8,59× | 37,0% (148/400) | 13,73× | 43,0% (222/516) | 2,64× | 3,82× | 10, 15 | 2/100 | 2 (8,7%) |
| 150 | 8,19× | 33,9% (135/398) | 12,26× | 45,3% (230/508) | 2,64× | 4,00× | 13, 17 | 3/100 | 3 (11,1%) |
| 350 | 6,60× | 26,8% (106/396) | 9,42× | 35,4% (181/511) | 2,62× | 3,99× | 13, 17 | 3/100 | 3 (11,1%) |
| 800 (atual) | 1,57× | 35,8% (140/391) | **0,75×** | 16,9% (86/509) | 2,72× | 4,08× | 14, 15 | 4/100 | 4 (16,0%) |

### Classificação de títulos e participação, por teto

| Teto | 100%-reais/bots/mista (159 total) | % real | Torneios disputados — reais | Torneios disputados — bots | Preenchimento (S1 / S2) |
|---|---|---|---|---|---|
| 50 | 104/34/21 | 65,4% | média 35,32/mediana 40 | média 3,36/mediana 1 | 20,2% / 20,0% |
| 100 | 84/40/35 | 52,8% | média 32,15/mediana 32 | média 3,68/mediana 1 | 20,2% / 20,0% |
| 150 | 85/67/7 | 53,5% | média 26,79/mediana 27 | média 4,22/mediana 1 | 20,2% / 20,0% |
| 350 | 72/79/8 | **45,3%** | média 24,28/mediana 19 | média 4,47/mediana 1 | 20,2% / 20,0% |
| 800 (atual) | 95/57/7 | 59,7% | média 26,46/mediana 21 | média 4,25/mediana **2** | 23,0% / **41,6%** |

### 1.4 — Onde a curva realmente se move (e onde ela não se move)

**Entre 50 e 150, a curva é essencialmente PLANA — nenhum cotovelo aí.** A
razão de regime fica entre 12,3× e 13,9× nos três valores pedidos —
uma faixa estreita, sem sinal de inflexão. Isso tem uma explicação
direta: com teto=150, só quem tem rank individual ≤150 é excluído —
uma fatia pequena da população de 1000. Subir o teto pra 50 ou 100
muda quantas PESSOAS ficam de fora, mas nessa faixa (top 50 a top 150)
é sempre um grupo pequeno — a demanda que sobra pra Bronze/Silver
continua sendo quase toda a população, e por isso a razão continua
travada em dois dígitos.

**A curva se move de verdade em 350 — não é preciso chegar a 800 pra
sair da faixa "essencialmente plana".** Razão de regime: 150→12,26×,
350→**9,42×**, 800→0,75×. A queda de 150 pra 350 já é real (-23%), mas
o salto grande — de dois dígitos pra abaixo de 1× — só acontece entre
350 e 800, não antes. A curva completa (razão de regime):

```
50 ──── 100 ──── 150 ──── 350 ──────────────────── 800
13,90×   13,73×   12,26×   9,42×                    0,75×
   (essencialmente plano)      (queda real,        (abaixo da
                                 mas ainda            capacidade —
                                 oversubscrito)       ultrapassou)
```

**A exclusão de reais por temporada não segue um padrão monotônico
limpo** entre os cinco valores (12/19 → 10/15 → 13/17 → 13/17 → 14/15)
— nem deveria: entre 50 e 350, o teto exclui uma fatia relativamente
pequena e crescente da população, e o que varia temporada a temporada
é tanto ruído de simulação (formação de parcerias, lesões) quanto o
próprio teto — os dois efeitos se misturam nessa faixa, sem um sinal
limpo isolado.

**Achado central do item 1 — o vazamento do item 2.2 (preenchimento
ignorando elegibilidade) só aparece em teto=800, ZERO nos quatro
valores mais baixos, incluindo 350.** Confirma a leitura: o vazamento
não é sobre o teto em si, é sobre quão ESCASSO o pool elegível fica.
Até 350, o pool elegível nunca escasseia o bastante pra disparar o ramo
`usingBelowCutoffFallback` em Bronze/Silver. Só em 800 (~80% da
população excluída) o pool periodicamente seca. **Consequência direta
e mensurável: 350 é o único teto testado onde Bronze/Silver mostra a
MENOR dominância real (45,3%, contra 52,8-65,4% na faixa 50-150 e
59,7% em 800)** — não porque os reais joguem pior, mas porque em 350 o
mecanismo de exclusão funciona sem o vazamento reintroduzindo duplas
de elite pela porta dos fundos; em 800, o vazamento devolve parte da
dominância real que o teto tentou remover.

**Isto é um argumento concreto a favor de um teto na faixa de 150-350,
não 800** — não só pela razão demanda/capacidade (que continua
oversubscrita nessa faixa, então não "resolve" o problema de capacidade
sozinha, na leitura já dada pela Fase 5.1/achado #32), mas porque é a
faixa onde o mecanismo do item 2.2 nunca dispara. Nenhum número está
sendo escolhido aqui — os dois lados do trade-off (razão ainda alta em
150-350 vs. vazamento reaparecendo em 800) são exatamente o tipo de
decisão que cabe a você, não a esta medição.

---

## 3 — Preenchimento de reserva: números e desenho proposto (sem implementar)

### 3.1/3.2 — Quanto da participação é escolha própria vs. preenchimento forçado

Medido em todos os cenários (tabela acima, coluna "Preenchimento"):
**consistentemente ~20% dos entrantes finais de Bronze/Silver, em
qualquer teto de 50 a 350** — não é um artefato do teto, é estrutural
do calendário/IA de escolha (a distribuição semanal de eventos nem
sempre bate com a distribuição semanal de escolhas, mesmo quando a
demanda agregada da temporada é muito maior que a capacidade agregada
— ver 1.4). **Em teto=800 (o valor atual), o preenchimento sobe pra
23,0% na temporada 1 e SALTA pra 41,6% na temporada 2 (regime)** — quase
metade da chave de Bronze/Silver, no estado atual do jogo, não escolheu
estar lá.

**Resposta direta ao pedido ("quanto da melhora [mediana de bots
0→2, achado da Fase 5.1] é escolha e quanto é preenchimento
forçado?")**: com 41,6% dos entrantes vindo de preenchimento em regime
(teto=800, o estado atual), uma fração substancial da participação de
bots que a Fase 5.1 mediu como melhora não reflete demanda genuína —
reflete o mecanismo de fechamento de chave. Isso NÃO invalida o achado
da Fase 5.1 (a mediana subir de 0 pra 2 continua sendo um fato — bots
que antes nunca apareciam em nenhuma chave agora aparecem), mas
qualifica a INTERPRETAÇÃO: parte dessa melhora é "a chave precisava de
gente e pegou quem sobrava", não "esse bot passou a ser competitivo o
bastante pra ser escolhido".

### 3.3 — Desenho proposto (três opções, não implementadas)

**(a) Manter o preenchimento como está.** Simples, mas só é defensável
em tetos onde o vazamento do item 2.2 não dispara — pelos dados acima,
isso significa ficar na faixa 50-150 (ou perto dela), não em 800.

**(b) Permitir chave menor que `drawSize`.** Uma chave de 16 com 12
interessados roda com 12 — reflete demanda real, elimina o vazamento
por completo (sem preenchimento, não há como um par inelegível
"aparecer" pra fechar vaga). Efeito colateral a medir: mais chaves
pequenas podem significar menos pontos/prêmio distribuídos no
agregado, e a métrica "chaves incompletas" (hoje sempre 0/N) passaria
a ser o normal, não uma bandeira de alerta — precisaria de uma leitura
nova do que "incompleta" significa daqui pra frente.

**(c) Piso mínimo — preenche só até uma fração da capacidade, não até
100%.** Ex.: completa até 50-75% de `drawSize`, aceita o resto como
vago se não houver gente elegível o bastante. Meio-termo entre (a) e
(b) — reduz o vazamento (menos vagas força-preenchidas = menos chance
de precisar recorrer a `remaining` sem filtro) sem abrir mão de um
tamanho mínimo de chave viável.

**Não implementado — aguardando aprovação, conforme instruído.**

---

## 4 — Validação final

- Instrumentação temporária (`DIAG_CAPACITY`, `DIAG_BACKFILL`,
  `DIAG_RANK_LEAK`, reintroduzida e revertida várias vezes ao longo
  desta fase pra cada rodada de medição) revertida integralmente —
  confirmado por grep, zero ocorrências em `src/`/`scripts/`;
  `WorldTourLifecycle.js` e `audit-real-athletes-simulation.mjs` com
  `git diff` vazio. `EntryManager.js` mantém só a mudança permanente e
  pretendida (item 1.1 — teto virou parâmetro próprio,
  `OPEN_TIER_CEILING`, atualmente em **800** — o mesmo valor já em
  produção desde a Fase 5.1, sem escolher um novo número, conforme
  instruído).
- `npm run lint` (`eslint . --quiet`) — limpo, sem avisos, em todo o
  repositório.
- `npm run build` — OK (1m4s, único aviso é o já existente de chunk
  >500kB, não relacionado).
- Suíte de regressão completa (`node scripts/rc-qa-suite-v36.mjs`,
  perfil `core`, 36 suítes) — **33/36 aprovadas, score 92/100 — idêntico
  ao estado final da Fase 5.1.** As mesmas 3 falhas pré-existentes e já
  registradas (`test:rc-gameplay-balance`, `test:career-pace`,
  `test:ui-quality`) — nenhuma regressão nova introduzida por esta fase.
- `git status --short -- src-tauri/` — vazio, nenhum arquivo tocado.
- Relatórios auto-regenerados por rodar a suíte
  (`reports/rc-qa-latest.*`, `reports/BETA-AUDIT-v36.1.*`,
  `reports/rc-sprint-1/*`) revertidos (`git checkout`) antes do commit.

---

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | Curva do teto (50/100/150) + razão Gold+, sem escolher o número | ✅ curva medida em 5 pontos (50/100/150/350/800, o 4º adicionado pra localizar a transição real); Bronze+Silver plana entre 50-150, cai de verdade a partir de 350, cruza pra sub-capacidade só perto de 800; Gold+ nunca chega a 4,1× em nenhum teto testado |
| 2 | Confirmação/refutação do mecanismo do `rank>0` | ✅ hipótese específica REFUTADA (reais nunca escolhem Bronze/Silver); mecanismo real encontrado e medido (preenchimento de reserva ignora elegibilidade quando o pool esgota — 176 eventos, 19 duplas reais distintas, incluindo a #2 do mundo, em teto=800); correção prevista não se aplica — nada implementado |
| 3 | Números do preenchimento de reserva + desenho proposto | ✅ ~20% estrutural em qualquer teto até 350; salta pra 41,6% em regime a teto=800; 3 opções de desenho propostas, não implementadas |
| 4 | Suíte, lint, build OK | ✅ lint limpo; build OK; suíte 33/36 (score 92/100, idêntico à Fase 5.1 — zero regressão nova); `src-tauri/` intocado |

**Resumo executivo**: a curva do teto não tem um cotovelo único e
limpo — tem um platô (50-150, onde o teto exclui pouca gente e a razão
fica travada em ~13×) seguido de uma queda real a partir de 350 e um
mergulho abaixo da capacidade perto de 800. O achado mais importante,
porém, não é sobre a razão — é que o vazamento do preenchimento de
reserva (item 2) só aparece no valor ATUAL (800): até 350, o teto
funciona sem essa brecha. A hipótese original do item 2 (ranking de
dupla vs. individual) estava errada — `pairEntryRank` já calcula
certo — mas o problema real é mais sério do que uma exceção mal
desenhada: é uma escolha explícita de código (preencher a qualquer
custo, ignorando elegibilidade, priorizando quem é mais forte) que só
se manifesta quando o teto fica apertado o bastante pra esvaziar o
pool elegível. Isso liga os itens 1, 2 e 3 numa única decisão: qualquer
teto acima de ~350 reabre a porta que o teto foi desenhado pra fechar,
e a única forma de saber o tamanho real dessa porta noutros valores é
medir de novo se um teto mais alto for escolhido. Nada foi implementado
nesta entrega além da separação estrutural do teto (item 1.1) — os
números e desenhos aguardam decisão.
