# LOCAL-9E.1 — Simulador de decisões econômicas e esportivas (linha de base)

Branch `integracao/cloud-6o` · base `2583789` (LOCAL-9B). Fase só de medição: nenhum arquivo de `src/` foi alterado. Preços, bônus, contratos, curvas de treino e demais regras de balanceamento continuam como estão.

Objetivo: medir a economia e a progressão **atuais**, já com o modelo de atributos da 9B, antes da reformulação da Loja (9C) e dos Patrocínios (9D). Os números daqui são o "antes" que essas fases vão comparar.

## 1. O que foi construído

| Arquivo | Papel |
|---|---|
| `scripts/lib/local9e1Policies.mjs` | Três perfis de decisão (econômico, equilibrado, competitivo). Funções puras e determinísticas, sem sorteio. Empates resolvidos pelo id |
| `scripts/sim-local-9e1-decisions.mjs` | Driver: uma carreira por seed, pelo pipeline real do jogo |
| `scripts/test-local-9e1-decision-simulator.mjs` | 48 verificações: políticas, determinismo, pareamento, integridade, save/load e sonda de patrocínio |
| `scripts/analyze-local-9e1-decisions.mjs` | Consolida as carreiras brutas em `reports/local-9e1-decision-simulator/summary.{json,md}` |

### Reuso: nenhuma regra de negócio duplicada

- Boot, determinismo (`Math.random` e relógio por seed) e criação de carreira: `scripts/lib/v526CareerSim.mjs`.
- Ações do jogador: `scripts/lib/v526Actions.mjs`, que chama as mesmas funções das páginas. Cobre onboarding, parceiro, patrocínio, treinador, staff, Loja, investimento, treino, inscrição e imprensa. O equipar passa por `equipmentLifecycle.toggleEquipItem` (9B).
- Rodada de torneio: `scripts/lib/v526Tournament.mjs`. Motor real, com o jogador montado por `loadEffectivePlayerProfile` (base + equipamento).
- Avanço de dia e fechamento mensal: `calendarLifecycle` real.
- Ganho de um equipamento: `equipmentModifiers.computeEquipmentModifiers` e `totalAppliedModifier`, a fonte canônica da 9B, com o limite de 100.
- Pontuação de parceiro: `v527gPartnerScore` (equilibrado) e `v527iOptimizerScore` (competitivo).
- Renovação de patrocínio: `sponsors.renewContract`, a mesma do botão da tela de Economia. Os harnesses anteriores nunca a chamavam (9A §7.2).

### Pareamento

O mundo e o atleta dependem só da seed (`9e1-<seed>`), nunca do perfil. Nos três perfis, o mesmo número de seed parte do mesmo atleta (atributos, estilo, potencial, caixa) e do mesmo mundo. Só as decisões mudam. O teste confirma isso.

## 2. Perfis de decisão

Parâmetros só de comportamento (quanto guardar, quanto arriscar, quando trocar):

| Decisão | Econômico | Equilibrado | Competitivo |
|---|---|---|---|
| Reserva de caixa | 4 meses de folha (mín. 400) | 2 meses (mín. 250) | 1 mês (mín. 100) |
| Treino | 1 sessão leve/dia, energia ≥ 50 | até 2, moderado (leve se energia ≤ 70) | até 3, intenso com energia > 75 e fadiga < 50 |
| Poupa energia antes do torneio | 3 dias | 3 dias | 4 dias |
| Equipamento | maior ROI; ≥ 1 ponto efetivo por 100 moedas; até 20% do caixa livre | maior ROI; ≥ 1 ponto por 333; até 40% | maior ganho efetivo; até 80% |
| Patrocínio | maior valor total (luvas + salário × meses) | idem | maior tier, depois salário; deixa vencer se há tier melhor no slot |
| Renovar patrocínio | nos últimos 30 dias | idem | idem |
| Treinador | salário ≤ 20% da receita recorrente | ≤ 40% | ≤ 60% |
| Staff | só contador/empresário, ≤ 0% da receita (na prática, nenhum) | ≤ 30%, prioridade fisioterapia | ≤ 45% |
| Torneio | encaixe de ranking, depois taxa menor; taxa ≤ 10% do caixa | encaixe, depois tier maior; ≤ 25% | tier maior; ≤ 50% |
| Parceiro | o caixa sustenta ≥ 6 meses, pontuação equilibrada | pontuação equilibrada (5.27-G) | mais forte sustentável (5.27-I) |
| Investimento | 50% do excedente acima de 2× a reserva | 30% acima de 4× | nunca |

Comum aos três: caixa negativo → dispensa o maior salário (staff ou treinador). Não se inscreve com o parceiro que já decidiu sair. Imprensa: a resposta com mais fãs + apelo comercial.

## 3. Métricas

