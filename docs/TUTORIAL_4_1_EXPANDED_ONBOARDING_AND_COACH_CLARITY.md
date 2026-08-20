# Tutorial 4.1 — Onboarding Expandido + Clareza do Mercado de Treinadores

## O problema (QA real, pós Tutorial 4.0)

Três problemas reais encontrados em QA:

1. O tutorial terminava logo após a primeira partida oficial — ensinava só
   o loop básico (atleta, dupla, treinador, treino, calendário, competir),
   deixando sistemas inteiros (comissão técnica, economia, patrocínios,
   loja, equipamentos, atletas do circuito, ranking, mundo do padel,
   notícias, imprensa, central de notificações) completamente
   desconhecidos.
2. Os cards de seleção de treinador regrediram: mostravam texto editorial
   vago ("mais estratégia") em vez do impacto numérico real, que só
   aparecia em "Ver detalhes" — impossível comparar treinadores sem abrir
   cada um.
3. Um bug real de integridade de dado: o toast pós-contratação dizia
   "salário mensal de 1 moedas" mesmo quando o mercado mostrava um preço
   real antes de contratar.

## Parte 1 — Tutorial expandido (27 etapas, não mais 15)

O motor de auto-conclusão por visita (`kind:'VISIT'`, `OnboardingGuide.jsx`)
já existia e não precisou de nenhuma mudança de mecanismo — só de dados: 12
novos passos foram inseridos entre `first-match` e `autonomy`.

**Bug real corrigido antes de inserir os novos passos:**
`isTutorialRouteMatch` (`tutorialIdentity.js`) descartava a query string
inteira antes de comparar rotas. Três dos novos passos (economia,
patrocínios, oportunidades) vivem na MESMA rota (`/game/economy`),
diferenciadas só por `?view=`. Sem o fix, visitar qualquer aba de economia
completaria as três de uma vez. Corrigido para comparar também os
parâmetros declarados na rota do passo, quando existirem — retrocompatível
(passos sem `?` na rota continuam funcionando exatamente como antes).

**Novas etapas** (todas VISIT, auto-completam ao visitar, sem "Entendi"):

| Capítulo | Etapas | Rota |
|---|---|---|
| Comissão técnica | `staff-known` | `/staff` |
| Economia e patrimônio | `economy-known`, `sponsors-known`, `opportunities-known`, `shop-known`, `equipment-known` | `/game/economy?view=dashboard`, `?view=sponsors`, `?view=opportunities`, `/game/shop`, `/game/inventory` |
| Conheça o circuito | `athletes-known`, `ranking-known`, `world-known`, `news-known`, `press-known`, `notifications-known` | `/athletes`, `/ranking`, `/world`, `/journal`, `/press`, `/communications` |

**Duas fusões deliberadas** (evitam bloat, evidência de auditoria):
comissão técnica + auxiliares viram UM passo (`/staff` é uma página só, sem
sub-view que distinga os dois); "Mundo do padel" aponta só para `/world` —
`/world-market` é uma página real distinta, mas adicionar um 13º passo só
para ela violaria a regra explícita de não inflar o tutorial de novo; fica
coberta pelo Guia flutuante, como já acontecia com outros sistemas
avançados desde a v9.

**Primeira partida oficial vira marco, não fim.** Ao completar `first-match`,
um toast dedicado substitui o genérico: "Primeira partida oficial
concluída — Você aprendeu o ciclo básico: preparar, inscrever-se e
competir." com CTA "Continuar conhecendo a carreira" → `/staff`.

**Saves que já tinham "terminado" o tutorial (definição de 15 etapas)
reabrem automaticamente.** Decisão deliberada: `reconcileTutorialProgress`
já recalcula o status ao vivo a cada carregamento (nunca confia num status
congelado) — o mesmo mecanismo que tornou as migrações v9→v10→v11
desnecessárias de código extra. Nada é revogado (`completedAt` histórico
preservado, nenhuma recompensa perdida); o jogador só volta a ver o
tutorial ativo, agora cobrindo o que faltava.

**Progresso por capítulo na página Objetivos.** Antes, "Tutorial 15/15"
dava sensação de fim. Agora a página mostra um resumo compacto por
capítulo (ex.: "Comissão técnica 1/1", "Economia e patrimônio 3/5") acima
do card de próxima etapa — reaproveita `CompactListItem` já existente, sem
nenhum componente novo.

