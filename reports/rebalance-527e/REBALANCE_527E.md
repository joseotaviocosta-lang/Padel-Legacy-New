# Calibração de competição de entrada e economia inicial — Playthrough 5.27-E

Branch `feature/live-coach-dynamic-adaptation`, HEAD `d5e5a2e` (inalterado). Sem
commit, sem push. Relatórios `rebalance-527`…`527d` preservados (só lidos).

**Veredito: B.** A micro-calibração não passou o gate (Easy do 1º ano ≥ 40%) com
as alavancas autorizadas; pela regra da fase o Stage 1 **não** foi liberado.
Decisão do usuário: parar aqui com relatório.

## Resumo

O diagnóstico (Blocos A/B/D/G) contrariou a hipótese inicial da fase: **a banda
Silver, o bracket e os multiplicadores econômicos não eram a causa principal**.
As causas medidas, em ordem de peso:

1. **Energia (política do harness).** A política v1 treinava até a véspera do
   torneio; o jogador entrava com energia mediana 61 (Normal) / 45 (Optimizer).
   No motor real, com times de mesmo OVR, energia 55 derruba o jogador de ~52%
   para ~7% (a energia entra duas vezes: −2 no OVR e `(100−e)×0,12` por golpe no
   RallyEngine; os bots jogam sempre com 100).
2. **Primeiro parceiro fraco e preso.** A vitrine inicial (design 4.8) recomenda
   parceiros perto do OVR do novato (9–14 na maioria das seeds) e a proteção de
   torneio comprometido (5.17) adia o fim do contrato de 60 dias por ~11 meses,
   enquanto o jogador evolui ~22→50. Time do 1º ano ~31–37.
3. **Assimetria do motor entre lados** (não autorizada para correção): com times
   idênticos, o lado A (sempre o jogador) vence 42% em OVR 35–50 e 84% em OVR 75.
4. **Escolha de tier do Normal** (`best-eligible`): metade do 1º ano no Silver.

### Por que o Silver parecia mais difícil que o Gold

- O WR agregado do Gold incluía o **qualifying** (28% das partidas Gold, 59% de
  vitórias contra força ~40). Na chave principal: Bronze 35%, Silver 15%, Gold 19%.
- O **campo está ordenado corretamente** (OVR de dupla P50: Bronze 36,5 · Silver
  47,5 · Gold 76,5 · Platinum 80, todos os torneios do mundo).
- O Silver é jogado no **1º ano com parceiro de OVR ~21–27**; o Gold, depois, com
  parceiro 64–91. Controlando por delta de força e energia ≥ 70, Silver e Gold
  rendem parecido. A inversão é de momento de carreira, não de banda.

### Por que o ranking subia rápido

0 vitórias em 32 torneios → rank #452 (54 pontos) em 1 ano. A subida vem dos
pontos de participação/derrota sobre uma base de população com poucos pontos
(`ranking-progression.csv`), não de vitórias. Fórmula de ranking **não**
alterada (congelada até o 1º Stage 1, item 68).

## O que foi alterado

**Harness — política v2** (`PL527E_POLICY=v2`; v1 continua o padrão, preservando a
5.27-D), em `scripts/sim-progression-economy-v526.mjs`:
- taper de energia: Normal não treina 3 dias antes e durante torneio inscrito;
  Optimizer 4; Casual 0 (já jogava com energia ~90);
- Normal aceita a dupla **recomendada** pelo jogo (antes: maior compatibilidade
  por 1 ponto) e escolhe tier por encaixe de rank (`best-fit`);
- Casual orça staff pela receita **recorrente** (antes incluía luvas/conquistas
  pontuais) e mantém reserva de treino de 50;
- versão da política gravada no checkpoint (resume com política diferente é
  recusado).

**Jogo — só nos presets -E** (`conservative-e` / `balanced-e` / `hardcore-e`,
`src/lib/balance527.js`; presets anteriores e default intactos, `balanceHash` dos
presets B inalterado):
- `ENTRY_COMPETITION_527E` compartilhado pelos 3 presets: economia idêntica à
  5.27-B por enquanto;
