# Padel Legacy — Auditoria de prontidão para testes externos

Base: `integracao/cloud-6o`, `ea79766` (LOCAL-8F) + LOCAL-8G sem commit. Data da auditoria: 2026-10-21.

**Escopo:** só auditoria e planejamento. Nenhum código de produção foi alterado por causa destes achados.

**Pergunta:** o que falta para que outras pessoas instalem o Padel Legacy, criem uma carreira e joguem de forma satisfatória?

## 1. Resposta curta

O **núcleo técnico está pronto para um primeiro teste fechado no navegador ou desktop**:

- A carreira nova funciona de ponta a ponta sem visitar telas específicas (LOCAL-8F, teste integrado 9/9).
- 10 temporadas simuladas sem travar (LOCAL-8A: 1 241 torneios, 0 travados).
- Save/load é íntegro (64 MB, 34 coleções idênticas) e o avanço é determinístico.
- A navegação não altera a carreira (LOCAL-8C a 8G).

O que **não está pronto** é o que mais importa para o jogador:

1. **A progressão não foi validada.** Ninguém mostrou que um jogador real chega ao topo, nem quanto tempo leva. As evidências apontam para um início difícil e um topo raramente alcançado (§4).
2. **Android não foi testado em aparelho:** instalação, persistência, retomada e desempenho.
3. **O desempenho cresce com a carreira:** save de 64 MB e 911 MB de heap na temporada 10, medidos no desktop.
4. **Não existe fim de carreira**: a aposentadoria é só uma marca, sem tela de encerramento nem pós-carreira.

**Recomendação:** um primeiro teste externo **fechado, pequeno (5–10 pessoas), em navegador ou Windows**, focado nas 2–3 primeiras temporadas, depois de cumprir os itens obrigatórios do §8. Android fica para a segunda rodada, depois da validação em aparelho.

## 2. Contagem de achados

| Gravidade | Quantidade | Itens |
|---|---|---|
| **P0** (bloqueador) | **0 confirmados** | nenhum defeito confirmado impede iniciar ou continuar uma carreira no navegador/desktop |
| **P1** (grave) | **4** | R1 progressão não validada · R2 Android não validado em aparelho · R3 desempenho cresce com o save (risco em mobile) · R4 build Windows/Tauri não verificado nesta fase |
| **P2** (importante) | **7** | R5 sem fim de carreira · R6 sem exportação/importação de save · R7 mensagem de save incompatível não verificada na UI · R8 períodos sem parceiro e sem negociação antecipada · R9 riscos antigos de atomicidade no treino não reverificados · R10 economia não auditada no longo prazo · R11 primeira partida/torneio pode ser difícil demais (6D/6E) |
| **P3** (melhoria) | **6** | R12 testes desatualizados ou frágeis: `sponsor-eligibility-authority-v526c`, `premium-market-v33-4`, `hotfix-rc1-press`, baseline byte a byte da CLOUD-7B1 (falha desde pelo menos `4226055`) e o cenário do 7G.1 sensível ao relógio determinístico · R13 status da exibição pré-temporada (8A-A2) · R14 dev server degradado após trocas de arquivo · R15 estados vazios a revisar · R16 iOS não iniciado · R17 `metadata.career_date/season` da lista de carreiras com a data do PC (só exibição; corrigir junto com a regeneração dos baselines) |

## 3. Matriz de sistemas

Estados: **COMPLETO** · **FUNCIONAL COM LIMITAÇÕES** · **INCOMPLETO** · **NÃO IMPLEMENTADO** · **NÃO VERIFICADO**. A classificação vem de código e testes executados, não da existência de telas.

### Carreira

