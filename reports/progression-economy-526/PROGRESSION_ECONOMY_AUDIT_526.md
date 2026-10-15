# Auditoria de progressão, dificuldade e economia — Playthrough 5.26

**Fase de auditoria. Nenhum valor de balanceamento foi alterado.** O `git diff`
desta fase contém só scripts, testes e relatórios (seção 15).

## Resumo executivo

**Veredito: estruturalmente desequilibrada.** A economia é fácil demais e
ao mesmo tempo sem propósito (o dinheiro nunca compra progressão), e a
dificuldade competitiva é artificialmente difícil por causa de um bug do motor.

- **Dois bugs P0 dominam tudo.** (1) Em 100% das 11.265 partidas o parceiro do
  jogador jogou com **OVR 1** no motor (card mostra mediana 35). (2) Toda
  carreira **trava para sempre** entre os dias 366 e 452 (o jogo real não
  avança; o harness seguiu com um shim documentado).
- **Patrocínio é a economia inteira.** O jogador assina no **dia 0, rank #1002,
  sem jogar**: ~1.500/mês + ~1.875 de luvas por contrato. No Ano 1, patrocínio =
  86% da renda e prêmios = 2,4% (36:1). O valor **não escala** com o ranking e
  nunca passa do tier Bronze (bloqueio de idade pelo relógio do PC).
