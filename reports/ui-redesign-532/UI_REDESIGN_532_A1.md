# Fase 5.32-A.1 — Acabamento visual do Ranking

**Base:** `082bf87` (`integracao/cloud-6o`) + as alterações da 5.32-A, ainda não comitadas e preservadas. Nada foi comitado.

**Delta da A.1 sobre a 5.32-A** (medido contra um backup das versões 5.32-A):

| Arquivo | Delta |
|---|---|
| `src/pages/Ranking.jsx` | +80 −42 |
| `src/lib/rankingDisplay.js` | +33 (helper novo `buildClimbContext`) |
| `RankingPosition.jsx` | sem mudança |

Motor, TeamRanking, Race, Finals, simulação e saves: **0 linhas**.

## Veredito: **A−**

- Os 4 rankings estão consistentes.
- O contexto competitivo das duplas existe em qualquer posição.
- Os empates aparecem sem ambiguidade.
- O desktop ficou 27% mais curto nas Duplas.
- 0 regressão, 0 overflow e 0 erro de JS.

Continua em A− porque faltam o smoke no Redmi 12 e a sua validação manual. A Race de Duplas com a dupla do jogador pontuando não tem captura de tela (ver Pendências).

## Problemas identificados

1. **A causa do "contexto pouco evidente" nas duplas era um defeito, não só de layout.**
   - A escada de duplas lia `getTeamRankings(600)`, mas `getTeamRank` calcula a posição sobre a população inteira (corte 5000).
   - Uma dupla em #895 (o seu caso) ficava fora da lista. "Ao seu redor" não aparecia, e o cartão caía em **"Sua dupla lidera o ranking"**, porque não havia vizinho acima.
   - O teste D6 reproduz o caso com dado real: dupla em **#940 de 940**, ausente da lista de 600.
2. **"empatado com #N" era ambíguo.**
   - No individual, empate em pontos gera posições distintas (a ordenação desempata).
   - Nas duplas, empate em pontos divide a posição (ranking de competição).
   - Além disso, "faltam" apontava sempre para a linha imediatamente acima, mesmo quando ela tinha os mesmos pontos.
3. **Desktop:** linhas de dupla de 75 px (nomes em duas linhas, mesmo com largura sobrando).
   - Corrigido: o nome da dupla agora usa reticências na coluna estreita, onde antes encostava nos pontos.
   - Corrigido: o rótulo das Finals, que era cortado, agora quebra em duas linhas.

## O que mudou

- **Corte da escada de duplas:** `TEAM_BOARD_CAP = 5000`, o mesmo corte de `getTeamRank`/`getTeamRaceRank`, nas duas escadas (Mundial e Race). Mesma autoridade, mesma ordenação, só deixou de cortar a leitura.
- **`buildClimbContext`** (puro, `rankingDisplay.js`): lê a escada já ordenada e devolve:
  - o alvo para subir: a linha **mais próxima com mais pontos** e quantos faltam, nunca "faltam 0";
  - o empate com a linha de cima, sabendo se ele divide a posição;
  - quem vem atrás e a vantagem sobre ele;
  - se é líder.

  Fora da escada, devolve `null` e a tela não diz nada.
- **`ClimbLines`** substitui `GapLines` nos 4 cartões:
  - ↑ "Faltam 2 pts para #529 …";
  - = "Mesmos pontos de #1006 …" (individual) ou "Empate em #531 com …" (duplas);
  - ↓ "#534 … a 1 pt" ou "com os mesmos pontos";
  - 👑 "lidera" só na posição 1 sem ninguém com mais pontos.

  O critério do desempate não é afirmado.
- **Duplas:** o corte das Finals entrou no próprio cartão "Sua dupla", com um bloco a menos antes de "Ao seu redor".
- **Desktop (≥ 1024 px):** linhas com `py-1.5`, e os dois membros da dupla na mesma linha ("A & B"). Mobile intocado.

## Medições (antes = 5.32-A, depois = 5.32-A.1; `a1-before/` e `a1-after/measurements.json`)

| Estado · view @ largura | Altura da página | Altura das linhas |
|---|---|---|
| t5-com-dupla · Mundial Duplas @1600 | 4.374 → **3.174** (−27%) | 75 → **51** |
| t5-race-sem-dupla · Race Duplas @1600 | 4.374 → **3.174** | 75 → **51** |
| t5-com-dupla · Mundial Individual @1600 | 3.360 → **3.160** | 55 → **51** |
| t5-com-dupla · Mundial Duplas @390 | 5.119 → 5.157 | 75 → 75 |
| t5-com-dupla · Mundial Duplas @768 | 5.033 → 5.071 | 75 → 75 |

