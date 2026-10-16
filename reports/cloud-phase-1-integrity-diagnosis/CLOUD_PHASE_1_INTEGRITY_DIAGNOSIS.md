# CLOUD-1 — Diagnóstico de integridade

**Base:** `cloud/phase-0-test-baseline` @ `efc1a3f` (= `4fac81d` + baseline CLOUD-0).
**Branch:** `cloud/phase-1-integrity-diagnosis` (local, não publicada).
**Data:** 16/10/2026.

**Regras desta fase:**
- nenhum arquivo de `src/`, teste, schema, balanceamento ou save alterado;
- reproduções 100% em memória;
- nenhum arquivo versionado de evidência foi tocado.

## Veredito: **CLOUD-1 READY FOR HUMAN REVIEW**

As três falhas "de lógica" do CLOUD-0 **não são bugs do jogo**. Em todas, o código mudou de propósito numa fase anterior e o teste não acompanhou:

| | Teste | Causa confirmada | Bug no jogo? |
|---|---|---|---|
| A | `test-career-persistence-integrity` | A fixture inscreve a dupla com `teamRank: 200` num **Silver**. A regra de teto `OPEN_TIER_CEILING = 400` (Fases 5.3/5.6) recusa a inscrição, e o teste não confere `success`. Sem inscrição, não há evento nem `tournament_run`. | **Não.** Com ranking elegível, o run é criado em D-3, persistido e sobrevive ao reload |
| B | `test-phase15-5-1-critical-training-center` | O teste fixa `Math.random = () => 0.99`. `makeId` gera `<prefixo>-<Date.now()>-<6 dígitos do random>`, e todo id do mesmo ms vira `…-zn1fu8`. | **Só em teoria:** chance ~2×10⁻³ em 10 anos de jogo; o efeito seria um avanço de dia que falha e é desfeito por inteiro, sem corromper o save |
| C | `test-ranking-rolling-window-fase4` | A 5.26-C passou a **decair linearmente** a âncora legada (100% → 0% em 364 dias) para eliminar o "penhasco" de 03/01/2027 (−64% dos pontos do mundo num dia). O teste ainda espera a regra antiga (100% até expirar). | **Não.** Regra nova deliberada e documentada |

**Dois achados novos que merecem atenção humana:**
1. **Possível lacuna real de UX no Android.** O campo **"Nome do atleta" do tutorial** (`src/pages/Missions.jsx:465`) não tem `onFocus → scrollIntoView`. O teclado pode cobri-lo. Essa proteção não existe em nenhuma versão do histórico Git; o campo equivalente em `CareerManager.jsx:585` tem. Precisa de validação no Redmi 12.
2. **Robustez:** `calendarSystem.js:443` chama `ensureTournamentDraw(...).catch(() => null)`. Qualquer erro do sorteio desaparece em silêncio, sem log nem diagnóstico. Foi assim que a causa A ficou escondida.

---

## A — Persistência de torneios (`tournament_run`)

### Ciclo de vida (como funciona hoje)
1. **Inscrição.** `registerTournament` (`src/lib/tournamentRegistration.js`) valida pela `EntryManager.evaluateTournamentEntry`.
   - Se aceita, cria um `CalendarEvent` (`event_type:'tournament'`) com `metadata.registration_id`.
   - Se recusa, devolve `{ success:false, reasons }` e **não cria nada**.
2. **Sorteio em D-3.** `processCalendarEvents` (`src/lib/calendarSystem.js:440`) chama `ensureTournamentDraw` (`src/lib/tournamentDraw.js:428`) quando `isTournamentDrawDue` (âncora `start_date`, até 3 dias antes).
   - Nesse momento grava `metadata.tournament_run` (+ `tournament_run_schema_version: 2`).
   - O Tournament passa para `chaveamento`.
   - Guardas: só sorteia com `registration_id` (o evento de demonstração do seed nunca sorteia) e nunca ressuscita evento vencido.
3. **Partidas e encerramento.** `tournamentLifecycle.js` atualiza o run.
   - Desistência grava o run com status de abandono (`:218`).
   - A finalização registra a chave em `profile.processed_tournament_runs` (`:469`).
   - **Nenhum caminho apaga `tournament_run`.**
4. **Save e reload.** O run vive dentro de `career.entities.CalendarEvent[].metadata`. É serializado no JSON da carreira como qualquer outro campo, e não há migração de schema que o toque. A migração v1 do run (`normalizeLegacyRun`) só completa campos.

### Reprodução mínima
`repro/repro-a-tournament-run.mjs`: storage em memória, mesmo cenário do §8 do teste. Saídas em `repro-a-output-rank*.json`.

