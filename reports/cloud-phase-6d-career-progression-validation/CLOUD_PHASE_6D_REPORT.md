# CLOUD-6D — Career Progression Validation After Rebalance

Fase de **diagnóstico e validação**. Nenhum código de produção, balanceamento, schema de save, versão do app ou preset foi alterado. O diff desta fase contém só este relatório, os dados em `data/` e um script de análise somente-leitura (`scripts/audit-cloud6d-compare.mjs`).

| Item | Valor |
|---|---|
| Repositório | `joseotaviocosta-lang/Padel-Legacy-New` |
| Origem | `cloud/phase-6c-victory-attribute-integrity` @ `5a8350a` (confirmado; worktree limpo no início) |
| Branch desta fase | `cloud/phase-6d-career-progression-validation` (local, **sem push, sem PR**) |
| Código testado ("6D") | `5a8350a` = CLOUD-6B (curva contínua) + CLOUD-6C (bônus de vitória limitado ao teto) |
| Código de comparação ("baseline") | `fbb0bc4` (CLOUD-5, base da 6A), em worktree separado, **mesmo harness** |
| Preset | padrão de produção `balanced` (`PL527_PRESET` não definido; `getBalance527()` cai em `balanced`, confirmado em `src/lib/balance527.js:91`) |
| Dificuldade | `normal` (a que o simulador cria) |

> **Leitura obrigatória antes dos números.** A amostra é **1 semente (seed 1) por perfil**, e as carreiras cobrem **só até ~18 anos** (normal: dia 805 comparável; otimizador: dia 896 comparável). Nada foi simulado depois disso, então **nada é afirmado** sobre 19+ anos, Top 1, auge ou envelhecimento. n=1 não permite inferir frequências. Além disso, o **parceiro divergiu entre os lados** no otimizador (§5.5), o que confunde a leitura do ranking. Onde há inferência, está marcada como **Hipótese**; onde há extrapolação, **Projeção**.

---

## 1. Resumo executivo

1. **Observado:** a nova curva é bem mais lenta no início, como projetado. OVR no dia 360 (≈1 ano): normal 62 → **45**, otimizador 68 → **47**. No dia 720 (17 anos): normal 76 → 58, otimizador 81 → 60. A observação (45) ficou próxima da projeção da 6B para o normal (49).
2. **Observado:** no otimizador, o crescimento da 6D **continua em ritmo ~constante** (+3 OVR por ~90 dias entre os dias 630 e 810) no ponto em que a baseline já desacelera (+2, +1) e achata em 82–83; a 6D ainda cresce aos ~18 anos. No normal os dois lados crescem +2 a +3 por trimestre nesse trecho (sem desaceleração visível na baseline). Isso é compatível com o objetivo da 6B, mas **só vale até onde foi simulado**.
3. **Observado:** a progressão mais lenta se traduziu em **piora forte de resultados competitivos** no horizonte simulado. Otimizador: 73 vitórias em 136 partidas (baseline) contra 36 em 110 (6D); melhor rank 22 contra 128. Normal: 20 em 88 contra 2 em 70. Top 100 do otimizador: dia 679 (baseline) contra não alcançado até o dia 900.
4. **Observado:** a **qualidade do parceiro continua dominante**. Na baseline, o otimizador contratou OVR 81 no dia 225 (dupla no rank 74 no dia 270). Na 6D, o mesmo perfil ficou com parceiro OVR ~50 até o dia ~869 (OVR 87 só depois). **Hipótese:** o jogador mais lento mantém a razão parceiro/jogador acima do limiar de renovação do harness e não reabre a Busca.
5. **Observado (validação 6C):** nenhum atributo da 6D passou de 88; a baseline chegou a 89 e teve quedas semanais acumuladas de 10 pontos no otimizador, que na 6D foram **0**.
6. **Observado:** economia mais apertada na 6D (caixa 3,7k contra 26,9k no dia 896; patrocínio 4,2k contra 8,2k/mês). **Hipótese:** efeito indireto de menos vitórias, ranking e prêmio, não de regra econômica (nada foi alterado).
7. **Veredito:** **não há evidência suficiente para validar a nova curva nem para reverter.** O que foi observado é uma carreira inicial muito mais difícil (risco já apontado na 6B). Antes de qualquer ajuste é necessário replicar com mais sementes e com o parceiro controlado (§9).