## Parte 2 — Card de treinador: impacto real, não texto vago

Causa raiz confirmada por leitura direta: `CoachCard.jsx` renderizava
`COACH_SPECIALTY_INFO[especialidade].benefits` — uma lista editorial
estática e independente — enquanto `CoachDetail.jsx` ("Ver detalhes")
sempre usou `getCoachImpactSummary(coach, profile).highlights`, o impacto
numérico real derivado da engine (`getCoachEffects`). As duas listas podiam
divergir; é exatamente o que o QA relatou.

A função canônica que o briefing pedia (`getCoachDisplayEffects`) já
existia com outro nome — `getCoachImpactSummary`. Nenhuma função nova foi
criada: o card foi religado à mesma fonte que o modal já usava. Também foi
adicionado o valor de assinatura (`evaluation.signingCost`), que existia no
cálculo mas não aparecia no card.

## Parte 3 — O bug do salário de "1 moeda"

Causa raiz exata: `localSeed.js` tinha um seed legado de 2 treinadores
("Carlos Mendes", "Javier Molina") com schema incompatível — campo
`monthly_salary` em vez do real `monthly_cost`, especialidade capitalizada
fora do enum real. Como esses nomes não batem com nenhuma entrada de
`COACHES_DATA`, `ensureCoachCatalog()` nunca corrigia essas linhas.
`hirePrimaryCoach`'s fórmula original (`coach.market_salary ?? coach.monthly_cost`,
sem o fallback `monthly_salary`) resolvia para `NaN`, e o piso
`Math.max(1, NaN || 1)` mascarava isso como "1 moeda". "Carlos Mendes" é o
nome exato do relato de QA — confirmação direta, não hipotética.

**Correção em quatro partes:**
1. Seed legado removido de `localSeed.js` — `ensureCoachCatalog()` já semeia
   o catálogo real (~118 treinadores) sob demanda.
2. Fonte única centralizada: `resolveCoachCanonicalSalary(coach)`
   (`coaches.js`) substitui 3 fórmulas divergentes que existiam (a de
   exibição no mercado, a de `hirePrimaryCoach`, e um `Stat` inline em
   `CoachDetail.jsx`). Nunca cai silenciosamente em 1: resolve pelo próprio
   objeto, senão pelo catálogo por nome, senão retorna `null` — e
   `hirePrimaryCoach`/`renewPrimaryCoach` agora lançam erro diagnosticável
   em vez de prosseguir com um valor inventado.
3. `ensureCoachCatalog()` passa a excluir do mercado qualquer linha
   persistida sem correspondência no catálogo real e sem `monthly_cost`
   válido — nunca deleta, só para de oferecer.
4. Saves já afetados (salário persistido ≤ 1) se autocorrigem na próxima
   vez que o treinador ativo é resolvido — correção de dado, não
   re-concessão nem revogação de nada.

## Parte 4 — Conquistas (auditoria apenas, sem novo código)

175 entradas no catálogo. **31 têm gatilho funcional** hoje
(`join_tournament` 5, `win_tournament` 7, `complete_training` 5,
`advance_day` 6, `reach_age` 3, `reach_rank` 5). **144 são visíveis sem
gatilho funcional ainda.** **16 são secretas** (`name === '???'`). Trigger
types ligados a mecânicas que ainda não existem no jogo (`retire`,
`multi_generation_champ`, etc.) ficam registrados como dívida P1 para uma
próxima fase — nenhuma nova implementação de gatilho nesta correção, por
decisão explícita do escopo.

## O que não mudou

Motor de partidas, ranking, dificuldade, calendário, bracket, economia
(sem evidência), contratação automática de treinador inicial, exigência de
compra/patrocínio no tutorial — nada disso foi tocado. Toda rota nova
aponta para uma página que já existia.

## Testes

- `test:tutorial-expanded-flow` — pipeline completo até `autonomy`,
  incluindo o gate central (primeira partida oficial ≠ tutorial concluído).
- `test:tutorial-visit-auto-completion` — correspondência de rota+query
  para as 12 etapas novas, incluindo o caso exato do bug de Part L (3
  etapas na mesma rota base).
- `test:coach-card-effects` — card usa a função canônica, nunca a lista
  editorial.
- `test:coach-salary-consistency` — mercado === contratação === contrato
  === toast === folha mensal, com reprodução exata do bug relatado.
