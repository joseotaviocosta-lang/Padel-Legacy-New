# Fase 8.2 — Dominância de tier: mecanismo confirmado, correção proposta refutada por medição

> **COMPLETA — diagnóstico e proposta, nada implementado**, conforme pedido. O
> mecanismo NÃO é preferência ativa da IA por tiers fáceis — é escassez de
> calendário no topo, confirmada por rastreio nominal. Mas a correção óbvia
> que essa causa sugeria (mais Elite/Crown) foi testada numa medição pontual
> e **não reduziu a dominância agregada** — só redistribuiu a participação
> individual do próprio real rastreado. Isso refuta a hipótese de que
> escassez de calendário no topo é a causa principal da dominância AGREGADA
> (é a causa completa do padrão individual de escolha, mas não do número que
> a Fase 0 mede). Proposta revisada: nenhuma correção de calendário ou de
> `chooseTournament` deve ser implementada com base só no diagnóstico desta
> fase — a causa real provavelmente está na composição de força dos CAMPOS
> (quantos bots comparáveis a um real aparecem em Gold/Platinum/Masters), uma
> investigação diferente, não iniciada aqui.

## 1 — Mecanismo confirmado: não é preferência, é escassez de calendário

### 1.1 — `chooseTournament`: como a escolha semanal funciona hoje

`TournamentSelectionAI.js:chooseTournament` avalia TODOS os eventos da semana,
filtra pelos elegíveis (`evaluateTournamentEntry`), pontua cada um
(`scoreOption`: combinação ponderada de retorno líquido esperado, pontos de
ranking esperados, prestígio, chance de título, menos fadiga — pesos variam
por `careerStrategy`) e escolhe o de maior pontuação, ou descansa se o
"valor do descanso" superar a melhor opção. **Não existe nenhuma preferência
de tier codificada** — nunca existiu (não é uma regressão; não há nenhum
achado anterior, em nenhuma fase, mencionando essa peça como implementada e
quebrada). A pontuação em si, quando calculada pra um real de topo (rank 2)
em cada tier isoladamente, JÁ favorece corretamente tiers mais altos: numa
simulação de bancada (`scoreOption` reimplementada fielmente, fora do
motor), Crown vence Elite vence Masters vence Platinum vence Gold em TODAS
as 5 estratégias de carreira, pra um rank 2. A fórmula não está quebrada.

### 1.2 — Rastreio nominal: Arturo Coello (fip_rank 1), temporada 1, calendário atual

Instrumentação temporária (revertida) logou, pra cada semana, o calendário
disponível (por tier) e a opção escolhida. Resultado da temporada 1 completa
(78 semanas):

| | Semanas | % |
|---|---|---|
| Zero opções elegíveis (só Bronze/Silver na semana, ou nada) | 35 | 44,9% |
| Exatamente 1 opção elegível (sem escolha real a fazer) | 40 | 51,3% |
| 2+ opções elegíveis (escolha real exercida) | **3** | **3,8%** |

Confirmado em 2 temporadas seguidas (135 semanas acumuladas): 61 zero, 68
uma, 6 duas-ou-mais — mesma proporção (~4,4%).

**Nas 3 semanas com escolha real, a pontuação escolheu CORRETAMENTE o tier
mais alto disponível nas 3 vezes** (0 contraexemplos) — inclusive um caso
concreto: `{Gold, Masters}` disponíveis → escolheu Masters (mais prestígio),
não Gold. `chooseTournament` nunca "desceu" pra um tier mais fácil quando
tinha a opção de subir.

**As 35 semanas de "zero opções" são, nominalmente, 100% semanas em que só
havia Bronze e/ou Silver no calendário** — nenhuma dessas semanas tinha
Gold/Platinum/Masters/Elite/Crown rodando e foi ignorado por preferência;
literalmente não havia nada além da base pra escolher. Nas 40 semanas de
"uma opção", a distribuição bate quase exatamente com `TIER_EVENTS_PER_YEAR`
(Elite:10, Masters:10, Gold:8→7 observado, Platinum:6, Crown:4→5 observado)
— ou seja, **o real joga essencialmente TODO evento de todo tier
médio/alto que existe no calendário do ano**, não porque escolhe entre eles,
mas porque raramente há dois no ar ao mesmo tempo pra escolher.

