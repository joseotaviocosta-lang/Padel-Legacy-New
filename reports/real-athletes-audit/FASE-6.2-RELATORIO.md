# Fase 6.2 — Medir o penhasco sincronizado antes de escolher a correção

> Pré-requisito: Fase 6.1 achou o mecanismo de dois estágios (loteria de
> formação + penhasco do `legacy_seed` aos 364 dias). Ver
> [FASE-6.1-RELATORIO.md](FASE-6.1-RELATORIO.md). Esta fase mede a escala
> do penhasco antes de mexer nele, implementa a correção de menor risco
> (semear parceiro para os 46 reais sem par conhecido) e propõe — sem
> aplicar ainda — a prioridade por tempo de espera.

## 1 — O penhasco sincronizado: escala medida antes de qualquer correção

Instrumentação temporária `DIAG_CLIFF` (`circuitLifecycle.js:processWorldCircuit`,
o único lugar que recalcula a população inteira toda semana) — conta,
para cada semana, quantos atletas tinham EXATAMENTE uma linha de
`AthleteRankingResult` (a âncora `legacy_seed`) e nenhuma outra, e essa
âncora expirou nesta semana especificamente. Carreira nova, mesma seed
(`official-900-100-s1`), 15 meses (`DIAG_MAX_MONTHS=15` — não precisa de
2 temporadas inteiras, só passar do marco dos 364 dias com folga).

### 1.1 — A contagem: 401 de uma vez, não "os reais"

| Semana | Data | Atletas afetados | Reais | Bots | De quantos processados |
|---|---|---|---|---|---|
| 2027-W02 | 2027-01-03 | **401** | 12 | 389 | 956 |
| 2027-W07 | 2027-02-07 | 1 | 0 | 1 | 955 |
| 2027-W11 | 2027-03-07 | 4 | 0 | 4 | 958 |

**98,8% do evento inteiro (401 de 406 em 15 meses) acontece numa ÚNICA
semana**, ~52 semanas depois do início do mundo (o "primeiro toque" de
`processWorldCircuit` sobre a população inteira, que acontece na semana 1
de qualquer carreira nova) — exatamente como o desenho de
`buildLegacySeedRow` prevê: a âncora é datada no genesis, expira 364 dias
depois, e o genesis é o MESMO dia pra todo mundo que existia desde o
início. **É a população inteira de quem nunca jogou em 12 meses, caindo
junto — não um efeito específico de atletas reais.** Os 3 eventos
seguintes (1, depois 4 atletas, em semanas espaçadas) são o rastro
esperado de quem entrou na população DEPOIS do genesis (prospects gerados
mês a mês, achado #2D.2 — cada um bate seu PRÓPRIO marco de 364 dias a
partir da própria data de criação, por isso ficam espalhados, não
empilhados).

401 sobre ~956 processados é **42% da população inteira** perdendo o
ranking de uma vez. Isso é "centenas de bots simultaneamente" — o
critério que o próprio pedido definiu como "problema próprio e
independente" (item 4).

### 1.2 — Efeito no ranking mundial nessa semana

Só na semana do evento principal: deslocamento de posição na população
inteira (todos os ~956 atletas, não só os 401) — **média 142,3 posições,
mediana 92, máximo 634; 750 dos 956 atletas (78%) moveram mais de 50
posições numa semana só.** Não é um evento que só afeta quem cai — é uma
reordenação de quase toda a tabela: os ~555 atletas que NÃO perderam a
âncora ainda assim se deslocam (pra cima, em média), porque 401 posições
acima deles esvaziam de uma vez. Nas duas semanas seguintes com eventos
pequenos (1 e 4 atletas), o deslocamento populacional cai proporcionalmente
(média 15,6 e 17,4) — confirma que a magnitude do ruído populacional
escala com o TAMANHO do evento, não é um artefato de medição.

### 1.3 — Cascata: de qual tier pra qual

Amostra dos 40 primeiros afetados (ordenados pelo rank ANTIGO, do melhor
pro pior) mostra o evento atravessando TODOS os tiers de acesso, não só a
borda:

| Atleta | Rank antes | Tier antes (corte atual) | Rank depois | Tier depois |
|---|---|---|---|---|
| real_francisco_guerrero | 15 | Crown (≤75) | 556 | Base (>450) |
| real_javier_leal | 19 | Crown | 557 | Base |
| real_eduardo_alonso | 21 | Crown | 558 | Base |
| real_ignacio_piotto_albornoz | 71 | Crown | 560 | Base |
| real_marc_sintes_villalonga | 79 | Elite (≤140) | 561 | Base |
| real_mario_del_castillo | 94 | Elite | 564 | Base |
| real_alvaro_montiel_caruso | 99 | Elite | 565 | Base |
| real_maximiliano_sanchez | 103 | Elite | 566 | Base |
| real_pedro_melendez_amaya | 147 | Masters (≤230) | 568 | Base |
| (bots, ranks 197-288) | 197-288 | Masters/Platinum/Gold | 569-595 | Base |

**Todo mundo na amostra cai direto pra base**, de QUALQUER tier de
origem — Crown, Elite, Masters, Platinum e Gold despejam na mesma
semana. Isso não é sutil: um atleta que "seria" Crown-elegível pelo
histórico de pontos perde esse acesso de um dia pro outro, sem jogar
pior — só porque não jogou nada. Consequência direta pro World Tour em
segundo plano: nessa mesma semana, dezenas de vagas de entrada direta
em Crown/Elite/Masters ficam sem seus ocupantes esperados, e a base
(Bronze/Silver) recebe uma leva simultânea de atletas com
`overall_rating` alto (o `legacy_seed` não mexe em `overall_rating`,
só em pontos de ranking) — pares que, se conseguirem parceiro, dominam
`pairScore`/`applyOpenTierEntryPriority` na entrada da base pela mesma
razão já registrada no achado #32 (a fatia de maior `overall_rating`
reenchendo toda vaga nova). **O penhasco não é só uma queda de posição —
é uma injeção pontual de talento subitamente "rebaixado" na base,
concentrada numa única semana por temporada.**

**`rankGapWeight` no mercado de parceria**: os ~401 caem para uma faixa
de rank muito próxima ENTRE SI (556-600+), o que os torna bons
candidatos de pareamento UNS COM OS OUTROS (gap pequeno,
`rankGapWeight` alto) — mas péssimos candidatos contra o resto da
população ativa (gap de centenas de posições contra quem segue jogando
normalmente). Se o mercado por acaso sortear dois membros do próprio
grupo crashado como `first`/`second` na mesma iteração, eles se pareiam
com facilidade; caso contrário, ficam competindo pela mesma fatia
estreita e distante do resto do pool.

### 1.4 — Conclusão do item 1: problema independente, não some sozinho com os itens 2/3

O critério que o próprio pedido definiu (item 4): "se ele derruba
centenas de bots simultaneamente, é problema próprio e independente."
**401 bots+reais de uma vez, 389 deles bots — é centenas, e a imensa
maioria não tem nada a ver com o registro de atletas reais.** Os itens 2
e 3 (que atacam especificamente a origem do problema PARA OS REAIS —
loteria de formação) não tocam nos ~389 bots que caem juntos na mesma
semana, nem no efeito de reordenação de 78% da população. **O penhasco
precisa de correção própria, independente do que os itens 2/3
resolverem** — decisão final registrada no item 4 deste relatório, mas
o número já está definido aqui: não é "poucos", é quase metade da
população inteira numa carreira nova.

## 2 — Pareamento inicial dos 46 reais sem parceiro conhecido

### 2.1 — Implementado