---

## 2. Metodologia e condições de comparação

### 2.1 O que foi comparado

Comparação **pareada**: mesmo harness (`scripts/sim-progression-economy-v526.mjs`), mesma semente (1), mesmos perfis (normal e otimizador), mesma dificuldade e mesmo preset, mudando apenas o código do jogo:

| Lado | Árvore de código | Diferenças de produção em relação ao outro lado |
|---|---|---|
| baseline | worktree `fbb0bc4` | — |
| 6D | `5a8350a` | `git diff fbb0bc4 5a8350a -- src` toca só `trainingSystemV2.js` (6B/6C), `padel.js` (6C) e o novo `attributeCeiling.js` |

### 2.2 Por que não se comparou diretamente com os CSVs da 6A

A baseline foi **reexecutada** em vez de lida do CSV da 6A. Motivo (verificado no piloto de 90 dias):

- O piloto da baseline reproduz **exatamente** o piloto da 6A (7 partidas, rank 910, OVR 38).
- A série semanal publicada da 6A (`weekly-normal-seed1.csv`) **coincide nos dias 0–28 e diverge a partir do dia 35** (moedas 750 contra 1.392). Reexecutei com `--checkpointEvery=180 --segment` (o modo do runner da 6A) por 42 dias e o resultado é idêntico ao contínuo, então esse modo não explica a divergência.
- **Causa não identificada.** **Hipótese:** as execuções longas da 6A partiram de um estado de árvore ou harness diferente do piloto. Não foi possível confirmar.

Consequência: os números da 6A ficam como **referência secundária**; as tabelas antes/depois abaixo usam a baseline reexecutada. As médias de atributos da baseline reexecutada ficam próximas das da 6A (normal 62 e 76 nos dias 360 e 720, contra 64 e 76; otimizador 68 e 80,6, contra 67 e 81), mas **o caminho de parceiro do normal difere** (ver §5.5).

### 2.3 Cenários diretamente comparáveis

| Cenário | Comparável com a 6A? | Observação |
|---|---|---|
| normal, seed 1, dif. normal | sim em atributos; **não** em parceiro/ranking | baseline reexecutada difere da 6A depois do dia 35 |
| otimizador, seed 1, dif. normal | sim em atributos e parceiro até o dia ~270 | parceiro 81 no dia 225 (6A: 82 no dia 225) |
| casual | **não executado** | priorização pedida: normal e otimizador |
| easy/hard, outras sementes | **não executados** | custo |

### 2.4 Validação do simulador (Etapa 2)

| Pergunta | Resultado |
|---|---|
| Usa as funções reais de treino? | **Sim.** `v526Actions.train` chama `trainingSystemV2.executeTraining` (`v526Actions.mjs:377-381`). |
| Usa o bônus de vitória real? | **Sim.** `v526Tournament.mjs:190` chama `padel.buildMatchRewardsPatch(..., { officialTournament: true })`. |
| Reimplementa fórmulas antigas? | **Não** encontrado. O simulador carrega os módulos de `src/` (`L('/src/lib/...')`). |
| OVR corresponde ao jogo? | O OVR do simulador é `round(média dos 10 atributos planos)` (`ovrOf`), a mesma definição usada nas fases 6A–6C; para atletas do mundo, cai em `overall`. **Não** foi comparado com a função de OVR da interface do jogo nesta fase (limitação). |
| As otimizações da CLOUD-5 alteraram resultados? | O piloto da baseline `fbb0bc4` (já com CLOUD-5) reproduz o piloto da 6A. A CLOUD-5 também aparece no lado 6D. Não há sinal de efeito funcional. O clone rápido (`PL527D_FASTCLONE`) é opt-in e **não foi ativado**. |
| Determinismo | Dois processos distintos produziram a mesma série semanal nos dias 0–42 (piloto contínuo e piloto com checkpoint). Reinício do container no meio da execução foi retomado do checkpoint, que o próprio simulador define como determinístico; o resultado retomado não foi comparado com uma execução ininterrupta. |
| Foi preciso corrigir o instrumento? | **Não.** Nenhuma alteração no simulador. |