| | `teamRank: 200` (fixture do teste) | `teamRank: 600` (elegível) |
|---|---|---|
| Inscrição | **`success:false` — `SPORTING_INELIGIBLE`: "Ranking já classifica para tiers acima (Top 400) — não disputa mais a base."** | `success:true` |
| `CalendarEvent` do torneio | nenhum, em nenhum dia | criado em 01/01 (`scheduled`) |
| 05/01 (D-3) | Tournament continua `inscricoes` | sorteio → `tournament_run` criado; Tournament `chaveamento` |
| JSON persistido | 0 eventos do torneio | evento com `tournament_run` e `tournament_run_schema_version` |
| Após `loadCareer` (reload) | `hasRun:false` (nunca existiu) | **`hasRun:true`** |

### Conclusão
- **Causa confirmada:** fixture desatualizada. A regra de teto (`EntryManager.js:207`, comentário das Fases 5.3/5.6) é intencional e anterior ao histórico Git.
- O teste chama `registerTournament` sem verificar o retorno, então a falha aparece **oito passos depois** como "run sumiu após reload".
- **Persistência íntegra.**

| Item | Avaliação |
|---|---|
| Impacto no jogador | Nenhum. Na UI, a inscrição recusada mostra o motivo |
| Risco para saves antigos | Nenhum |
| Correção recomendada | Só no teste: ranking elegível (ou tier sem teto) e `gate(registration.success)` logo após a inscrição |
| Melhoria opcional (código) | Registrar diagnóstico no `.catch` de `calendarSystem.js:443`, sem mudar comportamento |
| Testes de regressão | O §8 corrigido, mais uma variante "inscrição recusada não cria evento" |

## B — Ids duplicados de `WorldEvent` (Centro de Treinamento)

### Geração de ids
`makeId` em `src/gameplay/repositories/CareerEntityRepository.js:21`:

