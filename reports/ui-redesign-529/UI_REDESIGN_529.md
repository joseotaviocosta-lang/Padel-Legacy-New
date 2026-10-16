# Fase 5.29 — Redesign das telas centrais (Torneios + Centro de Treinamento)

**Base:** `e85944e` (build 9003). **Sem commit, sem push.**

**Validação:** app desktop real (Tauri/WebView2 dirigido por puppeteer) na
carreira de teste "Smoke 527K — pode apagar", em **360×780, 390×844, desktop
1280×800 e paisagem 780×360**.

## Veredito

**A− (aprovado).**
- Remodelação estrutural real das duas telas, perceptível no antes/depois.
- Zero overflow, zero elemento fora da tela, zero botão estourado, zero erro de JS.
- Funcional **27/27** com cliques reais.
- **0 regressões** em 39 testes.

Não é "A" cheio por dois motivos:
- a validação ainda é emulada (falta o Redmi 12);
- a faixa de abas do Centro não "gruda" no celular (defeito antigo, explicado abaixo, fora do escopo).

**Recomendo gerar o APK 9004 para smoke físico.**

## O que foi remodelado

### Torneios — de "pilha de cards" para hub de competição

| Antes (primeira dobra em 390px) | Depois |
|---|---|
| Herói (título + HUD "próximo evento" + "Abrir evento" + ajuda) | Cartão único de competição |
| Barra de data + dupla | Linha da dupla no rodapé do cartão (a data já está no header) |
| Cartão "Você está disputando" + "Preparar" | Dentro do mesmo cartão: estado, adversário, **um** primário + "Chave"/"Detalhes" (ghost) |
| Abas → Futuros/Passados → seletor de categoria (3 faixas) | Abas → **uma linha**: Futuros/Passados + seletor |
| Lista começava abaixo da dobra | Lista começa na primeira dobra |

**O cartão de competição:**
- Mostra o compromisso atual (campanha ou inscrição).
- Sem compromisso, mostra o próximo evento aberto, respondendo num só lugar a pergunta "o que vem agora?".
- Acento de cor do tier à esquerda.
- No celular o título "Torneios" sai, porque a aba "Torneios" do grupo Competir já nomeia a página. No desktop ele continua.

**Cartão de agenda (lista):**
- **Tier:** faixa de cor à esquerda no lugar de borda + brilho em volta do cartão inteiro.
- **Metadados:** uma linha só (data · em X dias · dificuldade · vagas). Antes, "Ver detalhes"/"Ver chave" quebravam essa linha no meio.
- **Situação** (cancelado / sem campeão / campeão / aviso de inscrição): uma linha de texto com ícone, em vez de caixas com borda.
- **Análise do treinador:** um link discreto expansível.
- **Rodapé único:** recompensas à esquerda; à direita, "Ver detalhes" e "Ver chave" (ghost), a ação do card (secundária) e "Cancelar inscrição" (ghost).
- O primário da tela vive só no cartão de competição.
- Mesmos estados (`resolveTournamentCardState`), mesmas guardas (chave só depois do sorteio, inscrição só com `REGISTRATION_OPEN`) e mesmos handlers.

### Centro de Treinamento — painel de treino enxuto

| Antes | Depois |
|---|---|
| Herói + HUD 2×2 com fios + cartão separado "Partida treino" | **Painel "Hoje"**: 4 medidores com barra (treinos, partida, energia, fadiga) e a partida treino como uma linha |
| Lista dentro de mais uma caixa ("Atividades de treino" + descrição) | Lista direto sob as abas, com uma linha curta de contexto |
| Categorias quebrando em 2 linhas | Faixa única rolável |
| **3+ botões verdes "TREINAR · 💰30"** por dobra | Botão **secundário** "Treinar" com o custo na linha auxiliar ("30 moedas"), compacto e alinhado à direita |
| Selo grande "RECOMENDADO" em pílula | Rótulo pequeno ao lado do nome |
| Custo repetido no resumo e no botão | Custo num só lugar: o botão, visível com o card fechado |

Custos, energia, fadiga, recomendação e fluxo de treinar são os mesmos; só a apresentação mudou.

## Validação por largura (`before/` e `after/measurements.json`)

12 telas/estados × 4 larguras:
- **Torneios:** topo, lista, passados, detalhe, estatísticas.
- **Treino:** topo, cards, card expandido, partida, agenda, evolução, centro.

| | Antes | Depois |
|---|---|---|
| Overflow horizontal | 0 | **0** |
| Elementos fora da tela | 0 | **0** |
| Botão com texto estourado | 0 | **0** |
| Erros de JS | 0 | **0** |
| Primários verdes na dobra de Treino (360) | 3 | **0** (ações de lista secundárias) |
| Blocos antes da lista de Torneios (360) | 6 (herói, barra de status, modo foco, abas, Futuros/Passados, categoria) | **3** (cartão de competição, abas, linha de controles) |

Comparativos lado a lado: `compare/` (13 pares: Torneios 360/390/lista/passados/desktop/paisagem; Treino 360/390/cards/expandido/desktop/paisagem).

## Validação funcional (`functional.json`) — 27/27, cliques reais, 390px

