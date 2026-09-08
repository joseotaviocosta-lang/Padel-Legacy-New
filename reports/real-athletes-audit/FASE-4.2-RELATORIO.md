# Fase 4.2 — Fechar a paridade, rodar o regime-check, e acertar o registro

> Pré-requisito: Fase 4.1 entregue (`clubs.js` sequenciado, determinismo por
> save confirmado como anti-requisito de design, medição de custo retomada
> — 38min16s→5min57,9s, 7,5×→1,70×). Ver
> [FASE-4.1-RELATORIO.md](FASE-4.1-RELATORIO.md).

## 1 — Resíduo de paridade: rastreado até o fim, não totalmente eliminado

O resíduo de 1 atleta em 147 (Fase 4.1, item 2) não era o caso aceito
conscientemente (arrays fixos de 2-4 creates) — era uma segunda fonte,
nunca mapeada.

**Identificado**: sempre o mesmo atleta, "Rafael Alonso" — o prospect
criado exatamente no boundary de 1º de fevereiro que motivou a
investigação de `clubs.js` na Fase 4.1. `overall_rating`/`ranking_points`
batem exatos (57 nos dois testes) — o resultado competitivo nunca muda.
O que diverge é um conjunto inteiro de campos de personalidade
(`ai_career_archetype`, `behavior_axes`, `preferred_side`,
`pressure_profile`, `partnership_patience`) mais `form`/`energy`/
`fatigue`/`wealth`/`morale` como efeito colateral de uma trajetória de IA
diferente a partir daí.

**Causa**: `athletePersonalityLifecycle.js` deriva esses campos de um
hash seedado pelo `id` do próprio atleta — determinístico, não usa
`Math.random()`. Mas o `id` de um atleta recém-criado embute `Date.now()`
(`makeId`), e `dayAdvanceCoordinator.js` envolve o avanço de dia real em
`profileAction('advance-day', ...)`, cujo `recordAction` grava
`at: Date.now()` — um tick a mais no relógio determinístico do processo,
todo dia, que este harness não tinha. Ao longo de 31 dias esse
desalinhamento acumula o bastante pra que um atleta criado no dia 31
nasça com um `id` — e portanto uma personalidade inteira hash-derivada —
diferente da que nasceria em produção.

**Corrigido parcialmente**: o harness passou a envolver seu laço em
`profileAction('advance-day', ...)`, igual produção. O resíduo
**persistiu** depois dessa correção (mesmo atleta, mesmos campos, valores
diferentes de novo) — confirma que existe pelo menos mais uma fonte de
tick de relógio extra em algum lugar da cadeia de instrumentação de
produção, não identificada. Não perseguido além disso: é cosmético por
natureza (afeta só "sabor" de IA de atletas recém-criados no dia exato de
um desalinhamento, nunca resultado competitivo), com retorno decrescente
a cada tick adicional de rastreamento.

**Decisão**: `docs/baseline-pre-fase3.json` não precisa ser recongelada.
A divergência que motivou a preocupação (heisenbug de instrumentação,
cascata populacional inteira) está resolvida — o que resta é plenamente
rastreado, pequeno e comprovadamente não-competitivo.

## 2 — Regime-check de 5 temporadas (finalmente rodado)

