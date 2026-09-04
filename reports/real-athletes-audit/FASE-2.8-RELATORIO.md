# Fase 2.8 — Vazamento de memória, checkpoint do harness e dívidas curtas

> Pré-requisito: Fase 2.7 entregue (consolidação + cadência do editorial,
> achado #18 catalogado, guarda de parâmetro no mercado, baseline
> pré-Fase-3 congelada, regime-check adiado por OOM). Ver
> [FASE-2.7-RELATORIO.md](FASE-2.7-RELATORIO.md).

## 1 — O que realmente está crescendo

**Achado, com causa raiz confirmada por código e por medição — não é
`AthleteCareerLegacy`, não é a vazão de mercado, e as coleções que a Fase
0.1 já tinha identificado (`Partnership`/`TeamRanking`/`WorldEvent`/
`CareerMessage`) estão exatamente onde a poda mensal do harness deveria
deixá-las. O que realmente cresce sem limite é uma camada inteiramente
diferente: BACKUPS de arquivo, na camada de storage — invisível pra
qualquer métrica que só olha as coleções de entidade (`AthleteProfile`,
`WorldEvent` etc.), porque não é uma entidade, é um arquivo.**

### Método

[scripts/audit-real-athletes-simulation.mjs](../../scripts/audit-real-athletes-simulation.mjs)
ganhou instrumentação nova, gated pelas MESMAS variáveis de ambiente que
já existiam (`DIAG_SIZES`, mais um `DIAG_MAX_MONTHS` novo pra parar antes
de completar a temporada): contagem de linhas + bytes aproximados
(`JSON.stringify`) por coleção de entidade ao fim de cada mês, e —
depois que a hipótese inicial não fechou em ordem de grandeza — contagem
+ bytes de TODO arquivo no storage simulado, separando os que têm
"backup" no nome. Rodado 6 meses, população de produção (100 reais + 900
procedurais), sem nenhuma correção aplicada.

### Coleções de entidade — nenhuma delas explica o problema

| Coleção | Mês 1 | Mês 2 | Mês 3 | Mês 4 | Mês 5 | Mês 6 | Comportamento |
|---|---|---|---|---|---|---|---|
| `AthleteProfile` — linhas | 1006 | 1012 | 1018 | 1024 | 1030 | 1036 | Linear, pequeno (+6/mês, vazão de prospects já calibrada) |
| `AthleteProfile` — bytes | 2,00MB | 2,49MB | 3,00MB | 3,47MB | 4,01MB | 4,47MB | Cresce por atleta (ver abaixo), não por contagem |
| `WorldEvent` — linhas | 114 | 218 | 300 | 300 | 300 | 300 | **Poda mensal funcionando** — trava em 300 a partir do mês 3, como desenhado |
| `CareerMessage` — linhas | 6 | 11 | 17 | 23 | 28 | 33 | Cresce, mas devagar (poda corta acima de 50 — ainda não atingiu) |
| `TeamRanking` — linhas | 27 | 27 | 27 | 27 | 27 | 27 | **Travado em 27** — a poda do harness apaga TUDO que não é uma das 27 duplas históricas, todo mês (achado à parte, ver abaixo) |
| `Partnership` — linhas | 92 | 145 | 192 | 230 | 264 | 289 | Cresce só por formação nova — **0 dissoluções em 6 meses** (contratos ainda não venceram) |
| `Partnership` — ativas/mortas | 92/0 | 145/0 | 192/0 | 230/0 | 264/0 | 289/0 | Nenhuma "morta" ainda — poda de status ainda não foi testada por este diagnóstico |
| `AnnualCareerReport` | 0 | 0 | 0 | 0 | 0 | 0 | Só cria no fim do ano — nada a podar ainda |
| `AthleteCareerLegacy` | 10 | 24 | 37 | 43 | 50 | 62 | Cresce devagar, do tamanho esperado (achado da Fase 2.6, ~55-70/ano — bate) |
| **Total de bytes (todas as coleções)** | **2,22MB** | **2,83MB** | **3,46MB** | **3,98MB** | **4,57MB** | **5,07MB** | Linear, pequeno — **não explica 8GB nem de longe** |

`AthleteProfile`'s crescimento por LINHA (1987→4315 bytes/linha em 6
meses, quase o dobro) é real, mas explicado e BENIGNO: `ranking_history`
(`circuitLifecycle.js`) empurra uma entrada por atleta TODA SEMANA,
capado em 51 (`.slice(-51)`) — nos primeiros ~12 meses de qualquer
carreira, esse array só está enchendo até o teto, ainda não estabilizou.
Projeção: no pico (~51 semanas), cada atleta carrega ~5-8KB só desse
campo — com ~1050 atletas, isso é ~5-8MB no total, uma fração
desprezível de um crash de memória. **Não é o vazamento.**

