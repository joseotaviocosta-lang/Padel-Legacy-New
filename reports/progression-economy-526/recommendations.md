# Recomendações quantitativas — Playthrough 5.26

> **Nada aqui foi aplicado.** Esta fase é "AUDIT FIRST / TUNE LATER". Os números
> abaixo vêm de 45 carreiras de 5 temporadas (15 seeds × casual/normal/otimizador)
> e de 3 carreiras de 10 temporadas (detalhes em `PROGRESSION_ECONOMY_AUDIT_526.md`).
> Referência principal: perfil **normal**. Valores "atual" são medianas medidas.

## 0. Pré-requisito: corrigir os bugs antes de qualquer número

Dois bugs P0 distorcem **toda** medição de dificuldade e de progressão de
longo prazo. Rebalancear antes de corrigi-los calibraria o jogo em cima de um
estado quebrado.

| Ordem | Bug | Efeito medido | Correção mínima sugerida |
|---|---|---|---|
| 1 | Parceiro joga com **OVR 1** no motor (`engine/match/playerModel.js:5-13` x `lib/padel.js:225`) | 100% das 11.265 partidas; card do parceiro mediano 35 | Motor usar a mesma regra de OVR da UI (atributos presentes ou `overall` declarado) |
| 2 | **Soft-lock** da carreira (`lib/saveFoundation.js:61/355` + `WorldTourLifecycle.js:1683`) | 100% das carreiras; dia 366–452 | Verificar/semear contra a coleção inteira (ou por id/bot_id), nunca `create` de id existente |
| 3 | Moedas de conquista apagadas pelo `playerPatch.coins` absoluto (`tournamentLifecycle.js:449`, `TournamentModal.jsx:940`) | normal: 46k em 5 anos (~10% da renda) | Patch de moedas como **delta** aplicado sobre o perfil fresco |
| 4 | Reputação nunca sobe (`pressData.js:1076`) | 0% das carreiras com reputação > 0 | Aplicar `effects.reputation` (com a escala da seção 6) |
| 5 | `ranking_position` do jogador nunca gravado | loja e estágio de patrocínio leem rank 9999/2000 | Gravar o rank canônico do jogador (ou ler `getWorldRank`) |
| 6 | Idade de patrocínio pelo relógio do PC (`sponsors.js:511`) + 9/21 patrocinadores sem `is_available` | 100% das ~1.150 assinaturas são Bronze | Idade pela `career_date`; `is_available` default `true` |

Depois dessas correções **é obrigatório reexecutar esta auditoria** (o harness e
os scripts estão prontos: `node scripts/run-progression-economy-v526.mjs`). As
faixas abaixo são o ponto de partida, a serem revalidadas.

## 1. Patrocínio inicial

- Hoje: Padel League (base 1.200, luvas 1.500) e LocalFit (900 / 1.100) não pedem
  fãs, XP, títulos nem ranking. O perfil normal assina **no dia 0, rank #1002,
  OVR 12, 0 partidas**: ~1.500/mês + ~1.875 de luvas por contrato.
- Ano 1 (normal): patrocínio = **86%** da renda (62,3k), prêmios+partidas = **2,4%**
  (1,7k) → razão patrocínio:prêmio **36:1**. Patrocínio ativo fica em
  ~4,8–5,4k/mês do mês 3 ao ano 5.

| Parâmetro | Atual | Conservative | Balanced | Hardcore |
|---|---|---|---|---|
| Base mensal starter (Padel League / LocalFit) | 1.200 / 900 | 700–900 / 500–700 | **400–600 / 300–450** | 250–400 / 200–300 |
| Luvas starter | 1.500 / 1.100 | 600–900 | **300–500** | 0–200 |
| Requisito starter | nenhum | 1 partida oficial | **5 partidas oficiais ou 10 fãs** | rank ≤ 900 |
| Razão patrocínio:prêmio no Ano 1 (meta) | 36:1 | 10–15:1 | **3–6:1** | 1–2:1 |

## 2. Escada de patrocínio por ranking