`saveFoundation.js:ensureWorldSeed2025` (produção) e o espelho equivalente
em `scripts/audit-real-athletes-simulation.mjs` (o harness não pode chamar
a função de produção — depende de `window`, ver comentário já existente no
script) ganharam o mesmo bloco: depois de semear os 27 pares confirmados/
prováveis, os reais que sobram sem `ai_partner_id` (46 de 100 — confirmado
na Fase 6.1 §1.1) são ordenados por `fip_rank` (ranking real do FIP, já no
registro — `real_arturo_coello.fip_rank`, etc.) e pareados sequencialmente
entre si (1º-2º, 3º-4º, ...). `ai_partnership_protected: false` — estado
INICIAL, não travado como as 6 duplas históricas confirmadas: o mercado
(`aiPartnershipLifecycle.js`) dissolve e reforma essas duplas normalmente
dali em diante, pela mesma regra de chemistry/forma/contrato de qualquer
par de IA.

Nenhuma regra muda para o resto da população (bots inclusive) — só um
estado inicial que o registro já continha (`fip_rank`) e não estava sendo
usado para isto.

**Bug encontrado e corrigido durante a própria implementação**: a
primeira versão do espelho no harness (`audit-real-athletes-simulation.mjs`)
produziu "Duplas: 77 reais" em vez dos 50 esperados (27 originais + 23
novos). Causa: o laço dos 27 pares confirmados/prováveis, NO HARNESS
(diferente de `saveFoundation.js`, que já tinha essa linha), nunca
escrevia `row1.ai_partner_id`/`row2.ai_partner_id` em memória — só
enfileirava o patch pro banco. Meu filtro (`!row.ai_partner_id`) via
os 100 reais como livres, inclusive os 54 já pareados, formando 50
pares novos por cima dos 27 existentes. Corrigido adicionando a mesma
mutação em memória que `saveFoundation.js` já tinha (linha comentada
"evita reprocessar...") — confirmado por dois testes de 1 mês antes do
run de 5 temporadas: com a correção, "Duplas: 50 reais"; com
`DIAG_NO_SEED62=1` (interruptor de escape adicionado pra isolar o
efeito sem precisar reverter arquivo), "Duplas: 27 reais" — igual ao
baseline. Registrado porque é o tipo de erro que esta auditoria já
cataloga como classe própria (§3 da Fase 6.1): um cálculo (a mutação em
memória) que existia num lugar e faltava no espelho equivalente.

### 2.2 — Medição: ajuda, mas não estabiliza — e revela o segundo ponto de entrada da armadilha

Regime-check de 5 temporadas, mesma seed, `circuitCatalog.js` idêntico
(Candidato B) — só o pareamento inicial muda.

| Métrica | Baseline (Fase 6, sem correção) | Com item 2 aplicado |
|---|---|---|
| Ociosos por temporada | 13, 21, 29, 32, **42** | **4**, 29, 36, 44, **46** |
| Top 20 real, T1→T5 | 20,16,12,11,**10** | 20,18,16,11,**12** |
| União (5 temporadas) | 64 | 64 |
| **Interseção (nunca jogaram em NENHUMA das 5)** | **2** (3,1% da união) | **2** (3,1% da união) |
| Cumulativo "nunca jogaram até aqui" por checkpoint | 13→6→4→2→2 | **4→3→2→2→2** |

**Bug encontrado durante a implementação, corrigido antes de medir** (nota
de honestidade da própria auditoria, ver §2.1): a primeira versão do
espelho no harness produzia 77 duplas reais em vez de 50, porque a
mutação em memória que confirma "já tem parceiro" só existia em
`saveFoundation.js`, não no espelho do harness — o filtro via todo mundo
como livre. Corrigido e reconfirmado por dois testes de 1 mês antes de
rodar as 5 temporadas completas.

**Ajuda em três eixos**: temporada 1 cai de 13 pra 4 ociosos (-69%); o
cumulativo "nunca jogou até aqui" fica sistematicamente mais baixo em
TODO checkpoint (4 vs. 13 na T1, 3 vs. 6 na T2); Top 20 real termina em
12/20 em vez de 10/20. **Não estabiliza a curva de ociosos por
temporada** — ela continua subindo nos dois cenários (chega a 46 em vez
de 42, ligeiramente PIOR no fim) — e **a interseção final não muda: 2
reais continuam presos, nas duas versões do mundo.**

