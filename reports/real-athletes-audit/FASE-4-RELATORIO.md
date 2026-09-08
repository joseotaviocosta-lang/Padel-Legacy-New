# Fase 4.0 — Commitar, medir o #18 de verdade, e colher o barato

> Pré-requisito: Fase 3 entregue e commitada (escada de 9 tiers, calendário,
> migração, achado #22 promovido, achado #18 reaberto com o enquadramento
> corrigido — 7,58% do custo da temporada em `processWorldTourDay`). Ver
> [FASE-3-RELATORIO.md](FASE-3-RELATORIO.md).
>
> Toca `src/gameplay/adapters/ActiveCareerAdapter.js`,
> `src/gameplay/worldTour/WorldTourLifecycle.js`,
> `src/game-core/circuitLifecycle.js`, `src/lib/rankingPopulation.js` —
> validação completa de build/Tauri incluída, não pulada.

## 0 — Commit

Fase 3 já estava commitada pelo processo de snapshot automático do
repositório (`v100`, dois commits, conferidos linha a linha antes de
prosseguir — conteúdo batia exatamente com o que a Fase 3 produziu). Não
havia nada pendente pra commitar antes de abrir o achado #18. O trabalho
desta fase foi commitado ao final (`836a54a`), depois de toda a
validação, matching o mesmo processo.

## 1 — O #18 não sabia o que estava investigando

### 1A — Contagem de transações por dia e por chamador