```
`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
```

- Só ids do **mesmo milissegundo** podem colidir. O `bulkCreate` gera todos os ids num laço síncrono, então os itens do lote costumam compartilhar o ms.
- O formato é **deliberado**: o comentário das Fases 0.1/8.8 explica que `selectPair` faz hash FNV-1a do id, então mudar o formato mexe no balanceamento. O harness de auditoria torna os ids determinísticos substituindo `Math.random`/`Date` por um PRNG, que avança a cada chamada.
- O teste usa `() => 0.99` (constante), e `(0.99).toString(36).slice(2,8) === "zn1fu8"`. É exatamente o sufixo visto aqui e nos `tests.json` do Windows.

### Reprodução mínima determinística
`repro/repro-b-world-event-id.mjs`, executada 3 vezes com o mesmo resultado (`repro-b-output.json`):

| Caso | Resultado |
|---|---|
| 1. `bulkCreate` de 2 com `Math.random` real | ids distintos ✓ |
| 2. Mesmo, com `Math.random` constante + `Date.now` fixo | **erro** `WorldEvent já existe com o id: …-zn1fu8` |
| 3. Colisão **dentro de uma transação de persistência** (como no avanço de dia) | a colisão marca `rollbackError`; um `PlayerProfile.update` **sem relação** falha com o **mesmo erro**; a transação aborta; o **arquivo confirmado não muda** e as moedas continuam 1000 depois do reload |
| 4. Probabilidade com `Math.random` real (espaço de 36⁶ ≈ 2,18×10⁹) | por lote: 2×10⁻⁸ (n=10), 5,6×10⁻⁷ (n=50), 9×10⁻⁶ (n=200); **10 anos com 50 ids por dia ≈ 0,2%** |

**Por que a cascata no log do teste?** É a atomicidade de `ActiveCareerAdapter.mutateActiveCareer` (`:235-255`): "qualquer erro invalida a transação completa e descarta o draft". Por isso Comissão técnica, GameState, sistema médico e circuito registram o mesmo erro. Não há corrupção: o dia inteiro é desfeito.

| Item | Avaliação |
|---|---|
| Afeta só o teste? | O gatilho é do teste (random constante). No jogo real é teórico, mas não impossível |
| Impacto no jogador (se ocorrer) | O avanço de dia falha e é revertido por inteiro (treino, custos, atributos e calendário intactos). A nova tentativa usa outro ms e passa. Nenhum dado perdido |
| Idempotência e reprocessamento | Preservados: rollback atômico, sem escrita parcial |
| Risco para saves antigos | Nenhum |
| Correção recomendada (teste) | Trocar a constante por um PRNG semeado (o padrão `installDeterminism`), ou restaurar `Math.random` antes da simulação do mundo |
| Correção opcional (código, só com autorização) | Em `create`/`bulkCreate`/batch, **gerar de novo o id só quando colide** (mesmo formato, então `selectPair` e o harness ficam intactos). Não mudar o formato do id |
| Testes de regressão | O caso 2 da reprodução virando sucesso com retry; paridade do harness determinístico (`audit:real-athletes-simulation`) inalterada |

## C — Janela móvel do ranking

### Regras atuais (`src/game-core/rankingWindow.js`)
- **Janela de 364 dias.** `isResultExpired` usa `idade > 364`: expira no dia 365.
- **Best-22.** `RANKING_BEST_N`.
- **Âncora legada** (`buildLegacySeedRow`): uma linha por atleta sem resultados datados, valendo o total vitalício, datada no primeiro toque do circuito.
- **Desde a 5.26-C** (`effectiveResultPoints`), a âncora vale `pontos × (364 − idade)/364`. Resultados reais não decaem.
- O recálculo semanal em `circuitLifecycle.js:276-282` (atletas) e `:375-381` (jogador) usa essas mesmas funções.

### Linha do tempo (repro pura, `repro/repro-c-ranking-window.mjs`)
Cenário do teste: "Top 10 inativo" com âncora de 6.000 em 29/12/2025, e 25 fillers ganhando 100 por semana.

| Semana | Data | Idade (d) | Regra atual (5.26-C) | Esperado pelo teste | Fillers |
|---|---|---|---|---|---|
| 1 | 29/12/2025 | 0 | 6.000 | 6.000 | 100 |
| 2 | 05/01/2026 | 7 | 5.885 | 6.000 | 200 |
| 13 | 23/03/2026 | 84 | 4.615 | 6.000 | 1.300 |
| 26 | 22/06/2026 | 175 | 3.115 | 6.000 | 2.200 |
| 34 | 17/08/2026 | 231 | **2.192**, ultrapassado pelos fillers (2.200) | 6.000 | 2.200 |
| 39 | 21/09/2026 | 266 | 1.615 | 6.000 | 2.200 |
| **52** | 21/12/2026 | 357 | **115** | **6.000** ← gate | 2.200 |
| 53 | 28/12/2026 | 364 | 0 (ainda não expirada, vale 0) | 6.000 | 2.200 |
| 54 | 04/01/2027 | 371 | 0 (expirada) | 0 | 2.200 |

**Diferença entre a regra e o teste:**
- O gate 4C.1 ("não decai antes de 52 semanas") **é exatamente a premissa que a 5.26-C revogou**.
- A troca foi registrada em `reports/progression-clean-526c/PROGRESSION_CLEAN_AUDIT_526C.md` (§1, com antes e depois: −63,8% → −0,2% de pontos do mundo no dia das 888 expirações).
- Naquela fase, outro teste (`test-race-circuit-ledger-parity-v5`) foi atualizado. Este ficou fora da seleção de regressão da 5.26-C.

**Borda da semana 52/53, virada de temporada e jogador ativo × inativo:**
- **Bordas:** não há off-by-one. No dia 364 a âncora vale 0 sem estar expirada, e no dia 365 expira. É coerente.
- **Virada de temporada:** não toca o World. Só a Race zera em 01/01 (`annualCareerReportLifecycle`).
- **Ativo × inativo:** um atleta ativo substitui a âncora nos best-22 antes; um inativo converge para zero ao longo da janela.

| Item | Avaliação |
|---|---|
| Impacto no jogador | Comportamento pretendido: sem queda brusca coletiva em 03/01/2027 |
| Efeito colateral de design (para decisão humana) | Um atleta legado de elite que para de jogar perde posição **gradualmente desde a migração** (aqui, sai da frente dos fillers na semana 34), e não de uma vez no fim da janela |
| Risco para saves antigos | Nenhum novo: a regra já está em produção desde o 9001 |
| Correção recomendada | **Atualizar o teste** para a regra da 5.26-C (linear, com tolerância de 7 dias como a 5.26-C fez no outro teste; 0 em 364; expira em 365). Manter os gates 4C.3 (tier móvel) e 4C.4 (dado de expiração) |
| Mudança de regra | **Nenhuma recomendada.** Se a premissa antiga for desejada, é decisão de balanceamento e exige rodar o harness 5.26-C/5.27 |
| Testes de regressão | `test-ranking-rolling-window-fase4` atualizado + `test-race-circuit-ledger-parity-v5` + `test-ranking-race-season` |

---

## Parte 3 — Auditoria dos testes antigos

O detalhe por teste está em **`legacy-tests-audit.json`**: funcionalidade protegida, motivo da falha, comportamento atual, cobertura equivalente, recomendação e como fazer. Nenhum teste foi alterado nesta fase.

| Recomendação | Qtde | Testes |
|---|---|---|
| **Atualizar** | 22 | os 9 "obsoletos" + `redesign-polish2`, `ui-redesign`, `page-hierarchy`, `onboarding-priority`, `mobile-compact-ux-m4`, `mobile-filters-postmatch-m4-2-2`, `mobile-game-flow-m4-3`, `mobile-m3-1-device-hotfix`, `staff-architecture-v29-1`, `training-center-unification-phase15-5`, `ranking-ui-authority-v56`, `living-career-v34-9`, `phase15-5-4-critical-mobile-qa` |
| **Substituir** | 3 | `redesign-polish21`, `mobile-game-app-experience-m4-2`, `phase15-4-mobile-flow-polish` → cobertos pelos testes da 5.30 e 5.30-B |
| **Remover** (depois de aprovação) | 5 | `home-redesign`, `premium-home-v33-2`, `premium-interfaces-v33`, `premium-relations-v33-8`, `living-career-v34-4`: só verificam strings de layouts v33/v34 que não existem mais, e há cobertura nova (5.30/5.31) |
| **Manter** | 1 | `mobile-m3-2-android-ux`: aponta a lacuna real do campo do nome do atleta |

**Padrões observados:**
1. A maioria dos testes falha por **asserção literal de código-fonte** (regex ou string) sobre layouts que mudaram. Atualizar resolve; o comportamento é igual ou melhor.
2. Mudanças **intencionais** de padrão quebraram testes sem atualização:
   - `PageHeader` passou a `dense = true`;
   - `FilterPills` trocou o trilho rolável por quebra de linha no mobile (5.20-B);
   - `/game/matches` virou redirecionamento.
3. Três testes v34 rodam `src/` com node puro e quebram no alias `@/`. Precisam do carregador Vite SSR, como os kits v52x.
4. **Fora da baseline**, conferindo a cobertura citada:
   - `test-onboarding-home-cta` falha por falso positivo (a rota existe via `APP_ROUTES.TRAINING_CENTER`);
   - `test-interview-overlay-transition` também falha (não investigado). Recomendo incluir os dois na próxima baseline.

## Priorização das correções (nada aplicado; aguarda autorização)

| P | O quê | Tipo | Muda jogo? | Esforço |
|---|---|---|---|---|
| **P1** | Corrigir as fixtures/expectativas dos testes A, B e C (restaura cobertura de persistência de torneio, rollback e janela móvel) | teste | não | baixo |
| **P1** | Validar no Redmi 12 o campo "Nome do atleta" do tutorial com o teclado aberto; se reproduzir, adicionar `onFocus → scrollIntoView` (1 linha) | UX Android | sim (apresentação) | baixo |
| **P2** | Diagnóstico no `.catch(() => null)` do sorteio (`calendarSystem.js:443`) | observabilidade | não (só log) | baixo |
| **P2** | Recriar a fixture de conquista legada (`test-achievement-save-migration`): hoje nenhum teste cobre linhas pré-Fase-12 | teste | não | baixo |
| **P3** | Gerar o id de novo quando colide em `create`/`bulkCreate`/batch, mantendo o formato | robustez | sim (raríssimo) | baixo-médio; exige rodar o harness determinístico |
| **P3** | Atualizar ou substituir os 25 testes restantes e remover os 5 obsoletos, com aprovação caso a caso | teste | não | médio |

**Compatibilidade:** nenhuma recomendação muda schema, formato de id, formato de save ou balanceamento.

## Arquivos desta pasta

| Arquivo | Conteúdo |
|---|---|
| `CLOUD_PHASE_1_INTEGRITY_DIAGNOSIS.md` | este relatório |
| `legacy-tests-audit.json` | auditoria dos 31 testes + 2 achados extras |
| `repro/repro-a-tournament-run.mjs` | repro A (`--team-rank=<n>`, `--out=<json>`) |
| `repro/repro-a-output-rank200.json`, `repro-a-output-rank600.json` | estado antes do save, persistido e depois do reload, dia a dia |
| `repro/repro-b-world-event-id.mjs`, `repro-b-output.json` | repro B determinística (4 casos) |
| `repro/repro-c-ranking-window.mjs`, `repro-c-output.json` | linha do tempo C (60 semanas, regra atual × esperada) |

Todas as reproduções rodam a partir da raiz do repositório, só em memória, e não gravam fora do `--out` indicado.