---

## 3. Execução e controle de custo (Etapa 4)

| Item | Valor |
|---|---|
| Ordem | piloto de 90 dias (baseline e 6D) → 6D normal → 6D otimizador → baseline normal → baseline otimizador, **uma simulação pesada por vez** |
| Limites | 100 min de relógio por carreira (`timeout`), `--max-old-space-size=3072`, checkpoint a cada 90 dias com retomada automática |
| Pilotos | baseline 246 s, 836 MB RSS; 6D 237 s (90 dias, normal) |
| Resultado por job | 6D normal: cortado pelo limite, checkpoint no dia 810 · 6D otimizador: dia 900 (62 min antes do reinício do container + 38 min depois) · baseline normal: dia 990 (corte) · baseline otimizador: encerrado manualmente no dia 900 |
| Falhas | 0 erros de simulação em todos os arquivos (`errors` vazio); nenhum `CHECKPOINT_CORRUPT` |
| Memória | pico de RSS não foi registrado durante as corridas longas; o teto de heap de 3 GB nunca foi atingido (nenhum job morreu por memória). Checkpoint do dia 810: 18,6 MB. |
| Reinício do container | ocorreu durante o `6d otimizador` (checkpoint do dia 630). Retomado com os 38 min restantes do orçamento. Registrado em `data/execution-log.txt`. |
| Sementes | **1** (apenas) por perfil. Não foram executadas dezenas de sementes. |

**Janela comparável (dia comum):** normal **805** (6D parou em 810), otimizador **896**. Idades: 16 no início; 18 aos 730 dias. A idade exibida é a do simulador (inteira). **Não há dados da 6D além desses dias.**

---

## 4. Resultados de progressão (observado)

Fonte: `data/weekly-*.csv` e `data/comparison-*-seed1.json`. Todas as colunas "antes→depois" são baseline → 6D.

### 4.1 Normal, seed 1

| Dia | Idade | OVR | Média atributos | Rank individual | Parceiro OVR | Moedas |
|---|---|---|---|---|---|---|
| 0 | 16 | 22→22 | 21,8→21,8 | 1001→1001 | 14→14 | 900→900 |
| 90 | 16 | 38→31 | 37,8→30,5 | 910→930 | 15→15 | 3881→3620 |
| 180 | 16 | 49→37 | 49,3→36,5 | 673→785 | 41→34 | 7281→4379 |
| 270 | 16 | 57→41 | 56,9→40,9 | 495→566 | 41→35 | 9017→4049 |
| 360 | 16 | 62→45 | 62,0→45,4 | 396→470 | 41→36 | 2435→1929 |
| 450 | 17 | 69→50 | 68,7→49,7 | 308→367 | 42→37 | 3928→2505 |
| 540 | 17 | 72→52 | 71,9→52,4 | 249→277 | 43→38 | 4162→479 |
| 630 | 17 | 74→55 | 74,1→54,8 | 163→213 | 46→39 | 7462→2662 |
| 720 | 17 | 76→58 | 76,4→57,9 | 128→161 | 47→40 | 2368→1007 |
| 805 | 18 | 79→59 | 78,8→58,9 | 116→147 | 48→41 | 7767→43 |

### 4.2 Otimizador, seed 1

| Dia | Idade | OVR | Média atributos | Rank individual | Rank da dupla | Parceiro OVR |
|---|---|---|---|---|---|---|
| 0 | 16 | 22→22 | 21,8→21,8 | 1001→1001 | — | 37→37 |
| 90 | 16 | 35→29 | 34,6→29,4 | 881→933 | 841→929 | 37→53 |
| 180 | 16 | 49→37 | 48,7→36,7 | 716→800 | 695→912 | 36→53 |
| 270 | 16 | 60→43 | 60,4→42,7 | 538→562 | **74**→613 | **81**→52 |
| 360 | 16 | 68→47 | 68,0→46,9 | 472→464 | 105→473 | 81→52 |
| 450 | 17 | 74→51 | 74,4→51,2 | 331→381 | 151→389 | 81→51 |
| 540 | 17 | 78→54 | 77,5→54,4 | 207→286 | 185→285 | 81→50 |
| 630 | 17 | 79→57 | 79,4→57,3 | 123→210 | 96→212 | 81→50 |
| 720 | 17 | 81→60 | 80,6→60,1 | 62→154 | 48→161 | 80→50 |
| 810 | 18 | 82→63 | 81,7→62,7 | 62→145 | 36→132 | 80→50 |
| 896 | 18 | 83→65 | 83,1→65,1 | **22**→128 | **8**→108 | 80→**87** |