**Torneios:**
- página abre;
- CTA principal correto ("Preparar");
- estado inscrito visível;
- abas Estatísticas, Circuito, Notícias e Agenda;
- Passados/Futuros;
- cartões presentes;
- abrir evento pelo cartão de competição e voltar;
- "Ver detalhes" de um cartão;
- "Chave";
- análise do treinador expande.

**Treino:**
- painel "Hoje";
- abas Partida, Agenda, Evolução, Centro e Treino;
- troca de tipo de treino troca os cartões;
- cartão expande (intensidade);
- 6 CTAs "Treinar" com custo.

**Treino executado:** "Treinar" grava a sessão na hora (o treino é instantâneo: `TrainingTimerModal` `DURATION = 0`). O script executou **um** treino na carreira de teste:
- treinos 0/3 → 1/3;
- saldo 6.511 → 6.481 (−30 = custo mostrado no botão).

Por isso os prints "depois" mostram 6.481 moedas e −15 de energia nos cards: é o estado do atleta depois do treino, não mudança de regra. O script passou a só treinar com `--train`.

## Testes (`tests.json`)

Seleção: os **39 testes** que leem `Tournaments.jsx`, `TrainingCenter.jsx`, `TrainingView.jsx` ou `TrainingActivityCard.jsx`, rodados aqui e num worktree limpo do HEAD `e85944e`.
- **22 passam, 0 regressões, 17 falham igualmente no HEAD** (preexistentes).
- Os testes que leem `CareerStatusBar` também rodaram: nenhuma diferença em relação ao HEAD.

**5 testes antigos foram atualizados para a nova estrutura, mantendo a intenção:**

| Teste | O que cobrava | Como ficou |
|---|---|---|
| `test-mobile-game-feel-m4-1` | Torneios com `PageHeader dense` + `hudItems`; Treino com HUD antes das abas | Cartão de competição com estado + ação; painel "Hoje" antes das abas |
| `test-mobile-visual-polish-m4-1-2` | Nome + dias como `value` do HUD | Nome como título do cartão + "em Xd" na linha de status |
| `test-mobile-visual-hotfix-m4-1-3` | Treinar como primário com `normal-case`; nome no `value` do HUD | Treinar secundário (não herda caixa alta); nome como título do cartão. A regra "sem largura mínima artificial" foi **mantida** (removi um `min-w` que eu tinha posto) |
| `test-mobile-training-game-experience-m4-2-1` | `💰 {cost}` no resumo; "Treinar · 💰{cost}" | Custo visível com o card fechado, na linha auxiliar do botão |
| `test-bracket-cta-availability-v516` | ≥ 3 superfícies `onClick={onViewBracket}` | ≥ 2 (competição + agenda; o atalho do bloco de campeão foi fundido), contando os dois formatos de chamada; **0 sem guarda** |

**Gates:** lint ✓, build ✓, `git diff --check` ✓.

O `test-mobile-game-feel-m4-1` registra (só log, sem gate) que `Tournaments.jsx` tem mais tags JSX (51 → 72) e contêineres (21 → 24). É a linha de metadados em `<span>`s e o novo cartão. Os blocos visíveis e a altura até a lista caíram, como mostram os prints.

## Ressalvas e débitos (fora do escopo)

1. **A faixa de abas do Centro não gruda no celular** (antes e depois). O `<main>` tem `overflow-x-hidden`, o que o torna o contêiner de rolagem do `sticky`; como quem rola é a janela, o `sticky` nunca engata. Corrigir mexe no layout global (`AppLayout`), por isso ficou fora.
2. **No desktop, a coluna flutuante** (BETA/carreiras/centro) cobre a borda direita do conteúdo. O link "Jogar →" do painel foi movido para junto do texto por isso; o problema geral é antigo.
3. **Testes preexistentes:** 17 falhas da seleção, iguais no HEAD.
4. **Ainda sem validação no aparelho físico.**

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/pages/Tournaments.jsx` | `CompetitionHeroCard` (substitui herói+HUD, barra de status e modo foco); título só no desktop; Futuros/Passados + categoria numa linha; cartão de agenda redesenhado; acentos de tier |
| `src/components/career/CareerStatusBar.jsx` | Modo `compact` (só a linha da dupla), usado no cartão de competição; o modo padrão não muda (Home) |
| `src/pages/TrainingCenter.jsx` | Painel "Hoje" com `TodayMeter`; partida treino como linha |
| `src/components/training-center/TrainingView.jsx` | Sem caixa extra; categorias em faixa única; linha de contexto |
| `src/components/training/TrainingActivityCard.jsx` | Ação secundária com custo na linha auxiliar; rótulo "Recomendado" discreto; custo fora do resumo |
| 5 testes em `scripts/` | Atualizados para a nova estrutura (tabela acima) |
| `scripts/ui-audit-529.mjs` + `reports/ui-redesign-529/tools/` | Auditoria, comparativos, roteiro funcional, seleção de testes |

Nenhuma regra de jogo, balanceamento, economia, progressão ou simulação foi tocada.

## Recomendação

**Gerar o APK 9004 e fazer um smoke físico curto no Redmi 12.** Itens do roteiro:
- **Torneios:** cartão de competição, linha Futuros/Passados + categoria, cartão de agenda (rodapé de ações) e paisagem.
- **Treino:** painel "Hoje", faixa de categorias, botões "Treinar" e uma sessão de treino real.
