# P0 — Crash de carreira após Starter Coach Flow

## Contexto

QA real no executável Windows gerado pela fase anterior ("Starter Coach Flow"): abrir/testar uma carreira caía no `BetaErrorBoundary` com `Cannot read properties of null (reading 'career_level')`.

## Causa raiz (reproduzida, não suposta)

`getCareerEconomyStage(profile = {})` (`src/lib/sportsEconomyV26.js`) acessava `profile.career_level` sem optional chaining. O parâmetro padrão `= {}` só cobre `profile === undefined` — nunca `profile === null`. Essa função já existia antes desta fase (usada pelo mercado de patrocinadores) e nunca tinha sido chamada com um `profile` genuinamente `null`.

O "Starter Coach Flow" adicionou `Coaches.jsx`'s `market = useMemo(() => buildCoachMarket(..., profile, ...), [...])`. Como qualquer `useMemo`, esse cálculo roda incondicionalmente em **todo** render — inclusive o primeiro, antes do `if (loading) return <PageSkeleton/>` da própria página, com `profile` ainda `useState(null)`. `buildCoachMarket` chama `getCareerEconomyStage(profile)` direto: primeira vez que essa função ficou exposta a um `profile` `null` de verdade.

**Não foi causado pela remoção do treinador automático em si** — nenhum código de coach está no caminho do crash. Foi **revelado** pelo novo ponto de chamada que o mercado curado introduziu, expondo um bug latente e pré-existente na função reutilizada.

Reproduzido via chamada direta antes de qualquer correção:
```
getCareerEconomyStage(null)
TypeError: Cannot read properties of null (reading 'career_level')
    at getCareerEconomyStage (src/lib/sportsEconomyV26.js)
    at buildCoachMarket (src/lib/coaches.js)
```
Mensagem idêntica à do QA.

## Por que os testes anteriores não pegaram

Nenhum teste da fase anterior chamava `buildCoachMarket`/`getCareerEconomyStage` com `profile: null` — todos usavam perfis reais já carregados (correto para validar a lógica de negócio, mas não cobria o estado transitório real de um componente React no primeiro render). Confirma o próprio critério desta sessão: testes estruturais/de pipeline provam a lógica, não substituem QA no app real para timing de render.

## Auditoria mais ampla

Releitura de `CareerHub.jsx` (Home) confirmou que **todas** as outras funções que já rodavam incondicionalmente antes do gate de `loading` (`deriveCareerMoment`, `buildDailyCareerBriefing`, `buildCareerDecisionCenter`, `buildWeeklyCareerReview`, `buildSeasonCareerPlan`, `buildStrategicCareerState`, `getOnboardingNextAction`, `getNextStep`) já toleravam `profile: null` — não é um padrão sistemicamente quebrado, era uma lacuna pontual na única função nova reaproveitada. Um segundo caminho (nunca disparado até hoje) foi fechado de graça pela mesma correção: `SponsorPanel.jsx` → `getMonthlySponsorMarket` → `getCareerEconomyStage`, mesmo padrão de `useMemo` incondicional.

## Correção

`getCareerEconomyStage(profile)` normaliza `const p = profile || {}` internamente — cobre `undefined` E `null` na origem, não com optional chaining espalhado em cada ponto de chamada. Corrige os dois caminhos reais (`buildCoachMarket`, `getMonthlySponsorMarket`) de uma vez, e protege qualquer chamador futuro.

Não foi necessário nenhum outro fallback: `PlayerProfile` continua obrigatório após a criação da carreira (nunca foi ele quem ficava `null` — era o argumento passado durante uma janela transitória de carregamento); `coach`/`partner`/`staff`/`sponsor` continuam opcionais, tratados explicitamente onde já eram consumidos (confirmado na fase anterior). Nenhum treinador automático foi reintroduzido.

## Testes

Novo: `test:career-null-safety` (37 gates) — reproduz o crash exato via chamada direta às funções reais, prova que não ocorre mais, e percorre os 16 gates mínimos pedidos (perfil existe, coach ausente, Home/onboarding/decision-center/HUD/mercado/treino/torneio/notificações resolvem, save/reload funcionam, nenhum acesso a `career_level` de objeto nulo) mais os cenários A-F (carreira nova sem treinador, carreira com treinador, `coach_id` órfão, `coach_id` null explícito, perfil recém-criado antes de qualquer navegação, save/load antes de contratar) — tudo via pipeline real (`CareerManager` + storage em memória), nunca análise estática isolada.

`test:tutorial-auto-completion` também precisou de uma atualização (não relacionada ao crash): suas listas fixas de VISIT/DECISION ainda refletiam a composição de antes do hotfix "Starter Coach Flow" (`coaches-known` migrou para DECISION naquela fase, mas esse teste específico não estava na lista de regressão daquela fase e só foi pego agora, pela lista de regressão mais ampla deste hotfix).

Regressão completa (starter-coach-flow, coach-market-curation, coach-selection-clarity, onboarding ×4, training-v2, live-coach ×2, match-launch-pipeline, tournament-registration, career-systems, beta-candidate 14 pilares) e `lint`/`typecheck`/`build`/`app:build` — todos passando. `typecheck` variou +1 erro (2258→2259) por ruído de inferência do TypeScript num arquivo não relacionado (`localGame.entities.Club`, nada a ver com `profile`) — consistente com as flutuações de poucos erros já observadas em toda a sessão neste baseline de ~2000+ erros pré-existentes, não uma regressão de tipo real.
