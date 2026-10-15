# Integridade final de progressão e re-auditoria limpa — Playthrough 5.26-C

**FIX INTEGRITY · DO NOT TUNE BALANCE.** Nenhum valor de balanceamento foi
alterado (patrocínio, CDB/investimentos, salários, preços, thresholds de
dificuldade, prêmios, fãs, reputação, multas, save size, divisão de prêmio).
As baselines 5.26 (`reports/progression-economy-526/`) e 5.26-B
(`reports/progression-integrity-526b/`) seguem intactas.

Branch `feature/live-coach-dynamic-adaptation`, HEAD `d5e5a2e` (inalterado).
Sem commit, sem push, working tree preservado.

## Resumo

| Item do escopo | Antes | Depois |
|---|---|---|
| Salto de rank em 01/2027 | jogador parado sobe 298 posições; −63,8% dos pontos do mundo em 1 dia | 0 posições; −0,2%; na re-auditoria: variação semanal na virada mediana 0, máx. 24 |
| Patrocinadores "indisponíveis" | 9 de 21 nunca assináveis | 21/21 alcançáveis; 21/21 assinados em alguma carreira |
| Rank da dupla adversária | nunca resolvido para atletas reais do catálogo (chave por id de template) | resolvido pela identidade canônica; 0 casos de rank ausente com TeamRanking existente |
| Laço de re-contratação diária | até 123 re-contratações (13% das carreiras) | 0 em 30 dias, 365 dias e nas 55 carreiras da re-auditoria |
| Bug para runs longas | Race não zerava para atletas além do 1.500º | Race zera para toda a população |
| Re-auditoria limpa | 5.26 rodou com shim | 15 + 40 carreiras sem shim, sem trava, sem erro |

**Redução de gate (pedido do usuário):** o alvo da re-auditoria foi reduzido de
54 para **40 carreiras** (créditos). Composição: 35 × 5 temporadas (casual e
normal seeds 1–12, otimizador seeds 1–11) + 5 × 10 temporadas (seed 501 dos três
perfis + normal-502 e casual-502). O lote longo cumpre o **mínimo documentado**
(3 perfis × 1 carreira × 10 temporadas), não a meta de 9.

## 1. Bloco A — salto de ranking em 01/01/2027

**Reproduzido** (`scripts/instrument-rank-rollover-v526c.mjs`, carreira real,
jogador congelado em 117 pontos; `ranking-rollover-before.json`):

| Data | Jogador | Ranqueados | Pontos do mundo | Linhas expiradas |
|---|---|---|---|---|
| 31/12/2026 | #627 | 957 | 851.062 | 0 |
| 01/01/2027 | #626 | 958 | 857.347 | 0 (Race zerada: 217.352 → 0) |
| 03/01/2027 | **#328** | 752 | **309.972 (−63,8%)** | **888** |

**Causa.** Não é mistura World/Race nem corte por ano. Os pontos iniciais do
mundo são âncoras `legacy_seed` (uma por atleta, valendo o total inteiro), todas
com a **mesma data** (1ª semana do circuito). A janela rolling de 364 dias
(`rankingWindow.isResultExpired`) é correta, mas como as ~1.000 âncoras têm a
mesma data, todas saem no mesmo dia (03/01/2027): 888 linhas, −64% dos pontos e
206 atletas fora do ranking. Achado da 5.26-B confirmado com os dados atuais
(884 → 888 linhas, −64% → −63,8%).

**Autoridades mapeadas.** World/Circuit = `computeRollingPoints` (best-22,
janela de 364 dias por data do resultado; recálculo semanal em
`circuitLifecycle.processWorldCircuit`). Race = `race_points`, zerada só por
`annualCareerReportLifecycle.resetRaceSeasonPoints` na virada do ano civil.
Nenhum dado anual entra no World; não existe cutoff por ano.

**Correção** (`src/game-core/rankingWindow.js`, `effectiveResultPoints`): a
âncora representa resultados espalhados pelas 52 semanas anteriores cujas datas
não existem; ela passa a valer de forma linear ao longo da própria janela (100%
ao nascer → 0 aos 364 dias). Resultados reais, best-22, janela de 364 dias e
Race não mudam. **Depois** (`ranking-rollover-after.json`): 31/12 #344 → 01/01
#338 → 03/01 **#338**; pontos do mundo −0,2% no dia das 888 expirações. A queda
de 898 → 804 ranqueados em 01/01 é de âncoras pequenas que arredondam para 0
perto do fim da janela + aposentadorias anuais, não reset.

