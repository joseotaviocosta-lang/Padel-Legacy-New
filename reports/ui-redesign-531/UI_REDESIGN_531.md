# Fase 5.31 — Redesign de Dupla / Parceiro / Staff

**Base:** `742ee4a` + hotfix 5.30-B (não comitado na época).

**Validação:** app desktop real (Tauri/WebView2 + puppeteer), em 360×780, 390×844, 1280×800 e paisagem 780×360, em dois estados reais:
- **com parceiro:** "Smoke 527K — pode apagar". Tomás Acosta, contrato perto de vencer, compromisso no Londres Challenge.
- **sem parceiro:** "Smoke 530B2 — pode apagar". 4 propostas recebidas, sem técnico.

Estados que não existem nas carreiras de teste foram validados renderizando os componentes **reais** com dados de exemplo (SSR):
- separação pendente;
- técnico contratado;
- candidato indisponível;
- sem vaga.

**Princípio:** RELATIONSHIP FIRST · DECISION SECOND · DETAILS ON DEMAND.

## Veredito: **A−** (antes do Android físico)

Regressão real 0, gates verdes, evidências finais atualizadas. Fica A− só porque falta o smoke no Redmi 12 (fase 5.31-A).

## Nenhuma regra de jogo mudou

- **`src/lib/partnerScreen.js` é só apresentação.** Funções puras que traduzem `getContractDecisionState` e os campos que o lifecycle já grava (`contract_status`, `renewal_available`, `contract_end_date`) em:
  - selo;
  - linha "N dias restantes · até DD/MM/AAAA";
  - alerta único;
  - ação principal.

  "Perto de vencer" é o `renovacao_proxima` que o lifecycle marca a 15 dias; nenhuma janela é calculada.
- **Intactos:**
  - parceria: ofertas, renovação, saída, compromissos, separação, ex-parceiro, cooldowns, OVR, compatibilidade;
  - técnico e comissão: salários, efeitos, contratação;
  - economia.

  Todas as chamadas (`renewPartnerContract`, `schedulePartnerSeparation`, `releasePartner`, `acceptPartnerOffer`, `rejectPartnerOffer`, `startPartnership`, `hirePrimaryCoach`, `renewPrimaryCoach`, `hireStaff`, `fireStaff`, `renewStaffContract`) são as mesmas, com os mesmos argumentos.
- **Arquivos de jogo** (`game-core`, `partnershipSystem`, `coaches.js`, `staffCatalog`, `economy`): **0 linhas alteradas** nesta fase.

## Medições (390 px; antes → depois; `before/` e `after/measurements.json`)

| Tela · estado | Altura da página | CTAs primários | Observação |
|---|---|---|---|
| Dupla · com parceiro | 2.023 → **1.057** | 0 → **1** ("Renovar parceria") | 1ª ação 722 → 592 |
| Dupla · sem parceiro | 942 → 942 | 0 → **1** ("Analisar propostas (4)") | 1ª ação 722 → **401** |
| Contrato · com parceiro | 1.718 → **1.002** | 1 → 1 | |
| Mercado · 4 propostas | 2.194 → **1.066** | **4 → 0** na lista | o único primário fica no modal |
| Modal da proposta | 844 → 844 | 1 | rolagem interna igual; conteúdo reorganizado |
| Treinador | 3.154 → **1.855** | 0 → 0 | 1ª ação 503 → 403 |
| Detalhe do treinador (conteúdo do modal) | 1.782 → **801** | 1 | |
| Comissão | 1.687 → **1.060** | 0 → 0 | 1ª ação 722 → **568** |
| Mercado de staff | 8.689 → **2.023** | 0 → 0 | 6 por página |

Em **todas as 72 capturas finais** (2 estados × 9 telas × 4 larguras):
- 0 overflow horizontal;
- 0 elemento fora da tela;
- 0 botão cortado (página e modal);
- 0 erro de JS.

No desktop e na paisagem, o 2º "primário" contado é o botão **Avançar** do header de desktop; nas telas há 1.

## Respostas (35)

1. **Telas auditadas:**
   - Minha dupla: Visão geral, Mercado (Recebidas / Buscar / Caixa de entrada), Contrato, Histórico;
   - modal de proposta;
   - Equipe → Treinador: técnico atual, mercado, filtros, modal de detalhe/contratação;
   - Equipe → Comissão: Minha comissão, Mercado mensal, Instalações, Sinergias, Relatórios, reunião semanal.

   Renovação, troca, separação e rescisão vivem na aba Contrato; fisioterapia e demais funções vivem no mercado da comissão.
