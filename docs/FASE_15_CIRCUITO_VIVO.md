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

## Relatório final — 110 respostas obrigatórias

### Auditoria

1. Bots evoluíam por três rotinas concorrentes: evolução mensal, simulação mundial diária e circuito semanal.
2. Havia OVR em três motores, fase em duas fórmulas, lesão em dois modelos, pontos em World Tour/circuito/partidas invisíveis e duplas em `Partnership` versus `ai_partner_*`.
3. `AthleteProfile` virou a carreira canônica, `Partnership` a dupla canônica, Tournament/World Tour a origem de resultados/pontos, `CareerMessage` a comunicação e `WorldEvent` a narrativa.
4. O contrato chegava a D0, virava `vencido` e era encerrado depois da carência sem aviso visível; o `partner_id` era limpo.
5. O vencimento era previsto; o desaparecimento silencioso era uma falha de UX/lifecycle incompleto.
6. Sim. O padrão era e continua sendo 60 dias.
7. D0 marcava `vencido`; sem decisão, D+8 encerra e libera ambos. Uma separação planejada encerra em D+1.
8. Não havia aviso de contrato. Agora há D-15, D-7, D-3 e D-1 idempotentes.
9. Existia uma ação de renovação, mas era unilateral.
10. Não. Agora a IA aceita, aceita com condições, espera ou recusa.
11. Parcialmente: ofertas iniciais existiam e uma tentativa mensal recente era insuficiente.
12. O gerador parava após qualquer oferta anterior, não rodava emparelhado e usava dedupe/pool que suprimiam novas oportunidades.

### Carreira dos bots

13. `AthleteProfile`, com resultados recentes, H2H, fase, potencial, auge, melhores marcas e estado de mercado.
14. Sim; o schema ganhou campos opcionais e retrocompatíveis, sem exigir backfill inventado.
15. `prospect`, `rising`, `prime`, `established`, `declining` e `veteran`, com labels legados projetados para a UI antiga.
16. Por idade real/data de nascimento, `peak_age`, potencial, OVR, tendência e limites individuais.
17. Sim, como teto individual persistido/derivado.
18. Controla espaço de crescimento; não garante que todo atleta alcance o teto nem impõe curva idêntica.
19. Uma vez por mês, determinístico e idempotente, limitado a −1/0/+1 por mês; os atributos acompanham em passos pequenos.
20. 27,87 anos na simulação 100×10.
21. Sim.
22. Após o auge, idade, potencial, disciplina e resultados reduzem gradualmente a tendência; não há salto semanal artificial.
23. Sim.
24. Derivada dos resultados recentes reais, com fallback conservador para saves sem histórico.
25. Afeta seleção/desempenho do World Tour; o motor ponto a ponto não foi alterado.

### Duplas

26. NPCs usavam apenas campos `ai_partner_*` em `AthleteProfile`, formados mensalmente.
27. Toda dupla ativa/histórica agora possui `Partnership`; os campos antigos são apenas projeção de compatibilidade.
28. `Partnership`.
29. Sim; propostas espontâneas continuam possíveis enquanto emparelhado, sem romper automaticamente o contrato.
30. Sim; uma sondagem real cria `PartnerOffer`, atualiza a parceria e gera comunicação.
31. Sim, no fim do contrato, por aposentadoria ou por decisão bilateral/mercado; nunca por desaparecimento silencioso.
32. Química, resultados, moral, estabilidade, ranking relativo, trajetória, termos e oportunidade concreta.
33. Sim.
34. O mercado reconcilia mensalmente; contratos duram 210–360 dias quando renovados e têm estabilidade mínima de 120 dias fora de causas definitivas.
35. Estabilidade mínima, chance seedada, contrato, química/forma e histórico impedem roleta mensal.
36. Sim; reaproveita `evaluatePartnerCompatibility` e a preferência de lado existente.
37. Sim; ranking e nível/OVR entram em fit, mercado e decisão.
38. Sim; início, fim, motivo, renovações e eventos ficam em `Partnership.history`.

### Contrato