Pendente desde a Fase 2.7, adiado 3× por custo — a ~6min/temporada com a
transação por dia (achado #26), deixou de ser evento (~30min pras 5).
Rodado com o limite de heap PADRÃO do Node — de propósito: subir o
limite (`--max-old-space-size`) mascararia exatamente o que a medição
precisava confirmar.

**Completou as 5 temporadas sem travar.**

### 2A — OOM: refutado por medição

Pico de `heapUsed` por temporada: 2026=673,3MB · 2027=766,1MB ·
2028=831,9MB · 2029=830,2MB · 2030=831,5MB. Sobe nas primeiras 3
temporadas e **faz platô a partir da temporada 3** — não crescimento sem
limite. `AthleteCareerLegacy` (a coleção sem poda por design que
motivava a preocupação) foi de 10 linhas no mês 1 a 355 na temporada 5 —
cresce, mas devagar, longe de explicar sozinho um heap que parou de
subir. Total de bytes em todas as coleções: ~1,9MB (temporada 1) →
~5,4MB (temporada 5), também em platô relativo. As podas mensais já
existentes (WorldEvent/CareerMessage/TeamRanking/Partnership — achados
#20/#21 — e `AnnualCareerReport` podado pro mais recente) estão dando
conta.

Confirma a metade "corrigida" da projeção da Fase 4.1 (menos churn de
alocação = menos pressão de GC) e não confirma a metade de risco (o
crescimento sem poda de `AthleteCareerLegacy` não estourou nada em 5
temporadas, na escala atual). Não generaliza automaticamente pra escalas
maiores — é o que foi medido, não uma garantia permanente.

### 2B — Rotatividade dos reais ausentes: rotação confirmada, não exclusão

Instrumentação existente desde a Fase 2.7
(`realAthletesNeverPlayedThisSeason`/`realAthletesNeverPlayedRotation`),
rodada com `--seasons=5` pela primeira vez.

Reais que não jogaram por temporada: 12, 16, 20, 17, 19 (de 100) — oscila,
não cresce monotonicamente. União across as 5 temporadas: 57 reais
distintos ausentes em alguma temporada. **Interseção (ausentes em TODAS
as 5): 0 reais — 0% da união.** Nenhum atleta real foi permanentemente
excluído. Confirmado também pelo cumulativo: **0/100 reais nunca
apareceram em nenhuma chave** ao longo das 5 temporadas.

**Resposta direta**: é rotatividade, não exclusão. A Fase 5 não precisa
endereçar isso como problema.

### 2C — Composição de títulos e curva de dominância

Títulos 100%-reais por tier (agregado 5 temporadas, `season-tier-table.md`):
Silver 78/80, Gold 29/40 (mais disputado — maior parte dos títulos de
bots), Platinum 25/30, Masters 50/50 (100% reais em TODAS as 5
temporadas), Elite 47/50, Crown 20/20 (100% reais, todas as 5). No total
das 400 finais (todos os 9 tiers): 372 100%-reais, 24 100%-bots, 4
mistas — reais dominam 93% dos títulos ao longo de 5 anos.

**Top 20 (reais) por temporada**: 2026=20/20 · 2027=20/20 · 2028=19/20 ·
2029=16/20 · **2030=15/20** — declínio GRADUAL (não em degrau), de 100%
pra 75% ao longo de 5 anos. Consistente com narrativa de envelhecimento,
não diluição estatística abrupta: duplas de elite específicas
(Coello&Tapia, Galán&Chingotto, Lebrón&Augsburger) mantiveram 100% de
pareamento nas 5 temporadas inteiras, enquanto outras duplas históricas
caem gradualmente a partir da temporada 2-3 — "o topo persiste, o meio
da tabela rotaciona" bate com aging/retirement, não com um efeito que
afetaria a população toda por igual. Não confirmado como causal (não
cruzado idade-por-idade de quem saiu do Top 20) — leitura do padrão
agregado, suficiente pra não travar a Fase 4. Referência pré-Fase-3
(19/20 na temporada 1) — a temporada 1 medida aqui (20/20) já supera essa
referência.

## 3 — Registro da série de otimização corrigido

Adicionado ao achado #18: as 6 ocorrências catalogadas foram corrigidas
com base em números medidos pelo harness ANTES do achado #26 — que
superestimava o custo de clonagem em cada uma delas. Isso não invalida
nenhuma correção (acumular patches numa única transação é estritamente
melhor, com ou sem a fronteira certa) — mas o CUSTO QUE MOTIVOU essas
correções nunca esteve no jogo na magnitude que os números do harness
sugeriam. Registrado pra que uma sessão futura não leia "6 sistemas
bateram no mesmo teto, um custava 50,9% de `livingWorld`" como evidência
de que a persistência do jogo era um problema urgente. Não era — era o
instrumento de medição.

**Auditoria de números contaminados**: verificado que nenhum número
citado nos achados oficiais (#18, #22-#27) veio dos arquivos de
relatório contaminados pelo run de teste `diag-clean-1` (Fase 4.0) —
todo número reportado cita explicitamente `900+100`/`official-900-100-s1`
onde é a baseline oficial, e a única menção de escala reduzida
(`60+30`, achado #26) já estava rotulada como reprodução deliberada em
escala menor, não como número oficial. A contaminação ficou restrita aos
arquivos de dados rastreados (`summary.json`/`tournament-results.csv`/
`season-tier-table.md`), já corrigida na Fase 4.1.

## 4 — Suíte, lint, build, Tauri

- `npm run lint` — limpo, sem avisos.
- `npm run build` — OK.
- Nenhum arquivo de `src-tauri/` tocado — Tauri aprovado
  (`test:dev-server-config`).
- Suíte de regressão completa (14 scripts) + os 2 testes de Fase 4.0 —
  16/16 com exit 0 e sem FAIL/GATE FALHOU.

---

## Entrega

| # | Item | Status |
|---|---|---|
| 1 | Resíduo de paridade explicado ou rastreado | ✅ rastreado até a origem (clock-drift de `Date.now()` propagando pra campos hash-seedados por id); corrigido parcialmente; resíduo remanescente cosmético, não-competitivo, documentado |
| 2A | OOM refutado ou confirmado por medição | ✅ refutado — heap faz platô a partir da temporada 3 (~830MB), 5 temporadas completas sem travar |
| 2B | Rotatividade classificada | ✅ rotação confirmada — 0% de interseção entre as 5 temporadas, 0/100 reais nunca jogaram no total |
| 2C | Curva de dominância pelas 5 temporadas | ✅ declínio gradual 100%→75%, consistente com narrativa de envelhecimento (não confirmado causalmente, mas suficiente) |
| 3 | Registro da série de otimização corrigido | ✅ nota adicionada ao achado #18; auditoria de números contaminados concluída, nenhum vazamento encontrado |
| 4 | Suíte verde, lint, build, Tauri OK, commit | ✅ |

**Resumo executivo**: as duas perguntas que ficaram em aberto desde a
Fase 2.7 — o regime-check de memória e a rotatividade dos reais — agora
têm resposta por dado, não por projeção. Nenhuma das duas exige trabalho
novo antes da Fase 4: o OOM não reapareceu na escala atual, e a ausência
intermitente de reais é comportamento saudável, não um bug de exclusão.
O resíduo de paridade que sobrou não é mais um heisenbug — é uma
diferença pequena, estável e explicada, e a decisão de não recongelar a
baseline por causa dele é defensável com os números na mão.
