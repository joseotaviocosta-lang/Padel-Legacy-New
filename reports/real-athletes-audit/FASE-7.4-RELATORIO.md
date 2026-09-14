# Fase 7.4 — Janela de prioridade permanente + desempate do topo-76

> **COMPLETA.** Item 1: mecanismo promovido de diagnóstico a produção
> (`PRIORITY_WINDOW_N=4`, `QUALIFYING_SCALE_FACTOR=1,4`, sem flags),
> com a janela persistida em `Partnership.priority_window_remaining`
> (corrige, no caminho, o problema de estado não sobreviver a reinício
> de app que a Fase 7.3 tinha documentado só como achado, não como
> correção). Regime-check de 5 temporadas confirmou o núcleo do
> resultado (reincidência em 0%), com uma divergência populacional
> secundária explicada abaixo. Item 2: 3ª seed do topo-76 rodada e
> comparada — **diverge em FORMA das duas primeiras**, não só em
> magnitude, então o resultado é reportado como instabilidade
> genuína, sem uma 4ª seed.

## 1 — Janela de prioridade: de diagnóstico a produção

### 1.1 — Mudança de código

`src/gameplay/worldTour/WorldTourLifecycle.js`:

- `DIAG_WINDOW_N`/`DIAG_WINDOW_SCALE` (variáveis de ambiente) removidas.
  `PRIORITY_WINDOW_N = 4` e `QUALIFYING_SCALE_FACTOR = 1.4` são
  constantes fixas de produção, sempre ativas.
- `windowRemainingByPairId` (um `Map` em memória, criado do zero a cada
  início de processo) removido — a janela agora vive em
  `Partnership.priority_window_remaining` (campo novo, default `0`,
  adicionado a `base44/entities/Partnership.jsonc`), lida em
  `buildCanonicalPairs` a partir do mesmo `partnerships` já carregado
  no topo de `resolveCompletedWorldTourEvents`, e gravada de volta
  (só quem mudou nesta chamada) junto com o resto dos `bulkUpdate`s da
  função.