**Achado central do item 2: os presos não são mais os mesmos, e não são
dos 46 que a correção mirava.** Os 2 reais permanentemente ausentes
agora são **Javier Martínez** e **Albert Roglán Pons** — não Álvaro
Montiel Caruso/Maximiliano Sánchez (que a correção resolveu: ambos
aparecem pareados e jogando nas primeiras temporadas deste run). Mas
Javier Martínez e Albert Roglán Pons **já tinham parceiro histórico
confirmado desde o dia 1** (`Javier Martínez & Manuel Castaño Salguero`,
`Marco Cassetta & Albert Roglán Pons` — ambos rastreados desde a Fase
6.1 com pareamento caindo a 0% cedo e nunca voltando). **O item 2 fecha
a PRIMEIRA porta de entrada da armadilha (nunca ter parceiro) — mas
existe uma SEGUNDA porta, igualmente eficaz, que ele não toca: dissolver
e não reformar a tempo, algo que pode acontecer com QUALQUER real,
originalmente semeado ou não.** Isso é exatamente o que o item 3 ataca.

## 3 — Prioridade por tempo de espera: implementada depois do item 2 medido

### 3.1 — O campo que falta

`market_status:'livre'` não carrega quando o atleta ficou livre — não dá
pra priorizar por espera sem essa data. Proposta: `market_status_since`
(data), setada em `dissolvePartnerships` no momento da dissolução (junto
de `market_status:'livre'`) e limpa implicitamente ao formar um novo par
(a presença de `ai_partner_id` já basta pra saber que não está mais
esperando).

### 3.2 — O que "espera" significa para quem dissolveu e reformou várias vezes

**Decisão proposta: a corrente atual, não o acumulado da carreira.**
`market_status_since` reseta a cada nova formação — mede "há quanto tempo
está SEM PAR agora", não "quanto tempo já passou sem par ao longo de toda
a carreira". Razão: o risco que este mecanismo existe pra evitar (o
penhasco dos 364 dias) é sobre a corrente ATUAL sem resultado datado — um
atleta que já passou por 5 parcerias curtas e bem-sucedidas não está em
risco nenhum, mesmo com anos de vida de "espera" somada; um atleta na
PRIMEIRA corrente de 11 meses sem par está a um mês do penhasco. Medir a
corrente certa é medir o risco certo.

### 3.3 — Forma da correção: piso reservado, não bônus de peso

Duas formas possíveis — proponho a primeira, mesmo padrão já validado na
Fase 5.1/5.3 (fila sem memória favorece sempre os mesmos; correção lá foi
reservar fração das vagas por prioridade, não só re-pesar):

1. **Piso reservado** (proposta): reservar uma fração de `targetPairs` a
   cada mês (mesmo desenho do `OPEN_TIER_RESERVED_SHARE` da Fase 5.1) para
   quem tem `market_status_since` mais antigo, ignorando compatibilidade/
   proximidade de rank para essa fração — garante progresso dentro de um
   número de meses limitado, independente de quão ruim seja o
   `rankGapWeight` de alguém.
2. **Bônus de peso** (rejeitada): somar um termo crescente por tempo de
   espera ao peso de `selectPair`. Mais simples, mas não GARANTE nada — um
   outlier extremo (rank a centenas de posições de qualquer candidato
   livre) pode continuar perdendo o sorteio por muito tempo, só com odds
   um pouco melhores. O piso reservado resolve exatamente o caso que
   importa (quem está preso), o bônus só atenua.

### 3.4 — Implementado, depois de confirmar (§2.2) que o item 2 sozinho não fecha a segunda porta

