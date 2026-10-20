# Fase 5.32-B — Redesign de Mundo / Circuito Mundial

Branch `integracao/cloud-6o` · base `20023c8` (commit da 5.32-A/A.1) · sem commit da 5.32-B (aguardando validação).

## 1. Escopo e arquivos

| Arquivo | Tipo | O que mudou |
|---|---|---|
| `src/pages/WorldHub.jsx` | produção (UI) | página `/world` reorganizada (destaque → líderes → grandes eventos → notícias → explorar) |
| `src/lib/worldCircuitDisplay.js` | produção (novo, puro) | seletores de apresentação; não lê storage, não calcula pontos/posições |
| `scripts/test-world-circuit-v532b.mjs` | teste (novo) | 69 verificações comportamentais (SSR + mundo real em memória + saves LOCAL-8A) |
| `scripts/test-world-mobile-containment-v532b.mjs` | teste (novo) | 162 verificações no Chrome real (6 viewports × 2 carreiras + navegação) |
| `reports/ui-redesign-532/world/**` | evidências | capturas, medições, ferramentas, este relatório |

Motor, regras, persistência, formato de save, Android e autoridades de ranking: **intocados** (`git diff` de `src/` = só os 2 arquivos acima; o novo módulo é importado apenas pelo WorldHub).

## 2. Auditoria do Mundo antes

- Rota principal `/world` → `WorldHub` (item "Mundo" da navegação, atalho da Home e passo `visit_world` do tutorial). Subáreas próprias: `/world/circuit` (Notícias/Circuito/Imprensa/Comunidade) e `/world/directory` (Atletas/Clubes/Países) — não alteradas.
- Fonte única de dados da tela: `getLivingWorldSnapshot(profile, 80)` (WorldEvent). **Nenhum** ranking, torneio, atleta ou dupla era lido.
- Estrutura: PageHeader ("O mundo não espera você"), 4 StatCards de contagem (80 eventos / 15 circuito / 2 mercado / "Atualizado"), barra de 4 abas (Hoje/Circuito/Mercado/História), e na aba Hoje: boletim + "Agora no circuito" + 5 grupos de notícias.
- Primeira dobra a 390px: cabeçalho, contadores e abas; o primeiro conteúdo esportivo começava em **y=796** (atrás da barra inferior fixa, que começa em 779).

## 3. Mundo depois

1. **Cabeçalho compacto** — "Circuito mundial", temporada/data e "Atualizar" na linha da data (no canto direito ele ficava sob a pilha de atalhos flutuantes do app).
2. **Destaque do circuito** (um só CTA primário), por prioridade, só com fatos:
   título de grande evento nos últimos 21 dias → grande evento em andamento → número 1 do mundo → próximo grande evento → estado vazio com exploração.
3. **Líderes do circuito** — 3 cartões (Mundial, Duplas, Race {ano}), cada um com o nº 1 em destaque e o 2º/3º; o cartão inteiro leva à view certa do Ranking.
4. **Grandes eventos** (Platinum+) — Próximos (até 3: data, tier, local, "Ao vivo"/"Inscrições"/"Em N dias") e Campeões recentes (até 3 duplas campeãs). Cada linha abre o torneio (`/tournaments?tournament=<id>`).
5. **Notícias do circuito** — as mesmas 4 áreas de antes (Hoje/Circuito/Mercado/História), agora abaixo do conteúdo esportivo; boletim recolhido em 4 linhas com "Ler boletim completo"; grupos com 3 linhas; link para a Central do circuito.
6. **Explorar o circuito** — 6 atalhos para rotas reais: Ranking, Race, Duplas, Calendário, Atletas, História.

## 4. Autoridades de dados