Nas Duplas, a 390 e 768 px, a 1ª linha da escada desce 38 px porque o cartão ganhou as linhas de subida/empate/abaixo. O cabeçalho "Ao seu redor" continua na 1ª dobra a 390 px.

No desktop, cartão, corte das Finals e as 5 linhas de "Ao seu redor" cabem inteiros na 1ª dobra.

Todas as **96 capturas finais** (4 estados × 4 views × 360/390/768/1600/1366/paisagem):

- overflow horizontal: 0;
- erros de JS: 0.

O "cortado" que o medidor acusa a 768 px e na paisagem (4) e no desktop (1) são os chips do header global e o selo de notificação. Estão fora do Ranking, são os mesmos números da 5.32-A, e o teste de navegador escopado ao Ranking dá 0.

## Testes

| Suíte | Resultado |
|---|---|
| `test-ranking-ladder-v532` | **18/18** (6 novos de `buildClimbContext`: alvo pula empatados, posição dividida, líder e líder empatado, fim da escada, fora da escada, campo do período) |
| `test-ranking-views-v532` | **64/64** (16 novos com o mundo real: C1–C3 subida/empate no individual, D1–D12 contexto das duplas — vizinhos, alvo, empate de posição, homônimas, fora do Top 600, sem contexto, fim, líder, Race sem pontos, Race só com race_points) |
| `test-ranking-mobile-containment-v532` | **164/164** (+768 e +1600; novos: posição/nome/pontos inteiros em cada linha, duas colunas no desktop, linhas ≤ 56 px no desktop) |
| Roteiro funcional (cliques reais, 4 saves) | **72/72** (+5 para o contexto das duplas, inclusive a 360 e 1600 px) |
| LOCAL-7D, 7E, 7F, 7G, 7G.1, 7H, 7H.1 | **188/188** |
| CLOUD-7D1 | **38/38** |
| Bateria ampla (`tests-a1.json`) | 184 testes, **155 passam, 0 regressões**, 29 preexistentes (idênticas às da 5.32-A) |
| `lint`, `build`, `validate:architecture`, `git diff --check` | ok |

Dois testes de forma foram atualizados de propósito, porque procuravam o literal `getTeamRankings(600)`: `test-ranking-ui-authority-v56` (que é o "1 regressão" bruta da bateria; reexecutado, PASS) e `test-ranking-active-view-performance-v524b`. O propósito dos dois segue igual: mesma autoridade e carregamento de Duplas sob demanda. O v524b continua com a falha preexistente de CRLF; com o fonte em LF, ele passa inteiro.

## Respostas (24)

1. **HEAD e branch:** `integracao/cloud-6o` @ `082bf875134282e8a587c4f3cd3353240b571aaf`, com as alterações da 5.32-A no working tree, preservadas.

2. **Arquivos alterados na A.1:**
   - `src/pages/Ranking.jsx`;
   - `src/lib/rankingDisplay.js`;
   - testes: `test-ranking-ladder-v532`, `test-ranking-views-v532`, `test-ranking-mobile-containment-v532`, `test-ranking-ui-authority-v56`, `test-ranking-active-view-performance-v524b`;
   - ferramentas e evidências em `reports/ui-redesign-532/`.

3. **Mundial Individual:** o alvo para subir passou a ser o atleta mais próximo com mais pontos, e o empate em pontos aparece como "Mesmos pontos de #N". Linhas mais densas no desktop. O resto foi preservado.