`aiPartnershipLifecycle.js`: `market_status_since` adicionado (setado em
`dissolvePartnerships`, nos dois pontos onde um atleta vira `'livre'` —
dissolução normal e o caso `!partner`/parceiro sumiu). `formNewPartnerships`
ganhou uma fase reservada ANTES do sorteio ponderado —
`MARKET_WAIT_RESERVED_SHARE = 0,2` (20% de `targetPairs`/mês) — que
pareia os dois atletas com `market_status_since` mais antigo entre si,
sem pesar compatibilidade/proximidade, e sai do loop sem forçar nada se
ninguém tiver tempo de espera acumulado ainda (`daysSinceFree<=0`, o
caso do bootstrap do mundo). O sorteio ponderado normal (`selectPair`)
segue rodando pra `targetPairs - reservedFormed` pares, exatamente como
antes. A lógica de formação de par foi extraída pra uma função
(`formPair`) reaproveitada pelas duas fases, pra não duplicar os 5
efeitos colaterais (patch de atleta, upsert de `Partnership`, mutação em
memória, contador `formed`, evento narrativo) entre elas.

Testado (`node --check` + smoke test de 3 meses, sem erro) antes do run
de 5 temporadas completo.

### 3.5 — Medição: a segunda porta se fecha

Regime-check de 5 temporadas, mesma seed, `circuitCatalog.js` idêntico —
item 2 + item 3 juntos.

| Métrica | Baseline (sem correção) | Item 2 sozinho | **Item 2 + item 3** |
|---|---|---|---|
| Ociosos por temporada | 13, 21, 29, 32, 42 | 4, 29, 36, 44, 46 | **2, 20, 26, 37, 39** |
| União (5 temporadas) | 64 | 64 | **57** |
| **Interseção (nunca jogaram em NENHUMA)** | 2 (3,1%) | 2 (3,1%) | **0 (0%)** |
| Cumulativo por checkpoint | 13→6→4→2→2 | 4→3→2→2→2 | **2→1→0→0→0** |
| Top 20 real, T1→T5 | 20,16,12,11,10 | 20,18,16,11,12 | 20,18,15,11,**13** |
| Reais — torneios jogados (média) | ~57/5 temp. | — | 60,6 (mediana 58,5) |

**Interseção zerada — de volta ao valor que a Fase 4.2 media antes de
qualquer mudança da Fase 5.** `realAthletesNeverInAnyDraw` retorna
vazio: nenhum dos 100 reais fica de fora de TODAS as 5 temporadas. A
lista de quem já foi excluído (Javier Martínez, Albert Roglán Pons — os
2 do item 2) para de aparecer: o piso reservado os resgata antes do
penhasco fechar a porta de vez.

**Efeito colateral bom, não perseguido de propósito**: a UNIÃO cai de 64
pra 57 — não é só que ninguém fica preso pra sempre; MENOS reais no
total passam por algum período ocioso ao longo dos 5 anos. O ociosos-
por-temporada continua subindo (2→39, mesmo formato de curva das outras
duas versões) — **item 3 não estabiliza esse número**, ele resolve
especificamente a EXCLUSÃO PERMANENTE, que é a métrica que a Fase 6
definiu como a que importa (achado #32: razão agregada não é a métrica
certa, fração que nunca joga é).

## 4 — O penhasco ainda precisa de correção própria? Sim.

O critério que o próprio pedido definiu: "se ele derruba centenas de
bots simultaneamente, é problema próprio e independente. Se derruba
poucos, resolve-se sozinho com o item 2."

**Resposta do item 1**: 401 atletas de ~956 processados (42% da
população) numa única semana — **389 deles bots**. Os itens 2 e 3
mudam exclusivamente COMO os reais se pareiam entre si (pareamento
inicial + piso de espera) — nenhum dos dois toca em
`rankingWindow.js`/`buildLegacySeedRow`/`isResultExpired`, nem em
nenhum bot. O evento sincronizado do mês 12-13 continua acontecendo
INTOCADO, com a mesma magnitude (~401 atletas, 78% da população se
deslocando >50 posições numa semana), em toda carreira nova,
independente do que os itens 2/3 fizerem pelos reais.

