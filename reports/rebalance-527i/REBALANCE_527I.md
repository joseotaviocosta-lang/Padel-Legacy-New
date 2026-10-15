# Banda Silver e política do Otimizador — Playthrough 5.27-I

Branch `feature/live-coach-dynamic-adaptation`, HEAD `d5e5a2e` (inalterado). Sem
commit, sem push. Relatórios `rebalance-527`…`527h` preservados.

**Veredito: A.**

O Balanced-E passa todos os hard gates do Stage 1 (45/45 carreiras, 0 falhas,
0 divergência, 0 mudança de config), inclusive o gate novo do Silver. O R1 subiu
de 39,4% para **46,7%**.

O Hardcore-E saiu PREFERRED por 1,2 ponto de "equilíbrio". Pela regra da fase
isso é reportado e **o default não é trocado**.

**Stage 2: SIM** (o Balanced-E é VIABLE, com todos os gates verdes).

## 1. Otimizador (Bloco A) — bug do harness, não do jogo

### Reprodução

Baseline (5.27-H, `optimizer-baseline.csv`, Balanced-E, 5 seeds):

| | 6m | 12m | 18m | 24m |
|---|---|---|---|---|
| Parceiro (por seed) | 34–40 | 33–41 | 33–82 | 43–87 |
| Melhor alcançável | 82 | 82–89 | 85–86 | 86–91 |

- Gap > 30 durou **270–630 dias**.
- Salário coberto por 51–96 meses de caixa: não era custo.

### Causa (não presumida; medida decisão a decisão)

1. **Regra de renovação inadequada.** Renovava se `OVR parceiro / OVR jogador ≥
   0,6`, sem olhar o mercado, por **180 dias**. Com o jogador em 54–64 e o
   parceiro em 40–43, a razão ficava ≥ 0,6. A seed 2 renovou até 2 anos com
   82–91 alcançáveis.
2. **Compromisso confundido com desejabilidade.** Depois de recusar, o harness
   continuava inscrevendo torneios com o parceiro que estava deixando. Cada
   inscrição empurrava a separação, e a troca só saía 155–330 dias depois
   (seed 5: 36 inscrições e 43 partidas com parceiro 33).

### Correção (`PL527E_POLICY=v4` = v3 + só o Otimizador; `scripts/lib/v527iOptimizerScore.mjs`)

- **Busca:** força da dupla entre os parceiros que o caixa sustenta (salário ≤
  caixa/3 meses). Compatibilidade (100 = +5 OVR) e pontos de ranking (até +3)
  só desempatam. Não é "sempre o maior OVR".
- **Renovação:** só se o atual estiver a até 8 OVR do melhor alcançável e
  sustentável, ou se não houver alternativa sustentável. A razão de OVR saiu.
- **Não inscreve torneio novo** com o parceiro que decidiu deixar.
- **Normal e Casual: idênticos à v3.** Com a v4, o Normal joga as mesmas 47
  partidas da 5.27-H (prefixo verificado); bloco `partnerPolicy` do freeze
  inalterado.

### Depois (micro 2 anos, `optimizer-after.csv`, e Stage 1)

| | 6m | 12m | 18m | 24m |
|---|---|---|---|---|
| Parceiro (micro, por seed) | 34–40 | **91** (4) / 62 (1) | **85–91** | **85–91** |
| Mediana Stage 1, Balanced-E (parceiro / melhor) | 34 / 82 | **91 / 82** | **91 / 85** | **91 / 91** |

- Troca para forte nos dias 213–227.
- Maior trecho gap > 30: ≈ 90 dias.
- Gap final no Stage 1 (mediana): **0**.
- O Otimizador ainda difere do Normal (79 em 1 ano) e do Casual (38): 0
  sequências iguais em 30 pares.

**Resíduo:** se o parceiro forte sai, o Otimizador aceita uma **oferta recebida**
pendente antes de ir à Busca. Isso ocorreu na seed 2 do micro (parceiro 37 por
71 dias, abaixo do limite de 180).

## 2. Silver (Blocos B–D)

### Baseline reproduzida (micro, Normal, 5 seeds)

