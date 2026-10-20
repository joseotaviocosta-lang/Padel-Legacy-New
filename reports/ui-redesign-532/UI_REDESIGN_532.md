# Fase 5.32-A — Redesign do Ranking

**Base:** `082bf87` (branch `integracao/cloud-6o`). Nada foi comitado.

**Princípio:** POSITION FIRST · CONTEXT SECOND · DETAILS ON DEMAND. O Ranking deve parecer uma escada competitiva, não uma tabela de banco de dados.

**Validação:** Chrome headless (puppeteer-core) contra o dev server, com perfil temporário e storage em memória (`tools/session.mjs`). O IndexedDB e o AppData do usuário não foram tocados, e os saves da LOCAL-8A só foram lidos. Foram usados 4 estados reais:

| Estado | Origem | Situação |
|---|---|---|
| `carreira-nova` | carreira criada pela UI | sem ranking, sem dupla, Race 2026 vazia |
| `t5-sem-dupla` | save da temporada 5 da LOCAL-8A, como está | #303, sem dupla, Race 2031 ainda não começou |
| `t5-race-sem-dupla` | o mesmo save + ~40 dias jogados pelo botão "Avançar" | Race 2031 com pontos da IA; jogador sem dupla (o contrato de 30 dias expirou) e com 0 na Race |
| `t5-com-dupla` | o mesmo save + proposta aceita pela UI + 20 dias | #301, dupla com Rafael Vega #531 |

Os fixtures derivados ficam em `fixtures/`, que está no `.gitignore` (77 MB). São gerados por `tools/build-fixtures.mjs`, e antes e depois fotografam exatamente os mesmos dados.

## Veredito: **A−**

- 0 regressão.
- 0 overflow e 0 erro de JS nas 64 capturas finais.
- 67/67 passos no roteiro funcional com cliques reais.

Fica em A− porque ainda falta o smoke no aparelho físico (Redmi 12, Android 15), como na 5.31, e a validação manual no navegador.

## Nenhuma regra mudou

Arquivos de motor, pontuação, ranking, Race, torneios, saves e simulação: **0 linhas alteradas**.

As autoridades consumidas são as mesmas de antes, com os mesmos argumentos:

- `buildWorldRankingSnapshot(profile)`;
- `getTeamRankings(600)` e `getTeamRank`;
- `getTeamRaceRankings(600, { profile })` e `getTeamRaceRank`;
- `ensurePlayerTeamRanking`;
- `teamListPoints` (LOCAL-7D);
- `buildTeamFinalsCut`;
- `buildCountryDirectory`.

Os helpers novos de `rankingDisplay.js` são puros: só decidem o que é **exibível** e não calculam pontos nem posição.

## Medições (390 px, antes → depois, `before/` e `after/measurements.json`)

| Estado · view | Topo de "Sua posição" | 1ª linha da escada | Altura da página |
|---|---|---|---|
| t5-com-dupla · Mundial Individual | 489 → **255** | 898 → **477** | 6.396 → 3.985 |
| t5-com-dupla · Mundial Duplas | 489 → **255** | 1.034 → **549** | 6.423 → 5.119 |
| t5-race-sem-dupla · Race Individual | 489 → **270** | 922 → **658** | 6.420 → 3.699 |
| t5-race-sem-dupla · Race Duplas | 566 → **270** | 875 → **612** | 6.171 → 4.605 |
| carreira-nova · Mundial Individual | 489 → **255** | 898 → **566** | 6.396 → 3.607 |
| t5-sem-dupla · Race Duplas (temporada não começou) | 566 → **270** | 875 (linhas 1…N com 0 pts) → — (estado vazio) | 6.171 → 942 |

Alturas das linhas:

- Individual: 70 → **56 px**.
- Duplas: 63 → **75 px**. As duplas agora mostram os dois nomes em duas linhas, em vez de cortar o segundo membro.

Em todas as **64 capturas finais** (4 estados × 4 views × 360/390/desktop/paisagem):

- overflow horizontal: 0;
- erros de JS: 0;
- botões cortados dentro do Ranking: 0.

