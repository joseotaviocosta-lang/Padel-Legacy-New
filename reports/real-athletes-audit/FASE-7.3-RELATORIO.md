# Fase 7.3 — Confirmar a inversão, ver o topo-120, e medir a janela de prioridade

> **COMPLETA.** Retomada num notebook novo (reinício da temporada 1 nas
> 3 rodadas de janela de prioridade e na 2ª seed do topo-76, conforme
> exigido pelo achado 3.4 abaixo — instrumentação de diagnóstico não
> sobrevive a `--resumeFrom`). As 4 medições pendentes rodaram
> sequencialmente (não em paralelo — ver nota de hardware no fim desta
> seção) até 5/5 temporadas cada. Os 4 itens do pedido original estão
> fechados.
>
> **Nota de hardware**: antes de rodar as 4 juntas, uma foi lançada
> sozinha (`window-n4-rate`) pra medir tempo/memória neste notebook.
> Resultado: ~5-8 min/temporada, ~1-1,3 GB de heap por processo — mas a
> memória livre do sistema, com só ESSE processo rodando, caiu pra
> ~1,6 GB de um total de 16,6 GB (o resto já estava ocupado por
> aplicativos normais do desktop — navegador, editor, etc., não pela
> simulação). Rodar as 4 em paralelo teria sido arriscado nesta máquina
> especificamente (perfil de hardware diferente do desktop do
> escritório); as 4 rodaram em sequência, sem incidentes.

## 1 — Confirmar a inversão do topo-76 (2ª seed)

**Status: completo — resultado AMBÍGUO, não confirma nem refuta
estritamente.**

Foi rodada a 2ª seed (`official-900-100-s2`) no cenário topo-76 com
qualifying em vigor, mesma população oficial (900 procedurais, 100
reais), mesmo `DIAG_TOP_EVENTS=76` já usado nas Fases 6.7/7/7.1/7.2, até
5/5 temporadas:

| Temporada | Seed 1 (`s1`, Fase 7.2) | Seed 2 (`s2`, esta fase) |
|---|---|---|
| 2026 (T1) | 0 | 0 |
| 2027 (T2) | 11 | 11 |
| 2028 (T3) | 10 | 11 |
| 2029 (T4) | 22 | 23 |
| 2030 (T5) | 34 | 26 |

Incrementos temporada a temporada:

| | T1→T2 | T2→T3 | T3→T4 | T4→T5 |
|---|---|---|---|---|
| Seed 1 | +11 | **-1** | +12 | +12 |
| Seed 2 | +11 | **0** | +12 | +3 |

**Leitura, sem cherry-picking**: as duas seeds são notavelmente
próximas em T1-T4 (diferença de no máximo 1 unidade a cada temporada) —
isso não é ruído, é o mesmo mecanismo se comportando de forma quase
idêntica sob duas sementes diferentes. E as duas mostram a MESMA forma
qualitativa em T2→T3→T4: o crescimento estagna ou recua bruscamente em
T2→T3 (muito abaixo do que a tendência de T1→T2 sugeriria), e depois
salta exatamente +12 em T3→T4 nas duas seeds — coincidência forte demais
pra ser acaso.