## 2 — Calendário, não seleção — confirmado, com uma ressalva importante

**Resposta direta**: é escassez de calendário no topo (Elite/Crown: só
10+4=14 eventos/ano, contra Gold+Platinum+Masters=24/ano), não preferência
ativa. A IA nunca tem a chance de preferir Crown a Gold na maioria das
semanas — ou tem Crown disponível (e escolhe), ou não tem (e joga o que
houver, ou descansa). Isso responde ao item 1.2 do pedido: **não existe
nenhuma preferência de tier "quebrada"** — nunca existiu nenhuma, e a que
existe implicitamente (via pontuação) funciona.

**A ressalva (item 3, abaixo) é que corrigir a escassez não corrigiu a
dominância agregada** — os dois fenômenos são reais, mas não são a mesma
causa do mesmo efeito na medida que a Fase 0 usa pra julgar sucesso.

## 3 — Proposta testada: expandir Elite/Crown — efeito nulo na dominância agregada

### 3.1 — O que foi medido

Medição pontual (não regime-check completo): mesma seed/população, 2-3
temporadas, `Gold/Platinum/Masters` no nível de topo-120 (já validado na
Fase 8) **mais** `Elite: 10→20` e `Crown: 4→8` (2× cada) — testando
especificamente se dar mais volume ao TOPO do calendário (não só ao meio)
reduz a dominância real em Gold/Platinum/Masters.

**Efeito no indivíduo rastreado (Coello) — dramático, na direção esperada**:
com o topo ampliado, 2+ opções elegíveis sobem de ~4% pra **30,5%** das
semanas (39/128 na temporada 1); Gold, que ele jogava por falta de opção,
cai pra só 3 aparições na temporada inteira (contra Masters:32, Platinum:17,
Elite:16, Crown:6) — a preferência correta de `chooseTournament` finalmente
tem chance de se exercer na maioria das semanas, e o real de topo migra pro
tier certo quando pode.

**Efeito na dominância AGREGADA (a métrica que a Fase 0 mede) — nulo ou
pior**:

| Tier | Atual (Fase 8) | Topo-120 (Fase 8) | Topo-120 + Elite/Crown 2× (esta fase) |
|---|---|---|---|
| Gold, T1 | 87,5% | 70,6% | 76,5% |
| Gold, T2 | 87,5% | 54,3% | 51,4% |
| Platinum, T1 | 100% | 77,8% | **92,6%** |
| Platinum, T2 | 83,3% | 74,1% | **88,9%** |
| Masters, T1 | 100% | 97,7% | 97,7% |
| Masters, T2 | 100% | 95,5% | 97,7% |

Gold fica praticamente EMPATADO com o topo-120 puro (51-77% vs. 51-76% —
diferença dentro do ruído de 1 seed); **Platinum piora nas duas
temporadas medidas** (77,8%→92,6% na T1, 74,1%→88,9% na T2); Masters não
muda. **Redistribuir ONDE o real de topo joga não muda QUEM VENCE nos
tiers que ele deixou de frequentar** — outros reais (ou o mesmo campo de
sempre) continuam vencendo lá.

### 3.2 — Por que a proposta original (regra de preferência) não é recomendada

O pedido original presumia que a causa fosse a IA preferindo ativamente
tiers fáceis, e propunha uma regra de ponderação suave como correção. A
medição do item 1 já mostra que essa premissa não se sustenta — a
pontuação atual é correta nas 100% das vezes em que tem escolha real
(§1.2). **Não há nada pra "consertar" na função de pontuação.** Adicionar
uma regra de preferência explícita, dado esse achado, seria uma correção
sem defeito correspondente — risco de introduzir um comportamento novo
(e possivelmente pior) sem nenhum problema medido que ela resolva.

### 3.3 — Por que a correção de calendário (Elite/Crown) também não é
recomendada, sozinha

A medição do item 3.1 mostra que dar mais volume ao topo redistribui a
PARTICIPAÇÃO do indivíduo mais forte, mas não move a métrica de
dominância que a Fase 0 realmente cobra. Implementar essa expansão sem
mais investigação arriscaria o mesmo padrão já visto na Fase 6.7 (mais
calendário não é estritamente melhor em toda métrica) — desta vez,
"melhor" nem chega a se confirmar no eixo que importa.