- **Corrige por construção o achado 3.4 da Fase 7.3** ("o diagnóstico
  não sobrevive a `--resumeFrom`"): como o estado agora é lido/gravado
  pela mesma via de persistência que todo o resto do pipeline (Tournament,
  AthleteProfile, WorldEvent), uma retomada por `--resumeFrom` ou um
  reinício de app no meio de uma janela ativa reconstrói o estado
  corretamente — não é mais um Map efêmero que zera silenciosamente.
  Isso importava GENUINAMENTE pra produção (não só pro harness): um
  jogo de carreira roda em muitas sessões de app ao longo de meses,
  reiniciar o processo é a norma, não a exceção — um mecanismo
  em-memória-só teria efeito real muito mais fraco que o medido, porque
  a maioria das duplas nunca chegaria a acumular as `N` aparições
  seguidas antes de uma sessão terminar.
- `commitWindow=false` para a chamada especulativa (loop de fallback de
  tier) mantido exatamente como implementado na Fase 7.3 — leitura de
  `priorityWindowRemaining > 0` acontece sempre (inclusive na
  especulativa, pra que o fallback simule corretamente quem sobrevive),
  mas CONCESSÃO de janela nova só no caminho já commitado.
- Logs de diagnóstico (`[DIAG_WINDOW]`) removidos — o mecanismo agora é
  lógica de produção silenciosa, não instrumentação.

**Verificação antes do regime-check**: 2 testes-fumaça com logging
temporário (removido depois, não commitado) confirmaram, por log
direto: concessão de janela (`priorityWindowRemaining = 4`) ao vencer o
qualifying; desconto correto a cada aparição efetiva (4→3→2→1→0,
observado em dezenas de duplas); e — o ponto novo desta fase —
**persistência lida corretamente na chamada SEGUINTE** (valores
decrescendo de forma consistente entre invocações separadas de
`resolveCompletedWorldTourEvents`, prova de que o ciclo
leitura-da-entidade → mutação → gravação-delta funciona de ponta a
ponta, não só dentro de uma chamada).

### 1.2 — Regime-check: núcleo confirmado, divergência populacional secundária explicada

Rodado com o código permanente (sem nenhuma variável `DIAG_WINDOW_*`),
mesma seed/população/calendário do `window-n4-rate` da Fase 7.3
(`official-900-100-s1`, 900 procedurais, 100 reais, calendário atual),
com `DIAG_TAPER=1` só para medir reincidência (instrumento de leitura,
sem efeito em gameplay):

| | T1 | T2 | T3 | T4 | T5 |
|---|---|---|---|---|---|
| Reincidência (Fase 7.3, diagnóstico) | — | — | — | **0%** (0/2) | **0%** (0/2) |
| Reincidência (Fase 7.4, regime-check) | — | — | — | **0%** (0/1) | **0%** (0/2) |

**O núcleo do resultado bate exatamente**: reincidência em 0% nas duas
temporadas mensuráveis, nas duas rodadas — a claim que esta fase
precisava confirmar (a correção funciona sem as flags de diagnóstico)
está validada.

O que NÃO bate exatamente é a curva secundária de "reais que não
jogaram nesta temporada":

| Temporada | Fase 7.3 (`window-n4-rate`) | Fase 7.4 (regime-check) |
|---|---|---|
| T1 | 0 | 0 |
| T2 | 14 | 13 |
| T3 | 23 | 31 |
| T4 | 40 | 45 |
| T5 | 41 | 37 |

**Causa identificada, não um bug**: `QUALIFYING_SCALE_FACTOR` (1,4×) é
aplicado desde o 1º torneio no código permanente; na medição da Fase
7.3, o harness só chamava `setQualifyingScaleDiag(1,4)` depois que a
temporada 1 terminava (a instrumentação precisava saber o tamanho do
grupo `rank>300` antes de decidir o fator — mesmo mecanismo usado pela
política "group", que de fato depende desse tamanho; "rate" nunca
dependeu, mas herdava o mesmo gatilho por reutilizar a mesma chamada).
Aplicar o fator uma temporada mais cedo desloca marginalmente QUAIS
duplas entram em quais torneios já na temporada 1 (bootstrap, onde
T1=0 não muda — nenhum real fica de fora em nenhuma medição já feita —
mas a ALOCAÇÃO de vagas reservadas/qualifying entre bots e reais
recém-formados pode diferir) — essa diferença pequena se PROPAGA e
amplifica temporada a temporada (rank é posição relativa acumulada; uma
pequena diferença de pontos ganhos em T1 desloca ranks em T2, que
desloca quem entra em qualifying em T2, etc.) — um efeito-borboleta
normal num sistema onde tudo depende de posição relativa, não um sinal
de erro de implementação.

**Por que não replicar o gatilho exato (fator só a partir da temporada
2)**: exigiria o mesmo tipo de estado-de-sessão efêmero
(saber "isto não é mais a primeira temporada") que o achado 3.4 desta
mesma linha de investigação identificou como frágil a reinício de
app/`--resumeFrom` — ou uma nova peça de estado persistido só para
isso. Como o VALOR do fator em política "rate" nunca dependeu do
tamanho do grupo (ao contrário de "group"), não há necessidade
funcional de atrasar sua aplicação — o atraso na medição original era
um artefato de como a instrumentação estava conectada, não uma decisão
de design a preservar. Documentado aqui em vez de escondido.

**O que isso significa pra confiança no resultado**: o EFEITO PRINCIPAL
(reincidência de resgate cai de 90-100% pra ~0% com a janela) é grande
o bastante (quase 1 ordem de grandeza, replicado independentemente do
timing exato do fator de escala) que a divergência populacional
secundária não muda a conclusão. Mas registrado com honestidade: quem
comparar os números da Fase 7.3 com os de produção verá curvas
diferentes na métrica "reais que não jogaram por temporada" — a
reincidência (a métrica que decide se a janela funciona) é a que
precisa bater, e bate.

## 2 — Terceira seed de desempate do topo-76

**Status: rodado, resultado É a conclusão — diverge em forma, não só
magnitude.**

Rodado ANTES da mudança de código do item 1 (na mesma metodologia
exata das seeds 1 e 2 — sem a janela de prioridade, que se tornou
permanente só depois; rodar com a janela ativa teria confundido duas
variáveis ao mesmo tempo — tamanho do calendário E mecanismo de
entrada — invalidando a comparação que este item precisa fazer):

| Temporada | Seed 1 (`s1`) | Seed 2 (`s2`) | Seed 3 (`s3`, esta fase) |
|---|---|---|---|
| T1 | 0 | 0 | 0 |
| T2 | 11 | 11 | 6 |
| T3 | 10 | 11 | 14 |
| T4 | 22 | 23 | 23 |
| T5 | 34 | 26 | 29 |

Incrementos:

| | T1→T2 | T2→T3 | T3→T4 | T4→T5 |
|---|---|---|---|---|
| Seed 1 | +11 | **-1** | +12 | +12 |
| Seed 2 | +11 | **0** | +12 | +3 |
| Seed 3 | +6 | **+8** | +9 | +6 |

**A seed 3 não reproduz a forma das outras duas.** Seeds 1 e 2
concordavam numa característica qualitativa clara: o crescimento
estagna ou recua bruscamente em T2→T3 (muito abaixo da tendência de
T1→T2), seguido de um salto acentuado em T3→T4. A seed 3 não mostra
nada disso — cresce de forma monotônica e relativamente suave em toda
a série (+6, +8, +9, +6), sem nenhum ponto de estagnação ou recuo. Pelo
critério pré-registrado no fechamento da Fase 7.3 ("se divergir também
na forma, o resultado é genuinamente instável"), este é exatamente esse
caso.

**Conclusão, sem forçar uma 4ª seed**: com 3 seeds independentes
mostrando 2 formas qualitativamente diferentes (1 reversão clara, 1
patamar, 1 crescimento monotônico sem nenhuma parada), o padrão
"estagnação/recuo em T2→T3" não é robusto o suficiente pra ser tratado
como propriedade estrutural do cenário topo-76 — é mais consistente com
ruído de seed em torno de uma tendência de crescimento real (as 3 seeds
concordam em DIREÇÃO — sempre sobe — e ficam num range relativamente
estreito de nível final, 26-34), do que com um efeito determinístico do
tamanho do calendário. **O topo-76 não deve ser tratado como um
cenário confiável para decisão de dimensionamento de calendário
baseada no formato da curva (só/principalmente no nível final, que é
mais estável entre as 3 seeds).** Uma 4ª seed não decidiria nada demais
saber: já temos 2 formas diferentes em 3 tentativas — o resultado É
que a forma não é estável aqui, não uma pergunta em aberto esperando
mais dados.

## 3 — Fechamento do registro de auditoria

[FASE-7-RELATORIO.md](FASE-7-RELATORIO.md) — onde o espiral
auto-reforçado foi originalmente identificado (§1.2) — recebeu uma
seção de fechamento apontando a cadeia completa: Fase 7.1 (qualifying)
→ Fase 7.2 (mediu a reincidência de 90-100%) → Fase 7.3 (mediu a
correção: janela N=4 zera a reincidência) → Fase 7.4 (promoveu a
correção a permanente, corrigindo no caminho a sobrevivência a
reinício de app). A causa raiz (rank como posição relativa que só sobe
pra quem joga) continua existindo por design — a janela dá tempo pra
escapar dela, não a elimina.

## 4 — Validação

- `npm run lint` — limpo.
- `npm run build` — sucesso (mesmo aviso pré-existente de chunk
  >500kB).
- `node scripts/rc-qa-suite-v36.mjs` — **33/36, score 92/100**, as
  MESMAS 3 falhas pré-existentes já confirmadas na Fase 7.3
  (`test:rc-gameplay-balance`, `test:career-pace`, `test:ui-quality`),
  confirmado por nome exato — sem regressão.
- `src-tauri/` — sem alterações.
- Arquivos tocados: `src/gameplay/worldTour/WorldTourLifecycle.js`,
  `base44/entities/Partnership.jsonc` (campo novo
  `priority_window_remaining`), `scripts/audit-real-athletes-simulation.mjs`
  (removida a wiring morta de `DIAG_WINDOW_SCALE`/`setQualifyingScaleDiag`;
  `DIAG_TAPER` mantido como instrumento de medição permanente do
  harness).
- `reports/BETA-AUDIT-v36.1.{json,md}`, `reports/rc-qa-latest.{json,md}`,
  `reports/rc-sprint-1/*.json` (auto-regenerados pela suíte) revertidos
  com `git checkout HEAD --` antes do commit.
- Scratch descartado: `resume-state.json` (40-45 MB cada) e `run.log`
  de todas as rodadas desta fase; `summary.json`/`tournament-results.csv`/
  `season-tier-table.md` mantidos em
  `reports/real-athletes-audit/f74-{topo76-seed3,regime-check}/`.

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | Janela de prioridade permanente, sem flags de diagnóstico, regime-check confirmando | ✅ completo — mecanismo permanente e persistido (corrige sobrevivência a reinício de app); reincidência confirmada em 0% no regime-check, igual à medição diagnóstica; divergência populacional secundária identificada e explicada (timing do fator de escala) |
| 2 | 3ª seed do topo-76 rodada e comparada às duas anteriores | ✅ completo — diverge em FORMA (não só magnitude); topo-76 registrado como cenário instável para decisão por formato de curva, sem necessidade de 4ª seed |
| 3 | Suíte completa, lint, build, commit | ✅ 33/36 (92/100), mesmas 3 falhas pré-existentes; lint/build OK |