**Decisão: sim, precisa de correção própria — 389 bots de uma vez não
"resolve-se sozinho" com nada que esta entrega fez.** Os itens 2/3
resolveram a consequência mais grave do penhasco PRA OS REAIS
especificamente (exclusão permanente, interseção zerada) — mas o
penhasco em si, como evento populacional, continua lá, e continua
sendo capaz de produzir o mesmo tipo de dano (queda abrupta,
reordenação em massa da tabela, uma leva de talento alto-mas-rank-zero
entrando na base de repente) pra qualquer atleta — real ou bot — que
não jogue no primeiro ano. Um real futuro que, por azar, não seja
resgatado a tempo pelo piso de espera (§3.3-3.5 não garantem 100% —
reduzem a probabilidade a zero NESTA medição, não a zero por
construção) ainda cairia no mesmo precipício.

**Não corrigido nesta fase** — como pedido, item 4 é só a decisão, não
a implementação. Candidato natural para a próxima fase desta série:
suavizar a expiração do `legacy_seed` (variante (c) da Fase 6.1 §5 —
"a âncora não deveria contar um relógio que o atleta não pode parar de
rodar" — mais forte ainda quando confirmado que o relógio nem sequer é
sobre o atleta ficar sem parceiro: são ~389 bots PAREADOS que também
caem, então a causa não é só "sem dupla", é "sem jogar", ponto — dupla
formada não implica torneio disputado a tempo).

## 5 — Validação

Código de produção mudou nesta fase (diferente da Fase 6.1) — itens 2 e
3 são correções de verdade, não só relatório:

- `src/lib/saveFoundation.js` — pareamento inicial dos 46 reais (item 2).
- `scripts/audit-real-athletes-simulation.mjs` — espelho da mesma
  correção (produção não pode ser chamada pelo harness) + o bug
  encontrado e corrigido durante a implementação (§2.1).
- `src/game-core/aiPartnershipLifecycle.js` — `market_status_since` +
  piso reservado de 20% por tempo de espera (item 3). `DIAG_CLIFF`
  (`circuitLifecycle.js`, item 1) revertido — grep confirma zero
  ocorrências.

Validação:
- `npm run lint` — limpo.
- `npm run build` — OK (mesmo aviso pré-existente de chunk >500kB).
- Suíte de regressão — 33/36, score 92/100, as mesmas 3 falhas
  pré-existentes (`test:rc-gameplay-balance`, `test:career-pace`,
  `test:ui-quality`), nenhuma relacionada a esta fase.
- `src-tauri/` intocado.
- `git diff -- src/` só mostra os 3 arquivos do item 2/3 — zero
  ocorrências de `DIAG_CLIFF` em `src/`/`scripts/`.
- Arquivos auto-regenerados pela suíte revertidos antes do commit.

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | Contagem e cascata do penhasco sincronizado, sem correção | ✅ **401 de 956 (42%) numa única semana, 389 bots** — deslocamento populacional médio de 142 posições, 78% da população move >50 posições; sem correção |
| 2 | Pareamento inicial dos 46 implementado, curva remedida | ✅ implementado e medido — ajuda mas **não fecha a interseção sozinho (fica em 2/100)**: achado de uma segunda porta (dissolver e não reformar) |
| 3 | Prioridade por espera implementada depois do item 2 medido | ✅ implementada e medida — **interseção zerada (0/100)**, de volta ao valor pré-Fase-5 |
| 4 | Suíte, lint, build, Tauri OK, commit | ✅ lint 0 · build OK · suíte 33/36 (92/100) · `src-tauri/` intocado |

### Resumo executivo

O pedido pediu pra medir antes de corrigir, e a medição mudou a decisão
em dois pontos: (1) o penhasco não é "problema dos reais" — é 42% da
população inteira, majoritariamente bots, e continua precisando de
correção própria depois de tudo que esta fase fez; (2) o pareamento
inicial (item 2), a correção de "menor risco" cotada no pedido, sozinho
não fechou a interseção — só a combinação com a prioridade por espera
(item 3) zerou. As duas portas de entrada da armadilha (nunca ter
parceiro / dissolver e não reformar a tempo) precisavam das duas
correções; uma sozinha resolvia só uma porta.