- recomendação da 1ª dupla mede distância contra nível-alvo 36 com peso 0,45
  (antes 0,2 contra o OVR do jogador) — `src/lib/firstPartnershipScoring.js`.
  Vitrines medidas: recomendada 31–33 na maioria das seeds (antes 9–14);
- pico de preferência/admissão do Silver até rank 900 (antes 800) —
  `src/lib/circuitCatalog.js`. Teto de elegibilidade (400), Bronze e Gold+ intactos.

**Não alterado:** motor de partida, fórmula de ranking, bracket, âncoras de
população, starting coins (900), multiplicadores de prêmio/patrocínio, ciclo e
contrato de parceria, proteção de torneio comprometido.

## Micro-calibração (Normal, seeds 1–3, 1 ano)

| Candidato | Easy | R1 | Bronze | Silver | Energia | Rank @1y | Sponsor Y1 | Prize Y1 | Gate |
|---|---|---|---|---|---|---|---|---|---|
| baseline (v1) | 3,2% | 3,3% | 6% | 0% | 61 | #443 | 62% | 9,0% | FAIL |
| taper | 15,3% | 14,9% | 23% | 6% | 100 | #443 | 59,6% | 9,8% | FAIL |
| balanced-e (+ 1ª dupla) | 30,1% | 32,6% | 41% | 15% | 100 | #395 | 58,7% | 10,9% | FAIL |
| + Silver até 900 | 32,8% | 29,8% | 45% | 15% | 100 | #382 | 52,8% | 12,4% | FAIL |
| + best-fit (Silver 900) | 31,9% | 29,5% | 39% | 17% | 100 | #410 | 58,8% | 10,6% | FAIL |
| + best-fit (Silver 800) | 29,6% | 32,6% | 33% | 22% | 100 | #422 | 61% | 9,6% | FAIL |

Ganho estrutural: Easy 3% → ~31%, R1 3% → ~31%, energia 61 → 100, prize ≥ 10%,
sponsor ≤ 60%. Nenhum candidato atingiu Easy ≥ 40% / R1 ≥ 35%. As três últimas
linhas estão dentro do ruído de 3 seeds. Medium não se aplica (o Normal não chega
ao Gold no 1º ano).

## O que falta (para uma próxima fase)

- **Motor:** a vantagem estrutural do lado B em OVR baixo (~−8 pp para o jogador)
  e a contagem dupla da energia são as maiores alavancas restantes; exigem
  autorização para tocar a fórmula da partida.
- **Campo do Silver contra o time do 1º ano** (~45 × ~42): a banda quase não move
  o campo (há poucas duplas na faixa 800–1000); a alavanca restante seria a curva
  de população (âncoras 700–1000), que afeta o mundo da IA.
- **Ranking por participação**: auditar só após um Stage 1 aprovado.

## Dívida do Casual (5.27-D, 7 episódios — `casual-debt-events.csv`)

Nenhum episódio ligado a rescisão. Classificação: principalmente **BAD POLICY**
(folha de staff orçada sobre receita pontual; treino sem reserva) somada a
**EXPECTED PRESSURE** (patrocínios de 4–8 meses vencendo ~dia 245–273);
**BALANCE FAILURE** parcial no Hardcore (4/7 episódios, patrocínio ×0,16). A
política v2 corrige a parte de política; o efeito na taxa de dívida não foi medido
em Stage 1.

---

## 55 itens

1. **Por que Silver > Gold?** WR do Gold inflado pelo qualifying + Silver jogado
   no 1º ano com parceiro de OVR ~21–27; campo ordenado corretamente.
2. **Field Bronze antes/depois:** P50 36,5 (antes). Depois: não medido no mundo;
   adversário do jogador ~35–35,5 (inalterado).
3. **Silver antes/depois:** P50 47,5 → adversário do jogador ~45 (Silver até 900).
4. **Gold antes/depois:** 76,5 / inalterado (controle).
5. **Silver band final:** pico de preferência 400–900 nos presets -E (antes
   400–800); presets anteriores 400–800.
6. **Bronze anchors mudaram?** Não.
7. **Elite voltou a contaminar low tiers?** Não observado (campos Bronze/Silver
   P90 41,5/53).
8. **R1 por tier antes (5.27-D, chave):** Bronze 24% · Silver 10% · Gold 18% ·
   Platinum 17% · Masters 17% · Elite 15%.
