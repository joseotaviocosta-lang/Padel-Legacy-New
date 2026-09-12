# Fase 7.3 — Confirmar a inversão, ver o topo-120, e medir a janela de prioridade

> **PARCIAL — checkpoint de desligamento de máquina, não o resultado da
> fase.** Os itens 1 e 3 tinham rodadas de medição em andamento quando a
> máquina precisou ser desligada; foram interrompidas em 2/5 temporadas
> (as duas primeiras, que são bootstrap universal — ver 1.1/3.1 abaixo)
> e **não têm nenhum sinal aproveitável ainda**. O item 2 está completo
> (reusou dados já existentes da Fase 7.2, não foi afetado pela
> interrupção). Este documento registra o que foi feito, o que não deu
> tempo, e os comandos exatos pra retomar do zero — em qualquer máquina,
> não só nesta.

## 1 — Confirmar a inversão do topo-76 (2ª seed)

**Status: interrompido em 2/5 temporadas — sem sinal ainda.**

Foi lançada uma 2ª seed (`official-900-100-s2`) no cenário topo-76 com
qualifying em vigor, mesma população oficial (900 procedurais, 100
reais), mesmo `DIAG_TOP_EVENTS=76` já usado nas Fases 6.7/7/7.1/7.2. A
máquina precisou desligar com a rodada em **2/5 temporadas**:

| Temporada | Reais que não jogaram nesta temporada |
|---|---|
| 2026 (T1) | 0 |
| 2027 (T2) | 11 |

Isso é exatamente o trecho de bootstrap (temporada 1 universal, todo
mundo joga; temporada 2 ainda não formou o grupo rank>300) — **o mesmo
alerta já registrado na Fase 6.5**: a curva só começa a mostrar formato
a partir da temporada 3, que é justamente onde a inversão original foi
observada (incremento T2→T3: 11 → **-1**). Com 2/5 não há como
confirmar OU refutar nada ainda; seria cherry-picking tratar esses 2
números como indicação de qualquer coisa.

**Pendente**: completar esta seed até 5/5, comparar contra a seed
original (`official-900-100-s1`, Fase 7.2 §2.2: 11, 23, 14, 13 → 11,
**-1**, 12, 12). Se a 2ª seed também inverter no mesmo ponto (T2→T3),
2/3 confirma. Se não inverter, lançar uma 3ª seed como desempate.

## 2 — O número que faltou: topo-120 lado a lado

**Status: completo — reusa dados já medidos na Fase 7.1/7.2, sem rodada
nova, não afetado pela interrupção.**

### 2.1 — Nível (reais que não jogaram na temporada, com qualifying em vigor)

| Cenário | T1 | T2 | T3 | T4 | T5 | Redução no fechamento vs. sem qualifying |
|---|---|---|---|---|---|---|
| Atual | 0 | 10 | 17 | 24 | **35** | -44,4% |
| Topo 76 | 0 | 11 | 10 | 22 | **34** | -44,3% |
| Topo 120 | 0 | 7 | 10 | 17 | **24** | -52,0% |

### 2.2 — Inclinação (incrementos temporada a temporada)

| Cenário | T1→T2 | T2→T3 | T3→T4 | T4→T5 | Inverte? |
|---|---|---|---|---|---|
| Atual | 10 | 7 | 7 | 11 | Não — achata, não inverte |
| Topo 76 | 11 | **-1** | 12 | 12 | **Sim, uma vez** (T2→T3) |
| Topo 120 | 7 | 3 | 7 | 7 | Não — achata mais que o atual, mas nunca fica negativo |

**Resposta ao item 2**: topo-120 é o cenário de MENOR nível final (24,
melhor que os 34-35 dos outros dois) mas **não é o que inverte** — quem
inverte é o topo-76, um cenário INTERMEDIÁRIO. Isso já é, em si, um
achado: "melhor nível final" e "inclinação que inverte" são duas coisas
diferentes, e não coincidem no mesmo cenário. Repete o padrão de
alerta da Fase 6.7 (mais calendário não é sempre estritamente melhor
em toda métrica) — mas aqui de um jeito mais sutil: topo-120 não piora
em nível (é o melhor dos três), só não repete a inversão pontual do
topo-76. Com os dados de 1 seed só por cenário, não dá pra saber se a
inversão do topo-76 é um efeito real do tamanho do calendário
(existindo um "ponto ótimo no meio, não nos extremos") ou ruído de uma
única seed que por acaso não apareceu no topo-120 — exatamente a
pergunta que o item 1 (rodando mais seeds) deveria responder antes de
qualquer decisão de dimensionamento. **Não dá pra recomendar
topo-76 sobre topo-120 (ou vice-versa) só com isso.**

