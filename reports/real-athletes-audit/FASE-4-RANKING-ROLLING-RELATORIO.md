# Fase 4 — Ranking rolling de 52 semanas

> Pré-requisito: Fase 4.2 entregue (paridade rastreada, regime-check de 5
> temporadas rodado pela primeira vez, registro do #18 corrigido). Ver
> [FASE-4.2-RELATORIO.md](FASE-4.2-RELATORIO.md). Este relatório fecha a
> Fase 4 anunciada ali — substituir o acumulador vitalício de ranking por
> uma janela móvel, como o circuito real.

## 1 — Verificação de intenção do carryover de 20% (condição do pedido)

Investigado antes de remover, como pedido. `finalizeSeason`
(`seasonLifecycle.js`) e `applyTeamRankingSeasonCarryover` (`teamRanking.js`)
cortavam 20% do Circuito do jogador uma vez por ano, desde o commit `5fe7f68`
("v36" — mensagem automática de snapshot, sem descrição). Nenhum comentário
de código explica o corte; a única menção em documentação
(`docs/BETA_READINESS_PHASE10.md`, §15) é uma confirmação puramente
funcional ("funciona e é idempotente"), não uma justificativa de design; o
teste dedicado (`test:ranking-carryover-v32`) era uma checagem estática de
string, não um teste de comportamento.

**Conclusão: resíduo, não decisão de balanceamento registrada — removido,
não substituído.** O jogo já tinha o mecanismo real de "temporada nova"
(`race_points`, zerado no ano civil) — o corte de 20% sobre o CIRCUITO, que
por definição nunca deveria resetar, era redundante com ele, nunca
complementar.

Efeito colateral corrigido: o bônus de prêmios de fim de temporada
(`totals.rankPoints`) deixou de ser somado direto ao total — vira um
resultado datado como qualquer outro, sujeito à mesma janela de 52 semanas.
Sem isso, remover o corte também apagaria em silêncio a concessão do
prêmio.

## 2 — Mecânica implementada

Nova coleção `AthleteRankingResult` (`src/game-core/rankingWindow.js`) — um
resultado datado por (atleta, torneio); nunca no documento clonado a cada
escrita, mesmo precedente do `ranking_history` (Fase 4.0). O total de
ranking passa a ser a soma dos **22 melhores resultados** dentro de **364
dias**, recalculado a partir da coleção, nunca mais incrementado.

Três pontos de escrita, cada um com feedback imediato só para quem foi
tocado:

1. `WorldTourLifecycle.js` — torneios de IA/bots resolvidos.
2. `tournamentLifecycle.js` — torneio do próprio jogador. Corrigido junto:
   a `TeamRanking` da dupla do jogador tinha o MESMO bug do carryover, um
   nível abaixo (incrementava pra sempre) — agora recalcula por média dos
   dois totais rolling atuais, igual às duplas de IA.
3. `circuitLifecycle.js:processWorldCircuit` — a ÚNICA passada semanal
   sobre a população inteira, e por isso o ÚNICO lugar que também PODA
   resultados expirados (decisão do item 3, abaixo). O jogador entra no
   mesmo mecanismo aqui (`PlayerProfile` é coleção separada de
   `AthleteProfile`, tratado à parte, sem consulta extra).

Race (ano civil) não muda — confirmado que `EntryManager.js:resolveEntryRank`
nunca lê `race_points`, então a elegibilidade por tier continua lendo só o
Circuito.

## 3 — Política de expiração e migração (aprovadas antes de aplicar)

**Expiração: apagar, não agregar.** `career_wins`/`career_losses`/
`career_titles`/`career_titles_by_tier` (vitalícios) e `recent_results`
(últimos 12) já preservam tudo que qualquer consumidor lê hoje — confirmado
por grep, nenhum leitor de "todos os resultados datados" existe. Agregar
numa rotina de ~30 mil expirações/ano recriaria o problema do achado #18;
`AthleteCareerLegacy` agrega só no evento terminal e raro (aposentadoria),
não é o mesmo caso.

**Migração: âncora sintética.** Uma linha (`buildLegacySeedRow`) gravada no
primeiro toque pós-migração, valendo o total vitalício CHEIO, datada nesse
momento — `finish: 'legacy_seed'`, `is_legacy_seed: true`,
`tournament_id: null` (distinguível pra sempre, não só pelo enum). Ocupa 1
dos 22 slots como qualquer resultado real: um atleta ativo pode descartá-la
antes das 52 semanas (intencional); um atleta inativo a mantém até ela
expirar e ser PODADA, 364 dias depois. Zero reset visível no dia da
migração — confirmado por teste.

## 4 — Verificação direta dos efeitos de jogo (item 4C)

`scripts/test-ranking-rolling-window-fase4.mjs`, novo, **76/76 gates PASS**.
Os dois gates críticos (4C.1 e 4C.3 — "pare e reporte se estranho") não
dispararam parada:

- **4C.1**: um real do top 10 forçado a não jogar por 52 semanas mantém o
  total cheio até a semana 52, cai a **zero** e sai do top 20 exatamente na
  semana 54 (>364 dias) quando a âncora expira — confirma recomputação por
  janela, não decaimento incremental.
- **4C.3**: elegibilidade móvel nos dois sentidos — Platinum (2000 pts)
  cruza pra Masters (2900 pts) ao pontuar; Masters (2600 pts, salvo
  pré-migração) cai pra Bronze quando a âncora expira sem novo resultado.
  Nenhum ranking fantasma em nenhuma direção.
- **4C.4**: dado de "defesa de pontos" existe e é consultável
  (`AthleteRankingResult.filter({athlete_id})` + `isResultExpired`) — UI
  não implementada, registrado como item pendente.

## 5 — Custo do recálculo semanal

| Medição | Antes (Fase 4.1) | Depois (Fase 4) |
|---|---|---|
| 1 temporada (900+100, `official-900-100-s1`) | 5min57,9s | 6min27s (+8,1%) |
| 5 temporadas (regime-check completo) | ~30min (projeção) | **48min55s** (medido) |

O custo por temporada cresce mais do que a curva de 1,70× já registrada
(achado #18) sozinha explicaria: laço diário da temporada 1 deste run
≈366,7s, temporada 3 ≈701,1s (quase o dobro), temporadas 4-5 recuam um
pouco (625,0s/669,4s) sem voltar ao patamar inicial. Atribuído à leitura de
`AthleteRankingResult` inteira (1×/semana + 1×/torneio resolvido) escalar
com o tamanho da própria coleção, que cresce ao longo de múltiplas
temporadas mesmo com a janela de 52 semanas limitando o tamanho por
atleta — um fator de custo novo, não presente antes desta fase. Não é
motivo de alarme (heap seguiu longe do limite padrão do Node), mas é custo
real, registrado como tal.

## 6 — Regime-check de 5 temporadas, comparado com `5b32e23` (achado #28)

Mesma seed/escala oficial (`official-900-100-s1`, 900+100).

**Dominância do Top 20 (reais) — a curva caiu mais e por motivo mais claro,
como o item 4C.2 previa:**

| Temporada | Antes (acumulador vitalício) | Depois (rolling) |
|---|---|---|
| 2026 | 20/20 (100%) | 20/20 (100%) |
| 2027 | 20/20 (100%) | 17/20 (85%) |
| 2028 | 19/20 (95%) | 15/20 (75%) |
| 2029 | 16/20 (80%) | 10/20 (50%) |
| 2030 | 15/20 (75%) | 10/20 (50%) |

A tabela "Duplas históricas" (`season-tier-table.md`) confirma o mesmo
padrão por outra métrica: as 3 duplas de elite mais fortes (Coello&Tapia,
Galán&Chingotto, Lebrón&Augsburger) seguem 100% pareadas nas 5 temporadas
inteiras — inalterado pela mudança de ranking, consistente com o topo
persistindo por mérito/narrativa — enquanto pares do meio da tabela
colapsam a 0% mais cedo que antes (vários já na temporada 2).

**Heap por temporada**: 762,3 · 832,7 · 888,4 · 894,2 · 932,5MB — mais alto
que o achado #28 em toda temporada, sem platô claro até a temporada 5
(ainda subindo, desacelerando). Nenhum OOM ocorreu; folga até o limite
padrão do Node continua grande.

**Composição de títulos cumulativa (400 finais)**: 381 100%-reais, 17
100%-bots, 2 mistas (era 372/24/4) — reais venceram MAIS títulos, não
menos, apesar do ranking cair mais rápido. Confirma que ranking (atividade
recente, sujeita a decaimento) e força competitiva (`overall_rating`,
usado pelo motor de partida, nunca por pontos de ranking) são coisas
diferentes — o mecanismo novo muda quem aparece no topo da TABELA sem
mudar quem VENCE as partidas.

**Rotatividade dos reais ausentes — mudou de 0% para 3,9% de interseção,
registrado para a Fase 5, não escondido.** Por temporada: 9, 14, 24, 23, 21
(união de 51 distintos). Interseção (ausentes em TODAS as 5 temporadas): 2
reais — Pablo García (OVR 82) e Eduardo Agustín Torre (OVR 79). Não são os
reais de OVR mais baixo da base (checado no registro), então não é
simplesmente "pior do elenco = excluído" — causa mais provável é um efeito
dinâmico da seleção de torneio pela IA interagindo com um ranking agora
sujeito a queda, não investigada a fundo aqui (fora do escopo desta
entrega). Pequena (2/100), mas real — exatamente o tipo de dado que o
enunciado desta fase já antecipava que a Fase 5 (agenda dos reais)
precisaria herdar.

## 7 — Gap conhecido e aceito

O `TeamRanking` da dupla do PRÓPRIO jogador só é recalculado quando ele
termina um torneio — ao contrário de duplas de IA (recalculadas toda
semana), não decai passivamente se ele parar de jogar. Afeta só essa única
linha (aba Duplas), não o "topo vitalício" que esta fase ataca. Registrado
como conhecido e aceito, não como pendência.

## 8 — Suíte, lint, build, Tauri

- `npm run lint` — limpo, sem avisos, em todo o repositório.
- `npm run build` — OK.
- Nenhum arquivo de `src-tauri/` tocado — `test:dev-server-config` aprovado.
- Suíte de regressão completa (14 scripts) + `test:athlete-hot-fields-fase4`
  + `test:rerank-topn-equivalence-fase4` + `test:ranking-carryover-v32`
  (reescrito para testar a ausência do carryover) +
  `test:ranking-rolling-window-fase4` (novo) — **18/18 com exit 0, sem
  nenhuma linha de FAIL/GATE FALHOU.**

---

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | Verificação de intenção do carryover, antes de remover | ✅ nenhum registro de intenção encontrado — resíduo, removido (não substituído) |
| 2 | Rolling window implementado, 4 efeitos do 4C verificados por medição | ✅ 76/76 gates PASS, os dois gates críticos (4C.1/4C.3) sem comportamento estranho |
| 3 | Teste do item 6 (top 10 inativo sai do top 20) | ✅ explícito, confirmado — cai a zero e sai do top 20 exatamente na expiração da âncora |
| 4 | Custo do recálculo semanal, antes e depois | ✅ +8,1% por temporada isolada; 48min55s para 5 temporadas (mais que a projeção ingênua, custo real registrado) |
| 5 | Regime-check de 5 temporadas comparado com `5b32e23` | ✅ dominância cai mais (100%→50% vs. 100%→75%), heap mais alto mas sem OOM, rotatividade passou de 0% a 3,9% de exclusão (registrado para a Fase 5) |
| 6 | Suíte verde, lint, build, Tauri OK, commit | ✅ |

**Resumo executivo**: o acumulador vitalício de ranking — a mecânica que
fazia a escada de tiers da Fase 3 não significar nada de verdade — está
substituído por uma janela móvel real, verificada por teste direto (não
por inferência) nos dois pontos que definiam se a mecânica estava certa.
O custo subiu, mas de forma medida e tolerável, não presumida. A curva de
dominância do Top 20 agora cai de forma mais acentuada e por um motivo
mais claro — atividade recente, não idade sozinha — exatamente o efeito
que esta fase existia para produzir. Um resultado novo e não previsto (2%
de exclusão permanente de reais, era 0%) fica registrado explicitamente
para a Fase 5, sem bloquear o fechamento desta.