39. D-15 gera aviso leve e abre renovação.
40. D-7 reforça que é hora de decidir.
41. D-3 vira pendência de alta prioridade.
42. D-1 pede decisão final.
43. O jogador propõe duração, divisão e salário; a IA calcula interesse e pode impor condições.
44. Aceite grava novo fim, termos, contador, moral, histórico e resolve mensagens pendentes.
45. Recusa marca `nao_renovara`, preserva o contrato até o fim e comunica explicitamente.
46. Pode ser rescisão imediata com multa, fim agendado ou encerramento após carência; o histórico é preservado.
47. O jogador fica livre, recebe ofertas mensais e tem ação para buscar parceiro.
48. A Home existente mostra "Sem dupla" e direciona para `/partners?view=offers`.
49. Todos os eventos pessoais usam `CareerMessage`/Central de Comunicações.
50. O sino consome a mesma fonte, com dedupe por chave de contexto e resolução de pendências.
51. Avisos/sondagens abrem `/partners?view=contract`; fim de dupla abre `/partners?view=offers`.

### Mundo

52. Rivalidade bot×bot só nasce de H2H factual com ao menos três encontros.
53. Sim; finalistas do World Tour alimentam H2H dos quatro atletas da partida de duplas.
54. Usa a escada única 500/250/100/50/30/20/10/5/3/1, com no máximo três histórias de marco por semana.
55. Aproximadamente 2,06 novos ocupantes distintos de Top 10 por temporada no horizonte 100×10.
56. Aproximadamente 0,63 novos #1 por temporada.
57. Havia anúncio e uma conexão recente de aposentadoria, mas não um ciclo completo coerente.
58. Aposentadoria agora encerra carreira/mercado/parceria, preserva histórico e cria vaga de reposição.
59. 38,49 anos.
60. Sim; sem reposição a população caía de 180 para cerca de 124 no modelo auditado.
61. 7,25 prospectos por temporada, em média, apenas para repor saídas.
62. Sim; 180 iniciais e 176,73 finais após dez temporadas (−1,82%).

### Simulação

63. 100 carreiras×3: 2,49 parceiros/carreira, 271 renovações, 149 fins e 20 saídas do parceiro.
64. 1,17 proposta por temporada para o jogador.
65. 64,52% entre decisões que terminaram em renovação ou fim (271/420).
66. 20 saídas em 100 carreiras de três temporadas.
67. 74,4 dias sem dupla, em média.
68. 100 mundos×10: 75,74 aposentados, 72,47 gerados e população final 176,73, em média.
69. 13,97 meses.
70. Aproximadamente 0,50 troca por temporada (1,49 trocas por carreira em três temporadas).
71. 22,5%.
72. 41,25%.
73. 30,47 anos.
74. 27,98 anos.
75. 30,30 anos.
76. 27,87 anos.
77. 38,49 anos.
78. 12,76 histórias mundiais por temporada.

### Integridade

79. Compatíveis: campos novos são opcionais, aliases antigos continuam e migração de duplas é preguiçosa.
80. Não foi inventado: saves sem evidência recebem fallback/estado atual, não passado fictício.
81. Sim; regras seedadas e teste save/load passaram.
82. Sim; chaves de mês/data/entidade e flags `world_tour_resolved` evitam reaplicação.
83. 5,79 ms no benchmark puro de 1.000 atletas; ranking existente ficou em 30 ms.
84. Nenhum contrato de UI/layout global da M4.3 foi reformulado; apenas PartnerHub e Atletas receberam informação contextual.
85. Sim; o teste M3.7.1 passou 20 gates e confirmou um commit físico por dia.
86. Sim; engine ponto a ponto, RNG de partida, playback e táticas não foram modificados.
87. Sim; pontos invisíveis semanais foram removidos, aliases sincronizados e o teste de ranking passou 21 gates.
88. Sim; estrutura/calendário/checkpoint não mudaram. World Tour resolve apenas eventos marcados e credita a dupla canônica.

### UI e narrativa