## 3 — Medir a janela de prioridade elevada

**Status: mecanismo implementado, revisado e verificado por 2 testes-
fumaça; rodadas de medição oficial interrompidas em 2/5 temporadas —
zero temporadas de reincidência coletadas.**

### 3.1 — O que foi implementado (temporário, em `WorldTourLifecycle.js`)

Depois de vencer o qualifying, a dupla ganha entrada GARANTIDA (fora de
toda disputa por rank) pelas próximas `DIAG_WINDOW_N` vezes que joga —
em vez de uma vitória pontual, uma sequência. Junto, `qualifyingScaleFactorDiag`
testa se a fatia de `QUALIFYING_SHARE` dentro do bucket reservado
precisa escalar (hipótese A da Fase 7.2), de duas formas:
- `DIAG_WINDOW_SCALE=rate`: fator fixo (1,4×) desde o início — a fatia
  cresce de uma vez, não junto com o grupo.
- `DIAG_WINDOW_SCALE=group`: fator cresce com o tamanho ATUAL do grupo
  rank>300 (`1 + grupo/50`) — pequeno enquanto o grupo é pequeno,
  maior conforme o grupo cresce.

**Cuidado de design que valeu a pena revisar antes de rodar**:
`applyEntryPriority` também é chamada de forma ESPECULATIVA (o loop de
fallback de tier, que simula "quem sobreviveria" pra decidir
remanejamento — não é o resultado final da semana). Conceder uma janela
ali seria um bug na mesma família do achado da Fase 7.1 (medir sobre a
coisa errada): uma dupla podia "ganhar" uma janela numa simulação
hipotética que nem é o torneio onde ela acaba jogando de verdade. Corrigido
ANTES de rodar — `applyEntryPriority` agora recebe um parâmetro
`commitWindow` (default `false`); só o ponto de resolução final (onde
o resultado realmente vira pontuação/notícia) passa `true`.

### 3.2 — Verificação: o mecanismo engaja corretamente

Dois testes-fumaça (população reduzida, `DIAG_WINDOW_N=4`) confirmaram,
por log direto (não por inferência):
- Duplas reais vencendo o qualifying e recebendo a janela (`ganhou
  janela de 4 torneios`).
- A mesma dupla entrando garantida em torneios seguintes, com o
  contador descontando corretamente (4 → 3 → 2 → 1, observado em
  dezenas de duplas ao longo de 2 rodadas de teste).
- Nenhum erro, nenhuma dupla "ganhando" janela na simulação especulativa
  (`commitWindow=false` nunca dispara o log de concessão).

Nenhum bug do tipo "critério errado que mede 0% e parece certo até
rodar" (o padrão que pegou a 1ª versão do qualifying na Fase 7.1) foi
encontrado aqui — mas a VERIFICAÇÃO DE EFEITO (será que a reincidência
cai?) exige as 5 temporadas completas, que não deu tempo de rodar.

### 3.3 — Rodadas oficiais: interrompidas sem sinal

3 das 4 rodadas planejadas foram lançadas (900 procedurais, 100 reais,
seed `official-900-100-s1`, cenário calendário atual):

| Rodada | Configuração | Temporadas completas | Sinal de reincidência coletado |
|---|---|---|---|
| `window-n4-rate` | N=4, escala=rate | 2/5 | Nenhum — 1ª verificação de reincidência só acontece na T4 |
| `window-n2-rate` | N=2, escala=rate | 2/5 | Nenhum |
| `window-n4-group` | N=4, escala=group | Não chegou a ser lançada | — |

A reincidência (a métrica que decide se a janela funciona) só pode ser
verificada a partir da temporada 4 (T3 forma o grupo e faz a 1ª
concessão; T4 é a 1ª vez que dá pra checar se quem foi resgatado em T3
ainda está preso). Com 2/5, **não há literalmente nenhum dado de
reincidência ainda** — nem a favor, nem contra a hipótese de que a
janela ajuda. Isso é mais cedo até que o registro parcial da Fase 6.5
(que pelo menos tinha o trecho plano documentado); aqui é só bootstrap.

### 3.4 — Achado de correção (não afeta a medição, mas importa pra retomada): o diagnóstico não sobrevive a `--resumeFrom`

Verificado ao revisar como retomar: o mecanismo de retomada permanente
(Fase 6.5) persiste corretamente o estado da SIMULAÇÃO (atletas,
torneios, ranking) — mas a instrumentação NOVA desta fase não foi
conectada a ele:

