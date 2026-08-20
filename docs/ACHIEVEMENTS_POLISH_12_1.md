# Achievements Polish 12.1 — Relevância de "Próximas Conquistas" + Densidade da Página

Fase de polish sobre a Fase 12 (Conquistas 2.0). Não altera catálogo, rewards,
triggers, engine principal, reconciliação de save, Match Engine, ranking,
tutorial, treinador, staff, economia, torneios, notificações, integração com
a Home ou navegação — só a lógica de RANKEAMENTO de "quais conquistas
mostrar primeiro" e a UI da página Objetivos → Conquistas.

## O bug real (QA)

Para um atleta de 16 anos em início de carreira, "Próximas conquistas"
mostrava: Relação de Confiança (60/100), Auge (16/28), Veterano (16/35),
Lenda Madura (16/40), Um Mês (10/30). A regra antiga (`AchievementsPanel.jsx`,
`nextUp`) ordenava só por `percent` desc — matematicamente correto (idade e
dias de carreira avançam de forma linear e previsível, então acumulam
percentual alto rápido), mas nada motivador: um atleta que ainda não jogou
nenhuma partida oficial via conquistas que "acontecem sozinhas com o tempo"
dominarem a lista, em vez de metas esportivas genuínas (ainda em 0% porque
o jogador ainda não agiu).

Reproduzido com um fixture real equivalente ao print (16 anos, ~10 dias de
carreira, ranking #900, treinador e dupla já iniciados, atributos iniciais
reais de ~30-33 como uma carreira nova de verdade): a regra antiga
selecionava **Relação de Confiança · Auge · Veterano · Lenda Madura ·
Veloz como o Vento** — 3 das 5 eram conquistas de idade. Confirmado por
`test:achievement-relevance-ranking`.

## A nova regra: `findNextRelevantAchievements` (`src/lib/achievementRelevance.js`)

Combina, por conquista candidata (avaliável, ainda não desbloqueada, só o
próximo degrau de cada escada):

- **Progresso real** (`percent`, já calculado por `getAchievementProgress`)
  para a maioria dos triggers.
- **Actionability**: quanto o jogador controla aquilo por decisão própria,
  de um mapa fixo por `trigger_type` (0-100) — alto para partida
  oficial/torneio/ranking (85-95), médio para treino/treinador/patrocínio/
  equipamento (45-75), baixo para idade/passagem de tempo (10-15).
- **Penalidade de distância temporal real** para conquistas passivas
  (`advance_day`/`reach_age`): em vez do percentual isolado (que engana —
  16/28 anos = 57%, mas faltam 12 anos reais), calcula quantas
  unidades reais faltam e decai fortemente por unidade (15 pontos por ano
  faltante em `reach_age`, 3 por dia em `advance_day`).

`relevanceScore = progresso × 0.55 + actionability × 0.45` (progresso pesa
um pouco mais — uma conquista quase pronta ainda deve furar a fila mesmo
com actionability média).

**Diversidade**, aplicada na seleção final (não afeta o score, só quais
sobrevivem para a lista): no máximo 1 conquista por escada (garantido antes
mesmo do score, já que só o próximo degrau de cada escada disputa), no
máximo 2 por categoria, no máximo 1 puramente passiva (idade/tempo) —
nunca as 3 de idade juntas, nunca 2 degraus da mesma escada juntos.

Com a mesma fixture do QA: **Relação de Confiança · Veloz como o Vento ·
Direita Mortal · Cobiçado · Top 100** — zero conquistas de idade (nenhuma
estava realisticamente perto o bastante pra vencer a disputa), diversidade
de categoria (carreira/evolução×2/economia), e "Top 100" (o degrau real
mais baixo da escada de ranking no catálogo atual — não existe "Top 500"
como achievement, só 100/50/10/3/1; o briefing usa "Top 500" como exemplo
ilustrativo, não uma conquista literal).

**Bug real encontrado e corrigido durante a implementação**: a primeira
versão escolhia "o próximo degrau de cada escada" comparando o `threshold`
cru (menor = próximo) — correto pra escadas crescentes (`play_official_match`
1→10→50), mas ERRADO pra `reach_rank`, que é invertida (Top 100 é mais
fácil que Top 10, mesmo com threshold menor). Corrigido comparando por
`percent` (já calculado corretamente nos dois sentidos por
`getAchievementProgress`), generalizando sem precisar de um caso especial
por trigger_type. Pego por `test:achievement-relevance-ranking` (cenário
Top 300 esperava "Top 100" e recebia "Número 1 do Mundo").

## Estágio de carreira (`getCareerRelevanceStage`)

Reaproveita `getCareerEconomyStage` (já usada pelo mercado de profissionais,
`sportsEconomyV26.js`) em vez de inventar uma segunda taxonomia — só
substitui o rank pela fonte canônica já buscada pelo `context.worldRank`
(nunca `profile.ranking_position` bruto). Usado hoje só como contexto de
auditoria/relatório, não como multiplicador de score — a combinação
progresso+actionability+penalidade temporal já produz o comportamento certo
por estágio sem precisar de um bônus explícito por estágio (confirmado nos
cenários Top 300/Top 20/veterano/sem-treinador/sem-patrocinador).

## UI da seção (Parte G/15-18)

Renomeada de "Próximas conquistas" para **"Metas relevantes para sua
carreira agora"**. Cada linha (`NextUpRow`) mostra: nome, badge de
categoria discreto, descrição curta, progresso real com barra E texto
(nunca uma barra sem contexto), recompensa (+XP/+moedas) pequena que não
compete visualmente com o objetivo.