| Sistema | Estado | Evidência | Gravidade | Próxima ação |
|---|---|---|---|---|
| Criação de personagem, nome, lado, estilo, dificuldade | COMPLETO | teste integrado 8F (UI), onboarding-v3 (172), tutorial (27 etapas) | — | — |
| Idade inicial / envelhecimento | FUNCIONAL COM LIMITAÇÕES | `career.js`: idade pela data de nascimento e da carreira; declínio de atributos depois dos 30 (−1/ano, −2 depois dos 35) | P2 | validar a curva de auge/declínio contra o desenho (não exercitada: a 8A vai só até os 26 anos) |
| Evolução de atributos e treino | FUNCIONAL COM LIMITAÇÕES | treino v2, teto de atributos, testes de economia de treino | P1 (R1) | validar o ritmo com jogador real (§4) |
| Energia, fadiga, recuperação | COMPLETO | `normalizeFatigue`, testes de energia | — | — |
| Lesões | FUNCIONAL COM LIMITAÇÕES | `injuryRecoveryLifecycle`, walkover pré-partida, softlock de lesão corrigido na Fase 10 | P3 | — |
| Fisioterapia | NÃO VERIFICADO | campo `did_physio_today`, sem teste dedicado | P3 | teste de fumaça |
| Auge e declínio | FUNCIONAL COM LIMITAÇÕES | atletas da IA com `peak_age` 26–30; jogador por idade | P2 | — |
| Aposentadoria do jogador | INCOMPLETO | aos 40 anos `retired = true` e marco na história; botão de encerrar no Legado; **nada bloqueia nem encerra a carreira, não há tela final** | P2 (R5) | definir o fim de carreira (tela de legado final, bloqueio do avanço) |
| Pós-carreira como treinador | NÃO IMPLEMENTADO | nenhum código | futuro | — |

### Competição

| Sistema | Estado | Evidência | Gravidade | Próxima ação |
|---|---|---|---|---|
| Calendário (15 meses, viradas de mês e temporada) | COMPLETO | 8A (1 241/1 241), 8G-01 (viradas idênticas com e sem visita) | — | — |
| Inscrições | COMPLETO | 21 testes de inscrição; regras de dupla obrigatória | — | — |
| Chaves e qualifying | COMPLETO | 41 testes de chave, LOCAL-7F | — | — |
| Simulação e partida ao vivo, narração | COMPLETO | 7 testes de partida ao vivo, motor de partida (balance CLI) | — | — |
| Resultados, premiações, pontos | COMPLETO | 8A: 0 erros de pontos em cerca de 5 500 conferências | — | — |
| Ranking individual, duplas e Race | COMPLETO | LOCAL-7D/7G, 5.32-A, 112 testes de ranking | — | — |
| Temporadas e torneios especiais (Finals, Crown) | COMPLETO | CLOUD-7D1, testes de Finals multitemporada | — | — |
| Exibição pré-temporada | FUNCIONAL COM LIMITAÇÕES | 8A-A2: fica "inscrições" depois da data quando não disputada | P3 (R13) | encerrar no tick diário |

### Relacionamentos

| Sistema | Estado | Evidência | Gravidade | Próxima ação |
|---|---|---|---|---|
| Propostas de parceiros | COMPLETO | 8F-01 e 8G-02 (lote único, janelas de calendário, sem duplicatas) | — | — |
| Contratos, renovação, recusa, separação | FUNCIONAL COM LIMITAÇÕES | 92 testes de parceria; mercado pós-separação (3/7 dias) | P2 (R8) | ver R8 |
| Troca de dupla e compatibilidade de lados | COMPLETO | primeira dupla ×5 testes, compatibilidade preservada | — | — |
| Relacionamentos (atletas) | FUNCIONAL COM LIMITAÇÕES | histórico por partida e interação; sem teste dedicado | P3 | — |
| Negociação antecipada de parceiros | NÃO IMPLEMENTADO | — | P2 (R8) | §7 |

### Economia

| Sistema | Estado | Evidência | Gravidade | Próxima ação |
|---|---|---|---|---|
| Saldo, receitas, despesas, extrato | COMPLETO | fluxo financeiro 5.27-M (14 + 11) | — | — |
| Premiações | COMPLETO | tabela oficial, 8A | — | — |
| Treinadores | COMPLETO | 8F-06 (fonte única, valor exibido = cobrado) | — | — |
| Loja e equipamentos | COMPLETO | 8E (sem duplicação), 8F-07 (relíquias), bônus de equipamento (14) | — | — |
| Patrocínios | FUNCIONAL COM LIMITAÇÕES | 23 de 23 alcançáveis, escala de patrocínio; o teste de elegibilidade está desatualizado (R12) | P3 | atualizar o teste |
| Contratos comerciais (Mercado Vivo) | NÃO IMPLEMENTADO | backlog `FUTURE_LIVE_BRANDS_SPONSORSHIP_MARKET.md` | futuro | §7 |
| Equilíbrio econômico de longo prazo | NÃO VERIFICADO | 8A não audita a economia; o simulador estatístico antigo apontava `ECONOMY_TOO_RICH` | P2 (R10) | auditoria econômica com jogador realista |