- Hoje o valor por contrato **não escala** com o ranking: média 1.589 (>1000),
  1.577 (101–250), 1.566 (Top100). Nenhum patrocinador Prata/Ouro é assinado
  (bloqueio de idade + indisponíveis).

| Faixa | Atual (média/contrato) | Balanced (alvo/contrato) |
|---|---|---|
| >750 | ~1.600 | 300–600 |
| 251–750 | ~1.700 | 700–1.200 |
| 101–250 | 1.577 | 1.200–2.500 |
| Top100 | 1.566 | 2.500–5.000 |
| Top20 (Ouro) | inalcançável | 6.000–12.000 |

Automatizar `evaluateSponsorContracts` (hoje só manual em `Economy.jsx:130`) para
que cláusulas de desempenho tenham efeito.

## 3. Prêmios por rodada

- Hoje: prêmio médio por entrada Bronze 23 (inscrição 10, ROI 1,27), Silver 58
  (ROI 1,9), Gold 173 (ROI 2,85), Platinum 277, Masters 524, Elite 816, Crown 1.469.
  Mesmo o Crown paga por entrada menos que **um terço** de um mês de patrocínio.
- Meta Balanced: prêmios+partidas = **15–25%** da renda no Ano 1 e **35–50%** no
  Ano 3+ (hoje 2,4% e 16%).

| Parâmetro | Atual | Conservative | Balanced | Hardcore |
|---|---|---|---|---|
| Moedas por rodada Bronze/Silver | base | ×1,5 | **×2–3** | ×1 (corta patrocínio em vez) |
| Moedas por rodada Gold/Platinum | base | ×1,25 | **×1,5–2** | ×1 |
| Prêmio de campeão Masters+ | 7.500–30.000 | manter | **manter** | manter |

## 4. Investimentos

- Hoje: retorno **mensal** declarado (`economy.js:27-32`): poupança 2%/mês,
  CDB 3,5%/mês (≈ 51%/ano composto), ações 6%, imóveis 5%, cripto 12%,
  venture 15%/mês. O otimizador colocou 18k no CDB e recebeu 26,5k em 5 anos.

| Produto | Atual (/mês) | Balanced (/mês) | Hardcore (/mês) |
|---|---|---|---|
| Poupança | 2% | **0,3–0,5%** | 0,2–0,3% |
| CDB | 3,5% | **0,5–0,8%** | 0,4–0,6% |
| Ações | 6% | **0,8–1,5% com variância (±3%)** | 0,6–1,2% |
| Cripto | 12% | **1,5–3% com perda possível (P≈20%)** | 1–2% |
| Venture | 15% | **2–4% com perda possível (P≈30%)** | 1,5–3% |

## 5. Loja / equipamento

- Catálogo real: 115 itens; **comprar tudo = 1.297.423**; loadout máximo =
  420.578 por +88 pontos de atributo (≈ +8,8 OVR). Bônus por 1.000 moedas cai de
  2,57 (comum) para 0,18 (exclusivo) — **14× pior**.
- Hoje ninguém passa de "incomum" (bloqueio de reputação/`ranking_position`).
  Gasto com equipamento = **0,5%** da renda (normal). Equipamento é irrelevante.
- Com renda normal atual (~80k/ano), um lendário (piso 16.000) custa 2,4 meses
  de renda; após o corte de patrocínio (Balanced, renda Ano 3 ≈ 35–45k), ≈ 5 meses.

| Parâmetro | Atual | Balanced |
|---|---|---|
| Bônus total lendário / mítico / exclusivo | ≤8 / ≤10 / ≤12 | **10–14 / 14–18 / 18–24** |
| Preço lendário+ | 13,7k–65k | **−25% a −35%** ou manter preço com o bônus maior |
| Gates de reputação (raro 8 → exclusivo 85) | inalcançáveis | manter, com a escala de reputação da seção 6 |

## 6. Fãs e reputação (imprensa)

- Hoje: 1ª entrevista leva fãs de 0 a ~57 (`profile.fan_appeal || 50`); fãs 100
  no dia **49** (normal). Reputação declarada nas respostas: +1.388 por carreira
  em 5 anos, aplicada: 0.