O parceiro OVR 87 da 6D foi contratado no dia 869; a dupla passou de rank 122 para 108 em 27 dias (§5.5).

### 4.3 Atributos individuais no dia comum

| Atributo | Normal base | Normal 6D | Otim. base | Otim. 6D |
|---|---|---|---|---|
| serve | 88 | 74 | 77 | 45 |
| forehand | 74 | 48 | 82 | 71 |
| backhand | 44 | 31 | 75 | 49 |
| volley | 88 | 71 | 89 | 76 |
| bandeja | 88 | 58 | 80 | 52 |
| smash | 88 | 88 | 85 | 69 |
| defense | 81 | 49 | 88 | 60 |
| agility | 84 | 82 | 85 | 71 |
| strategy | 72 | 43 | 85 | 84 |
| emotional_control | 81 | 45 | 85 | 74 |
| **máximo** | **88** | **88** | **89** | **84** |

Os dois lados do normal tocam 88 em pelo menos um atributo; a diferença está no restante (média 79 contra 59). Os arquétipos diferem entre perfis (a 6A já alertava), então não se compara normal com otimizador.

### 4.4 Marcos de ranking (individual)

| Marco | Normal base | Normal 6D | Otim. base | Otim. 6D |
|---|---|---|---|---|
| Top 500 | d273 | d336 | d336 | d336 |
| Top 250 | d539 | d574 | d518 | d581 |
| Top 100 | não até o d805 | não até o d805 | **d679** | **não até o d900** |
| Top 50 | — | — | d882 | não até o d900 |
| Top 20 / 10 / 1 | — | — | não até o d896 | — |

**"Não até o dia X" não significa "nunca":** a carreira simplesmente não foi simulada depois.

---

## 5. Análise (Etapa 5)

### 5.1 A progressão inicial ficou excessivamente lenta?

- **Observado:** o ritmo caiu muito. A média de atributos no fim do 1º ano é 45 (contra 62 na baseline); o Top 250 chega ~35–60 dias mais tarde.
- **Observado:** no 1º ano da 6D normal, 24 dos 26 torneios terminaram na 1ª rodada, com 2 vitórias em 28 partidas (baseline: 20 em 49).
- **Projeção da 6B** para esse ponto: normal ~49. Observado 45. A projeção subestimou levemente a lentidão.
- **Julgamento:** "excessivamente lento" depende de uma meta que não está definida neste relatório. O que os dados mostram é que o **início ficou claramente mais difícil** e a 6B já alertava para isso. Como o início já era apontado como frustrante na 6A (especialmente para o caminho casual), o risco é real. **A decisão é de design/humana.**

### 5.2 O treinamento continua relevante?

- **Observado:** sim, nos horizontes simulados. A 6D ganha ~+3 de OVR por trimestre entre os dias 630 e 810 (normal 55→58→59 nos dias 630/720/805; otimizador 57→60→63 nos dias 630/720/810). No otimizador a baseline desacelera (79→81→82); no normal a baseline segue +2 a +3 (74→76→79). Ou seja, o treino ainda "paga" aos ~18 anos na 6D e o padrão de saturação do otimizador da 6A não aparece nela, mas isso só está demonstrado para o otimizador.
- **Não medido:** a fração do ganho que vem do treino e a que vem do bônus de vitória. O harness não separa os dois. Por isso, a conclusão vale para a progressão total.
- **Limite:** o gráfico para depois de 18,4 anos.

### 5.3 O jogador compete em torneios adequados ao nível?