| | Campo P50 | Dupla × adversário enfrentado | WR main |
|---|---|---|---|
| Bronze | 35,5 | 38 × 35,5 | 59,0 |
| **Silver** | **46,8** (P10 41,5 · P25 45 · P75 49 · P90 50,5) | **40,5 × 46,5 (+6)** | **21,3** |
| Gold (2a) | 75 | 47 × 75 | 31,9 |

Confirmado: Silver ≈ 21% < Gold ≈ 32%, campo ≈ +6–7 acima da dupla.
Qualifying: Bronze/Silver não têm; o Normal teve 0–1 partida de qualifying em Gold/Platinum.

Distribuição do campo Silver (baseline, P10/P25/P50/P75/P90):

| OVR | TeamRank | tierFit | Força |
|---|---|---|---|
| 41,5 / 45 / 46,8 / 49 / 50,5 | 760 / 792 / 814 / 841 / 867 | 100 | 128 / – / 131 / – / 134 |

### Regra e causa

Campo do jogador: `WorldTourLifecycle.buildPlayerTournamentField`.

| Elemento | Regra atual |
|---|---|
| Pool elegível | rank > 400 (teto aberto) ou sem rank |
| `preferredPool` | escolhe este torneio na semana (`chooseTournament`) |
| Ordem | admissão fraco-primeiro dos tiers abertos (`-pairScore·(0,35+0,65·fit)`, fórmula preservada) |
| Banda | platô de ranks 400–900 (`silverPeakLow`) |
| Janela | **só no Silver**, pula os `max(vaga, 25% do pool ordenado)` mais fracos |
| Fallback | resgate por adequação |

| Pergunta | Resposta |
|---|---|
| Faixa estreita? | Não (A alargou para 1100 e o campo não mudou: 46,5). |
| Pouca população? | Não (~272 elegíveis; ~194 preferem o evento). |
| Weak-first deixou de valer? | Não: a ordem é fraco-primeiro, mas a janela pula o começo dela. |
| preferredPool / chooseTournament concentram duplas boas? | Não: com janela pequena o mesmo pool dá campo ~35–39. |
| **Percentil pega pares fortes?** | **Sim: é a causa.** Na base do ranking o OVR sobe rápido (rank ~950 → 35; ~810 → 47). Pular ~68 posições custa ~11 OVR. |

### Candidatos (uma dimensão por vez; `silver-candidates.csv`, `micro-results*.csv`)

| | Mudança | Campo P50 [P25–P75] | Bronze | Silver | Gold main (2a) | Easy | Medium (2a) | R1 (2a) | Gate |
|---|---|---|---|---|---|---|---|---|---|
| baseline | — | 46,8 [45–49] | 59,0 | 21,3 | 31,9 | 47,3 | 40,0 | 39,4 | ✗ Silver × Gold |
| A | faixa 900→1100 | 46,5 [45–49] | 58,9 | 32,5 | 54,8 | 47,8 | 44,6 | 43,4 | ✗ Silver × Gold |
| B | janela 25→10% | 37 [36–39,5] | 51,2 | 55,6 | — | 53,0 | — | — | 1a: Silver > Bronze |
| C | janela → só a vaga | 36 [35,5–37] | 49,3 | 56,1 | — | 52,5 | — | — | 1a: Silver > Bronze |
| D | A + B | 36,5 [35,5–38,5] | 54,7 | 54,9 | — | 54,8 | — | — | 1a: Silver = Bronze |
| **E** | **janela 25→15%** | **39 [37–42]** | **57,5** | **45,3** | **48,2** | **52,9** | **43,8** | **46,7** | **✓** |

**Escolhido: SILVER_E** (`silverFieldOffsetPct: 0.15` nos presets -E; os antigos ficam em 25%).
- É o menor ajuste que corrige a ordem: **Bronze 57,5 > Gold 48,2 ≈ Silver 45,3**.
- B, C e D (a mesma dimensão, mais longe) deixam o Silver tão fácil quanto o Bronze.
- A (outra dimensão) não mexe no campo e reprova Silver × Gold.