### Mundo

| Sistema | Estado | Evidência | Gravidade | Próxima ação |
|---|---|---|---|---|
| Atletas (população, evolução, aposentadoria da IA) | COMPLETO | 8A, LOCAL-7G.1, diretório 8C | — | — |
| Técnicos, clubes | COMPLETO | 8F (catálogo na ativação, lote único) | — | — |
| Notícias e Jornal | COMPLETO | 8E-02, 8F-04 (diário determinístico) | — | — |
| Entrevistas e imprensa | COMPLETO | 8G-05; consistência de entrevistas | — | — |
| Eventos e macroeventos | FUNCIONAL COM LIMITAÇÕES | os macroeventos têm efeitos declarados, mas só a tela os exibe (`computeCombinedEffects` não é aplicado ao jogo) | P3 | decidir se os efeitos entram na regra ou se viram só narrativa |
| Missões (tutorial) | COMPLETO | 8F-02, 9 testes | — | — |
| Conquistas | COMPLETO | 8F-03 (pagas no avanço, uma vez), 20 testes | — | — |
| Enciclopédia | COMPLETO | 8G-03 (estática) | — | — |

### Plataforma e dados

| Sistema | Estado | Evidência | Gravidade | Próxima ação |
|---|---|---|---|---|
| Persistência e save/load | COMPLETO | 8A (64 MB íntegro), CLOUD-7B1, 8E–8G | — | — |
| Versionamento de save | FUNCIONAL COM LIMITAÇÕES | `CareerMigration` recusa versão inválida ou **futura**; a mensagem ao jogador não foi verificada na UI | P2 (R7) | testar save incompatível no navegador |
| Exportar/importar save | NÃO IMPLEMENTADO (na UI) | só backups internos; a 8B confirmou que não há caminho de importação no aparelho | P2 (R6) | §8 |
| Desempenho | FUNCIONAL COM LIMITAÇÕES | dia mediano 212 → 1 161 ms; save 12 → 64 MB; heap até 911 MB (8A, desktop) | P1 (R3) | medir no Android; retomar compactação ou poda (7B2B) se necessário |

## 4. Experiência do jogador

Separação entre fato comprovado e hipótese.

**Comprovado:**

- **Início guiado:** tutorial de 27 etapas (identidade → dupla → treinador → treino → calendário → torneio → partida), com estados de carreira nova cobertos. Depois da 8F, propostas, catálogos e missões existem sem depender de visitas.
- **Primeira dupla:** propostas com idade, país, lado e compatibilidade (5.32-C.1, 8F). Recusar todas não gera propostas sem fim; novas chegam em 3 e 7 dias, e a busca manual fica sempre disponível.
- **Sem dupla, sem inscrição** (regra correta). Na simulação longa, o harness sem renovação passou cerca de 10 meses por ano sem dupla, com 82–96 inscrições recusadas por ano. Um jogador real que deixe o contrato vencer também fica parado: R8.
- **Mobile (viewport):** 55 testes de contenção e toque em 360–1600 px passam (ranking, mundo, diretório, partida ao vivo). Isso **não** equivale a teste em aparelho.

**Hipóteses e riscos de design (precisam de teste com pessoas):**

- **Ritmo da progressão** (R1, R11): na CLOUD-6D/6E, o início ficou bem mais difícil depois do rebalanceamento 6B, com um "salto de força Silver→Gold" e o teto de rank 400 da base sem aviso. No simulador estatístico da Fase 13 (1 000 carreiras × 10 temporadas), só **7 de 1 000** chegaram ao top 10 e nenhuma ao top 5 ou ao nº 1. Isso é anterior a vários ajustes e, portanto, indicativo, não conclusivo. **Risco real de frustração** nas primeiras horas.
- **Frequência de decisões:** o dia a dia é avançar, treinar e inscrever; as decisões fortes (dupla, contratos, torneios) são espaçadas. Não medido.
- **Feedback pós-partida, clareza de contratos e de economia:** telas existem e foram polidas (5.31/5.32), mas sem teste de usabilidade.
- **Fim de carreira** (R5): um testador dificilmente chega aos 40 anos (cerca de 24 temporadas), então isso não é crítico para a primeira rodada.