O medidor ainda acusa 1 elemento "cortado" no desktop e 4 na paisagem, os mesmos números do "antes". São os chips do header global (RANKING/DUPLA/OVR) e o selo de notificação do AppLayout, fora do escopo.

## Respostas (38)

1. **Branch e HEAD:** `integracao/cloud-6o` @ `082bf875134282e8a587c4f3cd3353240b571aaf`. Confirmado no preflight. Working tree antes: só os 5 falsos positivos de `src-tauri`.

2. **Arquivos alterados.**
   - Produção (só apresentação):
     - `src/pages/Ranking.jsx`;
     - `src/lib/rankingDisplay.js` (helpers novos ao final + import das constantes `RANKING_WINDOW_DAYS`/`RANKING_BEST_N`);
     - `src/components/design-system/RankingPosition.jsx` (o único consumidor é o Ranking).
   - Testes novos:
     - `scripts/test-ranking-ladder-v532.mjs`;
     - `scripts/test-ranking-views-v532.mjs`;
     - `scripts/test-ranking-mobile-containment-v532.mjs`.
   - Testes de layout antigos atualizados de propósito (mesmo propósito, forma nova): `test-ranking-mobile-two-level-tabs-v523`, `test-ranking-four-view-architecture-v523`, `test-ranking-no-active-partner-states-v523`, `test-ranking-world-compact-v522e`, `test-mobile-compact-ux-m4` e `test-mobile-game-feel-m4-1`. Os dois últimos ganharam o equivalente 5.32 do gate do HUD, como a 5.29/5.30/5.31 fizeram para Torneios, Home e Dupla.

3. **Telas auditadas:**
   - Mundial · Individual, Mundial · Duplas, Race · Individual e Race · Duplas;
   - o cabeçalho (HUD líder/race/países/clubes);
   - os dois níveis de abas;
   - os 4 cartões do jogador e o corte das Finals;
   - o pódio e as listas;
   - os estados vazio e sem dupla;
   - o modal do atleta;
   - os links para países e clubes;
   - os deep links (`?athlete=`) e os links legados (`?tab=`).

4. **Antes:**
   - Quatro camadas antes da posição do jogador: título grande, HUD 2×2 (líder, race, países, clubes), aba Mundial/Race e, numa segunda linha, Individual/Duplas. "Sua posição" começava em y=489 a 390 px, e a escada em y≈900.
   - Bugs de apresentação confirmados nas capturas:
     - carreira nova aparecia como **#1001** e "0 pontos" (posição exata falsa), com "#1000 Tomás Navarro · 1 pts" acima;
     - Race com 0 pontos virava "#356 na Race";
     - Race zerada ainda listava 1…N com "0 PTS RACE" e um pódio de "0 pts";
     - toda dupla tinha um "ESTÁVEL" fixo;
     - as duplas de IA mostravam "0 título(s)" mesmo com títulos no ledger;
     - os vizinhos tinham variações inventadas, como "↑65" para um atleta estável.

5. **Depois:**
   - Uma linha com dois alternadores segmentados, seguida de uma micro-explicação do período.
   - O cartão "Sua posição", depois "Ao seu redor" (2 acima, você, 2 abaixo), e por fim busca + chips, pódio e a escada a partir do 4º lugar (o pódio não se repete).
   - No desktop (≥ 1024 px), duas colunas: o cartão e a vizinhança fixos à esquerda, a escada à direita.
   - Links "N países · N clubes" no rodapé da escada.

6. **"Minha posição":** posição grande (`#301`, text-4xl), pontos ao lado, e duas linhas de contexto: "faltam 3 pts para #300 Lucas Campos" e "#302 Javier Herrera a 1 pt". O plural está correto e o empate aparece como "empatado com …". Depois vêm o próximo objetivo (Top 250 · faltam 51 posições) e um chip "Dupla: Rafael Vega" (ou "Sem dupla"), que leva a `/partners`.
   - **Variação do jogador:** não é exibida. Não existe autoridade para ela: o perfil grava só a posição atual (`ranking_position`), sem a anterior, e não inventamos dado.
   - Nas duplas: posição canônica, pontos, distância para a dupla acima, corte das Finals numa linha ("Top 8 duplas → Circuit Finals · faltam 4.900 pts") e "Composição dos pontos" sob demanda (`<details>`: 82 + 140 = **Total** 222).