9. **R1 depois:** micro Normal 1º ano ~30–33% agregado; por tier só Bronze/Silver
   (Gold+ não alcançado em 1 ano). Stage 1 não rodado.
10. **Bracket mudou?** Não.
11. **Match formula mudou?** Não (assimetria documentada, não corrigida).
12. **Easy micro:** 29,6–32,8% (melhor 32,8%).
13. **Medium micro:** N/A (sem partidas Gold no 1º ano Normal).
14. **Hard micro:** N/A.
15. **R1 micro:** 29,5–32,6%.
16. **Candidato que passou o micro-gate:** nenhum.
17. **Ranking subia rápido por quê?** Pontos de participação/derrota sobre base
    rala (0 vitórias → #452).
18. **Ranking formula mudou?** Não.
19. **Prize multiplier mudou?** Não.
20. **Por quê?** Item 23: competição primeiro; prize share já passou a ≥ 10% só
    com a melhora competitiva (10,6–12,4%).
21. **Prize share micro:** 9,6–12,4% (melhor 12,4%).
22. **Sponsor final:** multiplicadores inalterados (Balanced 0,22).
23. **Sponsor Y1 micro:** 52,8–61% (Normal).
24. **Casual debt causa principal:** orçamento de staff sobre receita pontual.
25. **Design ou policy?** Principalmente policy (+ pressão esperada; Hardcore
    também balanceamento).
26. **Starting coins mudou?** Não (900).
27. **Micro-runs:** 7 rodadas; 7 candidatos × 3 seeds = 21 carreiras de 1 ano
    (Silver até 1000 deu o mesmo que até 900; o taper foi rerodado após a
    mudança de política).
28. **Stage 1 — carreiras:** 0 (não liberado).
29–31. **E/M/H/R1 por preset -E:** não medidos (Stage 1 não rodado).
32. **Bronze/Silver/Gold final:** micro Normal Bronze 33–45%, Silver 15–22%,
    Gold N/A.
33–40. **Rank/títulos/sponsor/prize/dívida/money-solved do Stage 1:** não
    medidos.
41. **REJECT:** nenhum preset -E avaliado em Stage 1.
42. **VIABLE:** nenhum avaliado.
43. **PREFERRED:** nenhum.
44. **Stage 2 rodou?** Não.
45. **5y:** 0.
46–50. **5 anos:** não medidos.
51. **Long runs:** 0.
52. **Novo bug?** Sim, no motor: assimetria entre lados com times idênticos
    (lado A 42% em OVR 35–50, 84% em OVR 75) e energia contada duas vezes.
    Também: a recomendação da 1ª dupla ignorava a evolução do novato, e a
    proteção de torneio comprometido estende o 1º contrato de 60 dias para ~11
    meses. Nenhum dos dois corrigido no núcleo protegido.
53. **Integridade/regressões:** paridade 5.26-D 12/12; presets 5.27-B 5/5;
    banda Bronze/Silver 5.27-B 3/3; ordem de tiers (Silver/Bronze, Bronze/Silver,
    Gold/Masters) PASS; primeira dupla 6/6 + integridade de ofertas 9/9.
    `test-no-balance-mutation-v527d` 5/7 — esperado: a 5.27-E alterou de propósito
    `balance527.js` e `circuitCatalog.js` (o `balanceHash` estruturado dos presets
    B segue idêntico; mudou só o hash de arquivo). Os 12 testes novos da 5.27-E
    **não** foram criados (a fase parou antes do Stage 1).
54. **Lint/build/diff-check/commit/push:** verde / verde / limpo / sem / sem.
55. **VEREDITO: B.**

## Arquivos

- `diagnosis.json`, `baseline-527d.json`, `micro-calibration.json`,
  `micro-normal-365d.json`, `micro-run*.log`, `engine-bias.json`,
  `engine-bias-symmetry.json`, `field-strength.csv`, `ranking-progression.csv`,
  `casual-debt-events.csv`, `micro/` (resultados brutos).
- Scripts: `diag-engine-bias-v527e.mjs`, `diag-entry-field-v527e.mjs`,
  `run-micro-calibration-v527e.mjs`.