Desvios de protocolo, ambos registrados em `silver-choice.json` **antes** do Stage 1:
1. **E acrescentado depois de ver A–D**, para testar um ajuste menor que B na mesma dimensão.
2. **Gate de Medium e de Silver × Gold avaliado no micro de 2 anos.** No de 1 ano
   o Normal joga 0–5 partidas Medium em todos os candidatos, inclusive o
   baseline, então o gate é impossível de medir em 1 ano. O baseline de 2 anos
   é a 5.27-H (v3 ≡ v4 no Normal).

Gold+ e Bronze intocados: `circuitCatalog.js` com hash igual; fit e config de
Bronze/Gold/Platinum/Masters/Elite/Crown idênticos (`test-no-gold-change`).
Chave inalterada.

## 3. Stage 1 (45/45) — Normal, 2 anos

| | Conservative-E | **Balanced-E** | Hardcore-E | Gate |
|---|---|---|---|---|
| Easy | 54,4 | **52,9** (280) | 54,7 | ≥ 45 |
| Medium | 41,0 | **43,8** (242) | 40,8 | ≥ 30 |
| Hard | 35,2 | **32,6** (86) | 31,0 | ≤ 50 |
| R1 | 42,8 | **46,7** (336) | 44,1 | ≥ 40 |
| Bronze main | 56,3 | **57,5** | 56,0 | |
| Silver main | 51,7 | **45,3** | 53,0 | Silver+5 ≥ Gold |
| Gold main | 39,8 | **48,2** | 41,3 | |
| Platinum main | 41,7 | 41,5 | 40,5 | |
| Sponsor Y1 | **63,7 ✗** | **48,7** | 38,4 | ≤ 60 |
| Prize Y1 | 10,5 | **16,8** | 13,7 | ≥ 10 |
| Dívida Casual / Normal | 0 / 0 | **0 / 0** | 0 / 0 | ≤ 20 / ≤ 10 |
| Classe | REJECT | **VIABLE** | PREFERRED | |

Balanced-E por carreira:
- **R1:** mediana 47,8 · min 36,8 · máx 60 · dp 7,9 (na 5.27-H: min 18,8, dp 12,2).
- **Easy:** mediana 51,7 · min 48,2.

O Normal do Balanced-E na matriz bate **exatamente** com o micro E de 2 anos
(contínuo × segmentado): mais uma prova de determinismo.

Por ano (Balanced-E Normal):

| | Easy | R1 | Medium |
|---|---|---|---|
| Y1 | 52,9 | 51,7 | — |
| Y2 | — | 42,8 | 45,3 |

R1 por tier (micro E, 2a): Bronze 64,2 · Silver 41,7 · Gold 46,7 · Platinum 42,6.

**Hardcore-E PREFERRED:** score de equilíbrio 0,9 contra 2,1 do Balanced-E. A
diferença vem de Easy +1,8 e Sponsor Y1 mais baixo, dentro do ruído de 5 seeds.
**Default não trocado.**

### Otimizador (Bloco K)

| | Balanced-E |
|---|---|
| Parceiro (mediana) @6m / 12m / 18m / 24m | 34 / **91** / **91** / **91** |
| Gap final | 0 |
| Gap > 30 por > 180 dias sem causa | **0 casos em 15 carreiras** |

Competição do Otimizador (agora confiável):
- **Balanced-E:** Easy 59,5 · Medium 43,8 · R1 45,4 · rank 2a 23.
- **Hardcore-E:** Medium 48,7 · R1 50,3.
- Otimizador ≥ Normal ≥ Casual, como esperado.

### Commitment (Bloco G, só diagnóstico, não alterado)

| | |
|---|---|
| Recusas no Balanced-E Normal | 5 |
| Limbo, mediana | **50 dias** (36–151) |
| Seed 3 | recusa no dia 175, troca no dia 326 (151 dias, contra 260 na 5.27-H) |
| WR no limbo (B) | 53,8 contra 50,7 antes (A) |

Condições do critério: recusa ✓ · atraso ✓ · queda de WR ✗ · repetição ✗.
**Do not touch commitment lifecycle.**

### Ranking, títulos e economia (monitorados, não alterados)