- `previousSeasonRescuedIdsDiag` (harness) e `windowRemainingByPairId`
  (`WorldTourLifecycle.js`) são recriados VAZIOS a cada início de
  processo — nunca gravados no snapshot de retomada. Uma retomada por
  `--resumeFrom` reconstruiria a simulação corretamente, mas
  silenciosamente zeraria "quem foi resgatado na temporada anterior" e
  descartaria janelas de prioridade ainda ativas no meio de uma dupla —
  produzindo números errados sem erro nem aviso.
- `priorRankByAthleteDiag` é a exceção — é reconstruído a partir do
  `ranking_position` ATUAL de cada atleta, que já é dado persistido
  corretamente pela retomada; então essa parte sozinha é segura.

**Conclusão prática**: estas 3 rodadas específicas precisam ser
REINICIADAS DA TEMPORADA 1, não retomadas — em qualquer máquina. Os
`resume-state.json` gerados localmente foram descartados (junto com o
resto do diretório de scratch) porque usá-los produziria dados errados
sem sinalizar isso. Isso também torna irrelevante o fato de o scratch
ficar preso nesta máquina — não haveria nada de útil pra copiar pro
notebook novo mesmo que déssemos esse trabalho.

### 3.5 — Comandos pra retomar do zero (qualquer máquina)

```bash
# Item 1 — 2ª seed do topo-76 (confirmação da inversão)
DIAG_TOP_EVENTS=76 node --max-old-space-size=4096 \
  scripts/audit-real-athletes-simulation.mjs --seasons=5 \
  --seed=official-900-100-s2 --proceduralAthletes=900 \
  --proceduralTeams=450 --out=<dir>/topo76-seed2

# Item 3 — janela de prioridade, calendário atual, seed original (s1)
DIAG_TAPER=1 DIAG_WINDOW_N=4 DIAG_WINDOW_SCALE=rate node --max-old-space-size=4096 \
  scripts/audit-real-athletes-simulation.mjs --seasons=5 \
  --seed=official-900-100-s1 --proceduralAthletes=900 \
  --proceduralTeams=450 --out=<dir>/window-n4-rate

DIAG_TAPER=1 DIAG_WINDOW_N=2 DIAG_WINDOW_SCALE=rate node --max-old-space-size=4096 \
  scripts/audit-real-athletes-simulation.mjs --seasons=5 \
  --seed=official-900-100-s1 --proceduralAthletes=900 \
  --proceduralTeams=450 --out=<dir>/window-n2-rate

DIAG_TAPER=1 DIAG_WINDOW_N=4 DIAG_WINDOW_SCALE=group node --max-old-space-size=4096 \
  scripts/audit-real-athletes-simulation.mjs --seasons=5 \
  --seed=official-900-100-s1 --proceduralAthletes=900 \
  --proceduralTeams=450 --out=<dir>/window-n4-group
```

Todo o código (harness + `WorldTourLifecycle.js` + `circuitCatalog.js`)
já está neste commit — só falta rodar as 4 medições (2 de item 1/3ª
seed em aberto, 3 de item 3) até 5/5 temporadas.

## 4 — Validação (parcial, deste checkpoint)

- `npm run lint` — limpo.
- `npm run build` — sucesso.
- `node scripts/rc-qa-suite-v36.mjs` — **não rodado neste checkpoint**
  (desligamento de máquina, sem tempo). Rodar antes de fechar a fase
  de vez — não há motivo pra esperar regressão (as mudanças são
  aditivas, sem efeito quando as variáveis `DIAG_*` novas não estão
  setadas — mesmo padrão já usado nas Fases 7.1/7.2), mas não foi
  CONFIRMADO desta vez.
- `src-tauri/` sem alterações (nenhum arquivo fora de
  `scripts/`, `src/gameplay/`, `src/lib/` e `reports/` foi tocado).
- Diretórios de scratch (`f73`, `f73-smoke`, `f73-smoke2`) removidos —
  ver 3.4, não eram seguros de retomar.
- Árvore limpa ao final, exceto por este relatório e o código descrito
  acima (mantido, não revertido — a fase continua em andamento).

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | Confirmação (ou refutação) da inversão do topo-76, 2ª seed | ⏳ interrompido em 2/5 temporadas, sem sinal |
| 2 | Curva do topo-120, lado a lado com os outros dois cenários | ✅ feito — reusou dados da Fase 7.1/7.2 |
| 3 | Efeito medido da janela de prioridade (N=2/N=4, escalar por grupo vs. por taxa) | ⏳ mecanismo implementado e verificado; medição de efeito interrompida em 2/5 temporadas, sem sinal |
| 4 | Suíte, lint, build, Tauri OK, commit | ⚠️ lint/build OK; suíte completa pendente; commit deste checkpoint feito |