- **Esportivas:** OVR base, OVR efetivo, pontos de equipamento aplicados, ranking, partidas, vitórias por tier, torneios, títulos, sessões de treino, W.O.
- **Financeiras:** livro-caixa mensal por categoria. A variação de cada ação vai para a categoria da ação. Avanço de dia e rodada são decompostos pelas `FinancialTransaction` do próprio jogo. Também: caixa mínimo, semanas negativas, patrimônio (caixa + investido) e moedas por ponto efetivo de equipamento.
- **Integridade (toda semana):** atributo-base em [0, 100] e ≤ teto natural; efetivo ≥ base e ≤ 100; comprar e equipar não altera a base; ganho previsto = ganho realizado; um item equipado por categoria; sem item duplicado; sem patrocínio duplicado nem slot excedido; nenhum contrato vencido há mais de 31 dias ainda ativo; moedas finitas. No fim: recarga do runtime a partir do storage e comparação de base, modificadores, efetivo, inventário, contratos, investimentos e transações.

## 4. Execuções

`TZ=UTC node --max-old-space-size=3072 scripts/sim-local-9e1-decisions.mjs --profile=<perfil> --seeds=<a-b> --days=<n> --out=<dir>`

| Horizonte | Seeds por perfil | Carreiras | Tempo por carreira | Erros · violações · resíduo de caixa | Save/load |
|---|---|---:|---:|---|---|
| 30 dias | 1–3 | 9 | 30–55 s | 0 · 0 · 0 | idêntico em todas |
| 365 dias | 1–3 | 9 | 5–7 min | 0 · 0 · 0 | idêntico em todas |
| 730 dias | 1–2 | 6 | 17–20 min | 0 · 0 · 0 | idêntico em todas |

Os 730 dias só rodaram depois de os 365 mostrarem estabilidade (sem erro, sem violação, memória dentro de 3 GB). As tabelas completas estão em `reports/local-9e1-decision-simulator/summary.md`. Os 24 JSONs brutos (50–100 KB cada, ~1,6 MB no total) não foram versionados.

## 5. Resultados (médias entre seeds)

### 365 dias

| | Econômico | Equilibrado | Competitivo |
|---|---:|---:|---:|
| OVR base final (início 21,8) | 34,0 | **42,9** | 41,2 |
| OVR efetivo final | 34,3 | 43,6 | 43,1 |
| Pontos de equipamento aplicados | 3 | 7 | 19,7 |
| Ranking final | 373 | **244** | 248 |
| Vitórias | 24% | **29%** | 13% |
| Sessões de treino | 195 | 394 | 327 |
| Caixa + investido | **36.868** | 25.504 | 4.666 |
| Semanas com caixa negativo | 0 | 0 | 1,7 |
| Gasto com equipamento | 173 | 1.320 | 13.379 |
| Moedas por ponto efetivo | 58 | 189 | 676 |

### 730 dias

| | Econômico | Equilibrado | Competitivo |
|---|---:|---:|---:|
| OVR base final | 41,3 | **50,0** | 49,9 |
| OVR efetivo final | 41,6 | 50,7 | **52,0** |
| Ranking final | 306 | 109 | **102** |
| Vitórias | 12% | **16%** | 10% |
| Caixa + investido | **70.712** | 49.325 | −1.060 |
| Semanas com caixa negativo | 0 | 0 | 4 |
| Receita total | 90.804 | **111.109** | 97.585 |
| Despesa total | 20.992 | 62.684 | 99.545 |

Receita dos dois anos (média dos perfis): salário de patrocínio ~34 mil, prêmios de torneio 15 a 37 mil, conquistas 18 a 33 mil e renovações de patrocínio ~6 mil.

## 6. Achados