- **Observado:** não, no horizonte simulado, em nenhum perfil. Diferença média de força (dupla − adversário): normal −21,0 (6D) contra −8,2; otimizador −7,6 contra +5,8. No normal da 6D, 51 de 70 partidas tinham Δ < −10 (1 vitória); no otimizador da 6D, 49 de 110 (0 vitórias).
- **Observado:** vitórias por tier no otimizador 6D: Bronze 28/40, Silver 0/11, Gold 7/31, Platinum 0/20.
- **Hipótese:** parte disso é política do harness, porque o normal escolhe `best-eligible` independentemente da força da dupla, e o otimizador usa `best-fit`. O jogo não bloqueia inscrição por força (critério de projeto, citado na 6A), então um jogador humano pode ou não evitar esses tiers. Não foi verificado.

### 5.4 O crescimento continua até idades mais avançadas?

- **Observado:** a taxa de crescimento da 6D aos 17–18 anos é maior que a da baseline.
- **Não observado:** qualquer coisa depois dos 18,4 anos. A afirmação "atinge o auge aos 22–25" é **projeção da 6B**, não resultado desta fase.
- **Observado:** na baseline do otimizador o atributo máximo chegou a 89 (acima do teto de 88) e houve **quedas semanais acumuladas de 10 pontos** (por exemplo `forehand` 85→82 no dia 889–896), que são o rebaixamento ao teto que a 6B removeu. Na 6D não houve quedas no otimizador. No normal, ambos os lados têm uma queda de 1 ponto (6D: `emotional_control` 44→43, dia 679–686). **A origem dessas quedas de 1 ponto não foi identificada** (semana sem lesão); como também ocorre na baseline, não é efeito da 6B/6C.

### 5.5 A qualidade do parceiro ainda domina os resultados?

- **Observado:** sim. Com a mesma semente, o otimizador da baseline contratou OVR 81 no dia 225 (renovação no dia 245 com jogador 57) e o da 6D renovou parceiros de OVR 52–53 e depois 50 por ~640 dias, até contratar OVR 87 no dia 869. A dupla da baseline estava no rank 74 no dia 270 com o jogador no rank 538.
- **Observado:** no normal, os dois lados ficaram com parceiros fracos (23 e 20 na Busca do dia 92; 48 e 41 no fim). Mesmo com 20 pontos a mais de OVR, o jogador da baseline fica no rank 116 no dia 805 (melhor rank 112), contra 22 do otimizador com parceiro 80. O arquétipo difere, então a comparação é indicativa.
- **Confundidor:** a política de parceiro do harness reage ao estado do jogador. Na 6D, o jogador mais lento nunca disparou a troca. **Hipótese:** as decisões de renovação (`renewMinPartnerShare` 0,6) mantêm um parceiro de OVR ~50 enquanto o jogador está abaixo de ~80. Os `renewalDecisions` registrados são compatíveis com isso, mas o mecanismo não foi isolado.
- **Consequência para a interpretação:** parte da perda de ranking da 6D no otimizador é efeito do parceiro, não só da curva. Os dois efeitos não puderam ser separados.

### 5.6 O Top 1 ficou mais difícil de alcançar?

- **Não respondível com estes dados.** A baseline reexecutada chegou a rank 22 no dia 896 (não ao Top 1, que na 6A ocorreu no dia 1.162). A 6D chegou a 128. Nenhuma das duas foi simulada até o ponto relevante.
- **Observado:** o Top 100 do otimizador atrasou pelo menos 221 dias (baseline: dia 679; 6D: não até o 900).
- **Projeção:** coerente com a hipótese da 6B de que o topo vem 1–2 anos depois. **Não confirmado.**

### 5.7 Efeitos colaterais em economia, fadiga e calendário

| Medida (até o dia comum) | Normal base→6D | Otimizador base→6D |
|---|---|---|
| Partidas | 88→70 | 136→110 |
| Vitórias | 20→2 | 73→36 |
| Torneios disputados | 69→68 | 64→74 |
| Títulos | 1→0 | 1→0 |
| Prêmios acumulados | 24.555→16.576 | 62.276→27.140 |
| Inscrições sem torneio disputado (proxy de W.O./cancelamento)* | 8→9 | 25→13 |
| Contador cumulativo `forfeits` no último dia | 8→6 | 20→10 |
| Semanas com lesão | 6→6 | 9→6 |
| Energia / fadiga médias | 91,5/51,5 → 91,1/48,5 | 75,4/50,0 → 76,2/53,6 |
| Patrocínio mensal / staff mensal no fim | 5.907/950 → 2.319/900 | 8.220/4.800 → 4.151/1.650 |
| Caixa no fim | 7.767→43 | 26.925→3.737 |