2. **Maior poluição na Dupla:**
   - o cartão do parceiro tinha tudo aberto (3 barras em caixas, identidade, 4 stats, 2 rankings);
   - o contrato vinha num bloco à parte;
   - 3 botões grandes;
   - compatibilidade, objetivos, nota e cartões dos assessores ficavam abertos;
   - o HUD do topo repetia entrosamento e confiança;
   - no Contrato: 2 avisos, 3 métricas em caixa, 2 barras, compromissos, interesse e rescisão, todos abertos.
3. **Maior poluição no Staff:**
   - a "Comissão técnica viva" (3 StatCards + reunião + clima) ocupava a primeira dobra inteira; a equipe só começava em ~1.500 px;
   - o mercado renderizava **todos** os candidatos, com descrição, barra e pílulas (8.700 px);
   - no Treinador, o HUD repetia o cartão do técnico e havia 5 pílulas + 3 controles de filtro sempre visíveis.
4. **Blocos da Dupla:** antes, 11 painéis visuais com parceiro:
   - HUD;
   - cartão (barras/identidade/stats/ranking);
   - contrato;
   - ações;
   - compatibilidade;
   - objetivos;
   - nota dos assessores;
   - 2–3 cartões de assessor.

   Depois, 7, sendo 2 recolhidos:
   - cartão da dupla;
   - alerta único;
   - CTA;
   - ações secundárias;
   - linha de stats;
   - "Mais sobre a dupla" (recolhido);
   - "Conselhos dos assessores" (recolhido).

   O medidor de primeiro nível conta 3 → 3 (cabeçalho / abas / conteúdo), porque a mudança é dentro do conteúdo.
5. **CTAs primários:**
   - Dupla: 0 → 1 quando há decisão, 0 quando o contrato está ativo e sem decisão;
   - Mercado: 4 → 0 na lista;
   - Contrato: 1 → 1;
   - Treinador e Comissão: 0 → 0;
   - modais: 1.
6. **Hero da dupla:**
   - as iniciais lado a lado (você + parceiro);
   - "Sua dupla", nome, país · idade · nível;
   - **OVR do parceiro · lado · seu OVR**;
   - selo de situação;
   - três números: **Entrosamento** (com rótulo), **Ranking da dupla** (getTeamRank), **Contrato** (dias + "até DD/MM/AAAA");
   - barra de entrosamento e a linha de lados complementares.
7. **Status do contrato:** selo em linguagem de jogo:
   - Contrato ativo;
   - Perto de vencer;
   - Renovação necessária;
   - Parceiro não vai renovar;
   - Encerra no fim do contrato;
   - Encerra após compromissos;
   - Contrato renovado.

   Prazo numa linha só: "33 dias restantes · até 03/03/2026", e não data + dias + status em três blocos.
8. **Separação pendente:**
   - selo "Encerra após compromissos";
   - prazo efetivo = **data da separação** (`resolveScheduledSeparationDate`), não a do contrato;
   - alerta único "Separação após compromissos", que tem prioridade sobre qualquer outro alerta;
   - compromissos listados (`findCommittedTournaments`) com a frase da parceria esportiva;
   - renovação bloqueada ("Contrato em encerramento");
   - ação principal "Buscar próximo parceiro".

   Testado em `test-partner-exit-pending-ui-v531`.
9. **Renovação:**
   - na Visão geral, "Renovar parceria" vira o primário quando perto de vencer ou vencido (leva à aba Contrato);
   - no Contrato, "Renovar e renegociar" com selo de interesse (alto/médio/baixo) + até 2 fatores, duração e parte do prêmio lado a lado, e "Confirmar novo contrato" como único primário;
   - "Encerrar ao fim" e "Rescisão" ficam recolhidos em "Encerrar parceria", com rescisão em dois toques.
10. **Mercado:**
    - cards compactos, sem botão verde;
    - tipo diferenciado por selo ("Recomendado" / "Proposta");
    - "Comparar" e "Analisar proposta" secundários;
    - "Aceitar proposta" é o único primário, no modal, com "N dias · você fica com N%" na linha de baixo;
    - na Busca: os 7 botões de filtro viraram 2 seletores, e o card deixou de ser um `<button>` com outro `<button>` dentro;
    - "Ainda fora de alcance" continua sinalizado (nunca oculto).