| Informação | Autoridade | Observação |
|---|---|---|
| Líder e top 3 Mundial | `buildWorldRankingSnapshot` (ordem do snapshot) | idêntico ao Ranking 5.32-A (testado: R1, A1.1, A10.1) |
| Race | `snapshot.entries[].racePoints`, mesma ordenação da escada da Race | só quem pontuou; sem mistura com pontos World (S4/S5) |
| Duplas | `getTeamRankings` (`ranking_display_position`, `ranking_points`) | leitura de 50 linhas: as posições do topo são iguais às da população inteira (A1.2/A10.2 comparam com 5000) |
| Dupla ainda junta? | `ai_partner_id` mútuo + nenhum aposentado (a fonte que o motor de IA usa); dupla do jogador pela Partnership ativa (regra do Ranking) | sem como confirmar → nada é dito |
| Próximos eventos | `Tournament` + `isSelectableTournament`/janela de inscrição (`nextEventAuthority`) | nenhum evento criado/alterado |
| Campeões | `Tournament.champion_athlete_ids/names` gravados pelo settlement (LOCAL-7E) | nunca deduzido de notícia ou nome |
| Notícias | `getLivingWorldSnapshot` | inalterado |

**Achado durante a fase:** a primeira versão usava a linha de `Partnership 'ativa'` para dizer se a dupla ainda joga junta. Numa carreira nova as duplas reais semeadas (Coello/Tapia, Galán/Chingotto…) existem só no atleta (`ai_partner_id`); a linha de Partnership nasce depois. A tela teria marcado a dupla nº 1 do mundo como "Parceria encerrada". Corrigido para a fonte do motor; a Partnership ficou como testemunha independente nos saves longos (A1.5/A10.5: concordância total).

## 5. Divergência de posições (717/994)

- Mundo antes não exibia posição nenhuma; agora toda posição exibida vem do snapshot (a mesma autoridade do Ranking). O campo `ranking_position` gravado pelo circuito **não é lido** pela tela.
- Medido no topo 3: o `ranking_position` gravado diverge da posição exibida em 1/3 dos casos tanto na temporada 1 quanto na 10 (o Mundo segue o Ranking, não o campo gravado).
- Notícias antigas do Universo Vivo citam posições no texto ("Com a posição #N…") — texto histórico datado, gerado pelo motor; não foi alterado.
- Nada persistido, nenhuma sincronização ou migração. A divergência segue registrada para investigação funcional separada.

## 6. Medições (390×844; antes → depois)

| Estado | Altura | Blocos visuais | Cards | Filtros | 1º conteúdo útil | Destaque |
|---|---|---|---|---|---|---|
| Carreira nova | 2075 → 2186 | ~12 → 6 | 22 → 12 | 4 → 4 | y 796 → 193 | Nº 1 do mundo |
| Temporada 1 (LOCAL-8A) | 2969 → 3051 | ~12 → 6 | 27 → 13 | 4 → 4 | y 796 → 193 | Campeões · Legacy Finals |
| T5 com dupla | 2952 → 3008 | ~12 → 6 | 25 → 13 | 4 → 4 | y 796 → 193 | Nº 1 do mundo |
| Temporada 10 (LOCAL-8A) | 2968 → 3115 | ~12 → 6 | 27 → 13 | 4 → 4 | y 796 → 193 | Campeões · Legacy Finals |

- "Blocos visuais" antes: header, 4 contadores, abas, boletim, destaque, 5 grupos de notícias; depois: header, destaque, líderes, eventos, notícias, explorar.
- Filtros: as mesmas 4 abas de notícias, agora fora da primeira dobra; nenhum select.
- Ações dominantes (botão primário) na página: 1 (CTA do destaque) + a aba de notícias ativa.
- A altura total cresceu 2–5% porque nada das notícias foi removido; o ganho é na hierarquia: na primeira dobra entram destaque + início dos líderes (antes: só contadores).
- 0 overflow, 0 controle cortado, 0 erro de JS em 4 estados × 6 viewports (`after/measurements.json`).

**Desempenho** (`perf.json`, mesma sessão, variantes alternadas, mediana de 10 aberturas Home→Mundo, build de desenvolvimento): carreira nova 26 → 43 ms; temporada 10 48 → 73 ms (+17/+25 ms, por ler ranking/duplas/torneios que a tela antes não lia). A derivação do modelo custa ~3 ms com 1.391 torneios. Sem polling, sem escrita, nada no avanço diário.