## Densidade da página (Parte H/19-21)

A Fase 12 já tinha reduzido de 175/155 pra "só o próximo degrau de cada
escada" (~98 cards) — ainda uma parede grande. Agora, na vista padrão (sem
filtro de categoria nem busca ativos): até 5 "Metas relevantes" + até 12
"Em progresso" (as próximas 12 da mesma lista de relevância, fatiada
sequencialmente — nunca duplicando uma conquista entre as duas seções).
"Ver todas" revela o grid completo (mesmo comportamento de sempre,
catálogo 100% acessível, nada removido); um botão para desfazer volta à
vista relevante. Filtrar por categoria ou buscar já é um pedido explícito
de ver um subconjunto específico — nesses casos o limite de densidade não
se aplica, o resultado do filtro/busca aparece por completo. Uma escada
expandida ("ver mais X níveis") continua visível mesmo com o limite de
densidade ativo (senão o clique pareceria não fazer nada).

Medido com um fixture zerado: a vista padrão mostra 5+7 = 12 cards (a
diversidade limita "Em progresso" abaixo dos 12 pedidos quando não há
candidatos suficientemente diversos ainda — comportamento honesto, não um
bug), contra 155 no catálogo completo — redução real, não cosmética.
Confirmado por `test:achievements-page-density`.

## "Relação de Confiança" (Parte K) — esclarecida sem editar a copy

Auditada: `max_coach_affinity`, descrição **"Alcance 100 de afinidade com
seu treinador."** — já deixa claro que é afinidade com o TREINADOR, não com
o parceiro. A ambiguidade do QA não era da copy, era da UI: a linha
compacta antiga só mostrava nome + número (`"Relação de Confiança" · 60/100`),
nunca a descrição. A partir desta fase, tanto `NextUpRow` quanto
`AchievementCard` sempre mostram a descrição — a informação que já existia
nos dados passa a aparecer pro jogador. Nenhuma string do catálogo foi
alterada (exceção deliberadamente evitada por não ser necessária, per Parte
Q — "exceto copy claramente ambígua", e esta não estava).

## Filtro de categoria (Parte I/22)

Auditado: já é um `<select>` (dropdown nativo), não uma fileira de 10 chips
horizontais — já satisfaz a preferência do briefing. Nenhuma mudança feita.

## Performance (Parte M/26/27) — medido, não assumido

`findNextRelevantAchievements` é pura: roda só sobre `evaluateAchievements`
(já em memória, sem storage) uma vez por sync (mount da aba), nunca em loop
por conquista nem em render descontrolado. Benchmark real (N=30, catálogo
completo de 155 conquistas presentáveis):

- Rankear as 155 conquistas por relevância: média sub-milissegundo (mesma
  ordem de grandeza que `evaluateAchievements` isolado, já medido na Fase
  12 em ~0,43ms) — a camada de relevância adiciona um `map`+`sort`+seleção
  gulosa sobre um array que já existe, custo desprezível.

## Testes novos (3 arquivos)

| Teste | Gates | Cobre |
|---|---|---|
| `test:achievement-relevance-ranking` | 19 | Reproduz o bug real (regra antiga); prova a correção (máx 1 passiva, máx 1 idade, favorece esporte); estágios early/Top 300/Top 20/veterano/sem-treinador/sem-patrocinador; diversidade (máx 2/categoria, máx 1/escada, nunca future_system/arquivada/já desbloqueada) |
| `test:achievements-page-density` | 6 | Vista padrão ≤5 próximas + ≤12 em progresso, sem duplicatas entre as duas seções, catálogo completo (155) continua muito maior — a redução é real |
| `test:achievement-progress-display` | 29 | Formatação de progresso (ranking #atual→Top N, contadores x/y, idade, economia com separador de milhar) nunca produz NaN/undefined, mesmo com valores ausentes/zero |

Total: 54 gates novos, todos PASS. Mais 10 gates novos adicionados ao
`test:achievements-ui-v2` existente (33 no total agora) cobrindo o conteúdo
da nova seção e a densidade padrão.

## Arquivos

**Novos**: `src/lib/achievementRelevance.js`, `scripts/test-achievement-relevance-ranking.mjs`,
`scripts/test-achievements-page-density.mjs`, `scripts/test-achievement-progress-display.mjs`,
`docs/ACHIEVEMENTS_POLISH_12_1.md`.

**Modificados**: `src/components/achievements/AchievementsPanel.jsx` (seção
renomeada, `NextUpRow` novo, densidade padrão, `progressLabel` exportado),
`package.json` (3 scripts novos), `scripts/test-achievements-ui-v2.mjs`
(2 gates atualizados pra refletir a nova fonte de "Próximas", 10 gates novos).

## Regressão

3 gates pré-existentes em `test-achievements-ui-v2.mjs` verificavam
literalmente o texto "Próximas conquistas" e a lógica de sort por percent —
atualizados com comentário explicando a mudança deliberada, nunca removidos
silenciosamente. Nenhuma outra regressão encontrada — `beta-candidate` (14
pilares), `achievements-audit`, `achievement-engine-v2`,
`official-match-achievements`, `achievement-career-progression`,
`achievement-rewards-balance`, `achievement-save-migration`,
`missions-achievements-unification`, `tutorial-expanded-flow`,
`career-systems` todos PASS sem alteração.