### 3.4 — Hipótese alternativa, não testada nesta fase: composição de força
dos campos

Levantada, não confirmada: bots procedurais recebem `overall_rating`
diretamente calibrado pelo rank ABSOLUTO com que nascem
(`rankingPopulation.js`: `96 - (absoluteRank/1000)^0.72 × 57` — rank 1 ≈ 96,
rank 1000 ≈ 39), e — verificado agora — os reais NÃO têm um "prêmio" de OVR
sobre um bot na mesma posição seedada (num teste rápido, reais ficam de
fato ABAIXO do que um bot teria na mesma posição: -6 a -8 pontos de OVR
pra rank 10-75). Isso sugere que a dominância não vem de reais serem
"OVR-inflados" — mas não foi verificado o que importa de verdade: **qual
OVR os bots que efetivamente aparecem no CAMPO de um Gold/Platinum têm**,
depois de suas próprias trajetórias de ranking ao longo da carreira (um
bot forte que envelheceu/perdeu forma pode ter OVR alto mas rank baixo o
bastante pra acabar competindo em tiers baixos — ou pode não acontecer o
suficiente, deixando Gold/Platinum com um campo de bots sistematicamente
mais fraco que o rank sugere). Não medido — precisaria de uma
instrumentação nova (distribuição de OVR do campo de entrada de cada
tier, por temporada), fora do escopo desta fase.

## 4 — Recomendação sobre topo-120: independente da dominância, já decidida por outro motivo

Confirmado pelo item 2: a causa da dominância NÃO é seleção corrigível por
regra, e calendário-no-topo (testado) não a resolve sozinho. **As duas
decisões seguem caminhos totalmente separados**, exatamente como o pedido
previu para o cenário "se for puramente seleção" — só que a causa raiz
real (composição de campo, não seleção nem volume de calendário no topo)
torna essa separação ainda mais definitiva:

- **Topo-120 continua recomendado pelo motivo já estabelecido na Fase 8**:
  resolve participação individual (63%→11% de reais abaixo do piso de
  12 eventos/temporada). Essa recomendação NÃO muda com este diagnóstico.
- **Topo-120 (ou qualquer expansão de calendário, incluindo Elite/Crown)
  não deve ser vendido como correção de dominância** — a medição desta
  fase mostra que não é. Se/quando a dominância for atacada, será por
  outro mecanismo (provavelmente calibração de campo, §3.4), não por
  calendário.

## 5 — Validação

- Nenhum código de produção alterado — instrumentação temporária
  (`WorldTourLifecycle.js`, rastreio nominal; `circuitCatalog.js`, override
  `DIAG_TOP_EVENTS=999`) revertida antes do commit; `git diff` de ambos os
  arquivos fica vazio contra o commit da Fase 8.1.
- `npm run lint` — limpo.
- Cálculo de pontuação por tier (§1.1) reproduzido fora do motor, fórmulas
  copiadas fielmente de `TournamentSelectionAI.js`/`circuitCatalog.js` —
  script de verificação descartado após uso (não faz parte do código do
  jogo).
- Scratch descartado: `resume-state.json`/`run.log` verbosos das 2 rodadas
  de medição; `summary.json`/`tournament-results.csv`/`season-tier-table.md`
  mantidos em `reports/real-athletes-audit/f82-{trace-check,elite-crown-boost}/`
  como evidência das tabelas acima.
- `src-tauri/` — sem alterações.

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | Mecanismo confirmado, com rastreio nominal | ✅ não é preferência quebrada — nunca existiu regra de tier, e a pontuação por utilidade já favorece o tier mais alto em 100% dos casos com escolha real (3/3) |
| 2 | Resposta calendário vs. seleção | ✅ é escassez de calendário no topo (só 3,8% das semanas têm 2+ opções elegíveis) — confirmado, não é seleção ativa |
| 3 | Proposta de correção | ⚠️ proposta original (regra de preferência) refutada como desnecessária; proposta alternativa (mais calendário no topo) testada e refutada como insuficiente — nenhuma correção recomendada sem investigar composição de campo (§3.4) primeiro |
| 4 | Recomendação sobre topo-120 | ✅ mantida pelo motivo original (participação), explicitamente desvinculada de dominância — as duas decisões são independentes |