**Race.** Continua zerando em 01/01. Achado colateral corrigido (item 5 do
escopo): o reset lia só os 1.500 primeiros atletas por `ranking_position`
(`list('ranking_position', 1500)`); com prospects + aposentados na coleção, os
de fora levavam a Race do ano anterior para sempre. Agora lê a população
inteira. Na re-auditoria a população máxima foi 1.150 (o corte não chegou a
agir), 0 de 255 viradas sem reset do jogador.

## 2. Bloco B — patrocinadores

21 patrocinadores no catálogo; **9 nunca assináveis**, todos **BUG**: os 9
originais (Babolat, Siux, Varlion, Nox, Wilson, Adidas, Joma, Bullpadel, Head)
não têm o campo `is_available`; o mercado passou a ler `SPONSOR_CATALOG` direto
e `canSign` tratava campo ausente como "não aceita novos contratos". Correção em
`sponsors.js`: só `is_available === false` explícito bloqueia. Os outros 12 são
**EXPECTED LOCK** (XP/títulos/fãs/idade/estágio). **CONTENT NEVER REACHABLE: 0**
(`test-all-sponsors-reachable-v526c`: janela de idade cruza a carreira 16–40,
fãs ≤ 100, categoria de slot válida, aparece no mercado em ≤ 24 meses no
limiar). Campos auditados: idade (data da carreira, 5.26-B), `ranking_position`
(gravado pela autoridade, 5.26-B), reputação, `fan_appeal`, tier
(Bronze/Prata/Ouro ↔ TIER_RANK), data da carreira; status/nação/conquistas não
entram na elegibilidade. **Nenhum threshold alterado.** Tabela completa e dados
empíricos em `sponsors-eligibility.json`.

| id | tier | XP | títulos | fãs | idade | classificação | carreiras que assinaram (40) |
|---|---|---|---|---|---|---|---|
| babolat | Bronze | 0 | 0 | 20 | 16–35 | BUG corrigido | 31 |
| siux | Bronze | 0 | 0 | 25 | 16–32 | BUG corrigido | 39 |
| varlion | Bronze | 100 | 0 | 30 | 18–38 | BUG corrigido | 14 |
| nox | Prata | 500 | 0 | 40 | 18–36 | BUG corrigido | 23 |
| wilson | Prata | 1000 | 0 | 45 | 18–37 | BUG corrigido | 30 |
| adidas | Prata | 1500 | 0 | 50 | 20–36 | BUG corrigido | 33 |
| joma | Prata | 800 | 0 | 40 | 18–37 | BUG corrigido | 40 |
| bullpadel | Ouro | 3000 | 1 | 55 | 20–38 | BUG corrigido | 22 |
| head | Ouro | 5000 | 3 | 65 | 22–39 | BUG corrigido | 3 |
| asics, decathlon, paddleague, localfit | Bronze | 0–300 | 0 | 0–20 | 16–45 | EXPECTED LOCK | 39–40 |
| garmin, playtomic, therabody, movistar | Prata | 1100–2200 | 0 | 38–55 | 17–40 | EXPECTED LOCK | 20–40 |
| redbull, estrelladamm, cupra, iberdrola | Ouro | 3200–4200 | 1–2 | 62–72 | 18–40 | EXPECTED LOCK | 4–29 |

## 3. Bloco C — rank da dupla adversária e zebras

**Reproduzido** (`test-opponent-team-rank-resolution-v526c`): dupla canônica
#1 do mundo identificada pelos ids de template do catálogo (`player-real-*`) →
**sem ranking**; pelos ids do mundo → #1. Telemetria da re-auditoria anterior:
468 adversários, 0 linhas de TeamRanking encontradas.

**Causa.** `getCanonicalTeamWorldRank` montava a chave da dupla com os ids de
template; a TeamRanking é chaveada pelo id do AthleteProfile do mundo. Para
atletas reais os ids diferem.

**Autoridade agora.** `teamRanking.getCanonicalTeamWorldRank` resolve cada
membro pela mesma regra da materialização de parceiros
(`findMaterializedPartnerAthlete`: id → bot_id → nome só para reais) e lê a
TeamRanking canônica (`rankForTeamKey`), devolvendo `source`
(`team-ranking` | `unranked` | `missing-roster`). Sem seed, sem soma na UI, sem
rank individual. A regra de zebra, **inalterada**, virou função única
`isUpsetResult` (TournamentModal e harness). A partida grava o retrato
histórico: `opponent_rank`, `opponent_rank_source`, `opponent_member_ids`
(roster sorteado) e `team_rank_at_match` (roster comprometido); mudanças
posteriores não reescrevem (`test-historical-opponent-pair-rank-v526c`).
Casos exigidos (`test-upset-detection-v526c`): #200 vence #20 → zebra; #20
vence #200 → não; sem ranking → não; empate → não; legado/ausente → não.