11. **Informações no card compacto:** nome, selo de tipo, OVR, lado, estilo, interesse, duração, sua parte do prêmio e compatibilidade (número + rótulo). Parceria **não tem salário**: o "custo" é a divisão do prêmio, mostrada como "você 58%".
12. **Detalhe sob demanda?** **Sim.**
    - **Proposta (modal):** lado, estilo, ranking, interesse, motivo de "primeira dupla", formação sugerida + penalidade, pontos fortes e atenção, termos.
    - **Busca (expandir):** estilo de jogo, explicação de lado, avisos, decomposição da compatibilidade.
    - **Dupla:** "Mais sobre a dupla" traz confiança, moral, identidade, ranking individual, compatibilidade inicial, objetivos, conversas e conflitos.
13. **Comparação:**
    - entre propostas: grade sem largura mínima (compatibilidade, OVR, lado, estilo, interesse, penalidade de lado, duração), sem rolar para o lado no celular; testada com clique real;
    - **dupla atual × proposta** (no modal, quando há parceiro): química atual × compatibilidade estimada e sua parte do prêmio. Só dados existentes; o OVR do parceiro atual não está disponível no painel e não foi inventado.
14. **Staff atual:** cada posição numa linha compacta:
    - o **treinador principal** como líder ("Líder da comissão · N/mês", contrato, confiança, "Obrigatório", "Gerenciar treinador principal");
    - cada profissional com função · especialidade · nível, custo/mês, **"N dias restantes"** (âmbar a ≤30 dias), qualidade, **efeito principal** e satisfação/potencial;
    - renovar e demitir são secundários, demitir em dois toques.
15. **Vagas:**
    - as livres aparecem como posições ("Vaga livre · Ver mercado"), até 3, e levam ao Mercado mensal;
    - sem treinador: "Treinador principal · vaga aberta" com caminho para escolher;
    - vagas e folha ficam no HUD (não repetidos dentro do painel).
16. **Mercado de staff:**
    - cards com função · especialidade, nível (tier), até 2 efeitos, resumo em 1 linha, "N/mês · qualidade Q/P", demanda e **uma** ação;
    - paginação de 6 + "Mostrar mais (N restantes)";
    - indisponível e "Sem vagas disponíveis" sinalizados;
    - filtro de função mantido.
17. **Detalhe do treinador**, na ordem da decisão:
    1. pode contratar?
    2. identidade + afinidade;
    3. **Benefício principal** (2 maiores efeitos em destaque);
    4. 6 efeitos em grade 3×2;
    5. competências;
    6. por que combina (≤2);
    7. comparação com o técnico atual;
    8. custo numa linha + alerta de orçamento;
    9. "Perfil completo" recolhido (filosofia, estilo, métodos, especializações, histórico, conquistas, bio).

    Saiu o parágrafo "Importante:".
18. **Competências compactadas?** **Sim**: 5 linhas com barra fina (rótulo · barra · valor), em vez de 5 caixas.
19. **CTA de contratação:** "Contratar treinador" + "1.800/mês · luvas 3.000" no sublabel; bloqueado mostra o motivo; contratado mostra "Demitir treinador". Dentro das margens em 360, 390, desktop e paisagem (0 cortado).
20. **Custos:**
    - técnico: N moedas/mês · assinatura no card, e /mês · assinatura · % por vitória no modal;
    - staff: N/mês;
    - dupla: % do prêmio.

    Nenhum valor recalculado.
21. **360:** passou.
22. **390:** passou.
23. **Desktop:** passou. O primário da Dupla tem largura própria, não ocupa a linha inteira.
24. **Paisagem:** passou. A partir de 640 px, os CTAs não ocupam a largura toda.
25. **Overflow: 0.**
26. **Erros de JS: 0** (capturas + roteiro funcional).
27. **Lógica de parceria mudou? Não.**
28. **Lógica de staff mudou? Não.**
29. **Testes novos: 10**, com 137 verificações, todos PASS:
    - `test-partner-screen-hierarchy` (18);
    - `test-partner-market-cards` (17);
    - `test-partner-contract-state` (16);
    - `test-partner-exit-pending-ui` (11);
    - `test-staff-screen-hierarchy` (14);
    - `test-staff-market-cards` (14);
    - `test-coach-detail-layout` (16);
    - `test-contract-cta-overflow` (9);
    - `test-partner-no-overflow` (6);
    - `test-staff-no-overflow` (6);
    - kit: `scripts/lib/v531UiKit.mjs`.

    Também o roteiro funcional com cliques reais (`functional.json`): **46/46**, sendo 22 com parceiro e 24 sem.
30. **Testes que passaram:** seleção de **148** testes (todos os que leem os arquivos tocados + os de ciclo de vida de parceria/contrato/técnico/staff):
    - 123 passaram de primeira;
    - 4 marcados como regressão, todos esclarecidos (item 31) e passando;
    - 21 preexistentes.
