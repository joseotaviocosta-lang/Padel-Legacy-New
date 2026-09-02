# Fase 1.5, item 2 — Inventário de `list()` com limite numérico

> Só inventário — nenhuma correção aplicada aqui. Grep de todo
> `entities.*.list(sort, limiteNumérico)` em `src/`, filtrado para os casos
> onde a POPULAÇÃO REAL da entidade pode plausivelmente exceder o limite
> (população de referência: 994 `AthleteProfile` — 24 reais + 970
> procedurais —, 498 `TeamRanking` — 12 reais + 486 procedurais). Excluídos
> da tabela: paginação de UI claramente proposital (últimos N posts, últimas
> N partidas para um feed, últimos N torneios pra um calendário) e
> `src/lib/demoData.js` (seed de demonstração, não roda no loop de
> produção).

## Alto risco — sistema de população/progressão rodando sobre um recorte, não o todo

| Arquivo:linha | Sort | Limite | Sistema | Risco |
|---|---|---|---|---|
| `lib/athleteBehavior.js:154` | `-overall_rating` | **200** | `evolveAthletesMonthly` — a MESMA função que envelhece os atletas reais mensalmente (achado da Fase 1B) | **O maior achado desta lista.** Só os 200 melhores por `overall_rating` evoluem todo mês — **~794 dos 994 atletas (80%) nunca evoluem atributo nenhum.** Os reais (OVR 83-96) ficam dentro do corte e continuam evoluindo — mas a progressão de carreira de 4 em cada 5 bots do circuito está congelada por design não-intencional. |
| `game-core/aiPartnershipLifecycle.js:328,331,358` | `ranking_position` | 500 | `processAiPartnershipMarket` | Achado original da Fase 0.3. `ranking_position` não vem setado no seed dos reais (confirmado: 0/24 têm o campo no `worldSeed2025.json`) — item 1 desta mesma entrega mede se isso os exclui do corte em algum momento. |
| `game-core/circuitLifecycle.js:111` | `ranking_position` | 500 | `processWorldCircuit` — o sistema que DEFINE `ranking_position` toda semana | **Mesmo teto, mesmo campo, sistema diferente — e é circular**: este sistema lê `ranking_position` pra decidir quem processa, e é ele mesmo quem escreve `ranking_position` depois. Comentário já existente no código (linha ~114) admite que um teto anterior de 160-por-OVR "deixava posições antigas no restante da população" e foi só AUMENTADO pra 500, não removido — o mesmo problema estrutural, em escala maior. |
| `game-core/worldSimulationLifecycle.js:209,304` | `ranking_position` | 500 | `simulateWorldDay` (roda TODO DIA, até 80 atletas processados) | Terceiro sistema usando o mesmo campo truncado — se um atleta cai fora do corte de 500 aqui, sua atividade diária simplesmente não é simulada. |
| `game-core/worldMarketLifecycle.js:70,91` | `-overall_rating` | 500 | `initializeWorldMarket` | Reais seguros (maior OVR), mas ~494 procedurais nunca entram na inicialização do mercado mundial por este caminho. |
| `game-core/athletePersonalityLifecycle.js:101,134,216` | `-overall_rating` | 250 | `ensureAthleteIntelligenceProfiles` e funções irmãs (perfil de IA/personalidade) | Já usa `bulkUpdate` corretamente (comentário no código reconhece o custo de escrita individual — bom padrão, contraste com `aiPartnershipLifecycle.js`), mas ainda assim só 250/994 recebem perfil de inteligência garantido. |

## Risco médio — margem hoje, mas encolhendo com o crescimento normal da população

| Arquivo:linha | Sort | Limite | População atual | Observação |
|---|---|---|---|---|
| `gameplay/worldTour/WorldTourLifecycle.js:135` | `-world_ranking_points` | 1000 | 994 | Margem de só 6. `generateProspect` (`worldSimulationLifecycle.js`) cria +1 atleta procedural por mês — em menos de 1 ano de jogo este teto passa a truncar silenciosamente, sem nenhum aviso. |
| `game-core/circuitLifecycle.js:66` | `-ranking_points` | 500 | 498 (`TeamRanking`) | Margem de só 2, mesmo argumento acima (duplas de IA se formam e se dissolvem o tempo todo — o número de linhas de `TeamRanking` pode crescer). |
| `pages/Ranking.jsx:67`, `game-core/globalMarketLifecycle.js:99`, `lib/teamRanking.js:248` | `-ranking_points` | 500-600 | 498 | Mesma familia de risco — não são a mesma chamada, mas a mesma pressuposição (população de duplas cabe em 500-600) que já está perto do limite. |

## Baixo risco — truncamento intencional (amostra pequena/cosmética, ou exibição de UI)

| Arquivo:linha | Limite | Por quê é intencional |
|---|---|---|
| `game-core/world.js:4` (`tickWorldAfterMatch`) | 40, amostra 12 | Efeito cosmético de "mundo vivo" após a partida do jogador — não é um sistema de progressão, não precisa ver todo mundo. |
| `game-core/matchLifecycle.js:15` | 40 | Mesma família — notícia/flavor pós-partida, não progressão. |
| `game-core/circuitLifecycle.js:290` (`getCircuitSnapshot`) | 200 | Alimenta um snapshot/leaderboard de exibição — top-200 é um corte de UI razoável, ninguém rola até a posição 994 num ranking. |
| `game-core/worldMarketLifecycle.js:259` | 200 | Retorno de relatório mensal para exibição ("maiores movimentações do mercado") — mesma lógica. |
| `lib/athleteBehavior.js:270` (`getAthletes`) | 200 | Alimenta busca/enciclopédia de atletas — corte de UI. |
| `pages/*.jsx`, `lib/demoData.js`, `lib/journal.js`, `onboarding/tutorialEngine.js` | vários | Paginação de tela (feed, calendário, histórico recente) ou seed de demonstração — não fazem parte do loop de simulação diária/mensal. |

## Nota sobre `lib/athleteBehavior.js:154` (relacionamentos)

Não listado como alto risco por progressão, mas merece registro: `generateRelationships`
também usa o mesmo corte de 200 (`-overall_rating`) e monta relações por um laço
`others = profiles.filter(...)` sobre esse subconjunto — o corte aqui parece ser tanto
população quanto contenção de custo O(n²) (relacionamentos entre TODOS os pares de 994
atletas seria ~987 mil combinações). Registrado, não corrigido.

## Recomendação (não aplicada)

O padrão se repete: `ranking_position`/`overall_rating` como critério de corte, com um
número fixo escolhido para "caber a população atual" sem revisão quando a população
cresce. `evolveAthletesMonthly` (200) e o trio `ranking_position`=500
(`aiPartnershipLifecycle`/`circuitLifecycle`/`worldSimulationLifecycle`) são os candidatos
mais fortes a correção estrutural — mas qualquer mudança de teto nesses sistemas precisa
ser medida contra o perfilamento (aumentar o corte aumenta o `n` de sistemas que já
dominam o custo, achado da Fase 0.2). Fica para uma fase de correção dedicada; fora do
escopo de "só inventário" pedido aqui.
