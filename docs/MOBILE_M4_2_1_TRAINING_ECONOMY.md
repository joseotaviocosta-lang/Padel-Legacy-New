# M4.2.1 — Training Experience + Training Economy Rework

Subfase específica da M4.2: reduzir ainda mais o scroll/hierarquia da aba
Treinos e corrigir um problema de design econômico real — treinar dava
evolução, XP **e** moedas ao mesmo tempo, um incentivo puramente positivo
sem nenhuma contrapartida.

## Auditoria (Parte 1)

Mapeamento do sistema real, antes de qualquer mudança:

- **Catálogo** (`src/lib/trainingCatalog.js`): 14 atividades em 4 grupos
  (quadra/físico/mental/tático), todas com `duration:50min`, `xp:18`,
  `coins:10` fixos por padrão (`focus()` factory) — nenhuma variação por
  tipo. 3 intensidades (`leve`/`moderado`/`intenso`) com multiplicadores
  reais de ganho/energia/fadiga/duração/risco já existentes.
- **Execução real** (`executeTraining`, `src/lib/trainingSystemV2.js`): uma
  única função que já fazia validar (lesão/aposentado/parceiro/limite
  diário/energia) → calcular ganho → aplicar atributos/XP/moedas/energia/
  fadiga/moral/confiança/forma → salvar perfil → registrar
  `TrainingSession` → incrementar missão — numa única chamada
  `PlayerProfile.update`, já atômica por construção.
- **Limite diário**: `DAILY_TRAINING_LIMIT = 3` (`src/lib/padel.js`).
- **Bônus de treinador**: `coach.training_bonus` (por atributo, já
  existente) — preservado, sem custo/desconto novo.
- **Fisioterapia/comissão**: salário mensal já existente
  (`monthly_cost`), separado do treino — nunca cobrado por sessão.
- **Descanso**: `handleAdvanceDay` — sempre gratuito, sem mudança.
- **Fontes de moedas reais auditadas**: patrocínio (`sponsors.js`,
  `base_monthly_value` ~1500-6000/mês por tier), prêmio de torneio
  (`career.js TIER_REWARD_TABLES`, 15 a 24000 por rodada conforme tier),
  missão (`localSeed.js`, ex. `mission-train-1` = 3 treinos → 80 moedas),
  conquista (`achievementsData.js`, `coins_reward` variável). Carreira nova
  começa com 5000 moedas (`localSeed.js`).

## Mudança econômica (Partes 2-24)

Treino deixou de **pagar** moedas e passou a **custar**:

- `trainingCatalog.js`: campo `coins` removido do `focus()` — nenhuma
  atividade carrega mais um valor de recompensa.
- `src/lib/trainingEconomy.js` (novo, fonte única — Parte 41):
  `getTrainingCost(profile, intensityId)` = `TRAINING_BASE_COST_BY_STAGE[estágio]
  × TRAINING_COST_INTENSITY_MULTIPLIER[intensidade]`, reaproveitando
  `getCareerEconomyStage` (a mesma taxonomia de 5 estágios já usada por
  mercado de treinadores/patrocinadores — nenhum conceito de estágio
  paralelo). Base por estágio: beginner 20, regional 30, professional 45,
  international 65, elite 90. Multiplicador por intensidade: leve ×0.7,
  moderado ×1.0, intenso ×1.4 (mesma proporção conceitual do briefing).
- `executeTraining`: revalida saldo no momento da execução (nunca confia só
  na UI), debita o custo na MESMA escrita atômica que já aplicava os
  ganhos — nenhuma escrita separada, nenhum passo novo de transação.
  XP/atributos/energia/fadiga/moral/confiança/forma/limite diário/risco de
  lesão: **intocados**.
- `TrainingSession` ganha `coins_cost` (débito real); `coins_reward` passa
  a ser sempre `0` daqui em diante — sessões antigas mantêm seu
  `coins_reward` histórico sem migração (Parte 34).
- Missões/conquistas continuam concedendo moeda normalmente — trilha de
  dados independente do custo de treino (Parte 15), provado com o
  pipeline real.

## UI (Partes 9-33)

- `TrainingActivityCard.jsx`: card fechado mostra custo (💰) junto de
  fadiga/energia; expandido mostra a linha "Custo"; botão "Treinar"
  mostra o custo ao lado do rótulo; saldo insuficiente desabilita o botão
  com mensagem clara ("Moedas insuficientes"), nunca cobra sem avisar;
  trocar intensidade recalcula custo/ganho/energia/fadiga ao vivo, antes
  de confirmar.
- `Training.jsx`: saldo de moedas entra no HUD do `PageHeader` (Parte 27,
  sem card dedicado); feedback pós-treino mostra o débito real
  ("-X moedas" + saldo atualizado), nunca mais "+moedas"; histórico
  mostra o custo das sessões novas preservando o formato antigo.
- Estrutura action-first (atividades antes de Estado do atleta/
  Recuperação, ambos em `CollapsibleSection` recolhida) já existia desde
  M4/M4.1.3 — confirmada intacta, não recriada.

## Simulação (Partes 18-20/39) — `reports/fase-m4-2-1-training-economy-balance.json`

3 perfis (A: treina 1x/3 dias, B: 1x/dia, C: 3x/dia todo dia) × 3 janelas
(30/90/365 dias), usando o motor real (`executeTraining`/
`getTrainingCost`) com um modelo de renda simplificado e disclosed
(patrocínio Bronze diário + prêmio Silver semanal, valores reais já
auditados). Resultado: perfil B (o mais representativo de um jogador
ativo real) gasta 22-24% da renda em treino — dentro da faixa 10-30%
sugerida pelo briefing. Perfil C (grind máximo teórico) gasta 53-70% e é
throttled ~50% dos dias (bloqueado de completar as 3 sessões, nunca fica
negativo) — leitura como fricção pretendida pra um padrão de jogo
extremo, não como bug, já que a carreira nunca trava (saldo final sempre
positivo e crescente). Nenhum ajuste de valor foi feito — a simulação
suportou a hipótese inicial.

## Não alterado

Match/Rally Engine, calendário, torneios, ranking, formato de save,
persistência M3.7, tutorial 4.1, salário de treinador/comissão,
fisioterapia, descanso, sidebar, branding, Android lifecycle.