31. **Regressão nova real: 0.** Os 4 marcados:
    - **3 atualizações esperadas de teste** (protegiam markup literal do layout antigo; a intenção foi mantida):
      - `test-partner-decision-state-ui`: o token cru `encerra_apos_compromisso` saiu do PartnerHub. Agora exige `getContractDecisionState` + `ENDING_AFTER_COMMITMENTS` no hub e o rótulo "Encerra após compromissos" em `partnerScreen.js`.
      - `test-coach-market-curation`: "sem treinador não finge confiança/afinidade". Agora confere que elas só existem no cartão do técnico contratado.
      - `test-mobile-game-feel-m4-1`: o "stat strip". Dupla e Treinador aceitam o cartão hero como estado curto, sem HUD duplicado; as demais páginas continuam exigindo o HUD.
    - **1 load/flaky:** `test-former-partner-reintegration-v518` estourou o limite de 240 s sob carga. Rodado isolado: **7/7 PASS**. Não lê nenhum arquivo de UI.

    Também atualizados, por decisão de layout pedida na 5.31-A:
    - `test-coach-market-compact-layout`: "card expõe uma ação clara" + "o modal contém o CTA real de contratação";
    - `test-mobile-compact-ux-m4`: mesma regra do hero. Esse teste continua preexistente por outro gate, o `dense` da 5.28.
32. **Preexistentes (21, iguais no HEAD `742ee4a`):**
    - test-former-partner-world-continuity-v518
    - test-global-overlays-audit
    - test-live-match-landscape-contract-v520d
    - test-live-match-mobile-contract-v520d
    - test-long-career-partner-ecology-v518
    - test-micro-gate-post-partner-tactics-v527g
    - test-mobile-compact-ux-m4
    - test-mobile-game-app-experience-m4-2
    - test-notification-system-audit-rc
    - test-partner-athlete-idempotency-v512
    - test-partner-athlete-ovr-scale-v512
    - test-partner-engine-ovr-authority-v526b
    - test-phase15-3-economy-progression-navigation
    - test-phase15-5-1-critical-training-center
    - test-phase15-5-4-critical-mobile-qa
    - test-player-post-separation-market-v518
    - test-premium-interfaces-v33
    - test-premium-relations-v33-8
    - test-ranking-ui-authority-v56
    - test-staff-architecture-v29-1
    - test-ui-redesign
33. **Warnings:**
    - os FABs ainda encostam em cards no celular, sem cobrir CTA (problema antigo);
    - as abas da Comissão quebram em 2 linhas no celular (5 abas);
    - o modal de proposta continua com rolagem interna em 390 (conteúdo reorganizado, mesma altura);
    - o OVR do parceiro atual não está na comparação "atual × proposta" (não existe no painel);
    - estados especiais validados por render com dados de exemplo, não em carreira real.
34. **Recomendo APK para smoke físico?** **Sim** (fase 5.31-A).
35. **VEREDITO FINAL: A−** até o Android físico.

## Mudanças de UX deliberadas (não são regressão)

| Antes | Agora | Motivo |
|---|---|---|
| "Encerrar" na Visão geral: **1 toque encerrava a dupla** | 1º toque abre a confirmação; 2º toque ("Confirmar") encerra; "cancelar" desfaz | Segurança operacional: uma ação irreversível não pode estar a um toque, colada em "Conversar" |
| Card de técnico com 2 botões equivalentes ("Ver detalhes" + "Contratar"), que abriam o MESMO modal | 1 ação por card ("Ver detalhes", ou "Ver requisitos" quando bloqueado); a contratação continua só no modal | Uma ação clara por candidato |
| HUD no topo da Dupla e do Treinador | Removido (o cartão hero mostra os mesmos números) | Duplicação |

## Evidências

- `before/` e `after/`: `<tela>-<estado>-<largura>.png` (+ `-full` em 360/390) e `measurements.json`.
- `compare/`: 14 pares antes | depois.
- `functional.json`: cliques reais, só leitura e navegação. Nada aceito, contratado, demitido, renovado ou encerrado.
- `tests.json`: os 148 testes com comparação contra o HEAD e a classificação final.
- Ferramentas:
  - `scripts/ui-audit-531.mjs`;
  - `tools/functional.mjs`, `switch-career.mjs`, `compare.mjs`, `run-tests.mjs`, `tests.txt`.

## Line endings

O repositório normaliza por `.gitattributes` (`* text=auto`): o índice guarda **LF** (`git ls-files --eol` → `i/lf`). CRLF no diretório de trabalho é só artefato de checkout. O commit grava LF de qualquer forma, então não há o que restaurar e não há diff de fim de linha.
