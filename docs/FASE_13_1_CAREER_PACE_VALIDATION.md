# Fase 13.1 — Career Pace Validation & Elite Progression

Subfase de investigação da Fase 13: validar com o pipeline mais próximo
possível da produção se o "muro de elite" encontrado por
`test-massive-careers-v32.mjs` (auge mediana 26 anos, 0/1000 carreiras
alcançando Top5/Top3/#1) é real, e corrigir cirurgicamente só a causa
confirmada.

## Parte 1 — Auditoria dos simuladores existentes

| Simulador | PlayerProfile real | Calendar real | Training real | Tournament real | Ranking real | Bots reais | Economia real | Match Engine real | Dificuldade real | RNG seedado |
|---|---|---|---|---|---|---|---|---|---|---|
| `test:career-pace` (v17) | não — só regex sobre texto-fonte | não | não | não | não | não | não | não | não | n/a |
| `test:career-difficulty-pace` | não — reimplementação própria | não | não (fórmulas copiadas) | não | não (curva própria) | não | não | não | **sim** (`getDifficultyModifier` real) | sim |
| `test:massive-v32` | não — reimplementação própria | não | não (fórmulas copiadas) | não | não (curva própria) | não | não | não | **não** (nunca lê difficultyConfig) | sim |
| `test:career-beta-readiness` | **sim** | **sim** | não (não usa `executeTraining`) | parcial — registra mas **nunca joga** a rodada | não | parcial (bots de treino) | não | **sim** (partida de treino) | não | sim (decisões) |
| `test:career-pace-production` (novo) | **sim** | **sim** | **sim** (`executeTraining`/M4.2.1) | **sim** (motor real de ponto a ponto + `prepareTournamentFinalization`) | parcial* | **sim** | **sim** | **sim** | **sim** | sim |

\* `getWorldRank` real é chamado, mas a população de comparação
(`AthleteProfile`, ranking mundial de bots) nunca é semeada/evoluída neste
harness — o número de "rank" produzido é artefato de um pool quase vazio,
não um sinal confiável. Documentado como limitação, nunca usado para
nenhuma conclusão de posição no ranking.

**Conclusão da auditoria**: nenhum simulador pré-existente jogava uma
partida de TORNEIO de verdade. `career-difficulty-pace` é o único, dos
pré-existentes, que aplica os multiplicadores REAIS de dificuldade — por
isso é a fonte estatística mais confiável para idade-por-degrau, mesmo sem
tocar no motor de partida.

## Parte 2 — Por que career-difficulty-pace "não terminava"

**Não estava travado.** Medição direta (`perPhaseMs`, instrumentado nesta
fase): ~30s por 100 carreiras em cada uma das 3 dificuldades — uniforme,
sem outlier — confirmando ausência de O(n²)/loop infinito/handle vazado.
No padrão (`runs=100`, 1000 carreiras/dificuldade), o script roda 5
passadas completas (easy/normal/hard/neutro/hard-de-novo) de 16 temporadas
× 48 semanas cada, dominadas pelo scoring de parceiro contra um pool de
2200 candidatos — ~20-25 minutos no total, muito além de timeouts curtos
de CI, mas terminando normalmente (confirmado: a mesma execução já havia
completado com sucesso antes desta fase, só levou mais tempo do que os
timeouts usados).

**Bug real encontrado**: a 5ª passada (`hardCareers`) recomputava
`simulateDifficulty('hard')` do zero — já calculado (e descartado) na 3ª
passada do loop principal. Corrigido: o resultado da 3ª passada agora é
reaproveitado (`hardCareersFromLoop`). ~20% mais rápido, zero mudança de
números.

`test:career-pace-performance` (novo) prova escala linear (3x carreiras →
3.01x tempo medido) e a ausência da passada redundante.

## Parte 3 — Harness canônico (`test-career-pace-production.mjs`)

Reaproveita a fundação real de `test-career-beta-readiness.mjs` (Fase 10)
e acrescenta a peça que faltava: partida de TORNEIO headless com o motor
real, usando as MESMAS funções puras que `TournamentModal.jsx` usa —
`createTournamentRun`, `generateTournamentOpponent`, `getTournamentRounds`,
`getQualifyingRoundLabels` (bracket/oponentes), `recordTournamentMatchResult`
(pura, avança o bracket), `prepareTournamentFinalization` (recompensas/
ranking/histórico reais) — mais `createMatch`/`playPoint` (o mesmo motor de
ponto a ponto de qualquer partida de treino headless já existente).

**Limitação descoberta e documentada, não resolvida nesta fase**: a
posição de RANKING (`getWorldRank`) depende de uma população mundial de
`AthleteProfile` que não é semeada nem evoluída neste harness — sem ela, o
"rank" medido é artefato de um pool quase vazio (ex.: rank #8-20 mesmo para
um perfil com zero partidas jogadas). Corrigir isso exigiria bootstrapar e
evoluir corretamente um segundo subsistema inteiro (o "mundo vivo"/circuito
de bots, `circuitLifecycle.js`/`WorldTourLifecycle.js`) — maior escopo do
que uma correção cirúrgica permite fazer com segurança nesta fase. Por
isso o harness foi usado apenas para o que consegue validar honestamente
sem essa peça: curva de OVR por idade e sustentabilidade da economia de
treino (M4.2.1) num pipeline real e multi-anual — nunca para concluir
nada sobre posição de ranking.

## Achado central (Parte 10) — causa confirmada do "muro de elite"

Auditoria direta de código (não simulação) encontrou a causa real,
confirmada por leitura de TODA a cadeia de criação de carreira
(`CareerInitialDataService.js`, `ActiveCareerAdapter.js`,
`initialCareerProfiles.js`, assistente de personagem): **nenhum ponto do
jogo real jamais define `profile.potential`**. Toda carreira real caía no
fallback antigo de `getAttributeDevelopmentCeiling`
(`src/lib/trainingSystemV2.js`): `72`, teto máximo de atributo ~82-84.

Comparado ao Overall real dos bots por posição
(`src/lib/rankingPopulation.js`): Top 100 ~85, Top 30 ~91, Top 20 ~93,
Top 10 ~94, Top 5/3/#1 ~95-96. **O teto de qualquer carreira real
(72→~82-84) ficava ABAIXO do Overall de um bot do Top 100** — tornando o
Top 100 (não só o Top 10) estruturalmente inalcançável por design, não só
difícil.

Os simuladores estatísticos nunca expuseram isso porque SEMPRE injetam seu
próprio `potential` (78-91) por cenário — testam builds mais talentosos do
que qualquer perfil real recebe. O `massive-v32`/`career-difficulty-pace`
mediram um jogo hipotético mais generoso do que o real.

**Fatores contribuintes, documentados e não alterados** (Parte 10 pede pra
medir antes de unificar):
- **Curva de pontos de ranking não-linear** (`RANKING_POINT_ANCHORS`,
  `rankingPopulation.js`): a exigência de pontos praticamente TRIPLICA de
  Top30→Top10 (~2865→9130), a transição mais íngreme de toda a escada —
  mais que o dobro da inclinação de Top10→#1 (9130→13000, +42%). O "muro"
  em Top30→Top10 é, em parte, uma consequência DELIBERADA do formato da
  curva de pontos, não um bug.
- **Dois sistemas de pontuação de bots não coordenados** (já documentado
  na Fase 11, `docs/RANKING_INTEGRITY_PHASE11.md` §7): `processWorldCircuit`
  (semanal, top-160 Overall) e `resolveCompletedWorldTourEvents` (por
  torneio finalizado) escrevem no mesmo campo (`world_ranking_points`) sem
  checar sobreposição — double-award estruturalmente possível,
  especificamente mais provável para bots que são AO MESMO TEMPO
  high-Overall E ativos no World Tour, ou seja, justamente os bots de
  elite — o que infla desproporcionalmente o topo da tabela. Não
  quantificado (exigiria instrumentar os dois sistemas); não unificado
  (Parte 10 pede pra não fazer isso automaticamente).
- **Decaimento assimétrico**: jogador decai 20% por temporada (evento
  único, `seasonLifecycle.js`); bots decaem ~1,2%/semana compondo
  (~43,5%/temporada-equivalente, `circuitLifecycle.js`). Efeito líquido
  não quantificado sem simulação conjunta — documentado como fator a
  investigar numa fase futura dedicada a ranking.

## Correção cirúrgica aplicada (Parte 15, Caso 4)

`src/lib/trainingSystemV2.js`: fallback de `profile.potential` elevado de
`72`/`60` (inconsistente entre os dois pontos de leitura) para **`80`**
(unificado nos dois pontos) — mesmo valor já usado e validado por um dos
10 cenários "saudáveis" do `massive-v32` (`economy-conservative`). Teto
resultante (~87) fica acima do Overall real do Top 100 (85), ainda abaixo
do Top 20 (93) — Top 100+ deixa de ser estruturalmente impossível; Top
20-10-5-3-#1 continuam exigindo mais que a média (carreira excepcional,
Parte 12), nenhum deles virou trivial. Nenhum campo novo persistido,
nenhuma tela de criação de personagem alterada, nenhum outro sistema
tocado.

## Não corrigido nesta fase (documentado, não bloqueante)

- Curva de pontos de ranking (`RANKING_POINT_ANCHORS`) — não alterada,
  fora do escopo cirúrgico.
- Dois sistemas de pontuação de bots (Fase 11 §7) — não unificados,
  conforme instrução explícita.
- Assimetria de decaimento jogador/bot — não quantificada, não corrigida.
- `Math.random()` não seedado em `executeTraining` (risco de lesão) —
  documentado, não corrigido (mudaria a assinatura de uma função de
  gameplay real fora do escopo cirúrgico desta fase).
- Rank real dentro de `test-career-pace-production.mjs` — não confiável
  sem semear/evoluir o mundo de bots; disclosed, não usado para conclusões.