- **O dinheiro não tem destino.** A loja trava em "incomum" (reputação nunca
  sobe; `ranking_position` nunca gravado). Equipamento = 0,5% da renda.
  "Money solved" no **mês 16** (rank ~#293) para o perfil normal.
- **Progressão:** normal chega ao Top100 em 21 meses e fica no Top50 no ano 5
  (rank mediano #47), mas com **2 títulos em 225 carreira-anos**: finais
  vencidas em 5,3% dos casos. Ninguém chega a #1.
- **Longo prazo (10 temporadas):** platô entre #30 e #60 do ano 4 ao 10, melhor
  rank #19–21, **zero títulos em 30 carreira-anos**, nível 50 (teto) no ano 5,
  patrimônio do normal dobra de 158k para 330k sem nenhum destino, save de
  63–70 MB.

## 1. Escopo e método

| Item | Valor |
|---|---|
| Perfis | casual, **normal (referência)**, otimizador |
| Carreiras principais | **45** (15 seeds × 3 perfis × 5 temporadas = 1.826 dias) |
| Carreiras longas | **3** (1 por perfil × 10 temporadas = 3.653 dias) — *ver seção 11* |
| Partidas / torneios / meses de livro-razão | 11.265 / 6.697 / 2.745 |
| Checkpoints | 3, 6, 12, 24, 36, 48, 60 meses (longas: anual até 120) |
| Amostra save/reload | seeds 5, 10, 15 de cada perfil (20%): reload a cada 180 dias |

**Desvio do pedido original (decisão do usuário):** 15 seeds por perfil em vez
de 30, e 1 carreira longa por perfil em vez de 3, porque cada carreira de 5
anos leva 45–120 min nesta máquina (o save cresce até ~38 MB e é regravado a
cada escrita). As faixas P10–P90 e os IC95% da mediana (bootstrap) refletem
esse tamanho de amostra.

**Harness (só pipeline real de produção):** criação de carreira pela mesma
sequência da tela "Nova carreira"; avanço de dia por
`advanceCareerDays/finalizeCareerAdvanceRange` (que rodam `simulateWorldDay`,
mercado de duplas da IA, world tour, staff, finanças mensais); decisões do
jogador pelas mesmas funções das páginas (registro com `teamRank` como em
`Tournaments.jsx`, patrocínio, treinador, staff, loja+equipar, treino,
imprensa, parceria por oferta/busca/renovação, `ensureMyProfile` semanal como a
navegação faz); partidas pelo motor real com o mesmo `handleMatchFinished` do
`TournamentModal` (incluindo o commit via `incrementMissionProgress`). Detalhes:
`scripts/lib/v526*.mjs`.

**Políticas (só comportamento):** casual = 50% de inscrição em tier aleatório,
imprensa 30% com respostas aleatórias, sem upgrade de treinador; normal = melhor
tier elegível respeitando o ranking mínimo exibido, imprensa 80% com respostas
"positivas", renova parceiro com OVR ≥ 60% do seu, upgrade de treinador;
otimizador = encaixe de tier, treino intenso, imprensa 100% maximizando
fãs+patrocínio, CDB com excedente.

**Shim contrafactual (só no harness):** para medir além do dia ~366, o `create`
de `AthleteProfile` com id existente devolve a linha existente em vez de lançar
(`scripts/lib/v526CareerSim.mjs:installSoftLockShim`). O primeiro disparo é
gravado como o dia em que o jogo real travaria.

## 2. Validação do harness

| Verificação | Resultado |
|---|---|
| Testes do harness (`scripts/test-progression-economy-v526.mjs`) | **6/6**: determinismo, sem vazamento de futuro (prefixo), save/reload sem perda de estado, livro-razão, paridade de lifecycle, RNG de política isolado |
| Livro-razão (fechamento = abertura + receitas − despesas) | **2.745 meses, resíduo máximo 0**, nenhuma moeda sem categoria |
| Save/reload (9 carreiras, 90 reloads) | **0 divergências** de estado persistido |
| Dupla contagem | cada moeda entra numa única categoria pela diferença real do saldo por passo; luvas, mensalidade, prêmio, conquista e missão separadas |
| Competência de salários | coach/staff pelo `monthly_close` do mês; salário de parceria pela `FinancialTransaction` do jogo |
| Erros nas 45 carreiras | 0 |

## 3. Progressão (mediana, [P10–P90])

| Mês | casual rank | **normal rank** | otimizador rank | normal OVR | normal rank da dupla |
|---|---|---|---|---|---|
| 3 | 956 | **931** [905–937] | 940 | 33 | 902 |
| 6 | 884 | **812** [785–842] | 866 | 47 | 800 |
| 12 | 685 | **666** [621–702] | 741 | 61 | 775 |
| 24 | 112 | **75** [52–102] | 96 | 75 | 84 |
| 36 | 123 | **80** [67–88] | 81 | 80 | 26 |
| 48 | 95 | **58** [47–61] | 62 | 82 | 18 |
| 60 | 80 | **47** [34–55] | 53 | 83 | 13 |

OVR inicial 12. O OVR satura em 82–85 a partir do ano 3–4.

**Marcos (mediana entre quem alcançou; % que alcançou em 5 anos):**

| Marco | casual | **normal** | otimizador |
|---|---|---|---|
| Top500 | 12,2 m (100%) | **12,2 m (100%)** | 12,2 m (100%) |
| Top250 | 18,6 m (100%) | **17,0 m (100%)** | 18,4 m (100%) |
| Top100 | 27,8 m (100%) | **21,4 m (100%)** | 23,5 m (100%) |
| Top50 | — (0%) | **46,9 m (93%)** | 55,2 m (60%) |
| Top25 | — | 58 m (7%) | — |
| Top10 | — | 60 m (7%, 1 carreira) | — |
| #1 | — | — | — |

**Salto artificial:** em 01/01/2027 o jogador sobe ~290 posições com os
**mesmos pontos** (ex.: normal-007, 117 pontos: #624 → #337). Os pontos-semente
da IA expiram em bloco. Por isso o Top500 cai no dia 371 em 100% das carreiras.

![ranking](charts/rank-over-time.png) ![ovr](charts/ovr-over-time.png) ![marcos](charts/milestones.png)

## 4. Dificuldade

**Bug P0 por trás de toda esta seção:** o motor (`engine/match/playerModel.js`)
calcula o OVR pela média dos 10 atributos planos com piso 1; os atletas do
mundo não têm atributos planos (0 de 400 amostrados). Resultado: parceiro do
jogador = **OVR 1 em 100% das partidas** (card: mediana 35, P90 83);
adversários no motor = mediana 18,5 contra 30,5 no card.

### Matriz de dificuldade (72)

O jogo não tem Fácil/Médio/Difícil por partida: o card mostra um rótulo fixo por
tier. Agrupamento: Fácil = Bronze/Silver ("Iniciante/Entrada Mundial"), Médio =
Gold/Platinum ("Acessível/Competitivo"), Difícil = Masters/Elite/Crown.

| Classificação | Partidas | Win rate | Δ OVR exibido | Δ OVR do motor | Δ ranking |
|---|---|---|---|---|---|
| Fácil | 1.771 | **30,0%** | +15,1 | +14,3 | n/d* |
| Médio | 7.146 | **48,4%** | +30,2 | +23,1 | n/d* |
| Difícil | 2.345 | **24,8%** | +20,4 | +16,1 | n/d* |

\* O rank da dupla adversária (`getCanonicalTeamWorldRank`) volta "sem ranking"
em 11.265 de 11.265 partidas — a mesma chamada do modal; a detecção de zebra
(`upset`) provavelmente nunca dispara.

**Por tier:**

| Tier | Rótulo | Partidas | Vitórias | Δ exibido | Δ motor |
|---|---|---|---|---|---|
| Bronze | Iniciante | 1.061 | 28,3% | +15,4 | +14,1 |
| Silver | Entrada Mundial | 710 | 32,7% | +14,7 | +14,7 |
| Gold | Acessível | 3.180 | **52,4%** | +28,8 | +23,4 |
| Platinum | Competitivo | 3.966 | 45,2% | +31,3 | +22,8 |
| Masters | Difícil | 1.649 | 30,6% | +23,3 | +17,4 |
| Elite | Muito Difícil | 546 | **11,4%** | +16,3 | +13,7 |
| Crown | Lendário | 150 | 10,0% | +2,5 | +10,4 |

**Por rodada (chave principal):** primeira rodada 53,5%, R32 76,3%, oitavas
22,2%, quartas 20,9%, semifinal 21,5%, **final 5,3%** (38 finais). Qualifying
30,5%.

**Vitória x diferença de força:** com o card mostrando a dupla do jogador
**+5 a +15** mais forte, ela venceu **19%**; entre −5 e +5, **10,6%**. Só com
+15 ou mais passa de 50% (52,1%).

- **Rótulo invertido:** "Iniciante" (28%) é mais difícil que "Acessível" (52%),
  porque Bronze/Silver são jogados no início, com o jogador fraco e o parceiro a 1.
- **Penhasco:** Masters 30,6% → Elite 11,4% (−19 p.p.) com Δ exibido parecido.
- **Falsos degraus:** Elite e Crown têm vitória quase igual (11,4% e 10,0%) e a
  mesma rodada mediana (0).
- **Rodada esperada x real:** o normal fica abaixo da rodada esperada pela força
  exibida em **93%** dos torneios (mediana −2 rodadas).
- **Títulos:** 2 em 225 carreira-anos (casual 1 Gold, normal 1 Bronze, otimizador 0).

![vitória por tier](charts/win-by-tier-label.png) ![vitória x delta](charts/win-by-delta.png) ![rodadas](charts/round-reached-by-tier.png)

## 5. Economia

### Receita e despesa por ano — perfil normal (mediana)

| Ano | Receita | Despesa | Saldo do ano | Patrocínio | Prêmios+partidas | Conquistas | Conquistas apagadas (bug) |
|---|---|---|---|---|---|---|---|
| 1 | 72.282 | 41.404 | +30.816 | **86,2%** | 2,4% | 7.700 | 7.600 |
| 2 | 87.633 | 62.952 | +24.106 | 69,9% | 11,1% | 13.900 | 7.500 |
| 3 | 108.644 | 79.608 | +29.955 | 54,8% | 16,3% | 33.400 | 20.000 |
| 4 | 82.417 | 71.356 | +7.172 | 70,5% | 22,3% | 8.000 | 8.000 |
| 5 | 82.083 | 68.818 | +11.987 | 69,9% | 23,0% | 4.000 | 3.000 |

Maiores despesas do normal no Ano 3: treinador 24,8k, treino 17,7k, staff
17,5k, inscrições 5,7k. Salário de parceria: 0 a partir do Ano 3.

### Patrimônio (moedas + investido), mediana

| Mês | casual | **normal** | otimizador |
|---|---|---|---|
| 3 | 10.203 | **12.890** | 11.241 |
| 6 | 14.499 | **19.913** | 12.862 |
| 12 | 21.664 | **30.976** | 10.620 |
| 24 | 45.710 | **58.390** | 8.276 |
| 36 | 66.183 | **75.939** | 12.976 |
| 60 | 125.068 | **91.831** [73k–175k] | 9.603 |

### Estresse financeiro

| Perfil | Meses com saldo negativo | Insolvência (caixa < 0 alguma vez) | Índice de dificuldade econômica (0–100) |
|---|---|---|---|
| casual | 9,8% | 0% | 4,0 |
| normal | 16,4% | 0% | 6,6 |
| otimizador | 39,3% | **20%** | 42,8 |

Índice = 40 × fração de meses negativos + 30 × fração de semanas com caixa < 100
\+ 30 × (1 − min(1, patrimônio final / 12 meses de despesa)).

### Pontos de "resolvido"

| Ponto | casual | **normal** | otimizador |
|---|---|---|---|
| **Money solved** (receita recorrente ≥ despesa e caixa ≥ 12 meses de despesa) | mês 26, rank ~#90 | **mês 16, rank ~#293** | nunca |
| **Sponsor dominance** (patrocínio > 50% da renda e > prêmios) | dia 0 | **dia 0** | dia 0 |
| **Gear solved** | nunca (loja travada) | nunca | nunca |
| **Staff solved** (patrocínio ≥ treinador mais caro 7.435 + staff completo 17.500) | nunca | nunca | nunca |

![receita x despesa](charts/income-vs-expense.png) ![patrimônio](charts/patrimony-over-time.png) ![mix de receita](charts/income-mix-normal.png)

## 6. Patrocínio

- **Primeiro patrocinador:** normal e otimizador no **dia 0** (100% sem nenhuma
  partida), rank #1002, OVR 12, 0 fãs; casual no dia 14. Paga ~1.500/mês + ~1.875
  de luvas (Padel League; LocalFit também sem requisito).
- **Participação na renda:** Ano 1 = 86%, Ano 2 = 70%, Ano 3 = 55%, Ano 5 = 70%.
- **ROI no Ano 1:** patrocínio / (treinador + staff) = 5,2× (normal).
- **Teto Bronze:** 100% das ~1.150 assinaturas são de patrocinadores Bronze.
  Os Prata disponíveis (Garmin, Playtomic, Movistar, Therabody) recusam por
  idade ("Fora da faixa etária (17/18–38/40)"): `calculateAge` usa o relógio do
  PC e o atleta nascido em 2010 tem "16 anos" para sempre. Os outros 9
  (Babolat, Siux, Varlion, Nox, Wilson, Adidas, Joma, Bullpadel, Head) não têm
  `is_available` e são tratados como "não aceita novos contratos".

### Matriz de patrocínio (73)

| Faixa de ranking | Assinaturas/ano | Valor mensal médio | % da renda vinda de patrocínio |
|---|---|---|---|
| >1000 | 28,8 (2 assinaturas no 1º mês) | 1.589 | 56,3% |
| 751–1000 | 3,7 | 1.678 | 90,9% |
| 501–750 | 5,4 | 1.881 | 92,7% |
| 251–500 | 4,5 | 1.577 | 70,5% |
| 101–250 | 4,9 | 1.577 | 79,3% |
| Top100 | 4,7 | 1.566 | 67,8% |

![patrocínio mensal](charts/sponsor-monthly-over-time.png)

## 7. Treinador e staff

- **1º treinador:** normal no dia 63 (rank ~#958), 286/mês (iniciante) = 11,5% da
  renda recorrente estimada; casual no dia 21; otimizador no dia 63, mediana
  1.500/mês (profissional) = 57%.
- **Treinador elite:** normal em 73% das carreiras, mediana dia 532 (~17,5
  meses); otimizador 100%, dia 504; casual 0%.
- **Staff:** normal 9 contratações por carreira; casual 15; otimizador 11.
- Ganho de OVR/mês nos 6 meses antes x depois do 1º treinador (normal): 7,7 → 4,1
  (confundido com retornos decrescentes do OVR; não isola o efeito do treinador).

### Matriz de staff (74)

| Faixa | Staff médio | Custo/mês (staff + treinador) | % da renda do mês |
|---|---|---|---|
| >1000 | 0 | 0 | 0% |
| 751–1000 | 1,7 | 2.450 | 43,4% |
| 501–750 | 2,1 | 1.886 | 42,4% |
| 251–500 | 2,3 | 3.166 | 46,6% |
| 101–250 | 2,7 | 3.428 | 58,6% |
| Top100 | 2,3 | 3.950 | 58,4% |

![staff](charts/staff-cost-share.png)

## 8. Loja / equipamento

- **Catálogo real** (`shop-catalog.json`): 115 itens, 7 raridades. Comprar tudo
  = **1.297.423**; loadout máximo = **420.578** por +88 de atributos.
  Renda total do normal em 5 anos ≈ 433k.
- **Desbloqueio:** "incomum" no dia 7 (normal); **"raro" ou acima: 0% das
  carreiras em 5 anos**, porque o jogador nunca tem reputação ≥ 8 (nunca escrita)
  nem `ranking_position` (nunca gravado; a loja lê 9999 e exige Top500).
- **Compras:** 8 por carreira, todas nos 3 primeiros meses; 1º upgrade (incomum)
  no dia 49 (normal). Gasto com equipamento = **0,5%** da renda.
- **Eficiência:** bônus por 1.000 moedas = 2,57 (comum) → 1,31 (raro) → 0,70
  (épico) → 0,32 (lendário) → 0,23 (mítico) → 0,18 (exclusivo).

### Matriz de equipamento (75)

| Faixa | Raridade mediana | Custo acumulado | % da renda acumulada |
|---|---|---|---|
| >1000 | comum | 577 | 7,56% |
| 751–1000 | incomum | 2.344 | 6,73% |
| 501–750 | incomum | 2.345 | 3,92% |
| 251–500 | incomum | 2.351 | 2,68% |
| 101–250 | incomum | 2.955 | 1,64% |
| Top100 | incomum | 2.344 | 0,83% |

## 9. Torneios: eficiência e farming

| Tier | Entradas | Inscrição | Prêmio médio/entrada | ROI | Pontos/entrada | Vitórias | Eficiência de prêmio (prêmio ÷ dificuldade) | Eficiência de ranking |
|---|---|---|---|---|---|---|---|---|
| Bronze | 762 | 10 | 23 | 1,27 | 1,8 | 28,3% | 32 | 2,5 |
| Silver | 478 | 20 | 58 | 1,90 | 5,0 | 32,7% | 86 | 7,4 |
| Gold | 1.516 | 45 | 173 | **2,85** | 14,6 | 52,4% | 364 | 30,7 |
| Platinum | 2.174 | 90 | 277 | 2,07 | 22,8 | 45,2% | 505 | 41,6 |
| Masters | 1.145 | 180 | 524 | 1,91 | 44,1 | 30,6% | 755 | 63,5 |
| Elite | 484 | 320 | 816 | 1,55 | 68,3 | 11,4% | 921 | 77,1 |
| Crown | 135 | 500 | 1.469 | 1,94 | 122,9 | 10,0% | 1.632 | 136,6 |

Dificuldade = 1 − taxa de vitória do tier. **Top 10 torneios por ROI:** 8 são
Gold (Los Angeles Classic 4,31; Madri Classic 3,96; Milão Gold Series 3,82…),
mais Auckland Platinum Open (4,51) e Atenas Open/Bronze (3,39); lista completa
em `matrices.json` (`topTournaments`).

**Farming:** não há. Títulos são quase inexistentes (2), e só 6 entradas em
Bronze/Silver aconteceram com o jogador já no Top300. A regra de teto
(`OPEN_TIER_CEILING`) tira duplas boas da base. Nenhum torneio gera dinheiro
relevante: o melhor (Crown) paga 1.469 por entrada, menos que um mês de
patrocínio.

## 10. Imprensa, parceria, staff de saída

- **Imprensa:** normal deu 239 entrevistas em 5 anos; fãs 0 → 57 na primeira
  (`fan_appeal || 50`) e 100 no dia 49; reputação declarada nas respostas +1.388,
  aplicada 0.
- **Parceria:** 6 parceiros por carreira (normal), 95% por busca. Em 13% das
  carreiras normais/otimizadoras, depois de uma renovação o mesmo parceiro é
  re-contratado **todo dia** por ~120 dias (até 123 vezes): a parceria renovada
  deixa de ser reconhecida como ativa. Causa raiz não isolada nesta fase.
- **Demissão:** dispensar staff exige pagar a multa à vista
  (`economy.js:243`); sem caixa a tela recusa e o jogador fica preso à folha.

## 11. Carreiras longas (10 temporadas)

Uma carreira por perfil, seed 501, 3.653 dias (até 02/01/2036). Valores no
fim de cada marco (uma carreira por perfil — sem distribuição).

| Mês | casual rank | **normal rank** | otimizador rank | normal OVR | normal patrimônio | normal save |
|---|---|---|---|---|---|---|
| 12 | 740 | **667** | 737 | 58 | 26.521 | 12,3 MB |
| 24 | 137 | **76** | 83 | 73 | 55.085 | 18,6 MB |
| 36 | 130 | **84** | 78 | 78 | 99.362 | 24,7 MB |
| 60 | 96 | **30** | 48 | 82 | 157.513 | 36,8 MB |
| 84 | 86 | **53** | 49 | 84 | 236.058 | 48,4 MB |
| 120 | 88 | **36** | 50 | 86 | 329.533 | 66,1 MB |

- **Platô competitivo:** depois do ano 4 o normal oscila entre #30 e #62; melhor
  rank em 10 anos: #21 (normal), #19 (otimizador), #62 (casual). Top25 no mês 62
  (normal) e 112 (otimizador); **Top10 e #1 nunca**.
- **Zero títulos em 30 carreira-anos** (1.776 partidas), apesar de 13 Crown, 34
  Elite e 83 Masters disputados pelo normal.
- **Teto de progressão do personagem:** `career_level` chega a 50 por volta do
  mês 60 e para; OVR satura em 85–86 a partir do ano 6.
- **Late game sem propósito para o dinheiro:** patrimônio do normal cresce de
  158k (ano 5) para 330k (ano 10) sem nenhum gasto novo; patrocínio continua
  50–70% da renda; equipamento continua travado em incomum.
- **Custo técnico:** save de 63–70 MB no ano 10; o "reparo" do soft-lock disparou
  66–71 mil vezes por carreira.

## 12. Outliers e seeds representativas

| Lista | Carreiras (perfil-seed) |
|---|---|
| Mais rápidas ao Top100 | normal-5 (dia 574), normal-4, -11, -14 (588) |
| Mais lentas ao Top100 | casual-1 (dia 1.505), casual-3 (1.288), casual-6 (1.281) |
| Mais ricas | normal-6 (196k), normal-7 (178k), normal-12 (171k) |
| Mais pobres | otimizador-14 (4,3k), -7 (5,1k), -11 (7,0k) — gastam em treinador elite, treino intenso e staff |
| Maior patrocínio | normal-1 (6.158/mês), casual-13 (6.104/mês) |
| Staff mais cedo | casual-12/-13 (2.900/mês no dia 180) |

**Seeds representativas (normal):** fácil = normal-9 (#6 no fim, 165k);
mediana = normal-7 (#47, 178k); difícil = normal-15 (#58, 70k); rica = normal-6;
pobre = otimizador-14.

**Conferência manual de saves:** *seção 13.*

## 13. Conferência manual de 3 saves

Os três saves finais das carreiras longas (um por perfil, 10 temporadas) foram
gravados com `--keepSave` (`raw-long/*-501.save.json`) e abertos diretamente,
sem passar pelo harness. Tudo bate com o que o harness registrou.

| Verificação | casual-501 | normal-501 | otimizador-501 |
|---|---|---|---|
| Saldo no save = saldo do harness | 230.299 = 230.299 | 329.533 = 329.533 | 37.099 = 37.099 |
| OVR / nível | 85 / 49 | 86 / 50 | 85 / 50 |
| Patrocínios ativos (soma = harness) | Asics 1.816, LocalFit 925, Padel League 1.188 = 3.929 | Asics 1.986, Decathlon 1.570 = 3.556 | Decathlon 1.735, Padel League 1.375, Asics 1.935 = 5.045 |
| Tier dos patrocínios | só Bronze | só Bronze | só Bronze |
| Staff ativo (soma = harness) | fisio 950, prep. físico 800 = 1.750 | nutricionista 750, fisio 1.050 = 1.800 | prep. físico 900, empresário 1.400, nutricionista 750 = 3.050 |
| Treinador | Lucas Romero 252/mês | Enzo Navarro 286/mês | Sofia Castellano 2.500/mês |
| Equipamento | 9 itens, 8 equipados, comum/incomum | 9 / 8 | 9 / 8 |
| Partidas no save = harness | 499 | 614 = 614 | 589 = 589 |
| Inscrições | 221 concluídas + 6 confirmadas | 345 + 24 | 345 + 24 |
| `reputation` / `ranking_position` no perfil | **ausentes** | **ausentes** | **ausentes** |
| Mundo | 1.233 atletas, 1.216/1.391 torneios finalizados, 7.494 resultados de ranking | — | — |

Achado extra da conferência: o livro-razão do próprio jogo
(`FinancialTransaction`) registrou em 10 anos só **1** entrada de patrocínio e
**1** de treino (contra ~25 assinaturas e milhares de sessões): a tela de
Economia mostra um histórico incompleto.

## 14. Problemas classificados

### P0 — quebra de economia/progressão
1. **Parceiro com OVR 1 no motor** em 100% das partidas (`engine/match/playerModel.js:3-13` vs `lib/padel.js:225`); adversários com ~60% do OVR do card.
2. **Soft-lock da carreira** no dia 366–452 em 100% das carreiras (`lib/saveFoundation.js:61/355`, `WorldTourLifecycle.js:1683-1684`, `CareerEntityRepository.js:240`); ~18k "reparos" por carreira com o shim.

### P1 — severo
3. Conquistas da última partida do torneio apagadas pelo `playerPatch.coins` absoluto (`tournamentLifecycle.js:449` via `TournamentModal.jsx:940`): ~46k em 5 anos no normal (~10% da renda).
4. Reputação do jogador nunca sobe (`pressData.js:1076-1081`; nenhum código grava `PlayerProfile.reputation`).
5. `ranking_position` do jogador nunca gravado: loja (`storeCatalog.js:96-102`) e estágio de patrocínio (`sportsEconomyV26.js:20`) leem 9999/2000.
6. Escada de patrocínio travada no Bronze: idade pelo relógio do PC (`sponsors.js:511-517`) + 9/21 patrocinadores sem `is_available`.
7. Patrocínio inicial domina a economia: dia 0 sem jogar, 86% da renda no Ano 1, 36:1 contra prêmios; valor plano por ranking.
8. Loja/equipamento sem função: nada acima de incomum em 5 anos; 0,5% da renda.
9. Títulos praticamente impossíveis (2 em 225 carreira-anos; finais 5,3%) — consequência do P0-1; remedir após a correção.

### P2 — relevante
10. Fãs 0 → ~57 na primeira entrevista e 100 no dia 49 (`pressData.js:1078`).
11. Salto de ~290 posições em 01/01/2027 (pontos-semente expiram em bloco).
12. Investimentos com retorno mensal (`economy.js:27-32`; CDB ≈ 51%/ano).
13. Rótulos de dificuldade fixos por tier e invertidos na prática; penhasco Masters → Elite.
14. Detecção de zebra: rank da dupla adversária nunca resolvido (0/11.265).
15. Laço de re-contratação diária do mesmo parceiro após renovação (13% das carreiras normal/otimizador).
16. Oferta de parceria expirada continua "pendente" e falha ao aceitar; ofertas iniciais nunca se regeneram (`partnerOffers.js:84-99`).
17. Armadilha de dívida: multa de rescisão exige caixa (`economy.js:243`).
18. Divisão de prêmio "50%" cosmética (`calculatePrizeSplit` sem chamadores).
19. Otimizador termina pobre (insolvente em 20%): a economia não sinaliza que treinador elite + treino intenso + staff passam da renda.

### P3 — polish
20. `career_level` só é recalculado em `ensureMyProfile` (mount de páginas): progressão depende de navegação.
21. `evaluateSponsorContracts` só manual (`Economy.jsx:130`).
22. Save cresce ~6,5 MB/ano (37,6 MB no ano 5, 66–70 MB no ano 10) e cada dia custa ~1,5–4 s no Node — risco de desempenho/ANR no Android (ver 5.25).
23. Livro-razão do jogo (`FinancialTransaction`) incompleto: 1 entrada de patrocínio e 1 de treino em 10 anos.
24. Teto de `career_level` 50 atingido por volta do ano 5; OVR satura em 85–86 — sem progressão do personagem na segunda metade da carreira.

## 15. Escopo do diff e verificação

| Verificação | Resultado |
|---|---|
| Arquivos novos da fase | `scripts/lib/v526CareerSim.mjs`, `v526Actions.mjs`, `v526Tournament.mjs`; `scripts/sim-`, `run-`, `analyze-progression-economy-v526.mjs`; `audit-balance-inventory-`, `audit-shop-catalog-`, `render-charts-`, `test-progression-economy-v526.mjs`; `reports/progression-economy-526/` |
| `src/`, `src-tauri/`, `package.json` alterados nesta fase | **nenhum** (nenhum arquivo mais novo que o primeiro artefato da fase) |
| `npm run lint` | verde |
| `npm run build` | verde (só o aviso antigo de chunk > 500 kB) |
| `git diff --check` | verde |
| Testes do harness | 6/6 |
| Commit / push | nenhum |

**Atenção ao versionar:** `raw-long/*.save.json` são três saves completos de
63–70 MB cada (usados na conferência manual). Não devem ir para o git; apague
ou mova antes de qualquer commit.

## 16. Arquivos

`summary.json`, `progression.csv`, `economy.csv`, `sponsors.csv`, `staff.csv`,
`shop.csv`, `tournaments.csv`, `difficulty.csv`, `matrices.json`,
`outliers.json`, `recommendations.md`, `inventory.json/.md`,
`shop-catalog.json`, `charts/*.png`, dados brutos em `raw/` e `raw-long/`.