Mas, pelo critério literal definido nesta mesma fase ("se a 2ª seed
também inverter", isto é, incremento NEGATIVO), a seed 2 não inverte —
fica em 0 (patamar), não em negativo. E as seeds divergem fortemente em
T4→T5: seed 1 mantém o salto de +12 (fecha em 34), seed 2 desacelera pra
+3 (fecha em 26) — uma diferença de 8 pontos no nível final, a maior
divergência entre as duas seeds em toda a série.

**Conclusão**: o padrão de estagnação/recuo pontual em T2→T3 seguido de
salto em T3→T4 é reproduzido nas duas seeds — isso é sinal real, não
ruído de uma seed isolada. Mas a forma exata (negativo vs. patamar) e o
comportamento em T4→T5 (nível final 34 vs. 26) diferem o bastante para
que tratar isso como "2/3 confirmado" seria forçar a régua. Pelo
critério pré-registrado no checkpoint anterior desta fase, o resultado
correto é: **não confirmado nem refutado — uma 3ª seed de desempate é
necessária antes de qualquer decisão de dimensionamento de calendário
baseada no topo-76**, exatamente como o próprio checkpoint previu para o
caso de não-inversão estrita.

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

*Atualização (item 1, §1 acima): a 2ª seed do topo-76 reproduziu a
FORMA do recuo em T2→T3 mas não estritamente o sinal negativo — o
resultado ficou "não confirmado nem refutado", então esta comparação
topo-76 vs. topo-120 continua baseada em 1 seed por cenário e a mesma
ressalva se aplica.*

## 3 — Medir a janela de prioridade elevada

**Status: completo — as 3 configurações mostram um sinal claro: janela
curta (N=2) não resolve a reincidência, janela mais longa (N=4) resolve
bem.**

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

### 3.3 — Rodadas oficiais: resultado

As 3 rodadas planejadas rodaram até 5/5 temporadas (900 procedurais,
100 reais, seed `official-900-100-s1`, cenário calendário atual). A
reincidência (dupla resgatada na temporada anterior que ainda está em
rank>300 agora) só é mensurável a partir de T4 (T3 é quando o grupo se
forma e faz a 1ª concessão de janela):

| Configuração | T4 — resgatadas na T3 / ainda presas | T5 — resgatadas na T4 / ainda presas |
|---|---|---|
| `window-n4-rate` (N=4, escala=rate) | 0/2 (**0%**) | 0/2 (**0%**) |
| `window-n4-group` (N=4, escala=group) | 0/1 (**0%**) | 2/5 (**40%**) |
| `window-n2-rate` (N=2, escala=rate) | 1/2 (**50%**) | 10/11 (**90,9%**) |

**Leitura**: o tamanho da janela é o que decide, não a forma de escalar
o qualifying. As duas configurações com N=4 ficam muito abaixo dos
90-100% de reincidência medidos na Fase 7.2 sem janela — `rate` fica
consistentemente em 0% nas duas temporadas medidas, `group` sobe pra
40% na T5 (ainda assim bem abaixo do baseline). Já N=2 praticamente
reproduz o problema original: 90,9% de reincidência na T5, quase
indistinguível dos 90-100% sem qualquer janela. Uma vitória pontual no
qualifying não muda o rank o suficiente pra segurar a dupla fora do
grupo rank>300 — mas 4 aparições seguidas seguram na maioria dos casos,
enquanto 2 não seguram.

**Ressalva de amostra**: os denominadores são pequenos (1 a 11 duplas
resgatadas por temporada, porque o grupo rank>300 ainda está se
formando nas primeiras temporadas do bootstrap) — os percentuais acima
são direcionalmente claros (N=2 muito pior que N=4) mas não devem ser
lidos como probabilidades precisas com 1 seed e 2 pontos de medição por
configuração. Mais seeds/temporadas dariam mais confiança no número
exato, mas o tamanho do efeito (quase 1 ordem de grandeza entre N=2 e
N=4) é grande demais pra ser explicado só por ruído de amostra pequena.

**Recomendação**: `DIAG_WINDOW_N=4` com `DIAG_WINDOW_SCALE=rate` é a
configuração mais eficaz das 3 testadas para reduzir a reincidência do
resgate por qualifying.

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

### 3.5 — Comandos usados na retomada (histórico)

Os comandos abaixo (idênticos aos preparados no checkpoint anterior)
foram os efetivamente rodados, sequencialmente, no notebook novo, cada
um da temporada 1 — mantidos aqui como registro de como reproduzir os
números das seções 1 e 3.3:

```bash
# Item 1 — 2ª seed do topo-76 (confirmação da inversão)
DIAG_TOP_EVENTS=76 node --max-old-space-size=4096 \
  scripts/audit-real-athletes-simulation.mjs --seasons=5 \
  --seed=official-900-100-s2 --proceduralAthletes=900 \
  --proceduralTeams=450 --out=reports/real-athletes-audit/f73-topo76-seed2

# Item 3 — janela de prioridade, calendário atual, seed original (s1)
DIAG_TAPER=1 DIAG_WINDOW_N=4 DIAG_WINDOW_SCALE=rate node --max-old-space-size=4096 \
  scripts/audit-real-athletes-simulation.mjs --seasons=5 \
  --seed=official-900-100-s1 --proceduralAthletes=900 \
  --proceduralTeams=450 --out=reports/real-athletes-audit/f73-window-n4-rate

DIAG_TAPER=1 DIAG_WINDOW_N=2 DIAG_WINDOW_SCALE=rate node --max-old-space-size=4096 \
  scripts/audit-real-athletes-simulation.mjs --seasons=5 \
  --seed=official-900-100-s1 --proceduralAthletes=900 \
  --proceduralTeams=450 --out=reports/real-athletes-audit/f73-window-n2-rate

DIAG_TAPER=1 DIAG_WINDOW_N=4 DIAG_WINDOW_SCALE=group node --max-old-space-size=4096 \
  scripts/audit-real-athletes-simulation.mjs --seasons=5 \
  --seed=official-900-100-s1 --proceduralAthletes=900 \
  --proceduralTeams=450 --out=reports/real-athletes-audit/f73-window-n4-group
```

Os `resume-state.json` (40-45 MB cada, estado de retomada intermediário
sem valor depois que a rodada termina) e os `run.log` verbosos das 3
rodadas de janela (300-450 KB de linhas `[DIAG_WINDOW]` por torneio) das
4 rodadas foram descartados após a extração dos números acima;
`summary.json`, `tournament-results.csv` e `season-tier-table.md` de
cada rodada ficaram em `reports/real-athletes-audit/f73-*/` como
registro.

## 4 — Validação

- `npm run lint` — limpo.
- `npm run build` — sucesso.
- `node scripts/rc-qa-suite-v36.mjs` — **33/36 aprovadas, status
  BLOCKED** (`test:rc-gameplay-balance`, `test:career-pace` e
  `test:ui-quality` falham — 3, não 2; o `rc-qa-latest.json`
  previamente commitado, com 34/36, estava desatualizado). Verificado
  que as 3 falhas são PRÉ-EXISTENTES e não uma regressão desta fase:
  reproduzidas byte-a-byte rodando os mesmos 3 scripts isoladamente no
  commit `9b41d65` (o commit ANTES de toda mudança desta fase, via
  `git worktree`) — mesmo cenário `aggressive-tactic` com winRate
  50/50 em `test-rc-gameplay-balance-v36.mjs`, mesma mensagem de erro
  (`0 !== 24`) em `test-career-pace-v17.mjs`, mesmas 14 ocorrências de
  mojibake/rotas faltantes em `audit-ui-quality.mjs` — nos mesmos
  arquivos, nenhum deles tocado por esta fase (só
  `scripts/audit-real-athletes-simulation.mjs`,
  `src/gameplay/worldTour/WorldTourLifecycle.js` e
  `src/lib/circuitCatalog.js` foram alterados). Confirma a expectativa
  registrada no checkpoint anterior: as mudanças desta fase são
  aditivas e não introduziram regressão.
- `src-tauri/` sem alterações (nenhum arquivo fora de
  `scripts/`, `src/gameplay/`, `src/lib/` e `reports/` foi tocado).
- Diretórios de scratch dos smoke tests originais (`f73`, `f73-smoke`,
  `f73-smoke2`) permanecem removidos — ver 3.4. Os 4 diretórios novos
  (`f73-topo76-seed2`, `f73-window-n4-rate`, `f73-window-n2-rate`,
  `f73-window-n4-group`) contêm resultados válidos e completos (não são
  descartáveis como os smoke tests eram).

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | Confirmação (ou refutação) da inversão do topo-76, 2ª seed | ✅ completo — resultado ambíguo (forma reproduzida, sinal não; 3ª seed de desempate necessária — ver §1) |
| 2 | Curva do topo-120, lado a lado com os outros dois cenários | ✅ feito — reusou dados da Fase 7.1/7.2 |
| 3 | Efeito medido da janela de prioridade (N=2/N=4, escalar por grupo vs. por taxa) | ✅ completo — N=4 reduz reincidência drasticamente vs. N=2; `rate` marginalmente melhor que `group` (ver §3.3) |
| 4 | Suíte, lint, build, Tauri OK, commit | ✅ lint/build OK; suíte roda 33/36 (3 falhas pré-existentes confirmadas, não regressão) |