### O vazamento real: backup de arquivo com nome único, rotação que nunca roda

`GameStorage.js` (`src/storage/GameStorage.js`) grava o save da carreira
via `writeCareer` → `writeJson`, que por padrão (`backup = true`, sem
override na maioria dos chamadores de `CareerManager.saveCareer` —
`ActiveCareerAdapter.js:267/352/420`, o caminho que QUALQUER mutação de
entidade acaba percorrendo) copia o arquivo atual pra
`backups/<careerId>-<timestamp ISO>-backup.json` **antes** de
sobrescrever o principal. `BackupManager.backupFile` tem rotação
(`maxBackups = 3` — a intenção clara era manter só os 3 backups mais
recentes), mas a rotação só encontra algo pra rotacionar quando o MESMO
`backupPath` é reusado entre chamadas — como `backupFileName` embute um
timestamp NOVO no nome a cada chamada
(`` `${careerId}-${formatTimestamp()}-backup.json` ``), `backupPath`
nunca é o mesmo duas vezes, `existingBackups` fica sempre vazio, a
rotação nunca tem o que remover, e cada gravação de carreira cria **mais
um arquivo permanente**, do tamanho do save inteiro naquele momento.

Instrumentei o `MemoryStorage` do próprio harness pra contar e medir isso
diretamente (nunca visível numa query de entidade, porque não é uma
entidade — é um arquivo na camada de storage):

| Mês | Arquivos de backup | Bytes em backups | Δ bytes vs. mês anterior | Arquivos "outros" (save ativo) | Bytes "outros" |
|---|---|---|---|---|---|
| 1 | 223 | 16,2 MB | — | 2 | 2,58 MB |
| 2 | 356 | 36,0 MB | +19,8 MB | 2 | 3,19 MB |
| 3 | 500 | 60,2 MB | +24,2 MB | 2 | 3,82 MB |
| 4 | 644 | 93,1 MB | +32,9 MB | 2 | 4,34 MB |
| 5 | 797 | 130,9 MB | +37,8 MB | 2 | 4,93 MB |
| 6 | 946 | **173,1 MB** | **+42,2 MB** | 2 | 5,43 MB |

**Isso não é linear — está acelerando** (Δ mensal sobe de 19,8MB pra
42,2MB ao longo dos 6 meses medidos): o número de arquivos cresce ~145-150/mês
de forma quase constante, MAS cada novo backup também é maior que o
anterior (captura um save que já cresceu) — produto de duas curvas
crescentes. Extrapolando essa aceleração pros ~24 meses até a temporada 2
(onde o crash de memória de fato aconteceu, Fase 2.7), a trajetória passa
facilmente da casa dos GB — bate com um `heap out of memory` de verdade,
ao contrário das ~5MB de dados de entidade genuínos.