4. **Mundial de Duplas:**
   - escada completa (corte 5000), então "Ao seu redor" existe em qualquer posição (antes sumia acima de #600);
   - fim do falso "lidera";
   - subida e empate de posição claros;
   - Finals dentro do cartão;
   - desktop com os dois membros numa linha.

5. **Race Individual:** mesmas regras de subida e empate, com `race_points`. Ano real e reset intactos.

6. **Race de Duplas:** escada completa da projeção da Race, com contexto só pelos `race_points` (D12). A mensagem das Finals ("vem do Mundial de duplas") foi mantida.

7. **"Ao seu redor" nas duplas:**
   - 2 duplas acima, a sua (destacada, "SUA DUPLA") e 2 abaixo;
   - os dois membros, a posição da autoridade e os pontos do período;
   - "Ver na lista" abre as páginas até a sua linha;
   - perto do fim da escada mostra só o que existe (sem linhas inventadas);
   - sem dupla, sem pontos ou fora da escada, a seção não aparece (estado vazio "Sem dupla ativa" ou "Ainda sem ranking").

8. **Empates:**
   - individual: "= Mesmos pontos de #1006 Nome" (a ordenação já pôs um à frente; o critério não é citado);
   - duplas: "= Empate em #531 com Dupla";
   - abaixo: "com os mesmos pontos";
   - não existe mais "empatado com".

9. **Distância para subir:** "↑ Faltam N pts para #r Nome", sempre até a linha mais próxima com **mais** pontos, com plural correto ("Falta 1 pt"). Sem alvo confiável, nada é exibido, e "lidera" só aparece na posição 1.

10. **Compactação:**
    - desktop: `py-1.5` nas linhas e dupla numa linha só (51 px em vez de 75);
    - menos um bloco entre o cartão e "Ao seu redor";
    - reticências e quebra controladas na coluna estreita;
    - mobile sem compressão.

11. **360 px:** passou (0 overflow, linhas inteiras, controles numa linha).

12. **390 px:** passou.

13. **768 px:** passou.

14. **Desktop (1366 e 1600):** passou. Duas colunas, linhas ≤ 56 px.

15. **Paisagem:** passou.

16. **Overflow:** não houve.

17. **Erros de JS:** não houve (0 nas 96 capturas, nos 72 passos e nos 164 checks).

18. **Testes que passaram:**
    - 246/246 verificações direcionadas;
    - 72/72 no roteiro funcional;
    - 226/226 nas regressões LOCAL + CLOUD-7D1;
    - 155/184 na bateria ampla (as outras 29 são preexistentes).

19. **Regressões:** nenhuma.

20. **Falhas preexistentes:** as mesmas 29 da 5.32-A (lista em `tests-a1.json`):
    - parceria v527g/h/i/j, phase15, premium-v33, live-match-v520d, ui-performance, v524b (CRLF) e outras;
    - todas falham igual com os fontes e os scripts do HEAD.

21. **Autoridade funcional alterada:** nenhuma. Leitura com a mesma função e um corte maior, igual ao que a própria autoridade já usa. Pontos, ordenação, desempate, Race, reset e Finals intocados.

22. **Evidências visuais:**
    - `a1-before/`: 32 PNG (código 5.32-A a 390/768/1600);
    - `a1-after/`: 112 PNG (4 estados × 4 views × 6 larguras + página inteira);
    - `compare-a1/`: 11 comparações antes|depois (390, 768 e 1600);
    - `a1-*/measurements.json`, `functional.json`, `tests-a1.json`.

23. **Pendências:**
    - (a) Não há captura da Race de Duplas **com a dupla do jogador pontuando**. Nos estados reais disponíveis, ou a Race ainda não começou, ou o contrato do parceiro expirou, ou não há proposta. Pontuar exigiria jogar um torneio inteiro pela UI. O comportamento está coberto por D12 (dado real da Race) e o componente é o mesmo do Mundial de Duplas, capturado.
    - (b) Seus casos exatos (#895, #108, #1007) vêm do seu save, que não foi acessado (IndexedDB do usuário intocado). Os equivalentes foram reproduzidos em dados reais (D6/D7: #940; C2/C3: empate em pontos no individual; D3: empate de posição em #531).
    - (c) Divergência posição do snapshot × `ranking_position` do circuito (717/994 linhas): registrada, não tratada (fora do escopo).
    - (d) Empates do board da Race de duplas decididos por pontos mundiais: teórico, medido 0.
    - (e) Tokens `*-premium` sem CSS no Tailwind.
    - (f) Chip "#1000+" do header global.
    - (g) FABs legados sobre a última linha.
    - (h) Smoke físico no Redmi 12.

24. **Veredito: A−.**

## Validação manual sugerida

1. Mundial → Duplas com a sua dupla (#895):
   - o cartão mostra "Faltam N pts para #…", sem "lidera";
   - "Ao seu redor" mostra 2 acima, a sua e 2 abaixo;
   - "Ver na lista" leva à sua linha.
2. Mundial → Individual (#1007, 15 pts): aparece "= Mesmos pontos de #1006 …", e o "Faltam" aponta para o primeiro atleta com mais pontos.
3. Race → Duplas (#108): o contexto usa só pontos da Race, e a nota das Finals continua.
4. No desktop, as linhas de dupla ficam numa linha e "Ao seu redor" aparece inteiro na 1ª dobra.