89. Perfil mostra ranking atual/melhor, títulos, forma, parceiro/mercado e quatro resultados recentes.
90. Ganhou busca e filtros úteis de Top 100, ascensão, elite e veteranos, usando ranking canônico.
91. Recebe resultados de torneio, marcos, mudanças de dupla, aposentadorias e promessas sem notícia diária excessiva.
92. Histórias relevantes continuam em `WorldEvent` e podem ser promovidas pela infraestrutura de imprensa existente.
93. Avisos contratuais e decisões usam o sino existente; não foi criado sistema paralelo.
94. O relatório anual existente consome ranking, MVP, #1, títulos e linha mensal; dados mundiais agora têm origem factual mais consistente.
95. Ex-parceiros ficam no histórico; rival só é reconhecido após H2H oficial recorrente.

### Técnico

96. Modificados: `.gitignore`, 3 schemas Base44, 2 componentes de atleta, 7 lifecycles/game-core, World Tour, 4 libs, 2 páginas e `package.json`.
97. Novos: este documento, `livingCircuitRules.js`, dois scripts de teste e `reports/fase15-simulation.json`.
98. Criados: `test:living-partnership-market-phase15` e dez suites `test:world-*` sobre progressão, duplas, fases, aposentadoria, geração, ranking, história, idempotência, save/load e performance.
99. O simulador criado foi calibrado para reposição de 90%; testes legados não foram alterados.
100. Passaram lint, build, contrato F15, todas as suites mundo F15, mundo vivo, mercado, parcerias, carreira, rivalidades, comunicações, ranking, atomicidade, M3.7.1 e Atletas. `test:notification-deep-links` manteve uma falha preexistente por `scrollIntoView` em `Missions.jsx`, fora do escopo.
101. `npm run lint`: PASS.
102. Typecheck: antes 2.055 erros/323 arquivos; depois 2.030/320; delta −25 erros e −3 arquivos. Continua exit 2 por dívida preexistente.
103. `npm run build`: PASS; `dist/index.html` SHA-256 `3CFCDAF200EE54FCAB334A37219D5577C90FB56D4F308713F3FF5BBADC26F8F9`.
104. `npm run app:build`: compilou o `.exe`; o passo MSI falhou no WiX porque o serviço Windows Installer do ambiente estava inacessível.
105. EXE novo: `src-tauri/target/release/padel-legacy.exe`, 13.170.176 bytes, 2026-08-21 17:12:08 -03:00, SHA-256 `34DD8EE96A31008057AE466EBEEB4FDC12E9F5113F77A21F54D46F7A68E31CC1`. MSI novo: não, por `LGHT0217/LGHT0216` ambiental.
106. `npm run android:build`: PASS após apontar o cache Gradle para local gravável e baixar Gradle 8.14.3 autorizado.
107. APK universal release sem assinatura foi gerado; uma cópia `qa-signed` foi zipaligned, assinada com certificado Android Debug local e validada em v2/v3. Não é assinatura de produção.
108. APK QA SHA-256 `016C27B37D459CF90E721C85FF6F1F8BFD8FF63ED22F42CE345D76EB57495BB6`; AAB SHA-256 `436A24C56A5457358F78FE2D125EF6E57D91C93ACB9C8BFD480B2154E7D94604`.
109. QA física: instalar/abrir APK em aparelho, validar teclado/deep-links/sino, atravessar D-15→D+8, renovar/recusar, avançar meses com propostas, conferir torneio de NPCs e testar save antigo. Para distribuição, assinar com keystore de produção e testar o MSI em Windows Installer funcional.
110. Veredito: Fase 15 entregue e pronta para QA real, com circuito/duplas persistentes e determinísticos, builds web/EXE/Android produzidos e dois bloqueios externos transparentes (MSI do host e assinatura de produção ausente). Não iniciar fase seguinte antes do QA.

## Invariantes confirmadas

- Gameplay esportivo, RNG de partida, economia, treino, progressão do jogador, tutorial, conquistas, formato/calendário dos torneios e checkpoint/resume não foram alterados.
- A persistência M3.7 manteve uma transação/commit por dia.
- Nenhum deploy, push ou publicação foi executado.