**Limite estrutural (decisão de design em aberto).** Os adversários dos torneios
do jogador são duplas sintéticas do catálogo `BOTS_BY_DIFFICULTY`, nunca
inscritas no circuito (torneios do jogador são excluídos do sorteio de IA,
`WorldTourLifecycle.js:475`); por regra da 4.6B/5.15 elas não têm posição. Na
re-auditoria: 21.332 partidas, **5 com TeamRanking canônica** (todas
resolvidas; 0 ausentes), 1 tentativa de zebra (perdida), **0 zebras**. A
detecção funciona, mas o conjunto de dados quase nunca produz o caso. Dar rank a
esses adversários exige sortear o torneio do jogador do campo real de duplas
(com pontos para essas duplas no settlement) — mudança de design com efeito em
dificuldade, fora do escopo desta fase. Gate "upset detection always false" =
**não atendido nos dados**.

## 4. Bloco D — laço de re-contratação diária

**Reproduzido** (`scripts/repro-partner-retired-loop-v526c.mjs`, 30 dias,
`partner-loop-repro-before.json`): **30 re-contratações** do mesmo parceiro, 30
encerramentos "Aposentadoria do parceiro". Nos dados da 5.26: o mesmo template
(`player-fictional-1dmegvd`) re-contratado todo dia a partir de 2028-05-01 em 3
carreiras.

**Causa (provada).** O atleta materializado de um template se aposenta
(`evolveAthleteCareerMonth`) → `processPartnerDay` encerra a dupla → a busca
(`getAvailablePartners`, catálogo estático) oferece o MESMO template →
`startPartnership` → `materializePartnerAthlete` reaproveita a linha aposentada
→ encerrada no dia seguinte. Não era renovação, data de contrato ou lock.

**Correção.** `partnerAthlete.isRetiredAthlete` (mesma regra de
`processPartnerDay`); `startPartnership` recusa template aposentado **antes** de
encerrar a dupla atual; busca do PartnerSearch, propostas iniciais do PartnerHub
e candidatos reais excluem aposentados. **Depois:** 0 re-contratações em 30
dias (novo parceiro no dia seguinte); 365 dias: 7 assinaturas, 0 duplas < 2
dias, 0 dias sem dupla; re-auditoria: 0 eventos de laço, máx. 4 assinaturas do
mesmo parceiro em 5–10 anos (re-contratações legítimas espaçadas). Roster
comprometido, separação adiada e histórico intactos (regressões §8).

## 5. Bloco E — re-auditoria limpa

- Harness: `run-progression-economy-v526.mjs`, sem `PL526_SHIM` (todas as
  carreiras `shimEver=false`).
- Checkpoint a cada 180 dias, segmentos em processo novo; retomada após kill.
  **Determinístico**: contínua = morta no dia 60/100 e retomada
  (`test-progression-run-resume-v526c`, 6/6).
- Infraestrutura externa: 5 sims mortos com 0xC000013A e 8 relançamentos do
  runner após kill externo da árvore do harness (mais 1 relançamento causado
  por um encerramento antecipado do meu "stopper" do alvo de 40). Na máquina
  rodavam outros projetos (Codex, atlas-invest, VS Code), com CPU em 100% e
  0,5 GB livres em boa parte do tempo. Detectados e retomados do checkpoint por
  runner + supervisor + watchdog + trava por lote; nenhum classificado como bug.
  O WebSocket do Vite do harness foi desligado (`ws: false`) por conflito de
  porta 24678 com o Vite de outro projeto (só harness, sem efeito no jogo).

| Lote | Carreiras | Temporadas | Concluídas | Shim | Travas | Erros | OVR motor ≠ card | Moedas perdidas | Laço parceiro | Race sem reset |
|---|---|---|---|---|---|---|---|---|---|---|
| Smoke | 15 (5 seeds × 3) | 2 | 15 | 0 | 0 | 0 | 0 | 0 | 0 | 0/30 |
| Principal | 35 | 5 | 35 | 0 | 0 | 0 | 0 | 0 | 0 | 0/175 |
| Longo | 5 | 10 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0/50 |

## 6. Dificuldade, progressão e economia limpas (lote principal, 35 × 5 anos)