\* O simulador só guarda o contador cumulativo de W.O., sem data; o proxy é "inscrições do período menos torneios com registro de resultado" e **pode incluir cancelamentos que não são W.O.**

- **Observado:** fadiga e energia **não mudaram de forma relevante**; W.O. e lesões **não pioraram**. Menos partidas por temporada na 6D porque as derrotas na 1ª rodada eliminam cedo (otimizador 6D, temporada 3: 14 de 15 torneios acabaram na 1ª rodada).
- **Observado:** economia mais apertada na 6D, com o caixa chegando a 43 moedas no dia 805 do normal. **Hipótese:** consequência de menos vitórias e ranking, não de regra econômica. Não há mudança de economia nesta fase.
- **Calendário:** nenhum efeito direto observado (torneios/temporada na mesma ordem de grandeza).

### 5.8 Há evidências suficientes para manter a nova curva?

**Não.** Motivos:

1. n=1 por perfil, com parceiro divergente entre os lados do otimizador (§5.5).
2. Horizonte de ~18 anos: o objetivo da 6B (auge em 22–25, ritmo gradual até lá) **não foi testado**.
3. A baseline do normal não reproduz a 6A depois do dia 35, então a comparação com a 6A é qualitativa.
4. O que foi observado (início muito mais lento, queda forte de competitividade) é consistente com a projeção da 6B, mas **é um custo real** que a 6B listou como risco.

Nem há evidência para reverter: o crescimento tardio e a integridade do teto (6C) funcionaram como projetado nos pontos observados.

---

## 6. Riscos encontrados

| # | Risco | Evidência | Natureza |
|---|---|---|---|
| R1 | Início ~25% mais lento (OVR 45 contra 62 no dia 360) e resultados competitivos muito piores aos 16–18 anos | §4, §5.1 | observado (n=1) |
| R2 | Jogador mais lento mantém parceiro fraco por mais tempo (política de renovação do harness) | §5.5 | observado + hipótese do mecanismo |
| R3 | Caixa apertado durante a fase inicial | §5.7 | observado; causa indireta (hipótese) |
| R4 | Tier com Δ muito negativo e nenhuma barreira ou aviso | §5.3 | observado; a UX não foi testada |
| R5 | Quedas de 1 ponto de atributo sem origem identificada | §5.4 | observado, pré-existente |
| R6 | Meta de longo prazo (Top 1 e auge) sem teste | §5.6 | não medido |

## 7. Limitações

- **Uma semente**, perfis normal e otimizador, dificuldade `normal`. Casual, `easy` e `hard` não foram simulados.
- **Horizonte curto:** normal até o dia 805 e otimizador até o 896 (≈18 anos), por limite de custo (100 min por carreira). Nada foi extrapolado além disso.
- **Parceiro não controlado** entre os lados do otimizador; o normal teve parceiros fracos nos dois lados.
- **Harness vs. jogador humano:** as políticas do simulador (tier, parceiro, treino) não representam necessariamente decisões humanas.
- **Baseline reexecutada diverge dos CSVs da 6A** depois do dia 35 (causa desconhecida; ver §2.2).
- **OVR** do harness (média dos atributos) não foi cruzado com o cálculo exibido na interface.
- **Memória:** pico de RSS das corridas longas não foi medido.
- **Reinício do container:** a retomada pelo checkpoint não foi comparada com uma execução ininterrupta.
- **Testes:** `test:player-development-6b` (25 gates) e `test:victory-attribute-integrity-6c` (21 gates) passam no HEAD. A bateria de regressão completa não foi reexecutada (fora do escopo).
- Os tópicos de economia e W.O. usam contadores do simulador com as limitações descritas em §5.7.

## 8. Recomendações

Todas dependem de decisão humana; nada foi alterado.

