# Fase 5.30 — Redesign da Home (Centro da carreira)

**Base:** `62f549e` (build 9004). **Sem commit, push ou tag.**

**Validação:** app desktop real (Tauri/WebView2, puppeteer) em 360×780,
390×844, desktop 1280×800 e paisagem 780×360, em dois estados reais:
- **"nova":** carreira de teste "Smoke 530 — pode apagar", criada pela UI. Dia 1, sem parceiro, sem compromisso.
- **"torneio":** carreira "Smoke 527K — pode apagar". Inscrita e com chave sorteada, estreia hoje, com parceiro.

Os demais estados (inscrito em torneio futuro, energia baixa/alertas,
prioridades cheias, vazio total) foram validados nas funções puras com
fixtures. Ver ressalvas.

## Veredito: **A−**

A Home foi remodelada de verdade, com queda grande de altura, de blocos e de
primários concorrentes. Zero overflow e zero erro de JS. Funcional 24/24 com
cliques reais. 0 regressões nos 46 testes que leem a Home.

Fica em A− porque:
- falta o smoke físico;
- os dois estados reais estão com o tutorial em andamento, que suprime a lista de prioridades (regra existente). A lista cheia foi validada só por teste puro.

## Medições (antes → depois; `before/` e `after/measurements.json`)

| Estado · largura | Blocos | CTAs primários | 1º primário (y) | Altura da página |
|---|---|---|---|---|
| torneio · 360 | 9 → **6** | 4 → **1** | 812 (fora da dobra de 780) → **488** | 4.102 → **1.458** |
| torneio · 390 | 9 → **6** | 4 → **1** | 812 → **488** | 4.001 → **1.442** |
| nova · 360 | 9 → **6** | 0 → **1** | nenhum → **484** | 3.067 → **1.366** |
| nova · 390 | 9 → **6** | 0 → **1** | nenhum → **484** | 2.982 → **1.350** |
| torneio · desktop | 9 → 6 | 5 → 2* | — | 2.574 → 1.130 |
| torneio · paisagem | 9 → 6 | 5 → 2* | — | 3.600 → 1.316 |

\* No desktop e na paisagem o segundo "primário" é o botão **Avançar** do
header de desktop, que vive dentro de `<main>`. Na Home há 1.

Em todas as 16 capturas: **0 overflow, 0 elemento fora da tela, 0 botão
estourado, 0 erro de JS.**

## Respostas (26)

1. **Estrutura antes**, de cima para baixo:
   - faixa de momento;
   - herói com HUD (ranking, OVR, nível, pendências);
   - "Compromisso/Planejamento da Semana" com até 4 cartões de torneio, cada um com botão próprio, verde no caso de inscrição;
   - "O que fazer agora" com a lista de pendências;
   - calendário da carreira (dia, treinos, energia, "Avançar dia");
   - "Próximo objetivo";
   - banner do tutorial / painel médico;
   - "Sua jornada";
   - "Evolução";
   - "Atenção e oportunidades";
   - "Mundo";
   - "Ações rápidas";
   - "Ferramentas de gestão";
   - barra de data + dupla no rodapé.
2. **Blocos principais: 9** de primeiro nível medidos (cerca de 13 painéis visuais, com as grades internas).
3. **Duplicações:**
   - ranking e OVR no header **e** no HUD;
   - a data no header **e** no calendário **e** na barra do rodapé;
   - "Avançar" no header **e** no calendário;
   - o mesmo torneio no compromisso da semana, nos cartões de planejamento e, às vezes, no "O que fazer agora";
   - pendências em dois painéis ("O que fazer agora" + "Atenção");
   - o objetivo de ranking em "Próximo objetivo" **e** nas metas da "Evolução".
4. **Nova hierarquia:**
   - **Status** → **O que vem agora** → **Prioridades** → **Agenda + Progresso** (lado a lado no desktop) → **4 atalhos** → Ferramentas (recolhido);
   - banners contextuais (recuperação de partida, relatório mensal/anual, momento, tutorial final, painel médico) aparecem só quando se aplicam.
5. **Bloco de status:**
   - inicial, nome, "idade · país · lado · estilo";
   - barra de **Nível** e barra **"Rumo a #N"** (objetivo de ranking do plano da temporada, com %);
   - linha da **dupla** (componente compacto da 5.29; "Sem parceiro — toque para escolher").
   - Não repete ranking nem OVR, que já estão no header.
6. **Próximo compromisso** ("O que vem agora"), com a precedência:
   1. torneio comprometido ("Seu próximo torneio", estreia relativa, "Chave sorteada" ou "Sorteio em N dias");
   2. próxima inscrição possível ("Próxima oportunidade · Inscrições abertas");
   3. "Agenda livre · Nenhum torneio imediato · Próximo no calendário: X · em N dias".

   Embaixo, o **próximo passo** (heroStep: tutorial ou `getCareerNextAction`) com o único CTA primário, mais o secundário "Ver torneio"/"Ver calendário" quando o CTA aponta para outro lugar.
7. **CTAs primários: 1** na Home (medido em 360/390, nos dois estados).
8. **Prioridades:**
   - uma lista só, onde antes eram dois painéis;
   - ordenada por impacto (crítico/bloqueio → prazo/alto → resto);
   - sem repetir destino nem a ação do herói;
   - **máx. 3 visíveis** + "ver mais N";
   - propostas de parceria sem parceiro viram prioridade crítica;
   - vazio: "Tudo em dia".
9. **Progresso:**
   - 3 métricas da semana (partidas, aproveitamento, treinos);
   - metas da temporada com % e barras finas;
   - "Recentes" (3 itens da linha do tempo) e **1 manchete do circuito** (Universo Vivo).

   O objetivo de ranking não se repete: está no status.