| # | Prio. | Achado | Evidência |
|---|---|---|---|
| E1-01 | **P1** | **Renovar patrocínio paga luvas sem limite.** A tela de Economia mostra "Renovar" em qualquer contrato renovável, a qualquer momento. `renewContract` encerra o contrato, cria outro e paga as luvas × 1,1. Três renovações seguidas no mesmo dia pagaram +398 cada | sonda em `tests.json`; regra não alterada (escopo da 9D) |
| E1-02 | P2 | **Inscrever-se no tier mais alto permitido não tem retorno esportivo.** A elegibilidade (qualifying) deixa entrar em Gold, Platinum e Masters com ranking ~250. O motor dá diferença de −23 a −32 e 0% de vitórias nesses tiers. O ranking anda pelos pontos de participação, e a taxa de vitória cai para metade da do equilibrado | vitórias por tier (365 d): Bronze 38–50%, Silver 8–26%, Gold/Platinum 0% nos três perfis |
| E1-03 | P2 | **Dinheiro sobra para quem não gasta.** O econômico chega a 70,7 mil de patrimônio em 2 anos (66 mil investidos, 3,5 mil de rendimento) com o pior desempenho esportivo. Não há destino que converta o excedente em progressão além de treino e equipamento | patrimônio 730 d |
| E1-04 | P2 | **Equipamento caro rende pouco por moeda.** Itens comuns baratos: 58 moedas por ponto efetivo. O competitivo pagou 676 a 815 por ponto (raros) e gastou 13 a 17 mil para +2 de OVR efetivo. Agora o bônus é estável (9B), mas o custo por ponto cresce ~12× entre raridades | moedas por ponto efetivo |
| E1-05 | P2 | **Folha agressiva gera ciclo de contratar e demitir.** O competitivo contrata treinador de 1.800 e preparador de 1.150 e fica negativo. A regra de corte demite, e ele recontrata depois. Termina os 730 dias com caixa negativo nas duas seeds | `dismissals` (dias 336–399, seed 1) |
| E1-06 | P2 | **Conquistas são a maior receita do ano 1** (13 a 18 mil, à frente do salário de patrocínio). A economia inicial depende de pagamentos únicos | receitas 365 d |
| E1-07 | P3 | **Toda carreira nova herda dados de demonstração** de `src/local/localSeed.js`: contrato "Sul Energia" (`sponsor-002`, fora do catálogo, `monthly_value` em vez de `monthly_salary`), investimento de 500 (`invested_amount` em vez de `amount`) e itens de exemplo. Economicamente inertes (pagam 0), mas aparecem como contrato ativo até o fechamento de julho | `legacyContracts` nas carreiras brutas |
| E1-08 | P2 | **O mercado de patrocínio não diferencia perfis nem progride.** As 15 carreiras de 365 e 730 dias assinam exatamente 4 contratos, todos **Bronze**, e fazem 18 renovações em 2 anos. Nenhuma alcança Prata ou Ouro, nem com ranking ~90. O salário mensal fica estável em ~1,4 mil | `sponsorTiers` em `summary.json` |

Observação sobre a 9B: em 24 carreiras, com 3 a 18 compras cada, comprar e equipar nunca alterou o atributo-base. O ganho previsto pela fonte canônica bateu com o realizado em todas as compras, e nenhum atributo-base passou do teto natural.

## 7. Testes

`node scripts/test-local-9e1-decision-simulator.mjs` — **48/48** (`reports/local-9e1-decision-simulator/tests.json`):

- 32 de políticas puras: orçamento, ROI pelo modelo da 9B com o limite de 100, item duplicado, item bloqueado, patrocínio, renovação, treinador, staff, torneio, investimento, determinismo.
- Driver real com 14 dias por perfil: mesma seed e mesmo perfil → mesmo hash; três perfis com o mesmo estado inicial; sem erro; sem violação; save/load idêntico; livro-caixa sem resíduo; perfis divergem.
- Sonda de renovação de patrocínio (E1-01).

Determinismo: o `resultHash` de cada carreira exclui só o tempo de execução e o `careerId`, um UUID de `crypto.randomUUID` que fica fora do RNG determinístico. O resto da carreira é idêntico entre processos.

## 8. Limitações

- **Seeds:** 3 por perfil em 365 dias e 2 em 730. Suficiente para ordem de grandeza e para os achados, não para intervalos de confiança. A variação entre seeds é visível (ranking do equilibrado entre 89 e 129 em 730 d).
- **Políticas são heurísticas**, não ótimas. O "competitivo" é agressivo de propósito, e o resultado mede o jogo diante desse comportamento, não o melhor comportamento possível.
- **Fora do simulador:** Centro Médico (tratamentos), propriedades, investimentos de risco médio/alto, saque de investimento, venda de item, rescisão voluntária de patrocínio e metas de patrocínio (`evaluateContractSatisfaction` não é chamada pelo jogo).
- **Compra** continua replicada de `Shop.jsx` em `v526Actions.buyAndEquip`, porque a lógica ainda vive no componente (pendência 9B).
- **Notícias e entrevista pós-jogo** fora da rodada headless (sem efeito econômico, como no 5.26).
- **Dificuldade:** só a `normal`. Sem 5 temporadas, que ficam para a 9E.2/9F.

## 9. Recomendações

1. **9D (Patrocínios):** corrigir E1-01 antes de qualquer outra regra (renovação só perto do fim, ou luvas só uma vez por ciclo), e dar ao jogador escolha real de proposta (E1-08).
2. **9C (Loja):** usar "moedas por ponto efetivo" como métrica de balanceamento por raridade (E1-04). O simulador já calcula o ganho pela fonte canônica.
3. **Calendário/elegibilidade:** decidir se a entrada por qualifying em tiers sem chance real é desejada, ou se a tela deve sinalizar (E1-02). É fora do escopo do Mercado, mas distorce qualquer medição de progressão.
4. **Economia de longo prazo:** definir um destino para o excedente (E1-03) e reduzir a dependência de conquistas no ano 1 (E1-06), com estas tabelas como linha de base.
5. **Higiene:** remover a semente de demonstração das carreiras novas (E1-07). Exige decisão sobre saves existentes.
6. **9E.2:** reaproveitar este driver; acrescentar seeds e dificuldades, venda de item e as regras novas da 9C/9D; comparar com estas mesmas métricas.
