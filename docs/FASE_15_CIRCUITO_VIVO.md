# Fase 15 — auditoria pré-implementação

Data da auditoria: 2026-08-21. Esta seção registra o estado encontrado **antes** da consolidação da Fase 15. O repositório é offline/Tauri; as entidades Base44 funcionam como contrato de dados, enquanto a persistência efetiva passa por `CareerRepository` e pela transação M3.7.

## Veredito do caso de 60 dias

**Era um sistema parcialmente implementado, com UX incompleta.**

- `PARTNER_LOCK_DAYS`, a oferta inicial e `startPartnership` usam 60 dias por padrão.
- `processPartnerDay` já marcava o contrato como `vencido` em D0 e, após sete dias de carência, encerrava a `Partnership` e limpava `PlayerProfile.partner_id`.
- No comportamento que originou o relato não havia aviso de D-15/D-7/D-3/D-1, decisão pendente perceptível nem mensagem de encerramento. O resultado observável era “a dupla desapareceu”.
- Havia uma função de renovação e uma tela de contrato, mas a renovação era unilateral: nenhuma IA aceitava, esperava ou recusava.
- Não havia geração periódica de `PartnerOffer`: `ensureInitialPartnerOffers` só rodava na entrada da tela, recusava-se a gerar novamente quando já existia qualquer oferta e também recusava-se a rodar com `partner_id`.

## Mapa da arquitetura encontrada — 30 respostas

1. Bots evoluíam por `evolveAthletesMonthly`, `simulateWorldDay` e `processCircuitLifeWeek`.
2. OVR mudava nos três motores acima.
3. Atributos mudavam mensalmente em `evolveAthletesMonthly`.
4. Idade influenciava fase, crescimento, decadência e aposentadoria. Foi encontrado um bug histórico: bots envelheciam um ano por mês; o HEAD auditado já contém a correção para incrementar apenas na virada anual.
5. Auge existia via `peak_age` e `getCareerPhase`.
6. Decadência existia mensalmente por atributos e diariamente por uma chance de `overallDelta = -1` após 35 anos.
7. Aposentadoria tinha anúncio semanal; a aposentadoria automática definitiva só foi conectada recentemente à virada de ano.
8. `generateProspect` podia criar um atleta por mês, com chance determinística de 42%.
9. Duplas de bots mudavam mensalmente em `aiPartnershipLifecycle`.
10. A decisão usava química, forma, meses juntos, compatibilidade, ranking e hash seedável.
11. Não. `Partnership` representava apenas jogador↔NPC; bots usavam campos `ai_partner_*` em `AthleteProfile`.
12. Jogador preservava registros `Partnership`; bots preservavam apenas contador/data denormalizados e `WorldEvent`, insuficientes para reconstruir pares históricos.
13. Ranking influenciava categoria, mercado, compatibilidade e estratégia da IA.
14. Resultados sintéticos semanais influenciavam ranking e estatísticas. Resultados do World Tour também concediam pontos, mas não alimentavam de modo consistente forma, títulos e histórico do atleta.
15. Para atletas do mundo foram encontrados `resolveCompletedWorldTourEvents`, `processWorldCircuit`, `world.js` e patches de `matchLifecycle`; para duplas, `tournamentLifecycle`, `matchLifecycle`, `teamRanking` e a simulação semanal.
16. Sim. `resolveCompletedWorldTourEvents` e `processWorldCircuit` podiam premiar a mesma semana por pipelines diferentes; `ranking_points`, `world_ranking_points`, `rank_points` e `world_ranking` também eram usados de forma inconsistente.
17. Forma e reputação existiam, mas a forma era majoritariamente drift aleatório, não uma derivação canônica dos resultados recentes.
18. Sim, em dois modelos: `current_injury/injury_recovery_days` mensal e `injured_until` diário para bots.
19. Existiam relações bot×bot geradas por proximidade de OVR, inclusive com `Math.random`; isso não era uma rivalidade canônica baseada em H2H.
20. `career_titles` era preservado pelo circuito sintético; campeões reais do World Tour ficavam no torneio/notícia, mas nem sempre no histórico do atleta.
21. Sim, o contrato inicial padrão era 60 dias.
22. Em D0 virava `vencido`; depois de D+7 era encerrado e o jogador ficava livre.
23. Sim, `renewPartnerContract` e UI existiam.
24. Não. A função renovava sempre que o jogador confirmava.
25. No sistema original, não. O HEAD auditado já continha uma tentativa mensal recente, ainda incompleta.
26. A tentativa mensal roda em `processGameStateDay`, na virada de mês, dentro da transação do avanço diário.
27. Antes, ofertas eram apenas iniciais. Na tentativa recente, a baixa chance, o pool restrito a `market_status: livre`, o pareamento mensal dos NPCs e IDs de oferta estáveis por candidato ainda podiam suprimir quase todas as propostas futuras.
28. Não. Um campo chamado `partner_saw_better_opportunity` era preenchido quando **o jogador** recebia oferta, o que não representa uma proposta real ao parceiro.
29. Sim, mas fora de `Partnership`, sem contrato canônico e com churn mensal possível.
30. Só parcialmente: há ranking history, campeões e eventos, mas faltavam pares históricos, resultados completos/H2H e uma fonte única de pontos.