**Confirmado como bug de PRODUÇÃO, não artefato de harness**: o caminho
`CareerManager.saveCareer` → `CareerRepository.writeCareer` →
`GameStorage.writeCareer` → `writeJson({backup:true})` é o MESMO que
QUALQUER sessão real de jogador percorre a cada mutação persistida — o
próprio painel de diagnóstico do jogo (`BetaTools.jsx`, "Backups internos
encontrados") já expõe uma contagem que só cresce, sem nenhum botão de
limpeza — ninguém tinha notado porque ninguém tinha olhado a curva ao
longo de meses de jogo simulado. Cresce com o NÚMERO DE GRAVAÇÕES (~5-6
por dia, um por sistema que persiste), não com tempo real — uma sessão
real acumula mais devagar em relógio de parede, mas pelo MESMO mecanismo,
sem limite, então o destino de longo prazo é o mesmo: inchar o storage
local (e, no caminho, cada `writeJson` subsequente paga o custo de
verificar/gravar um arquivo a mais).

### Respostas às perguntas específicas do pedido

1. **`Partnership` dissolvida: marcada, não removida** (confirmado por
   leitura de código, `aiPartnershipLifecycle.js` — `status:
   'encerrada_parceiro'`, nunca um `delete`) — mas em 6 meses **nenhuma
   dissolução aconteceu ainda** (contratos de 210-360 dias, `minimumStabilityReached`
   exige 120+ dias) — o diagnóstico não alcançou essa janela. Confirmado
   como acumulação real em PRODUÇÃO (sem poda nenhuma); dentro do
   HARNESS especificamente, a poda mensal (`status !== 'ativa'`) já
   remove essas linhas todo mês — só ainda não foi exercitada porque não
   há nada pra remover neste recorte de 6 meses.
2. **`TeamRanking` de duplas desfeitas: mesma resposta, mas mascarada
   pela própria agressividade da poda do harness.** `updateTeamRankings`
   (`circuitLifecycle.js`) nunca atualiza nem remove a linha de uma dupla
   que se separou — só para de tocá-la. A poda do harness, porém, não
   distingue "dupla desfeita" de "dupla ainda ativa mas não é uma das 27
   históricas": ela apaga TODAS as linhas de `TeamRanking` que não estão
   no conjunto das 27 semeadas, TODO mês — inclusive pares que ainda
   estão juntos e ativos. Efeito colateral: `TeamRanking` fica
   permanentemente travado em 27 linhas neste harness (confirmado:
   27/27/27/27/27/27 nos 6 meses), o que é MAIS agressivo que o
   necessário (remove dado válido, não só o obsoleto) mas por acidente
   também mantém a coleção pequena. Em produção, sem essa poda, o mesmo
   padrão de "nunca remove" que afeta `Partnership` afeta `TeamRanking`
   igual.
3. **A poda mensal do harness está executando, nas 4 coleções, como
   desenhado** — confirmado empiricamente: `WorldEvent` trava em 300 a
   partir do mês 3 (exatamente o teto configurado), `CareerMessage` seria
   podada acima de 50 (ainda não atingiu em 6 meses), `TeamRanking` fica
   em 27 (mais agressivo que o pretendido, item 2 acima), `AnnualCareerReport`
   não teve nada pra podar ainda (só se cria 1x/ano). **O que ela NÃO
   cobre — porque não existia antes desta investigação — é `backups/` na
   camada de storage, que é onde o crescimento real está.**
4. **Tamanho do save "de verdade" (dados de entidade) cresce ~450-500
   bytes/linha de `AthleteProfile`/mês, linear, ~5MB de total em 6
   meses** — não é isso que ameaça a memória. O que ameaça é o storage
   (backups), medido acima.

### Decisão: sua, como combinado

Não corrigi nada — nem `GameStorage.js`/`BackupManager.js` (o bug de
rotação), nem a poda do harness (que mascara em vez de resolver o mesmo
padrão em `TeamRanking`). Registrado como achado próprio (**#20** — ver
tabela de classificação) porque é um bug de CORREÇÃO distinto do #18: o
#18 é sobre CUSTO (clonar o save inteiro a cada transação torna escritas
caras); este é sobre um mecanismo de rotação que existe, foi desenhado
corretamente (`maxBackups=3`), mas nunca dispara por causa de como o
nome do arquivo é gerado — um bug pontual e concreto (`backupFileName`
gerar timestamp único em vez de um nome estável), não uma questão de
arquitetura de transação. Fica pra você decidir se entra antes da Fase 3
(dado o tamanho do impacto e ser uma correção pequena e isolada) ou junto
com a investigação do #18 (já que os dois se alimentam do mesmo padrão de
"gravar toda hora").

---

## 2 — Checkpoint por temporada no harness

**Feito.** `scripts/audit-real-athletes-simulation.mjs` reescrito: a
lógica que montava `summary`/`tournament-results.csv`/`season-tier-table.md`
— antes só no fim do laço de dias INTEIRO — virou uma função
`writeCheckpoint(throughYear)`, chamada logo depois de CADA
`finalizeSeasonRecord` (dentro do laço, uma vez por temporada fechada),
não só no final do script.

Cada chamada sobrescreve os MESMOS três arquivos com o estado mais
recente disponível — não é uma retomada automática (rodar de novo ainda
recomeça da temporada 1), mas um crash na temporada N+1 agora deixa em
disco exatamente o que a temporada N produziu, pronto pra uso. É
literalmente o que faltou na tentativa de regime-check da Fase 2.7: a
temporada 1 tinha fechado e sido válida, mas o crash na temporada 2 não
deixou nada em disco porque a única escrita ficava depois do laço
inteiro.

Sem trabalho extra de manutenção: a função de checkpoint reaproveita
exatamente a mesma lógica que já existia (cumulativo, amostragem de
catálogo, csv, markdown) — só mudou ONDE ela é chamada. A amostragem do
catálogo de adversários (500 sorteios determinísticos) é recomputada a
cada checkpoint em vez de guardada de uma rodada anterior, pra manter a
função autocontida — custo desprezível (a mesma amostragem que já rodava
uma vez agora roda uma vez por temporada, não por dia).