| Parâmetro | Atual | Balanced (alvo) |
|---|---|---|
| Base de fãs quando 0 | trata como 50 | **0** (`?? 0`) |
| Fãs por entrevista (soma das respostas) | +7–8 | **+1–3** → fãs 100 em ~2–3 anos |
| Reputação por entrevista | +5–6 declarado, 0 aplicado | **+0,15–0,35 aplicado** (escala ×0,03–0,06) |
| Tempo até raro / épico / lendário / mítico / exclusivo | nunca | **3–6 m / ~1 a / ~2 a / 3–4 a / 5+ a** |

## 7. Treinador e staff

- Hoje: 1º treinador no dia 63 (normal), 286/mês = 11,5% da renda recorrente;
  treinador elite em 73% das carreiras normais (mediana dia 532 ≈ 17,5 meses);
  folha staff+treinador = 42–59% da renda do mês em todas as faixas. "Staff
  solved" nunca acontece (patrocínio máximo ~6,1k < 24,9k).
- Com o corte de patrocínio (Balanced), esses custos passam a ser um trade-off
  real. **Não mexer nos salários antes** de remedir. Hardcore: +20–30% salários.
- Multa de rescisão (`economy.js:243`) impede demitir sem caixa: permitir dívida
  parcelada ou multa ≤ 1 salário.

## 8. Dificuldade

Medido hoje (com o bug do OVR 1): Fácil (Bronze/Silver) **30,0%** de vitórias,
Médio (Gold/Platinum) **48,4%**, Difícil (Masters/Elite/Crown) **24,8%**; Masters
30,6% → Elite 11,4% (penhasco de 19 p.p.); finais vencidas 5,3%; **2 títulos em
225 carreira-anos**.

Metas após corrigir o OVR do motor (remedir antes de ajustar):

| Classe | Meta de vitória (no momento em que é jogada) |
|---|---|
| Fácil | 60–70% |
| Médio | 45–55% |
| Difícil | 25–35% |
| Títulos (Top100 normal) | 0,5–2 por ano |

Trocar o rótulo fixo por tier (`Tournaments.jsx` TIER_CONFIG.diffLabel) por um
rótulo relativo à força da dupla (rodada esperada).

## 9. Ranking

- Salto artificial de ~290 posições em 01/01/2027 (pontos-semente da IA expiram
  em bloco): "Top500" acontece no dia 371 em 100% das carreiras. Expirar os
  pontos-semente gradualmente ao longo de 2026 (1/12 por mês).

## 10. Cenários

### Conservative (mudanças pequenas)
1. Corrigir P0/P1 (seção 0).
2. Investimentos: CDB 0,8%/mês, poupança 0,5%, demais ÷4.
3. Fãs base 0 e efeitos ÷3; reputação aplicada com escala ×0,05.
4. Starter sponsors 700–900 / luvas 600–900, requisito de 1 partida.
5. Moedas por rodada Bronze/Silver ×1,5.

### Balanced (recomendação principal)
1. Tudo do Conservative.
2. Starter sponsors 400–600 / luvas 300–500, requisito 5 partidas ou 10 fãs.
3. Escada de patrocínio por ranking (seção 2) e avaliação de cláusulas automática.
4. Moedas por rodada Bronze/Silver ×2–3, Gold/Platinum ×1,5–2.
5. Investimentos nas faixas Balanced da seção 4.
6. Equipamento lendário+ com bônus 10–24 ou preço −25–35%.
7. Pontos-semente expiram gradualmente.
Metas: patrocínio:prêmio 3–6:1 no Ano 1; money-solved ~mês 30–36 (hoje mês 16);
folha staff+treinador 50–70% da renda recorrente no Top100.

### Hardcore (economia exigente)
1. Tudo do Balanced, com os limites inferiores das faixas.
2. Starter sponsor 250–400, sem luvas, requisito rank ≤ 900.
3. Salários de treinador/staff +20–30%; custo de treino ×1,5.
4. Investimentos nas faixas Hardcore com perdas.
Metas: money-solved após o Ano 4; insolvência possível para o casual (5–15%).