## 5. Carreira longa

- **Reaproveitada:** LOCAL-8A, `cloud-7c-long-career.mjs`, pipeline real: 10 temporadas, 3 650 dias, 80 min, 0 falhas, 0 torneios travados, pontos e ranking íntegros, persistência íntegra e determinismo em 35 dias. Limitações: uma seed e uma estratégia automática não representativa (troca de parceiro sem renovar), então **progressão e economia não foram avaliadas**.
- **Executada nesta fase sobre o código atual (8F + 8G):** mesmo simulador, seed `8a`, **2 temporadas** (cerca de 730 dias, 9,9 min).
  - Integridade ok nas duas temporadas; recargas do save ao fim de cada uma sem falha.
  - 52 torneios disputados, 0 decisões bloqueadas, 1 título.
  - Rank 434 → 326, OVR 39 → 43, saldo 13 493 → 19 527 moedas, save 12,4 → 19,0 MB, heap 272 → 374 MB.
  - As mesmas contagens da 8A nas mesmas temporadas (38 e 14 torneios, mesmo tamanho de save).
  - Evidência: `reports/external-test-readiness/longrun-2-seasons/`.
  - **Ressalva:** o dia mediano saiu 308/546 ms, contra 212/329 ms na 8A. A rodada disputou CPU com lint e build. O estágio diário de conquistas (8F) mede 26–63 ms por dia na temporada 10, o que não explica toda a diferença. É preciso **medir isolado** antes de concluir (R3).
  - 10 temporadas não foram repetidas nesta fase (cerca de 80 min); o baseline é a 8A.
- **Não afirmo** que a carreira foi validada de ponta a ponta com um jogador real: isso não aconteceu.

## 6. Plataformas

| Plataforma | Estado | Evidência | Pendência |
|---|---|---|---|
| **Web (navegador)** | **pronto para teste fechado** | Chrome real (puppeteer): inicialização, navegação, persistência e recarga (8F integrado); responsividade 360–1600 (55 testes) | testar em Firefox/Safari; aviso sobre armazenamento do navegador (limpar dados apaga a carreira) |
| **Windows/Tauri** | **não verificado nesta fase** | `tauri.conf.json` com alvos `msi`/`nsis` e armazenamento nativo (`GameStorage` Tauri); nenhum instalador recente em `src-tauri/target/release` | R4: gerar e instalar o build, abrir, criar carreira, fechar e reabrir |
| **Android** | **preparado, não validado** | LOCAL-8B: APK candidato assinado e roteiro escrito; instalação aguardando autorização; sem importação de saves | R2/R3: instalar, criar carreira, avançar semanas, fechar e reabrir, medir memória e avanço |
| **iOS** | **não iniciado** | não existe `src-tauri/gen/apple`; Tauri 2 suporta iOS, mas exige macOS + Xcode + conta Apple | R16: decisão de produto; fora da primeira rodada |

Nada foi testado fisicamente em Windows instalado, Android ou iOS nesta execução.

## 7. Funcionalidades futuras discutidas

| Funcionalidade | Essencial para a 1ª versão externa? | Justificativa |
|---|---|---|
| **Negociação antecipada de parceiros** (negociar a próxima dupla quando a atual não renova) | **Não essencial, recomendada para a 2ª rodada** | O buraco que ela cobre (dias sem dupla, sem inscrição) existe, mas já há busca manual a qualquer momento e o mercado pós-separação traz propostas em 3 e 7 dias. Para a 1ª rodada basta um **aviso claro** antes do vencimento do contrato (já existe aviso de renovação) e medir com os testadores se o buraco incomoda. |
| **Mercado Vivo** (marcas, contratos, equipamentos, descontos) | **Não essencial** | Loja, equipamentos e patrocínios atuais funcionam (8E/8F). É evolução de profundidade, com design e economia próprios; incluir agora aumentaria o risco de balanceamento numa fase em que a progressão ainda não foi validada. |