7. **Jogador sem ranking:** "Ainda sem ranking" (text-2xl) + "Dispute torneios oficiais para pontuar e entrar no ranking mundial."
   - Sem posição numérica: nem #1001, nem "#1000+".
   - Na escada, a linha "Você" mostra "—" no lugar da posição.
   - Na Race, quem tem 0 pontos não tem posição.
   - A regra é `resolveStandingRank`: a flag `unranked` da autoridade, posição 0 ou 0 pontos resultam em null.

8. **Mundial/Race:** controle segmentado próprio (`SegmentedToggle`): `role=tablist`, setas ← →, área de toque de 44 px, sem rolagem lateral a 360 px. A troca empilha `?scope=` no histórico, então voltar, avançar e recarregar funcionam. O `?tab=` legado continua normalizado com replace. Logo abaixo vem a micro-explicação do período:
   - Mundial: "os 22 melhores resultados das últimas 52 semanas" (constantes de `rankingWindow.js`);
   - Race: "Race 2031: pontos da temporada desde 1º de janeiro. Zera na virada do ano." O ano vem de `career_date`, não está fixo no código.

9. **Individual/Duplas:** segundo `SegmentedToggle`, **na mesma linha** do primeiro (medido nas 4 larguras), com `?type=`.

10. **Pontos das duplas:** `TeamRanking` (`getTeamRankings`/`getTeamRank`), exibidos por `teamListPoints(row, { race })`. A Race de duplas vem de `getTeamRaceRankings`/`getTeamRaceRank`.

11. **Fórmula canônica:** intacta. T5 verifica que os pontos da dupla do jogador são iguais a `computeCanonicalTeamRankingPoints(jogador, parceiro)` e iguais a `getTeamRank().points`. A UI não soma nada: a composição só exibe as três parcelas que já existiam.

12. **Race de Duplas:** correta. Continua a projeção a partir dos `race_points` dos membros. A escada mostra só quem pontuou, com a posição da autoridade (T14), e a lista exibe `race_points`, não os pontos mundiais (T15, LOCAL-7D).

13. **Reset anual:** intacto. É `resetRaceSeasonPoints` na virada do ano civil, que não foi tocado. A UI só explica o reset.

14. **Lista mobile:** `CompactListItem` (primitivo compartilhado) com:
    - `RankingPosition` em coluna (posição + variação real);
    - nome;
    - bandeira, país e OVR;
    - pontos e rótulo ("pts" ou "race").

    A linha do jogador tem fundo `primary/10`, uma barra lateral e o selo "VOCÊ". A dupla do jogador usa o selo "SUA DUPLA".

15. **Informações por linha:**
    - Individual: 5 (posição, nome, país, OVR, pontos) + a variação quando existe.
    - Duplas: 5 (posição, dois membros, V/D/títulos do ledger, pontos).

16. **Top 3:** pódio compacto em 3 colunas, com `PlayerAvatar` oficial (dois para as duplas), selo de posição, coroa no 1º, nome(s) e pontos. A ordem no DOM é 1-2-3 (leitor de tela) e a visual é 2-1-3. Só aparece se os 3 primeiros têm pontos > 0 (`hasMeaningfulPodium`) e some quando há busca ou filtro.

17. **Zero pontos:** existia. Na Race Duplas da temporada que não começou havia pódio "0 pts / 0 pts / 0 pts" e 600 linhas com "0 PTS RACE"; na Race individual, "#356 NA RACE 0 PONTOS". O medidor automático do "antes" não detecta isso (o pódio antigo não tinha atributo próprio), mas aparece no texto capturado em `before/measurements.json` e na captura `t5-sem-dupla--race-duplas`.