Instrumentação temporária (mesmo padrão de medições anteriores: atrás de
env var, revertida depois de medir) estendeu `dev/
persistenceTransactionProbe.js` — que já contava transações e rotulava
mutações por "stage", mas só DENTRO de uma `withPersistenceTransaction`
ativa — pro caminho SOLO (a maioria das escritas de produção, o próprio
objeto do achado #18), sem inventar mecanismo novo.

**Medido, população oficial (900+100), 3 meses, seed
`official-900-100-s1`**: **9,5 transações solo/dia**, espalhadas por 12
sistemas diferentes (`world`, `livingWorld`, `staff`, `persist`,
`circuit`, `circuitLife`, `athleteIntelligence`, `relationships`,
`aiPartnerships`, `notifications`, `aiCareerStrategy`,
`spontaneousPartnerMarket` — nenhum dominante).

**Critério de decisão declarado antes de ver o número**: ≥20-30/dia
espalhadas → fronteira ampliada se justifica; concentrado em 2-3 sistemas
→ batching pontual basta. 9,5/dia fica abaixo do primeiro patamar — mas a
distribuição por 12 sistemas descarta o segundo com clareza: "batching
pontual" viraria 12 correções separadas, o mesmo padrão que o achado #18
já cataloga 6 vezes.

**Isso levou a uma pergunta que a instrumentação por si não respondia**:
o harness usa o mesmo mecanismo de transação que a produção usa pro
avanço de dia real? Resposta: não. Ver achado #26 abaixo — descoberta que
mudou o resultado desta subfase de "escolher entre as 4 opções" pra
"confirmar que uma delas já está implementada".

### 1B — Perfilamento por sistema de topo

`dev/performanceProbe.js:createStageProfiler` já existe em produção
(usado por `dayAdvanceCoordinator.js`) e nunca tinha sido passado pro
harness — sem ele, nenhuma medição por subsistema existia fora do que o
achado #24 já tinha isolado dentro de `processWorldTourDay`.

**Maior consumidor em ambas as variantes**: `world` (`simulateWorldDay`,
~25% do tempo perfilado) — é custo COMPUTACIONAL real, não só
persistência. `livingWorld`/`persist`/`staff`/`circuit` seguem em ordem.
Envolvendo o dia numa transação, TODO stage caiu de custo absoluto
(~55-65% cada) — confirma que a sobrecarga de clone estava embutida na
medição de CADA sistema, não isolada num só lugar.

### Achado #26 — o harness nunca usou o mecanismo de transação que a produção já usa

A descoberta central da fase. Produção (`game-core/
dayAdvanceCoordinator.js:advanceCareerDayOnce` e `calendarLifecycle.js:
advanceCareerDays`) já envolve `advanceCareerDay` + `processGameStateDay`
do MESMO dia numa única `ActiveCareerAdapter.withPersistenceTransaction`
— 1 clone do save + 1 escrita física por dia, não importa quantos
sistemas rodem dentro (Mobile M3.7, já em produção). `scripts/
audit-real-athletes-simulation.mjs` (a fonte de TODOS os números de custo
desta auditoria, achados #23/#24/#18) chama os dois passos SOLTOS, sem
transação — decisão original da Fase 0.1 foi sobre ordem/granularidade de
simulação (dia a dia, por causa de um teste de paridade que achou 68% dos
campeões divergindo em lotes), nunca sobre a ausência do commit único.

Confirmado por busca exaustiva: `processGameStateDay` tem exatamente DOIS
chamadores em todo `src/`, os dois já dentro da transação; todo outro
chamador é ferramenta de harness/diagnóstico. E `processWorldTourDay`
(achado #24) roda DENTRO de `processGameStateDay`, via `livingWorldEngine.
js:processLivingWorldDay` — em produção, a reescrita de ranking do achado
#24 já entra automaticamente na mesma transação do resto do dia.

**Medido, mesma seed, mesmos 21 torneios resolvidos nas duas variantes:**

| | Sem transação (harness até aqui) | Com 1 transação/dia (produção real) |
|---|---|---|
| Transações SOLO (1 clone cada) | 860 (9,5/dia) | 3 (residual) |
| Mutações JOINED (custo marginal ~0) | 0 | 847 |
| Aberturas de transação | 0 | 90 (≈1,0/dia) |
| Tempo de parede (3 meses) | 3min37s | 2min16s |

**89% menos clones, 38% menos tempo de parede — pela MESMA simulação.**
Reproduzido numa escala menor antes de confirmar em escala oficial (60+30
atletas, 1 mês): mesmo padrão (282 clones solo/31 dias sem transação vs.
1 solo + 31 aberturas/31 dias com).

**Consequência**: os 38min16s da Fase 3 (achado #23) e os 7,58% de
`processWorldTourDay` (achado #24) são números reais do HARNESS, não do
que um jogador sente em produção. Isso não invalida as correções de bug
(achado #22) nem a localização do custo dentro de
`resolveCompletedWorldTourEvents` (achado #24) — muda a urgência da
opção arquitetural que o achado #18 vinha cogitando construir: ela já
existe e já roda em produção. O gap está no harness, não na produção.

## 2 — Colher o barato

### 2A — Campos mortos removidos

`world_ranking`: removido dos dois pontos de escrita
(`WorldTourLifecycle.js:reranked`, `rankingPopulation.js` — nascia
idêntico ao `ranking_position` desde a origem). `ranking_history`:
movido pra coleção própria (`AthleteRankingHistory`) — não descartado,
por intenção futura plausível (gráfico de evolução de ranking); zero
consumidores de leitura confirmados em todo `src/`.

**Migração**: os dois campos entram como `undefined` no `bulkUpdate`
semanal de `processWorldCircuit` — que já toca toda a população toda
semana — então a migração de saves existentes não custa nenhuma escrita
extra, só reaproveita a que já existia.

**Teste**: [scripts/test-athlete-hot-fields-fase4.mjs](../../scripts/test-athlete-hot-fields-fase4.mjs)
(14/14 PASS) — confirma remoção dos campos mortos, preservação e ordem
correta do histórico migrado, e o efeito isolado em bytes por atleta no
pico (histórico de 51 semanas inline vs. movido).

### 2B — Reranking redimensionado (com um bug real pego pelo próprio teste)

O reranking imediato continua necessário (corte de elegibilidade do
Circuit Finals/Legacy Finals, que não tolera atraso semanal) — mas
reescrevia a população inteira. Primeira versão: escrever só quem entra
no top 50 por pontos NOVOS. **O teste de equivalência pegou um bug real
antes de qualquer coisa ir pra produção**: quem CAI do top 50 (era #3,
virou #55 na rodada) ficava com a `ranking_position` ANTIGA — ainda
"elegível" pra um torneio que não devia mais poder disputar.

**Corrigido**: a escrita agora é a UNIÃO de quem está no top 50 por
pontos novos com quem estava no top 50 pela posição antiga — cobre os
dois lados da transição (entrada E saída do corte).

**Troca-off explícito, documentado no código**: tiers de corte mais
largo (Gold:800, Platinum:500, Masters:300, Elite:150, Crown:80) perdem
frescor no mesmo dia por este bloco especificamente — caem pra frescor
semanal, que já era o padrão do resto da população antes deste achado
existir.

**Teste**: [scripts/test-rerank-topn-equivalence-fase4.mjs](../../scripts/test-rerank-topn-equivalence-fase4.mjs)
(9/9 PASS) — inclui o cenário de queda explicitamente, com o comentário
de que ele reproduz o bug real encontrado na primeira versão.

## 3 — Suíte, lint, build, Tauri

Instrumentação de 1A/1B totalmente revertida (`DIAG_TXN_COUNT`,
`DIAG_WRAP_DAY_TXN`, `DIAG_STAGE_PROFILE` — confirmado por grep sem
nenhuma referência remanescente) antes da validação final.

- `npm run lint` — limpo, sem avisos.
- `npm run build` — OK.
- Nenhum arquivo de `src-tauri/` tocado — `npm run test:dev-server-config`
  aprovado.
- Suíte de regressão completa (14 scripts) + os dois testes novos desta
  fase (`test:athlete-hot-fields-fase4`, `test:rerank-topn-equivalence-fase4`)
  — **17/17 com PASS genuíno confirmado**, não só exit 0.

---

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | Commit antes de qualquer mudança | ✅ nada pendente (Fase 3 já commitada); trabalho desta fase commitado ao final (`836a54a`) |
| 2 | Contagem de transações por dia/chamador (1A) | ✅ 9,5/dia, 12 sistemas — critério não bate exatamente com nenhum dos dois patamares declarados, mas a distribuição descarta "batching pontual"; achado #26 tornou a escolha B×C discutível |
| 3 | Custo por sistema de topo (1B) | ✅ `world` (simulateWorldDay) é o maior custo COMPUTACIONAL real (~25%), não só persistência |
| 4 | Campos mortos removidos, efeito medido (2A) | ✅ `world_ranking` removido, `ranking_history` migrado pra coleção própria, migração sem custo extra, 14/14 PASS |
| 5 | Reranking redimensionado, equivalência testada (2B) | ✅ união top-50-novo/top-50-antigo (corrige bug pego pelo teste), 9/9 PASS |
| 6 | Instrumentação revertida, suíte verde, lint, build, Tauri | ✅ 17/17 PASS genuíno, tudo limpo |
| — | Achado #26 (não pedido explicitamente, descoberto no processo) | ✅ o harness nunca usou o mecanismo de transação que a produção já usa — os números de custo da Fase 3 são do harness, não de produção |

**Resumo executivo**: a pergunta que abriu esta fase ("a opção B do #18
se justifica?") virou uma pergunta melhor no meio do caminho — não "qual
das 4 opções escolher", mas "uma delas já está implementada?". Estava.
`dayAdvanceCoordinator.js`/`calendarLifecycle.js` já envolvem o avanço de
dia real numa única transação (Mobile M3.7); o harness que gerou todos os
números de custo desta auditoria (achados #23/#24) nunca usou esse
mecanismo, e a diferença medida (89% menos clones, 38% menos tempo de
parede, mesma simulação) mostra que boa parte do que parecia "achado #18
não resolvido" já está resolvido em produção — só não estava sendo
medido corretamente. 2A e 2B ficam de pé por si (bytes e trabalho
evitável, independente de quem clona o quê) e os dois já estão
aplicados, testados e commitados. O que falta pro achado #18 — se é que
falta algo — é uma verificação mais ampla de que nenhum outro caminho de
produção escapa da transação por dia, não uma escolha entre opções
arquiteturais novas.