1. **Não declarar a curva validada nem reverter.** Replicar primeiro (§9).
2. **Replicar com 3–5 sementes** (normal e otimizador), mesmo horizonte, idealmente em máquina local com mais tempo, para separar variância de efeito.
3. **Controlar o parceiro** em pelo menos uma bateria (por exemplo, forçar o mesmo parceiro nos dois lados ou registrar o mercado disponível em cada ponto), para isolar o efeito da curva do efeito da escolha de parceiro.
4. **Se o início lento for considerado excessivo**, a 6B já indica o ajuste de menor risco: suavizar `scale` (0,56→0,62) ou reduzir o `floor` em `DEVELOPMENT_WINDOW`. **Não aplicado aqui.**
5. **Avaliar um aviso de risco na inscrição** quando a diferença de força é muito negativa (já levantado na 6A); mais barato que alterar a curva.
6. **Investigar a origem das quedas de 1 ponto** de atributo (pré-existentes).
7. Só depois decidir sobre economia inicial, que não foi tocada.

## 9. Próximos testes necessários no Windows (humano)

1. Criar carreira nova e jogar as duas primeiras temporadas no código atual (`5a8350a`): registrar OVR médio aos 6, 12 e 24 meses e comparar com 31/45/58 (normal) e 29/47/60 (otimizador) desta fase.
2. Verificar a experiência de torneios da 1ª temporada: quantas derrotas na 1ª rodada e se o caminho do jogador é percebido como "frustrante" ou "desafiador".
3. Observar o mercado de parceiros aos 6 e 12 meses: qual OVR aparece na Busca e se um parceiro ≥80 é alcançável com o jogador abaixo do rank 400.
4. Confirmar o OVR exibido na interface contra o OVR do harness (média dos 10 atributos).
5. Carregar um save com 2+ temporadas da versão anterior e confirmar que atributos não diminuem após a atualização.
6. Repetir com dificuldades `easy` e `hard`, não simuladas.
7. Rodar a bateria de regressão completa e as falhas pré-existentes da 6B (`test-fatigue-integrity-rc`, `test-career-difficulty`) para confirmar que continuam inalteradas.

## 10. Arquivos e dados

| Arquivo | Conteúdo |
|---|---|
| `reports/cloud-phase-6d-career-progression-validation/CLOUD_PHASE_6D_REPORT.md` | este relatório |
| `scripts/audit-cloud6d-compare.mjs` | análise pareada somente-leitura; lê o JSON final ou o `out` do último checkpoint |
| `data/comparison-{normal,optimizer}-seed1.json` | resumos, snapshots, temporadas, tiers, marcos, parceiros |
| `data/weekly-*`, `data/tournaments-*`, `data/matches-*` (`baseline-fbb0bc4` e `cloud6d-5a8350a`) | dados brutos compactos até o dia comum |
| `data/execution-log.txt` | log da cadeia de execução (inclui o reinício do container e o encerramento manual) |

Total de dados versionados: ~130 KB. Os checkpoints (~18 MB cada) **não** foram versionados.

Reprodução (Linux ou Windows; ≥4 GB livres por processo):
```
git worktree add <dir-base> fbb0bc4          # baseline; ligar node_modules
node scripts/sim-progression-economy-v526.mjs --profile=normal --seeds=1-1 --days=1100 --checkpointEvery=90 --segment --out=<runs>/6d-normal       # em 5a8350a
node scripts/sim-progression-economy-v526.mjs --profile=normal --seeds=1-1 --days=1100 --checkpointEvery=90 --segment --out=<runs>/base-normal     # em <dir-base>
node scripts/audit-cloud6d-compare.mjs <runs> normal out.json --export=<dir>
```
(`--segment` sai com código 3 a cada checkpoint; reiniciar o comando até terminar. Repetir para `optimizer`.)

## 11. Restrições respeitadas

Nenhum código de produção modificado; balanceamento, schema, versão do app e preset padrão (`balanced`) inalterados; sem merge, rebase, PR ou push; nenhuma outra fase iniciada. O worktree auxiliar `fbb0bc4` fica no diretório temporário da sessão e não faz parte do repositório.

## 12. Commit final

Ver `git log -1` na branch `cloud/phase-6d-career-progression-validation` (sem push, sem PR).
