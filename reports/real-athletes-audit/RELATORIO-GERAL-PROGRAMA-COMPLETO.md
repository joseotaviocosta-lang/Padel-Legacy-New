# Relatório geral — Programa completo de reformulação do circuito de torneios (Fase 0 → 9)

> Resumo executivo de todo o programa, do diagnóstico inicial até a Fase 9. Mesmo
> padrão dos dois fechamentos anteriores (espiral de exclusão,
> [FECHAMENTO-ESPIRAL-REAIS.md](FECHAMENTO-ESPIRAL-REAIS.md); dominância de tier,
> [FECHAMENTO-DOMINANCIA-TIER-8.2-8.5.md](FECHAMENTO-DOMINANCIA-TIER-8.2-8.5.md)) —
> aponta para os relatórios de fase, não os substitui. Nenhuma medição nova foi
> feita para este documento; é consolidação pura de trabalho já commitado.

## 1 — O problema original e o que motivou o programa

A queixa que abriu tudo era simples de descrever e difícil de aceitar: torneios
grandes do World Tour eram vencidos, sistematicamente, por duplas de bots
anônimos, enquanto os atletas reais do circuito (Coello, Tapia, Galán...)
existiam apenas como linhas estáticas na página de Ranking — nunca entravam em
uma chave. A primeira hipótese óbvia (um bug pontual de seleção de torneio) foi
testada e refutada logo na Fase 0.3 (ordem de iteração não é a causa) e na Fase
1 (dispersão de hash não é a causa), o que já indicava que o sintoma não tinha
uma causa única e corrigível em uma tarde. A auditoria completa (Fase 0)
confirmou isso da pior forma possível: não existe *um* sistema "atletas reais"
no jogo, existem **três universos de dados completamente desconectados** (pool
de ranking mundial, catálogo de adversários do jogador, camada de nomes de
relações) que usam ids diferentes para a mesma pessoa e nunca se comunicam —
vencer o "Coello" de um universo não move um único ponto do "Coello" de outro.
Um sintoma estrutural desse tamanho exigia uma auditoria completa em vez de uma
correção pontual, e foi isso que motivou as 10 fases planejadas.

## 2 — As 10 fases planejadas vs. o que realmente aconteceu