## Classificação A–E

| Requisito | Classe | Evidência/decisão |
| --- | --- | --- |
| Persistência transacional diária | A | `dayAdvanceCoordinator` envolve core + GameState em uma transação M3.7. |
| Communications e deep-links | A/B | Infraestrutura canônica existe; eventos de parceria estavam incompletos. |
| Histórico da dupla do jogador | A | `Partnership` preserva início, término, química e resultados compartilhados. |
| Lifecycle explícito do contrato | B/D | Vencimento e carência existiam; alertas/negociação/IA não formavam um fluxo completo. |
| Propostas espontâneas | B/D | Tentativa mensal recente, mas sem mercado do parceiro e com deduplicação inadequada. |
| Carreira de NPC | C | Três motores alteravam OVR; dois modelos de lesão e duas fórmulas de fase. |
| Ranking mundial | C | World Tour e circuito sintético concediam pontos; aliases divergentes. |
| Duplas NPC | C | Campos `ai_partner_*` paralelos à entidade `Partnership`. |
| Forma recente | C | Vários campos/drifts; faltava derivação única dos resultados. |
| Rivalidade bot×bot | B/C | Relações existiam, mas não eram H2H factual. |
| Aposentadoria | B/D | Anúncio existia; saída definitiva só foi conectada recentemente. |
| Nova geração | B | Geração mensal existe; sua necessidade e equilíbrio ainda precisam de simulação longa. |
| Perfil do atleta 2.0 | B | Modal mostra OVR/fase/atributos, mas faltam melhor ranking, títulos, parceiro atual e trajetória factual. |
| Retrospectiva mundial | B | Relatórios existem, mas não consomem todas as evidências mundiais pedidas. |
| Partnership canônica para todo o mundo | E | A entidade existe e será ampliada; não será criada uma entidade paralela. |
| IA de renovação/saída do parceiro | E | Não existia decisão bilateral real. |

## Fontes canônicas escolhidas

- **Parcerias:** `Partnership`, para jogador e NPCs. Campos `ai_partner_*` permanecem apenas como projeção compatível para saves/UI antigos.
- **Atleta/carreira:** `AthleteProfile`; fase, tendência e forma são derivadas sempre que possível.
- **Resultados e pontos:** torneios/World Tour são a origem de resultados e prêmios; o lifecycle semanal ordena e narra, mas não deve conceder uma segunda premiação paralela.
- **Mensagens pessoais:** `CareerMessage`/Communications e o sino existente.
- **Narrativa mundial:** `WorldEvent`, promovendo para imprensa apenas histórias relevantes.
- **Aleatoriedade:** hash seedável por save/data/entidade; nenhum novo `Math.random` em lifecycle persistente.

## Baselines reais

- `npm run typecheck`: exit 2, **2.055** linhas `error TS...` em **323** arquivos antes da Fase 15. Meta: delta líquido zero.
- Worktree inicial: apenas `.claude/` não rastreado, preservado e fora do escopo.
- `npx.cmd base44 whoami` não concluiu no ambiente e foi interrompido; nenhum comando remoto, push ou deploy será executado nesta fase.