18. **Correções de apresentação (todas só UI):**
    - sem posição falsa para quem não tem ranking;
    - a escada da Race só tem quem pontuou;
    - pódio só com pontos reais;
    - "estável" fixo removido;
    - variação calculada com as duas posições gravadas pelo circuito (`ranking_previous_position → ranking_position`), e não contra a posição do snapshot (a outra ordenação inventava saltos);
    - títulos das duplas lidos do ledger (`ledger_titles`, LOCAL-7H);
    - o texto das Finals na Race individual dizia "veja em Race → Duplas", mas a autoridade é o Mundial de duplas, e foi corrigido;
    - o país era lido duas vezes pelo leitor de tela;
    - plural de "pt".

19. **Contexto competitivo:** sim. Cartão com distância para cima e para baixo, mais "Ao seu redor" (5 linhas, você no meio). O botão "Ver na lista" abre as páginas necessárias e centraliza a sua linha na escada (verificado com clique real).

20. **Destaque da dupla:** sim. A linha da dupla tem fundo, barra lateral e o selo "SUA DUPLA", identificada pela chave canônica (`team_key`), nunca pelo nome. T10 confirma que há exatamente 1 linha destacada.

21. **Nomes longos:** legíveis. Exemplos: "Juan Ignacio De Pascual / & Bruno Molina" e "Carlos Daniel Gutiérrez". Duplas usam duas linhas com `truncate` em cada membro. No pódio, cada nome tem a sua linha.

22. **Duplas homônimas:** continuam distintas. Cada `<li>` tem `data-team-key` (id estável), e os nomes desambiguados do mundo ("Diego Sánchez 457", "Rafael López 364") aparecem inteiros. T9 confirma que as chaves são únicas.

23. **360 px:** passou. 0 overflow, 0 elemento fora da tela, 0 controle cortado, alternadores numa linha e o cartão na primeira dobra. Medido no teste de navegador e nas capturas.

24. **390 px:** passou (mesmos critérios).

25. **Desktop:** passou. Duas colunas, sem overflow.

26. **Paisagem (844×390):** utilizável. Coluna única, o cartão começa na primeira dobra, sem overflow.

27. **Overflow:** nenhum, nas 64 capturas e nas 16 combinações do teste de navegador.

28. **Botões cortados:** nenhum no Ranking. "MELHOR RESULTADO" chegou a truncar no mini-grid da Race; o rótulo passou a quebrar em duas linhas. Os chips do header global seguem como antes (fora do escopo).

29. **Erros de JS:** 0, nas capturas, no roteiro funcional e no teste de navegador.

30. **Testes novos:** 3 arquivos, 152 verificações.
    - `test-ranking-ladder-v532` (12): helpers puros.
    - `test-ranking-views-v532` (48): mundo real em memória + autoridades reais + render SSR dos componentes da página. Cobre hierarquia, contexto, sem ranking, linha mobile, variação, duplas, Race e alternador.
    - `test-ranking-mobile-containment-v532` (92): navegador real, carreira criada pela UI, 4 larguras × 4 views, URL push/back/forward/reload, teclado e link legado.

31. **Testes que passaram:** os 3 novos (152/152).
    - LOCAL-7D (33), 7E (38), 7F (37), 7G (24), 7G.1 (18), 7H (23) e 7H.1 (15): todos passaram.
    - Bateria ampla (`tests.json`): seleção da 5.31 + todas as suítes de Ranking + as novas, 184 testes, **155 passam**.
    - `lint`, `build`, `validate:architecture` e `git diff --check`: ok.
    - Roteiro funcional (`functional.json`): 67/67.

32. **Regressão funcional:** nenhuma. Cada falha da bateria foi repetida com os fontes **e o script de teste** do HEAD, e todas falham igual lá. As restaurações foram conferidas por SHA-256.