| Fase | Status final | O que entregou |
|---|---|---|
| **0** | Concluída, expandida em sub-fases (0.1, 0.2, 0.3) | Mapeou os 3 universos desconectados; descobriu que o harness de medição NÃO representava o jogo (duas causas raiz distintas, corrigidas) e só depois disso ficou com uma baseline reproduzível; descartou duas hipóteses de causa antes de aceitar a real. |
| **1** | Concluída, expandida em sub-fase (1.5) | Corrigiu a leitura do rank (`resolveEntryRank`) que deixava toda dupla inelegível para os 4 tiers de topo; backfill de `birth_date`; inventário de todos os tetos `.list(sort, limit)` hardcoded do projeto. |
| **2** | Concluída, mas disparou uma cadeia de sub-fases (2.5→2.9), cada uma causada por um achado da anterior | Expandiu o elenco de 24→100 atletas reais com sistema completo de aposentadoria/renovação e tetos obrigatórios; a cadeia 2.5-2.9 resolveu, em sequência, um diagnóstico de custo errado, o verdadeiro gargalo de mercado, o custo real de `livingWorld`, um OOM (causa real: backups nunca rotacionados, achado #20) e uma política de acumulação de dados. |
| **3** | Concluída como planejado | Escada de 9 tiers (era 6), calendário de 80 eventos/ano, dois bugs independentes por trás de "chaves incompletas" corrigidos (achados #16b e #22) — incompletude 40,6%→0%. |
| **4** | Concluída, expandida em sub-fases (4.1-4.4 + "ranking rolling") | Achado #26: produção já envolve o dia inteiro numa única transação, mas o harness não — corrigir isso derrubou o custo de simulação em 84%; corrigiu um bug real de concorrência (`clubs.js`); substituiu o acumulador de ranking vitalício por uma janela rolante de 52 semanas. A Fase 4.3 já identificou o mecanismo real de exclusão em Bronze/Silver (capacidade fixa, sem fila) — esse achado redirecionaria a Fase 5. |
| **5** | **Consumida em parte.** Planejada para "balancear dominância de tier" (o tópico que só voltaria a ser tratado na Fase 8.2-8.5); redirecionada já na largada pelo achado da Fase 4.3 para "distribuir presença" em Bronze/Silver | Entregou recalibração real (agenda de tiers, remoção do preenchimento de reserva, correção de 3 bugs "campo certo/consumidor errado", tetos de ranking por tier recalibrados 4× ao longo de 5.1-5.6) — mas não tratou dominância de tier, que ficou pendente até a Fase 8. |
| **6** | **Consumida inteiramente** pela investigação da espiral de exclusão de reais | Abre com um regime-check mostrando a sobreposição de reais ociosos subindo de 0%→84% entre temporadas — a partir daí (6.1-6.7) é 100% diagnóstico do mecanismo (formação de parceria, penhasco de 364 dias, capacidade de topo vs. base). Nenhuma entrega "original" de Fase 6 sobrevive nesta forma. |
| **7** | **Consumida inteiramente**, no mesmo fio da Fase 6 | Identifica o mecanismo final (rank explica 98,8% de quem fica ocioso) e implementa/valida a correção definitiva (qualifying + janela de prioridade), fechada na 7.4. Ver seção 3.1. |
| **8** | Concluída, expandida em sub-fases (8.1-8.8) | Mede as 8 metas originais da Fase 0 contra o estado atual do circuito; abre e fecha a investigação de dominância de tier (8.2-8.5, ver seção 3.2); 8.1 confirma aposentadoria (não bug) e estende qualifying/janela ao jogador; 8.7 fecha topo-120 em produção e as 3 pontas restantes; 8.8 refuta um achado equivocado da própria 8.7. |
| **9** | Concluída como planejado — levantamento sem implementação — e seguida por trabalho de conexão real fora do escopo original (9.3, 9.4) | Mapeou 4 sistemas de "sabor": 3 de 4 já funcionavam mecanicamente (rivalidade, imprensa, dupla com real), só faltava conexão/peso extra para reais; aposentadoria visível era o único item genuinamente ausente. Os commits 9.3 e 9.4 (sem relatório de fase dedicado) já implementaram parte dessa conexão — ver seção 6. |

**Onde o plano original divergiu, de forma explícita**: as Fases 5, 6 e 7
originais não entregaram o que estava planejado para elas. A Fase 5 deveria
tratar dominância de tier e foi desviada, já na largada, para participação em
Bronze/Silver; as Fases 6 e 7 inteiras foram consumidas pela investigação da
espiral de exclusão de reais, que só foi *descoberta* na Fase 6 e fechada na
7.4. A dominância de tier, tema original da Fase 5, só voltou a ser tratada
três fases de numeração depois, na 8.2-8.5.

## 3 — Os dois desvios estruturais que dominaram o meio do programa

### 3.1 — A espiral de exclusão de reais (descoberta na Fase 6/7, fechada na 7.4)

Uma dupla real que joga pouco entra numa espiral que se auto-reforça com peças
de código já existentes, sem nenhum bug isolado: pontos de ranking só vêm de
jogar, uma dupla parada não perde pontos mas também não ganha nenhum enquanto o
resto do mundo sobe, e a prioridade de vagas principais usa esse mesmo rank —
quanto pior a posição relativa, menor a chance de reverter a situação. Rank
explicou 98,8% de quem ficava ocioso, reproduzido em 3 cenários de calendário
independentes. A correção final (sempre ativa, sem flags de diagnóstico):
**qualifying** (uma segunda porta de entrada por mini-bracket para quem tem os
piores ranks) + **janela de prioridade de 4 aparições seguidas** para quem
vence o qualifying, persistida em `Partnership.priority_window_remaining`.
Resultado: reincidência (dupla resgatada que volta a cair) caiu de **90-100%
para 0%**, confirmado num regime-check de produção sem nenhuma flag de
diagnóstico. Detalhe completo em
[FECHAMENTO-ESPIRAL-REAIS.md](FECHAMENTO-ESPIRAL-REAIS.md).

### 3.2 — A dominância de tier por composição de força (Fase 8.2→8.5)

Reais dominam Gold/Platinum/Masters não por bug, mas porque os 100 atletas
reais foram inseridos no elenco ANTES dos bots procedurais por desenho (Fase
2) — todo bot nasce numa posição de curva de OVR pior, com um teto ~11-12
pontos abaixo do teto real, e uma margem de crescimento 3-5× mais estreita que
a usada para substitutos. Três tentativas de correção foram medidas, cada uma
falhando de um jeito diferente: alargar o `potential` de toda a população
(fecha o gap parcialmente, mas bots passam a vencer títulos de Elite/Masters/
Crown que nunca venciam antes); alargar só numa faixa de rank + fração
boosted (o "corte por rank" acabou afetando 43% da população de bots, não uma
fração pequena; Top 20 real despenca); travar um teto de OVR no valor do tier
de destino (contém o vazamento quase por completo, mas o gap de OVR não fecha
— oscila e termina igual ou pior). Nenhuma das quatro configurações medidas
(produção, 8.3, 8.4, 8.5) chegou perto da meta original de 85% de títulos de
bot em Gold/Platinum — a melhor rodada (23,3% em Platinum) ficou 62 pontos
percentuais abaixo. **Decisão final**: corrigir a meta em vez de forçar a
solução — nenhuma das três correções foi implementada em produção. Detalhe
completo em
[FECHAMENTO-DOMINANCIA-TIER-8.2-8.5.md](FECHAMENTO-DOMINANCIA-TIER-8.2-8.5.md).

## 4 — Estado final das 8 metas originais da Fase 0

| Meta original | Status final |
|---|---|
| Major/P1 (Elite/Crown) ≥ 70% títulos 100% reais | ✅ **Atingida** (100% observado) |
| Acesso do jogador #1000 (≥15 eventos elegíveis, gap ≤21 dias, ano 1) | ✅ **Atingida** (40 eventos, gap máximo de 14 dias, com topo-120) |
| Pareamento de duplas históricas ≥ 90% dos eventos que disputam | ✅ **Atingida** — corrigida por evidência de métrica: 6/6 duplas confirmadas ficam em 97-100% enquanto ativas; a métrica cumulativa original penalizava aposentadoria (não jogar mais, por desenho) como se fosse falha de pareamento |
| Participação individual ≥ 12 eventos/temporada, já na T1 | ❌ **Não atingida** — mesmo com topo-120 (a melhor mitigação disponível, já adotada), ainda fica abaixo do piso numa fração da população |
| P2/Masters: 40-60% de títulos reais | **Meta revisada** — referência de teto observado de ~6% de títulos de bot (Masters é, na prática, ainda mais dominado por reais que Gold/Platinum, mesma causa estrutural) |
| Gold/Platinum: < 15% de títulos reais (bots deveriam vencer ≥85%) | **Meta revisada** — referência de teto observado de ~13% (Gold) / ~23% (Platinum) de títulos de bot; estruturalmente inatingível sem arriscar a meta de Major/P1 |
| Bronze/Silver: ~0% de títulos reais | ⚠️ **Parcial** — 10,5-20% real observado (não afetado pela linha de investigação 8.2-8.5); bem abaixo da dominância quase total do início do programa (97%), mas não zerado |
| Zero chaves incompletas | **Meta revisada, proposta não implementada** — residual de 2,6% com topo-120, concentrado na T1 e em eventos de convite pequenos (Legacy/Circuit Finals); proposta de "≤3% fora da T1" registrada em `docs/tournament-targets.md`, aguardando decisão |

## 5 — Achados estruturais que se repetiram ao longo do programa

- **"Campo certo existe, consumidor lê o errado"** — `rank` vs. `ranking`
  (achado #16, Fase 1: toda dupla ficava inelegível para os 4 tiers de topo);
  `draw_size` vs. `main_draw_size` (achado #16b, Fase 1/3: fallback sempre caía
  em 32); `score` de `calculatePartnershipInterest` calculado mas nunca lido
  por `available` em `buildInitialPartnerOffers` (Fase 4.4); `pairEntryRank`
  (média da dupla) existe mas `chooseTournament` comparava só `athlete_a`,
  deixando duplas de elite entrarem em Bronze/Silver (achado #37, Fase 5.5);
  `current_win_streak` calculado em memória mas nunca persistido no
  `playerPatch` — sempre lido como 0, inclusive por um motor de conquistas que
  nunca disparava (Fase 8.1); `eventRegion()` monta região a partir de campos
  que não existem em `Tournament` enquanto `TournamentSelectionAI.js` compara
  contra `world_region` (Fase 7, nunca corrigido por decisão de escopo).
- **"Silenciosamente errado em vez de visivelmente quebrado"** — rotação de
  backup corretamente desenhada (`maxBackups=3`) que nunca disparava porque o
  nome do arquivo nunca se repetia, backups crescendo sem limite até virarem a
  verdadeira causa de um OOM antes atribuído a outra coisa (achado #20, Fase
  2.8-2.9); o próprio fallback de 32 do achado #16b fazia todo torneio
  "parecer" ter o tamanho de chave certo mesmo quando não tinha; idade
  hardcoded (24 ou 25 anos) usada quando `birth_date` faltava, errando por até
  17 anos sem nenhum sinal de que o fallback estava em uso (Fase 1);
  preenchimento de reserva truncando entrantes acima da chave (só o
  sub-preenchimento tinha aviso) e, isoladamente, puxando duplas de elite para
  tiers de entrada quando o pool elegível ficava curto (Fase 4.3/5.2); o
  cenário de calendário "250" travando o circuito inteiro sem nenhum erro
  visível (Fase 5).
- **"Teto calibrado para a população de um momento, sem poda"** — `structuredClone`
  do save inteiro a cada escrita, em pelo menos 6 pontos de código, sem poda
  das coleções que cresciam (achado #18, explica o crescimento de custo
  intra-temporada de até 7,5×, Fase 2.6-2.7); a mesma família em arquivo, não
  em memória, é o achado #20 acima; `Tournament.list('-start_date', 300)` × 15
  meses de horizonte criando um teto de código de ~240 torneios/temporada,
  nunca documentado até travar o circuito inteiro (achado #32, Fase 5, ainda
  presente hoje); pelo menos 6 chamadas `.list(sort, limit)` hardcoded
  (200/500/500/500/500/250/1000) calibradas para uma população que já cresceu
  além delas (Fase 1.5 — ~794 de 994 atletas nunca recebiam evolução de
  atributo por causa de só uma delas); `OPEN_TIER_CEILING`/tetos de
  `minRanking` recalibrados 4 vezes ao longo da Fase 5 à medida que o
  mecanismo era entendido melhor; teto de geração de OVR de bot (~85) e
  margem de `potential` nunca revisitados desde que foram escritos em
  momentos diferentes do projeto — causa raiz da dominância de tier que a
  linha 8.2-8.5 não conseguiu corrigir (Fase 8.3).
- **"Reprodutibilidade quebrada por concorrência ou id não-seedado"** —
  `clubs.js:227` usava `Promise.all` sobre múltiplos clubes tocando
  `Math.random()` concorrentemente, corrigido para sequencial (Fase 4.1); o
  formato do `id` (curto vs. `makeId()` real) enviesava o hash de pareamento
  por ser sensível a comprimento de string — resolvido neutralizando
  `Math.random`/relógio só dentro do harness, sem mudar o formato de produção
  (achado A, Fase 0.1); `CareerEntityRepository.js:13` foi suspeito de causar
  o mesmo drift na Fase 8.7, mas **refutado** na Fase 8.8 — o mecanismo já
  estava corretamente neutralizado desde a Fase 0.1, confirmado por duas
  execuções byte-a-byte idênticas; estado de diagnóstico da janela de
  prioridade não sobrevivia a `--resumeFrom`, corrigido trocando um `Map` em
  memória por um campo persistido (Fase 7.3→7.4).
- **"Correção aplicada num caminho, o mesmo bug persiste em outro caminho que
  usa o mesmo mecanismo"** — a Fase 5.1 corrigiu o corte-sem-fila só para
  tiers abertos (`minRanking===0`); a Fase 6.4/6.5 encontrou o MESMO código
  ainda cortando sem fila em Gold/Platinum/Masters/Elite/Crown, 3 fases
  depois (motivou uma regra de método formal: "quando um mecanismo é
  corrigido num lugar, checar onde mais ele roda antes de fechar a fase");
  qualifying/janela de prioridade foi implementado só para o caminho da IA
  (Fase 7); a Fase 8/8.1 encontrou que o caminho do JOGADOR nunca recebeu o
  mesmo mecanismo.
- **"Número publicado enquanto o mecanismo medido fazia outra coisa"** —
  `tournaments_played` misturava um valor estático de backstory com jogo
  simulado de verdade (achado #33, Fase 5.1); o denominador de chaves
  canceladas inflava o "% de dominância real" da base (Fase 5.3/5.4); o
  vazamento de `athlete_a` (achado #37 acima) também distorcia a mesma
  métrica — 3 instâncias da mesma classe, cada correção mudando o número que
  decidia um parâmetro, sem mudar a leitura qualitativa.

## 6 — O que ficou pendente, deliberadamente

- **`eventRegion()`** — bug real de granularidade (compara país contra
  região), nunca corrigido por decisão explícita de escopo ao longo de toda a
  linha da espiral de exclusão.
- **Volume de calendário no meio da tabela e exclusão ativa por seleção** —
  descartadas por decisão na Fase 8.6: o padrão "mais calendário não move a
  métrica que importa" já tinha aparecido de forma independente nas Fases 6.7
  e 8.2, e exclusão ativa seria a primeira regra de comportamento do programa
  criada sem nenhum bug correspondente, só para forçar um número.
- **Wildcard (Opção B) e a Hipótese A (escalar `QUALIFYING_SHARE` pelo
  tamanho do grupo)** — propostas na Fase 7.1-7.3, testadas ou superadas pelo
  resultado da janela de prioridade; não são pendências, estão fechadas.
- **Topo-76 como cenário de dimensionamento de calendário** — descartado por
  instabilidade de forma entre 3 seeds diferentes (uma reversão, um patamar,
  um crescimento monotônico) — decisão registrada, não um resultado a
  reinvestigar.
- **Meta de "zero chaves incompletas"** — a proposta revisada (≤3% fora da
  T1) está registrada na Fase 8.7 mas não foi formalizada em
  `docs/tournament-targets.md`; aguardando decisão.
- **Comentário de uma linha em `CareerEntityRepository.js:13`** apontando
  para `installDeterminism`/Fase 0.1 — sugerido na Fase 8.8 (~5 min de
  esforço) para que uma terceira sessão não repita o mesmo diagnóstico
  equivocado; não implementado, registro já considerado suficiente.
- **`HallOfFameEntry`** — schema formal com zero leitores em todo o projeto,
  abandonado em favor de `AthleteCareerLegacy`. Decisão, não dívida — e
  reafirmada explicitamente no commit da Fase 9.3 ("duplicaria
  `AthleteCareerLegacy` sem ganho").
- **Evento/toast no momento exato da aposentadoria de um real** — a Fase 9
  propôs duas alternativas (criar um evento OU conectar uma tela a
  `AthleteCareerLegacy`); a Fase 9.3 implementou a tela (aba "Sua carreira"
  no Hall da Fama), não o evento — o sinal ativo no momento da aposentadoria
  continua ausente, mas o objetivo de visibilidade foi endereçado pelo
  caminho alternativo.
- **Mensagem/evento narrativo específico ao formar dupla com um atleta real**
  (Fase 9, item 4b) — a Fase 9.4 conectou o caminho de acesso (busca manual
  passa a incluir reais, com a mesma fricção do mercado espontâneo) e
  adicionou um badge visual, mas não criou o momento narrativo dedicado
  proposto ("você acabou de formar dupla com [nome real]").
- **Curadoria de rivalidade priorizando nomes reais** (Fase 9, item 1) — o
  veredito da própria fase foi "nada a construir"; item registrado como
  opcional, não como pendência.

## 7 — Métricas de antes/depois, headline

- **Torneios/temporada**: 32 (calendário original, 6 tiers) → 80 (Fase 3, 9
  tiers) → **162** (topo-120, configuração de produção final, Fase 8.7).
- **Atletas reais que nunca jogaram nenhum torneio**: 17/24 (70,8%, baseline
  original de 24 reais) → **0/100** na temporada 1 (confirmado em regime-check
  de 5 temporadas completas).
- **Reincidência da espiral de exclusão** (dupla resgatada que volta a cair):
  **90-100% → 0%** (Fase 7.2 → Fase 7.4).
- **Custo de simulação de 1 temporada**: 38min16s → **5min57,9s** (-84,4%),
  via correção de fronteira transacional (achado #26, Fase 4 → 4.1).
- **Dominância de título na base do circuito (Bronze/Silver)**: ~97% real
  (baseline pré-Fase-3) → ~40-50% real (Fase 5.6) — base tornada competitiva
  sem eliminar os reais dela.

## 8 — Índice de todos os relatórios de fase

- [AUDITORIA-ATLETAS-REAIS-VS-BOTS.md](AUDITORIA-ATLETAS-REAIS-VS-BOTS.md)
- [BASELINE-OFICIAL-CONGELADA.md](BASELINE-OFICIAL-CONGELADA.md)
- [BASELINE-PRE-FASE3-CONGELADA.md](BASELINE-PRE-FASE3-CONGELADA.md)
- [FASE-0.1-VALIDACAO-HARNESS.md](FASE-0.1-VALIDACAO-HARNESS.md)
- [PROFILING-FASE-0.2.md](PROFILING-FASE-0.2.md)
- [FASE-0.3-DIAGNOSTICO-MERCADO.md](FASE-0.3-DIAGNOSTICO-MERCADO.md)
- [FASE-1-RELATORIO.md](FASE-1-RELATORIO.md)
- [FASE-1.5-INVENTARIO-LIST-LIMIT.md](FASE-1.5-INVENTARIO-LIST-LIMIT.md)
- [FASE-1.5-RELATORIO.md](FASE-1.5-RELATORIO.md)
- [FASE-2-RELATORIO.md](FASE-2-RELATORIO.md)
- [FASE-2.5-RELATORIO.md](FASE-2.5-RELATORIO.md)
- [FASE-2.6-RELATORIO.md](FASE-2.6-RELATORIO.md)
- [FASE-2.7-RELATORIO.md](FASE-2.7-RELATORIO.md)
- [FASE-2.8-RELATORIO.md](FASE-2.8-RELATORIO.md)
- [FASE-2.9-RELATORIO.md](FASE-2.9-RELATORIO.md)
- [FASE-3-RELATORIO.md](FASE-3-RELATORIO.md)
- [FASE-4-RELATORIO.md](FASE-4-RELATORIO.md)
- [FASE-4.1-RELATORIO.md](FASE-4.1-RELATORIO.md)
- [FASE-4.2-RELATORIO.md](FASE-4.2-RELATORIO.md)
- [FASE-4-RANKING-ROLLING-RELATORIO.md](FASE-4-RANKING-ROLLING-RELATORIO.md)
- [FASE-4.3-RELATORIO.md](FASE-4.3-RELATORIO.md)
- [FASE-4.4-RELATORIO.md](FASE-4.4-RELATORIO.md)
- [FASE-5-RELATORIO.md](FASE-5-RELATORIO.md)
- [FASE-5.1-RELATORIO.md](FASE-5.1-RELATORIO.md)
- [FASE-5.2-RELATORIO.md](FASE-5.2-RELATORIO.md)
- [FASE-5.3-RELATORIO.md](FASE-5.3-RELATORIO.md)
- [FASE-5.4-RELATORIO.md](FASE-5.4-RELATORIO.md)
- [FASE-5.5-RELATORIO.md](FASE-5.5-RELATORIO.md)
- [FASE-5.6-RELATORIO.md](FASE-5.6-RELATORIO.md)
- [FASE-6-RELATORIO.md](FASE-6-RELATORIO.md)
- [FASE-6.1-RELATORIO.md](FASE-6.1-RELATORIO.md)
- [FASE-6.2-RELATORIO.md](FASE-6.2-RELATORIO.md)
- [FASE-6.3-RELATORIO.md](FASE-6.3-RELATORIO.md)
- [FASE-6.4-RELATORIO.md](FASE-6.4-RELATORIO.md)
- [FASE-6.5-RELATORIO.md](FASE-6.5-RELATORIO.md)
- [FASE-6.6-RELATORIO.md](FASE-6.6-RELATORIO.md)
- [FASE-6.7-RELATORIO.md](FASE-6.7-RELATORIO.md)
- [FASE-7-RELATORIO.md](FASE-7-RELATORIO.md)
- [FASE-7.1-RELATORIO.md](FASE-7.1-RELATORIO.md)
- [FASE-7.2-RELATORIO.md](FASE-7.2-RELATORIO.md)
- [FASE-7.3-RELATORIO.md](FASE-7.3-RELATORIO.md)
- [FASE-7.4-RELATORIO.md](FASE-7.4-RELATORIO.md)
- [FECHAMENTO-ESPIRAL-REAIS.md](FECHAMENTO-ESPIRAL-REAIS.md)
- [FASE-8-RELATORIO.md](FASE-8-RELATORIO.md)
- [FASE-8.1-RELATORIO.md](FASE-8.1-RELATORIO.md)
- [FASE-8.2-RELATORIO.md](FASE-8.2-RELATORIO.md)
- [FASE-8.3-RELATORIO.md](FASE-8.3-RELATORIO.md)
- [FASE-8.4-RELATORIO.md](FASE-8.4-RELATORIO.md)
- [FASE-8.5-RELATORIO.md](FASE-8.5-RELATORIO.md)
- [FECHAMENTO-DOMINANCIA-TIER-8.2-8.5.md](FECHAMENTO-DOMINANCIA-TIER-8.2-8.5.md)
- [FASE-8.7-RELATORIO.md](FASE-8.7-RELATORIO.md)
- [FASE-8.8-RELATORIO.md](FASE-8.8-RELATORIO.md)
- [FASE-9-LEVANTAMENTO-SABOR.md](FASE-9-LEVANTAMENTO-SABOR.md)
  (Fases 9.3 e 9.4 têm commit mas não relatório de fase dedicado —
  `ef57882` e `9b6b297`.)

## Entrega

1. Este documento de fechamento
2. Commit