## 7. Testes

- `test-world-circuit-v532b`: **69 PASS** — seletores (S1–S28), carreira nova real (R1–R16: líderes = Ranking, nenhum campeão inventado, eventos existentes, links para rotas reais, aposentado sai dos líderes, parceria desfeita sinalizada sem mudar posição), temporadas 1 e 10 (A*.1–A*.11).
- `test-world-mobile-containment-v532b`: **162 PASS** — 360/390/paisagem/768/1366/1600 × carreira nova e temporada 10; hierarquia, primeira dobra, etiquetas inteiras, "Atualizar" descoberto; navegação: cartões → views do Ranking (o Ranking abre na view certa), voltar do navegador, CTA do destaque (detalhes do torneio/atleta), linha de evento, atalhos Calendário/Atletas, as 4 áreas de notícias, boletim, recarregar; 0 erro de JS.
- Regressão (`tests.json`): seleção da 5.32-A + Mundo/LOCAL-7D…7H.1/CLOUD-7D1/Home = 210 testes. Ver seção 8.
- Gates: `npm run lint` ok · `npm run build` ok · `npm run validate:architecture` ok · `git diff --check` ok.

## 8. Falhas e pendências

Regressão: **210 testes · 177 pass · 31 preexistentes (falham igual no HEAD) · 2 marcados pelo executor como regressão, ambos descartados após investigação:**

| Teste | Execução em pool | HEAD | Reexecução isolada (código atual) | Conclusão |
|---|---|---|---|---|
| `test-long-career-partner-ecology-v518` | falhou (Parte H: churn do Top 10) | passou | 1ª **passou**, 2ª falhou | instável: mesmo código, resultados diferentes |
| `test-partner-athlete-idempotency-v512` | morto no limite de 900 s | passou | estourou 600 s nas duas | simulação longa (6 seeds × 1 temporada) sensível a tempo; na 5.32-A também estourou no estado da fase e no HEAD |

Os dois rodam a simulação headless do motor (`runHeadlessWorldSimulation`), que não carrega páginas. Os únicos arquivos de produção alterados (`WorldHub.jsx` e o novo `worldCircuitDisplay.js`, importado só pelo WorldHub) ficam fora do grafo de importação deles: o código que exercitam é idêntico ao HEAD. Não são regressões desta fase.

Preexistentes (31): as mesmas da 5.32-A/A.1 (`tests-a1.json`) mais `test-premium-world-v33` (cartão da Imprensa), `test-world-ui-v2` (`src/lib/careerAssistant.js` ausente), `test-home-redesign` e `test-premium-home-v33-2` (Home 5.30). Nenhuma toca o WorldHub (os dois testes de Mundo falham antes das verificações do WorldHub, cujos contratos — abas Hoje/Circuito/Mercado/História, boletim, linha do tempo, paginação, `categories?.circuito/mercado`, efeito de montagem só com `load()`, sem polling — foram mantidos).

Efeito colateral da regressão: testes de simulação regravaram relatórios versionados de outras fases (`reports/fase15-simulation.json`, `reports/progression-economy-526/*` etc.); foram restaurados ao HEAD e os arquivos gerados removidos.

Pendências:
- Smoke test Android físico (herdado da 5.32-A/A.1) e de Mundo.
- Divergência `ranking_position` gravado × snapshot (seção 5) — investigação funcional separada.
- "Dupla temporária": não existe tipo de parceria temporária nos dados (`npc`/`player`); campeões são identificados pelos ids gravados no torneio, sem afirmar parceria.
- A captura manual da Race de Duplas com a dupla pontuando (pendência da 5.32-A.1) continua aberta.

## 9. Evidências

- `before/`, `after/` (capturas por estado × viewport, `measurements.json`; recortes por seção em `after/sections/`) — PNGs ignorados pelo Git.
- `compare/` — 12 comparativos antes|depois.
- `functional.json`, `tests.json`, `perf.json`, `tools/` (captura, desempenho, regressão).