| | |
|---|---|
| Rank Normal 6m / 1a / 18m / 2a | 650 / **275** / 162 / **38** (⚑ ainda rápido, como na 5.27-H: 279 / 20) |
| Títulos Normal Y1 / Y2 acumulado | **1 / 2** (dentro das referências 0–1 e 1–3) |
| Táticas | 100% `equilibrado × equilibrado`, 0 partidas com adaptação da IA |

Dívida do Otimizador:
- **Balanced-E: 60% (3/5)**, curtas.
  - **Causa:** a política de investimento inalterada deixa caixa líquido de
    36–78 moedas (5,3–6k investidos), e os salários agora são de dupla 91 e
    técnico de elite. Uma multa de rescisão de técnico ou contador leva a −38 a
    −712 por 1–3 semanas.
  - **Seed 4:** termina com −2.015 no dia 730.
- **Hardcore-E:** 20%. **Conservative-E:** 20%.
- Não é gate (só Casual e Normal são).

## 4. Achados novos (não corrigidos — fora do escopo)

1. **Jogo — guarda de inscrição no limbo inexistente.**
   `committedRoster.canRegisterNewTournamentWithPartnership` (a regra da 5.17:
   "depois da data nominal a dupla só honra o que já assumiu") **não é chamada
   em lugar nenhum**. Ela também não cobre o status `encerra_apos_compromisso`
   que o lifecycle grava. Uma dupla com contrato vencido pode continuar se
   inscrevendo indefinidamente, e cada inscrição empurra a separação. Explica os
   limbos de 155–330 dias. Lifecycle congelado nesta fase: candidato da próxima.
2. **Harness — detector "escolha obsoleta" do Normal.** Ele marcou a seed 5
   (marcos 180/270). Mas a decisão anterior (dia 147) foi tomada quando o melhor
   alcançável era ~34–40, e na decisão seguinte (dia 259) o Normal recusou.
   Nenhuma decisão foi tomada com a alternativa forte disponível. O detector não
   olha a data da decisão; o caso entrou por ter batido exatamente o limiar de
   15 OVR.
3. **Harness — Otimizador aceita oferta recebida antes da Busca** (§1, resíduo).

## 5. Testes, regressões, lint, build

| Grupo | Resultado |
|---|---|
| **Novos 5.27-I** (`scripts/*-v527i.mjs`) | **12/12** |
| 5.27-H (paridade do motor + táticas) | 1/1 |
| 5.27-G (partner score, piso, Normal × Otimizador, compatibilidade, neutralidade, side swap) | **6/6** |
| 5.27-F (paridade, side swap, energia, aplicação única, força, monotonicidade, presets antigos, fontes de pontos, 0 vitórias) | 9/9 |
| 5.26-D (pares reais, TeamRanking, draw imutável, sem fallback) | 12/12 |
| Motor de partida | 3/3 |
| Ranking (TeamRanking, virada de ano, Race) | 3/3 |
| Parceria (commitment, re-sign, ex-parceiro, ofertas) | 9/9 |
| Persistência (atomicidade, save/reload, storage) | 5/5 |

A rodada completa (`regressions.json`) deu 59/60. O vermelho foi uma checagem
de **texto-fonte** do 5.27-G: procurava o literal `POLICY_VERSION === 'v3' ?
pickers.balanced`, que virou `POLICY_V3PLUS` para a v4 herdar a v3. O
comportamento do Normal é idêntico (prefixo de 47 partidas verificado). A
regex passou a aceitar as duas formas, e o grupo rerodado deu 6/6
(`regressions-5_27_G.json`).

Os testes de evidência da 5.27-H que comparam o codeHash da matriz deles com o
código atual não se aplicam mais: o simulador mudou nesta fase, por desenho. A
matriz da 5.27-H continua íntegra pelos próprios hashes.

| | |
|---|---|
| `npm run lint` | verde |
| `npm run build` | verde |
| `git diff --check` | limpo (arquivos novos sem espaço no fim) |
| commit / push | nenhum |

## 6. Respostas (55)