## 8. Roadmap até a primeira distribuição externa

**Fase A — obrigatório antes do 1º teste externo (fechado, web/Windows):**

1. **Validar a progressão (R1/R11):** corrigir a estratégia do harness (renovar a dupla e escolher categoria compatível) e simular 3–5 seeds × 3 temporadas com perfil de jogador realista. Medir rank aos 6/12/24/36 meses, títulos e saldo. Ajustar a curva **só** com evidência.
2. **Build de distribuição (R4):** gerar o instalador Windows (ou publicar a build web), instalar numa máquina limpa, criar uma carreira, fechar e reabrir, e conferir onde o save fica.
3. **Exportar save (R6), mínimo:** um botão "Exportar carreira" (arquivo JSON) para os testadores anexarem aos relatos de bug. A importação pode esperar.
4. **Save incompatível (R7):** verificar na UI a mensagem de versão futura ou inválida e a opção "nova carreira", sem apagar dados.
5. **Canal de feedback:** formulário ou link fixo nas configurações, com a versão do jogo e a data da carreira.

**Fase B — recomendado antes do 1º teste externo:**

6. Aviso explícito de "contrato de dupla vencendo, sem renovação" e caminho direto para a busca (R8, sem negociação antecipada).
7. Auditoria econômica de 3 temporadas com o harness corrigido (R10).
8. Reverificar os riscos de atomicidade no treino da Fase 10 (R9).
9. Atualizar ou endurecer os testes desatualizados e frágeis (R12). Decidir a regeneração do baseline da CLOUD-7B1 e, junto com ela, corrigir a `metadata` com a data da carreira (R17). Encerrar a exibição pré-temporada não disputada (R13).
10. Medir isolado o custo do dia (R3): a rodada de 2 temporadas desta fase saiu mais lenta que a 8A, mas medida com CPU disputada.

**Fase C — segunda rodada (inclui Android):**

11. Android em aparelho (R2/R3): instalação, persistência, retomada e desempenho com carreira nova e com um save avançado gerado; decidir compactação ou poda (7B2B) se o avanço passar de cerca de 2 s.
12. Negociação antecipada de parceiros, se a 1ª rodada mostrar que os dias sem dupla frustram.
13. Fim de carreira (R5): tela de encerramento, legado final e bloqueio do avanço depois da aposentadoria.

**Depois:** Mercado Vivo, pós-carreira como treinador, iOS.

**Critérios de entrada no 1º teste externo:**

- Fase A concluída.
- Nenhum P0 e nenhum P1 aberto **na plataforma do teste**.
- Regressões verdes (exceto as desatualizadas documentadas).
- Uma carreira nova jogada à mão por pelo menos 1 temporada sem bloqueio.

**Critérios de saída do 1º teste externo:**

- 0 perdas de save.
- 0 bloqueios que impeçam continuar.
- Pelo menos 70% dos testadores concluem a 1ª temporada.
- Mediana de tempo até o 1º título dentro da faixa de design.
- Lista de P1/P2 de experiência priorizada para a 2ª rodada.

## 9. Riscos para os primeiros testadores

1. **Frustração no início** (progressão lenta ou derrotas seguidas): o maior risco, e não medido.
2. **Perda de carreira no navegador** ao limpar dados do site: avisar e oferecer exportação.
3. **Lentidão crescente** em carreiras longas (desktop aceitável até a T10; mobile desconhecido).
4. **Dias parados sem dupla** depois de deixar o contrato vencer.
5. **Falta de fecho** para quem joga muito tempo (sem fim de carreira).

## 10. Evidências desta auditoria

- `reports/external-test-readiness/` (simulação longa desta fase).
- Referências: `docs/LOCAL_8A_CAREER_AUDIT.md`, `docs/LOCAL_8B_ANDROID_VALIDATION.md`, `reports/cloud-phase-6d-*/`, `reports/cloud-phase-6e-*/`, `reports/fase13-career-milestone-ages.json`, `docs/BETA_READINESS_PHASE10.md`, `docs/LOCAL_8C…8G`.
