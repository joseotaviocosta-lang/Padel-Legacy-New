# CLOUD-6N — Career Critical Flows: Integration & Reliability

Repositório: `joseotaviocosta-lang/Padel-Legacy-New` · Branch: `cloud/phase-6n-career-critical-flows` · Base: `d6db62e` (CLOUD-6M)

## Resumo
- **Nenhum defeito real de produto encontrado. Nenhuma correção de código de produto feita** (0 de 3 permitidas).
- Adicionado 1 cenário integrado (22 gates) com os motores reais + script npm.
- 4 testes legados falham; todos classificados como **testes desatualizados** (preexistentes no `d6db62e`, árvore limpa), não regressões.
- Validação apenas por código/Node. **Nada foi validado visualmente.**

## Fluxos avaliados
A) Nova carreira · B) Salvar/carregar · C) Calendário · D) Torneios · E) Progressão (treino, fadiga, ranking, mercado/parceiros) — cobertos pela suíte existente + cenário novo.

## Cenários executados
Novo: `scripts/test-cloud-6n-career-critical-flows.mjs` (`npm run test:cloud-6n-career-flows`), reutilizando `CareerManager`, `calendarLifecycle`, `registerTournament`, `TournamentRunManager` reais, com `MemoryStorage` (padrão já usado nos testes existentes).
1. Nova carreira → estado inicial válido (data, energia/fadiga/moedas, parceiro, torneios sem ids duplicados) → salvar → carregar (perfil idêntico, mesmas contagens).
2. Avançar calendário até a abertura → inscrição (bloqueada antes da janela; dupla Top 400 barrada em Silver; dupla sem ranking aceita; repetição idempotente, 1 linha de calendário).
3. Avanço bloqueado no dia do torneio inscrito; chave sorteada/persistida; derrota → `eliminated`; resultado repetido idempotente.
4. Avançar ~30 dias: sem travar, energia/fadiga em [0,100], sem ids duplicados.
5. Salvar → carregar → continuar: data, contagens e conclusão do torneio preservadas; avanço de dia segue sem duplicação.
Resultado: **22/22 PASS**.

## Testes e evidências
Aprovados (exit 0): career-persistence-integrity, career-atomicity, career-null-safety, calendar-advance-v24, tournament-registration-v2, tournament-flow-rc, tournament-match-lifecycle, tournament-resume-recovery, tournament-canonical-results, tournament-result-authority, tournament-draw-name-collision, tournament-confirm-no-skip, ranking-consistency, training-system-v2, partner-day1-gate, legacy-save-tournament-continuity-v517, career-beta-readiness, global-market-v25, living-world-v23, ranking-season-carryover-v32, career-legacy-integrity, cloud-6m-shell, cloud-6n (novo).
`npm run lint` OK · `npm run build` OK · `validate:architecture` OK.

## Falhas preexistentes (testes desatualizados — não alterados)
| Teste | Falha | Causa verificada |
|---|---|---|
| `test-phase15-7-first-tournament-parity` | 1º torneio aos 28 dias (esperado 30–45) e contagem ≠ 32 | Calendário redesenhado intencionalmente em `d5e5a2e` (elite 44→12 etc.); o teste data de antes. Com esses 2 gates relaxados, falha adiante pelo mesmo motivo abaixo. |
| `test-phase15-6-2-tournament-canonical-state` | inscrição com `teamRank: 200` rejeitada | `EntryManager` aplica `OPEN_TIER_CEILING = 400` (Fase 5.1): duplas Top 400 não disputam Silver (`overqualified`). Fixture com rank 200/300 está obsoleta; rank 0 passa (coberto no cenário novo). |
| `test-fatigue-integrity-rc` | busca de regex em `TrainingPage.jsx` | A página virou wrapper `<Navigate>`; o toast "Fadiga: …/100" com `normalizeFatigue` existe em `src/components/training-center/TrainingView.jsx:116`. |
Sugestão para decisão humana: atualizar esses fixtures/caminhos numa fase própria.

## Riscos pendentes / não testados
- UI (renderização, toques, navegação), Tauri/Android reais, I/O nativo de save (backup nativo indisponível em Node: logs `TAURI_UNSUPPORTED`/`window is not defined` em Node são ruído de ambiente).
- Temporadas completas e virada de ano não simuladas (por restrição).
- Compatibilidade com saves antigos: só os fixtures dos testes existentes (v516/v517) foram executados.
- Suíte completa (centenas de scripts) não executada; apenas a seleção acima.
- Mercado de parceiros / treino: cobertos só pelos testes existentes listados.

## Checklist recomendado — Windows e Android
1. Nova carreira → conferir home, calendário e parceiro inicial.
2. Fechar e reabrir o app → carreira carrega com mesma data/ranking/moedas.
3. Avançar dias até a janela de inscrição; inscrever-se; confirmar bloqueio após o prazo.
4. Tentar avançar além do dia do torneio sem jogar (deve bloquear).
5. Jogar uma rodada, perder/ganhar; conferir resultado, premiação e ranking.
6. Treinar, observar fadiga/energia; descansar e conferir recuperação.
7. Avançar um mês; conferir notificações sem duplicatas.
8. Salvar, fechar, reabrir (Android: matar o app pelo multitarefa) e continuar.
9. Android: rotação, voltar do sistema, cabeçalho único (CLOUD-6M).

## Arquivos modificados
- `scripts/test-cloud-6n-career-critical-flows.mjs` (novo)
- `package.json` (+1 script npm; versão e dependências intactas)
- `reports/cloud-phase-6n-career-critical-flows/CLOUD_PHASE_6N_REPORT.md` (novo)

Restrições respeitadas: sem mudança de balanceamento, schema de save, flag Silver (desativada), dependências ou versão; sem merge/rebase/PR/push.

## Commit final
Ver `git log -1` da branch `cloud/phase-6n-career-critical-flows` (único commit CLOUD-6N).