1. Por que o Otimizador mantinha OVR ~33? Renovava pela razão OVR ≥ 0,6 sem
   olhar o mercado, por 180 dias, e, ao decidir sair, continuava inscrevendo
   torneios com o parceiro antigo (troca 155–330 dias depois).
2. Jogo ou harness? **Harness** (política). O encadeamento usa um buraco do jogo
   (achado 4.1), mas a decisão de inscrever era da política.
3. Política alterada: **Otimizador v4** (`PL527E_POLICY=v4`, `v527iOptimizerScore.mjs`).
4. Normal mudou? **Não** (prefixo idêntico, bloco congelado igual).
5. Casual mudou? **Não**.
6. Parceiro @6m antes/depois: **34–40 / 34** (o mercado só tem 82+ a partir de ~6m).
7. @12m: **33–41 / 91**.
8. @18m: **33–82 / 91**.
9. @24m: **43–87 / 91**.
10. Gap final (melhor alcançável − atual): **0** (mediana Stage 1).
11. Campo Silver baseline: **46,8** (+6 sobre a dupla).
12. Bronze baseline: **35,5**.
13. Gold baseline: campo **75**; dupla do jogador 47.
14. Silver WR baseline: **21,3%**.
15. Gold WR baseline: **31,9%** (main, 2a).
16. Regra que causava o excesso: **janela de 25%** do campo Silver do jogador
    (pula as `max(vaga, 25%)` duplas mais fracas do pool ordenado).
17. Candidatos: **A, B, C, D e E**.
18. A (faixa 900→1100): campo inalterado (46,5); Silver 32,5; reprova Silver × Gold (Gold 54,8).
19. B (janela 10%): campo 37; Silver 55,6 > Bronze 51,2.
20. C (só a vaga): campo 36; Silver 56,1 > Bronze 49,3.
21. D (A + B): campo 36,5; Silver 54,9 ≈ Bronze 54,7.
22. Escolhido: **SILVER_E (janela 15%)**.
23. Por quê: menor ajuste que corrige a ordem (Bronze > Silver ≈ Gold) e passa o
    micro-gate; A não ataca a causa; B/C/D levam o Silver ao nível do Bronze.
24. Campo Silver final: **39** [37–42].
25. Silver WR micro: **45,3%**.
26. Gold WR micro (2a): **48,2%**.
27. Bronze WR micro: **57,5%**.
28. Silver R1: **41,7%** (baseline 20,6).
29. Easy micro: **52,9%**.
30. Medium micro (2a): **43,8%**.
31. Hard micro (2a): **32,6%**.
32. R1 micro (2a): **46,7%**.
33. Stage 1 liberado? **Sim** (micro-gate verde antes do `--init`).
34. Carreiras do Stage 1: **45**.
35. Falhas: **0**.
36. Balanced-E Easy: **52,9%**.
37. Medium: **43,8%**.
38. Hard: **32,6%**.
39. R1: **46,7%**.
40. Bronze: **57,5%**.
41. Silver: **45,3%**.
42. Gold: **48,2%**.
43. Silver ainda é mais difícil que Gold? **Só 2,9 pp** (dentro dos 5 pp; antes 10,6).
44. Sponsor Y1: **48,7%**.
45. Prize Y1: **16,8%**.
46. Dívida Casual: **0%**.
47. Dívida Normal: **0%**.
48. Dívida Otimizador: **60%** no Balanced-E (curta; investimento + multas), 20% nos outros.
49. Rank Normal @1a: **275** (⚑ rápido).
50. @2a: **38** (⚑ rápido).
51. Títulos Y1 / Y2: **1 / 2**.
52. Commitment alterado? **Não**.
53. Bug novo? **Sim**: guarda de inscrição no limbo não ligada (jogo, §4.1);
    detector de escolha obsoleta sem data de decisão e oferta recebida do
    Otimizador (harness).
54. Testes novos **12/12** · regressões **48/48** (após corrigir a regex de texto-fonte do 5.27-G) · lint ✓ · build ✓ · diff-check ✓ · commit ✗ · push ✗.
55. **VEREDITO: A. LIBERAR STAGE 2: SIM** (Balanced-E VIABLE com todos os gates).
    Default não trocado apesar do Hardcore-E PREFERRED.