**Prova de que funciona**: usado na própria investigação do item 1 — os
dois diagnósticos de crescimento (`DIAG_MAX_MONTHS=6`) passam por
`writeCheckpoint` na saída de segurança pós-laço (a mesma função que o
ponto de checkpoint dentro do laço chama, com o mesmo formato de
argumento) e produzem `summary.json`/csv/md válidos, com
`checkpoint:{seasonsCompleted:1,complete:true}` corretamente preenchido —
confirma que a função em si grava certo. O ponto de chamada DENTRO do
laço (disparado quando uma temporada fecha e ainda restam mais
temporadas pela frente) usa a função idêntica, sem lógica condicional
diferente — não justificou uma rodada de 2+ temporadas só pra exercitar
esse caminho específico, dado o custo (horas) e o fato de ser
literalmente a mesma chamada.

---

## 3 — Custo do editorial: sem perfilamento dedicado

Decisão registrada, não uma medição nova: por instrução explícita, não
rodei os ~30 min de perfilamento só pra confirmar o sinal parcial da Fase
2.7 (23% mais rápido no checkpoint de dia 120, direcionalmente
consistente com o corte de 71% na cadência). Fica assim até o próximo
perfilamento que rodar por outro motivo — quando isso acontecer, comparar
contra `profile-report.json` atual (que já reflete o código pós-Fase-2.7)
e reportar junto, sem rodada dedicada. Se a Fase 3 começar antes de
qualquer perfilamento acontecer, fica sem esse número — não é bloqueador,
como já dito na Fase 2.7.

---

## 4 — Dívida de conteúdo do editorial

Registrada como **achado #19** na tabela de classificação consolidada —
ver
[AUDITORIA-ATLETAS-REAIS-VS-BOTS.md](AUDITORIA-ATLETAS-REAIS-VS-BOTS.md#classifica%C3%A7%C3%A3o-consolidada):
3 templates fixos, `event_type` que não bate com nenhuma categoria do
snapshot, nunca aparece no resumo semanal (nunca tem `tier`). A Fase 2.7
tratou o CUSTO (cadência); o CONTEÚDO (variedade, categorização) continua
uma dívida em aberto, marcada como não-urgente e não-bug (funciona como
escrito, só é pobre demais pro que devia entregar).

---

## 5 — Suíte, lint, build

- `npm run lint` — limpo, sem avisos (nenhum arquivo de `src/` de
  produção foi tocado nesta fase — só `scripts/audit-real-athletes-simulation.mjs`
  e documentação).
- `npm run build` — OK, 34,21s.
- Suíte de regressão completa (10 scripts): `test:tournament-registration`,
  `test:ranking-consistency`, `test:tournament-flow-rc`,
  `test:partnerships-v29`, `test:living-partnership-market-phase15`,
  `test:world-partnership-dynamics`, `test:players`, `test:missions`,
  `test:ranking-race-season`, `test:simulation-population-cap-invariant`
  — **todos EXIT 0, todos com texto de PASS genuíno conferido**.

---

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | Curva de crescimento por coleção + tamanho do save por mês, sem correções | ✅ causa raiz encontrada e confirmada — não é nenhuma coleção de entidade, é backup de arquivo com rotação que nunca dispara (achado #20). 223→946 arquivos, 16,2MB→173,1MB em 6 meses, acelerando — contra ~5MB de dados de entidade genuínos no mesmo período |
| 2 | Checkpoint por temporada implementado | ✅ `writeCheckpoint()` chamado após cada temporada fechada, não só no fim do laço inteiro |
| 3 | Custo do editorial sem perfilamento dedicado | ✅ decisão registrada, sem rodada nova — dobra na próxima medição que acontecer por outro motivo |
| 4 | Dívida de conteúdo do editorial registrada | ✅ achado #19 |
| 5 | Suíte verde, lint, build OK | ✅ |

**Resumo executivo**: a pergunta do item 1 ("nada disso explica 8GB — o
que está vazando de verdade?") tinha razão em desconfiar da explicação
anterior — e a resposta certa não estava em nenhuma das coleções de
entidade já sob suspeita. É um bug concreto e isolado na camada de
storage (`GameStorage.js`): a intenção de manter só os 3 backups mais
recentes existe no código (`BackupManager`, `maxBackups=3`), mas nunca
funciona porque cada chamada gera um nome de arquivo novo, então a
rotação nunca encontra nada pra rotacionar. Confirmado como bug de
produção (não harness) pelo mesmo caminho de código que qualquer sessão
real de jogador usa a cada salvamento. Não corrigido nesta entrega, por
instrução — decisão sobre quando entrar (antes da Fase 3, ou junto com a
investigação do #18) fica com você. O checkpoint por temporada (item 2)
já reduz o RISCO de perder trabalho numa rodada longa futura, independente
dessa decisão — um crash na temporada N+1 agora preserva o resultado
válido da temporada N.