10. **Agenda:**
    - até 4 torneios reais do planejamento semanal, sem o que já está no compromisso;
    - cada um em uma linha: nome, "Melhor opção", tier, quando e prazo;
    - "Inscrever-se" secundário, abrindo o modal canônico, ou ">" para o detalhe;
    - "Ver calendário".

    Nenhum evento inventado.
11. **Ações rápidas: 4.** Treinar, Dupla, Objetivos (com contagem) e Mundo, em ícone + rótulo curto.
12. **Header alterado? Não.** A duplicação foi resolvida tirando ranking e OVR do bloco de status.
13. **Mudança de lógica? Não.**
    - Todos os cálculos foram mantidos: heroStep, `getCareerNextAction`, prioridades, decisões, revisão semanal, plano da temporada e regra do tutorial.
    - Saíram só duas variáveis de promoção de layout (`hasActionableTournamentDecision` e `showPlanningAtTop`), substituídas pela posição fixa do compromisso.
    - As novas agregações são funções puras em `src/lib/homeDashboard.js`.
14. **Arquivos:**
    - `src/pages/CareerHub.jsx` (composição e novos blocos);
    - `src/lib/homeDashboard.js` (novo);
    - 6 testes antigos atualizados;
    - 8 testes novos + `scripts/lib/v530HomeKit.mjs`;
    - `scripts/ui-audit-530.mjs` e as ferramentas da fase.
15. **360:** passou.
16. **390:** passou.
17. **desktop:** passou.
18. **paisagem:** passou. Usa o layout de desktop, a partir de 768px de largura.
19. **Overflow: 0.**
20. **Erros de JS: 0** (capturas e roteiro funcional).
21. **Testes:**
    - **8 novos, 96/96 gates**;
    - funcional **24/24** (12 por estado);
    - dos 46 que leem a Home, **27 passam**.
22. **Regressão nova: 0.** 6 testes antigos validavam a estrutura anterior ao pé da letra e foram atualizados preservando a intenção (tabela abaixo).
23. **Falhas preexistentes:** 19, idênticas no HEAD `62f549e` (worktree limpo).
24. **Ressalvas:**
    - os dois estados reais estão com o tutorial em andamento, então a lista de prioridades aparece vazia por regra ("Tudo em dia") e o CTA é a etapa do tutorial. Prioridades cheias, energia baixa e inscrito em torneio futuro foram validados com fixtures, não no app;
    - o "antes" do estado "nova" foi capturado antes de a carreira visitar Torneios; o "depois", depois (o calendário da Pré-Temporada passou a existir). A Home mostrou "Agenda livre" nos dois;
    - o botão flutuante de Centro de Treinamento encosta no canto superior direito do bloco de status no celular (sem cobrir texto; problema conhecido dos FABs);
    - o calendário da carreira saiu da Home (data e "Avançar" continuam no header; o calendário completo continua em Calendário);
    - mais tags JSX em `CareerHub.jsx` (94 → 107), mas menos contêineres (44 → 41) e menos sinais de cartão (36 → 22).
25. **Recomendo gerar o APK 9005** para smoke físico da Home.
26. **VEREDITO: A−.**

## Testes antigos atualizados (mesma intenção)

| Teste | Antes cobrava | Agora cobra |
|---|---|---|
| `test-mobile-game-feel-m4-1` | `PageHeader dense` + `hudItems`; `<PriorityActionsPanel>` antes de `<NextObjectiveCard>` | `HomeStatusCard` (estado curto no topo); "O que vem agora" antes do progresso |
| `test-ux-home-v36-3-1` | `JourneyTimeline`, `NextObjectiveCard`, `QuickActionsBar` | "Recentes" via `buildJourneyTimeline`; "Rumo a #N" do plano da temporada; `HomeQuickActions` com destinos reais |
| `test-living-world-v23` | `<WorldHighlights snapshot={worldSnapshot}>` | manchete do Universo Vivo (`selectWorldHeadline(worldSnapshot, posts)`, mesma prioridade de seleção) |
| `test-weekly-planning-after-registration-v513` | promoção condicional (`showPlanningAtTop`) e título alternado | compromisso com lugar fixo (2º bloco) e rótulo "Seu próximo torneio" quando há inscrição |
| `test-careerhub-tournament-planning-ui-v58` | headings "Planejamento/Compromisso da Semana", `openBracket`/`mode=run` | bloco de compromisso + agenda do planejamento semanal; modal canônico de inscrição; atalho para o detalhe |
| `test-weekly-planning-mobile-contract-v58` | classes dos cartões de planejamento | linhas da agenda que encolhem, nome que trunca, ação compacta secundária, `aria-label` por item |

## Evidências
- `before/` e `after/`: `home-<estado>-<largura>.png` e `-full.png`, mais `measurements.json`.
- `compare/`: 10 pares, incluindo página inteira em 390.
- `functional.json`: cliques reais nos dois estados. Cobre:
  - CTA do compromisso e retorno à Home;
  - ação secundária;
  - ação rápida;
  - item da agenda;
  - inscrição aberta e fechada **sem confirmar**;
  - prioridades;
  - erros de JS.
- `tests.json`: comparação com o HEAD.

**Carreiras de teste:** "Smoke 530 — pode apagar" foi criada nesta fase. Nenhuma ação de jogo foi gravada nela, além de o calendário de torneios ter sido gerado ao abrir Torneios. Pode ser apagada pela tela Carreiras. A carreira ativa do app ficou sendo a "Smoke 530".