**Vitória por classe:** Fácil 49,2% (n=1.704) · Médio 78,8% (n=10.254) ·
Difícil 63,6% (n=4.224); geral 71,7% (16.182 partidas).
**Por tier:** Bronze 50,4 · Silver 47,4 · Gold 80,6 · Platinum 77,6 · Masters
67,4 · Elite 62,3 · Crown 45,9 · Circuit Finals 61,3 · Legacy Finals 45,9.
**Por rodada:** Q 52,8 · R1 87,5 · R2 75,0 · QF 71,2 · SF 50,2 · F 34,3.
**Delta de força (motor):** mediana +29,4 OVR a favor do jogador; ≥+15 → 84,4%
de vitória; −5..+5 → 16,7%. Delta de rank de dupla: indisponível (adversários
sem rank, §3). Detalhe por perfil em `difficulty.json`.

**Marcos:** rank mediano 1 ano **#361**, 2 anos **#10**, 3 anos **#5**, 5 anos
#4. Top100 35/35 (dia 546), Top50 35/35 (dia 595), Top10 32/35 (dia 728), #1
22/35 (dia 882). Títulos nos 2 primeiros anos: mediana 1 (52 no total).
Por perfil (Top10): casual 75% (dia 1.442), normal 100% (693), otimizador 100%
(623). OVR mediano: início 12 · 6m 34–48 · 1a 52–65 · 2a 69–77 · 3a 77–81 ·
5a 83–84 · 10a 86. Títulos/finais/semis por ano em `summary.json`.

**Economia** (definições idênticas às da 5.26): receita do ano 1 84–101 mil;
patrocínio = **86–88% da renda no ano 1** (65–87% no ano 5); dominância do
patrocínio desde o dia 0 em 100% das carreiras. Money-solved: casual 75%
(dia ~533), normal 100% (dia ~1.416), otimizador 0% (reinveste o caixa;
patrimônio final 1,09 M). Treinador: contratado em 100%, salário 7,5–12% da
renda. Loja: 43–48 compras por carreira, índice de acessibilidade mediano
0,6–0,8. Insolvência 0%. Patrocínio: 1º Prata em 100% (dia mediano 459), 1º
Ouro em 95% (dia 763); valor mensal mediano Bronze 1.944 · Prata 5.155 · Ouro
13.411.

## 7. Save size e desempenho do harness

Save mediano: Ano 1 12,4 MB · Ano 2 18,5 · Ano 3 24,5 · Ano 5 36,0 · Ano 10
63,3 MB → **~6 MB/ano**. Maiores tabelas (save de 5 anos, 34–37 MB):
`Tournament` 9,6–9,9 MB (773), `AthleteProfile` 6,2–6,4 MB (~1.120),
`WorldEvent` 3,6–3,7 MB (~6.600), `AnnualCareerReport` 3,1 MB (5),
`TrainingSession` 3,1–3,3 MB. Harness: ~79 min por carreira de 5 anos (≈16 min
por carreira-ano) e 4–6 h por carreira de 10 anos com 3 workers sob máquina
saturada; RSS mediano 1,6 GB (máx. 2,1 GB). Não otimizado.

## 8. Verificação manual (Bloco P)

Saves finais (5 anos, seed 1) recarregados num runtime novo pelo caminho do
jogo (`scripts/inspect-save-v526c.mjs`, `manual-check.json`): rank, moedas,
patrocínios, staff, parceiro, títulos, equipamento, idade e reputação **batem com
o log da simulação nos três**.

| Save | Rank | Moedas | Patrocínios | Staff | Parceiro | Títulos | Equip. | Idade | Rep. |
|---|---|---|---|---|---|---|---|---|---|
| casual-001 | #5 | 100.337 | 6 (Bronze/Prata/Ouro) | 6 + treinador | Nathan Leroy, OVR 60 | 1 | 47/9 | 21 | 100 |
| normal-001 | #2 | 799.091 | 6 (Red Bull, Bullpadel…) | 7 + treinador | Nuno Teixeira, OVR 87 | 16 | 49/9 | 21 | 100 |
| otimizador-001 | #2 | 162.844 | 6 (Red Bull, Bullpadel…) | 7 + treinador | Miguel Yanguas, OVR 93 | 14 | 43/9 | 21 | 100 |

## 9. Comparação 5.26 × 5.26-B × 5.26-C

Ver `comparison-526-vs-526b-vs-526c.md` (tabela completa). Primeiros 730 dias,
seeds 1–5 × 3 perfis:

| Métrica | 5.26 | 5.26-B | 5.26-C |
|---|---|---|---|
| OVR do parceiro no motor = card | 0% (motor 1) | 100% (59) | 100% |
| Travamento | 100% | 0% | 0% |
| Vitória Fácil | 29,6% | 44,1% | 44,9% |
| Vitória Médio | 40,8% | 72,3% | 73,1% |
| Vitória Difícil | 24,1% | 55,0% | 53,8% |
| Rank mediano em 2 anos | #96 | #20 | #9 |
| Títulos por carreira-ano | 0,03 | 0,5 | 0,73 |
| Maior tier de patrocínio | Bronze | Prata | Prata (Ouro a partir do 3º ano) |
| Zebras detectadas | 0 | 0 | 0 (adversários sem rank) |
| Salto na virada de 2027 | ~300 posições | ~307 | 13 (mediana; progressão normal da semana) |
| Laço de re-contratação | 13,3% | 0% (3 carreiras) | 0% |

A 5.26-B guardou só 3 dos 14 JSON brutos usados no seu relatório; a coluna usa
as métricas documentadas (n=14) e marca com † o que saiu das 3 sobreviventes.

## 10. Bug × tuning

| Achado | Bug de integridade? | Tuning? | Resolvido? | Próxima fase |
|---|---|---|---|---|
| OVR do parceiro no motor | sim | — | sim (5.26-B) | — |
| Congelamento anual | sim | — | sim (5.26-B) | — |
| Moedas de conquista apagadas | sim | — | sim (5.26-B) | — |
| Reputação | sim | — | sim (5.26-B) | — |
| Idade (relógio real) | sim | — | sim (5.26-B) | — |
| Gating por ranking | sim | — | sim (5.26-B) | — |
| Salto de rank na virada | sim | — | sim | — |
| Race sem reset além de 1.500 atletas | sim | — | sim | — |
| Disponibilidade de patrocínio | sim | — | sim | — |
| Rank da dupla adversária (identidade) | sim | — | sim | — |
| Re-contratação diária | sim | — | sim | — |
| Adversários do jogador sem rank (zebras ≈ 0) | **design** | — | **não** | decisão: sortear do campo real |
| Patrocínio inicial / dominância desde o dia 0 | não | sim | — | 5.27 |
| CDB / investimentos | não | sim | — | 5.27 |
| Fãs (100 em semanas) | não | sim | — | 5.27 |
| Curva de dificuldade (R1 87%, delta +29 OVR) | não | sim | — | 5.27 |
| Custo de staff | não | sim | — | 5.27 |
| Preços da loja | não | sim | — | 5.27 |
| Multa de demissão | não | sim | — | 5.27 |
| Estrutura de prêmios (2–3% da renda) | não | sim | — | 5.27 |
| Save size (~6 MB/ano) | não | otimização | — | fase própria |

## 11. Testes, regressões e verificações

12 testes novos (`scripts/test-*-v526c.mjs`): **12/12**. Regressões
(`run-regressions-v526c.mjs`, `regressions.json`): **79/81**. As 2 falhas são
preexistentes: `test-athlete-profile-ovr-repair-v56` (já falhava na 5.26-B) e
`test-ranking-ui-authority-v56` (asserção sobre o CareerHud alterado na 5.24;
arquivo não tocado). `test-race-circuit-ledger-parity-v5` falhou na 1ª execução
por consequência desta fase: o teste recalculava o best-22 com uma cópia inline
da regra antiga (âncora a valor cheio). Passou a usar `computeRollingPoints`,
aceitando só o decaimento da âncora em até 7 dias (idade do último recálculo
semanal); resultados reais batem exatamente — 2/2.
`npm run lint` verde · `npm run build` verde · `git diff --check` limpo
(só avisos de fim de linha preexistentes). Sem commit, sem push.

Diff da fase (`phase-526c-src.diff`): 10 arquivos de jogo, +147/−21 linhas —
`rankingWindow.js`, `annualCareerReportLifecycle.js`, `sponsors.js`,
`teamRanking.js`, `TournamentModal.jsx`, `partnerAthlete.js`,
`partnershipSystem.js`, `career.js`, `PartnerSearch.jsx`, `PartnerHub.jsx`.
Auditoria do diff: nenhuma mudança em preços, recompensas, salários, pagamentos
de patrocínio, thresholds de dificuldade ou taxas de investimento.

## 12. Veredito

**B.** Todos os bugs de integridade do escopo foram reproduzidos, explicados,
corrigidos e provados; a re-auditoria rodou sem workaround, sem trava, sem erro
e com resume determinístico. Não é A por dois motivos: (1) redução de gate
pedida pelo usuário — 40 carreiras (35 × 5 + 5 × 10) em vez de 45 × 5 + 9 × 10;
(2) zebras continuam 0 nos dados porque os adversários dos torneios do jogador
são sintéticos e sem rank — exige decisão de design, não correção de
integridade.