33. **Falhas preexistentes (29):**
    - diag-ranking-cap-mechanism;
    - beta-integration-v35-5 (imprensa);
    - core-gameplay-ui (6/73, todas de Treinos/Calendário/Partidas; os 2 itens de Ranking voltaram a passar);
    - as v527g/h/i/j de parceria;
    - former-partner-world-continuity-v518;
    - live-match-*-v520d;
    - long-career-partner-ecology-v518;
    - notification-system-audit-rc;
    - partner-athlete-idempotency/ovr-scale-v512;
    - partner-engine-ovr-authority-v526b;
    - phase15-3 e phase15-5-4;
    - premium-interfaces-v33 e premium-relations-v33-8;
    - ranking-active-view-performance-v524b (frágil a CRLF);
    - team-ranking-partnership-change-v510;
    - ui-performance (setInterval em `src/dev`).

    A lista completa, com o trecho de cada falha, está em `tests.json`.

34. **Evidências visuais:**
    - `before/`: 80 PNG (4 estados × 4 views × 4 viewports + página inteira a 390);
    - `after/`: 80 PNG, idem (PNGs de antes/depois locais, no `.gitignore`, como na 5.31);
    - `compare/`: 16 comparações antes|depois;
    - `before/` e `after/measurements.json`;
    - `functional.json`, `tests.json`;
    - `tools/`: session, build-fixtures, capture, functional, compare e run-tests.

35. **Riscos e achados que ficam (fora do escopo visual, não alterados):**
    - (a) **Duas ordenações de posição convivem.** O snapshot do Ranking/header dá a posição exibida, e o circuito grava outra em `AthleteProfile.ranking_position`. Elas divergem em 717 de 994 linhas, porque o snapshot exclui inativos e deduplica nomes. Outras telas que leem `ranking_position` podem mostrar outro número. Proposta para fase própria, com aprovação.
    - (b) `assignTeamRankingPositions` agrupa empates por `ranking_points` também no board da Race. Duplas com Race diferente e Mundial igual podem dividir posição. Teórico: medido 0 caso.
    - (c) O token `premium` não está no `tailwind.config.js`, então as classes `*-premium` não geram CSS. O Ranking passou a usar `amber-400`; outros usos (por exemplo, o título de Torneios) continuam sem cor.
    - (d) O chip "RANKING #1000+" do header global continua (AppLayout, fora do escopo).
    - (e) A linha da dupla do jogador mostra "Histórico indisponível", porque a dupla do jogador conta por torneio desde a 5.0 e não usa o ledger.
    - (f) As linhas de dupla ficaram 12 px mais altas, para mostrar os dois nomes.
    - (g) No mundial individual ranqueado, a busca fica abaixo de "Ao seu redor" (abaixo da dobra a 390 px), por escolha: posição e contexto vêm primeiro.
    - (h) Os FABs legados (pasta/capelo) cobrem a última linha visível (soft warning, preexistente).
    - (i) `Ranking.jsx` passou a exportar funções puras para os testes. No dev, editar o arquivo faz recarga completa em vez de Fast Refresh.

36. **Teste manual no navegador:** recomendado (roteiro abaixo).

37. **Smoke físico futuro:** recomendado no Redmi 12. Verificar a bandeira emoji (o Windows mostra só as letras), o toque nos alternadores, o "Ver na lista" e o `<details>`.

38. **Veredito: A−.**

## Validação manual sugerida (http://127.0.0.1:5174, F5)

1. Ranking → Mundial/Individual:
   - a posição, os pontos e "faltam N pts para #…" aparecem no topo;
   - "Ver na lista" leva à sua linha destacada;
   - tocar numa linha abre o atleta.
2. Digitar um nome na busca: as linhas mantêm a posição original, e o X limpa a busca. Testar os chips "Top 100" e país.
3. Duplas:
   - com dupla: o cartão mostra a posição; "Composição dos pontos" abre com Total; "Top 8 duplas → Circuit Finals" aparece logo abaixo;
   - sem dupla: "Procurar parceiro" abre o mercado.
4. Race:
   - a micro-explicação traz o ano da carreira;
   - com a temporada recém-zerada não aparece pódio de "0 pts", e sim o estado "ainda não começou".
5. Voltar e avançar do navegador entre as views, e F5 mantém a view.
