# CLOUD-6A — Career Progression & Competitive Balance Audit

Fase de **diagnóstico**. Nenhum balanceamento, schema de save, contrato de IA, versão
do app ou comportamento de produção foi alterado. O diff desta fase contém só este
relatório, os dados em `data/` e um script de análise somente-leitura
(`scripts/audit-cloud6a-analyze.mjs`).

| Item | Valor |
|---|---|
| Repositório | `joseotaviocosta-lang/Padel-Legacy-New` |
| Origem | `cloud/phase-5-performance-optimization` @ `fbb0bc4` (confirmado; worktree limpo no início) |
| Branch desta fase | `cloud/phase-6a-career-progression-audit` (local, **sem push**) |
| Simulador | existente: `scripts/sim-progression-economy-v526.mjs` + `run-progression-economy-v526.mjs` (pipeline real do jogo; nenhum simulador novo foi escrito) |
| Preset de balanceamento | padrão de produção (`PL527_PRESET` não definido → `balanced`, ver §2) |
| Dificuldade da carreira | `normal` (a que o simulador cria; `easy` e `hard` **não** foram simuladas) |

> **Leitura obrigatória antes dos números:** a amostra é **1 semente (seed 1) por perfil**,
> e as carreiras normal e otimizador cobrem **1.440 dias (~4 temporadas, 16→19 anos)**, não
> 5 temporadas (limite de custo/tempo, §3). Tudo abaixo é **observação de n=1**; frequências
> e probabilidades **não** podem ser inferidas dela. Onde há inferência, está marcada
> como **Hipótese**.

---

## 1. Resumo executivo

1. **Observado:** nas três carreiras o jogador atinge o teto de atributos muito cedo.
   Médias de atributos (normal): 22 → 64 aos 12 meses → 81 aos 18 anos; atributo máximo
   88 já no dia 357 (idade 16–17). O OVR de ~84 é alcançado aos 18 anos (otimizador) e
   fica **plano depois**. O auge de projeto (22–25 anos) não é representado: a curva
   de crescimento termina ~4–7 anos antes.
2. **Observado (n=1):** o otimizador chega ao **Top 10 no dia 847 (18 anos), Top 1 no
   dia 1.162 (19 anos, temporada 4)**, com 10 títulos em 4 temporadas e ~70% de vitórias.
   O normal chega ao Top 10 no dia 1.302 (19 anos). O critério de projeto é "topo em
   **menos de 15** temporadas para carreira bem administrada, sem garantia": o piso
   observado é **muito mais rápido** que o esperado, e não há "teto de dificuldade" visível.
3. **Observado:** a **qualidade do parceiro** é a variável dominante. Mesmo OVR individual
   (~84), o casual (parceiro OVR 34 por 5 anos) fica entre #100 e #190 e vence 0/31 em
   Platinum; o otimizador (parceiro OVR 82 no dia 225, 90 no dia 270) fica Top 3. O
   parceiro OVR 90 foi contratado quando o jogador era rank ~470, 16 anos.
4. **Observado:** a economia é apertada só no 1º ano (caixa 544–1.160 moedas) e **deixa de
   limitar a evolução depois do mês ~18** (caixa de 20k–75k parado; staff do otimizador a
   13k/mês sem esgotar o caixa).
5. **Observado:** consequências de fadiga existem e são perceptíveis (W.O. por energia/lesão:
   10% das inscrições no normal, 19% no otimizador), mas o treino perde sentido após ~18 anos
   porque o teto de atributo é atingido.
6. **Limitação:** não foi possível observar envelhecimento (carreira para em 19–21 anos) nem
   chegar a 30 anos. Por leitura de código, **não existe declínio de atributos do jogador**
   (§4.4) — achado **estático**, não de simulação.

Veredito de diagnóstico: o ritmo observado é **acelerado demais no meio da carreira e sem
fase de auge/manutenção**, enquanto **o início (primeiros 6 meses) e o caminho casual
são lentos/frustrantes**. A carreira não se mostra "excessivamente lenta" nos perfis bem
administrados; o risco principal é a **perda de desafio** após ~18 anos e a **dependência
da escolha do parceiro**.

---

## 2. Parâmetros atuais de progressão (leitura de código)

| Área | Parâmetro | Fonte |
|---|---|---|
| Treino | `ganho = baseGainBudget(0,9) × intensidade(leve 0,72 / normal 1 / intensa 1,28) × levelMultiplier(1,18−0,0065·nível, 0,42–1,12) × fadiga(1−0,006·fadiga, 0,45–1) × potencial(0,9+pot/520) × idade × janela de desenvolvimento × repetição × afinidade × clube × treinador(≤+15%) × staff × instalações × dificuldade` | `src/lib/trainingSystemV2.js:149` |
| Multiplicador de idade | ≤18: 1,34 · ≤22: 1,24 · ≤26: 1,06 · ≤30: 0,86 · ≤35: 0,68 · >35: 0,48 | `trainingSystemV2.js:114` |
| Teto por atributo | `47 + potencial·0,48` ±estilo/inicial, limitado a 65–98; `potential` ausente → **80** (≈ teto 85–88) | `trainingSystemV2.js:57-66` (Fase 13.1) |
| Janela de desenvolvimento | restante ≥15: ×1 · ≥8: ×0,82 · ≥4: ×0,58 · ≥1: ×0,30 · <1: ×0,08 | `trainingSystemV2.js:68-74` |
| Dificuldade (treino / XP / pontos de ranking / prêmio) | hard 1,10/1,05/1,0/1,0 · **normal 1,45/1,25/1,35/1,08** · easy 2,00/1,70/2,90/1,20 | `src/gameplay/difficulty/difficultyConfig.js` |
| Intensidade (energia/fadiga/risco de lesão) | leve 6/3/0,05% · normal 10/7/0,15% · intensa 16/12/0,45% | `src/lib/trainingCatalog.js:13-15` |
| Lesão | 2% base, 12% com energia <30, +3%/ano acima de 30 | `src/lib/padel.js:323` |
| Pontos de ranking (âncoras posição→pontos) | #1 13.000 · #10 9.130 · #24 3.110 · #50 2.050 · #100 1.200 · #200 650 · #500 200 · #1000 1 | `src/lib/rankingPopulation.js:115` |
| Decaimento de pontos | jogador: linear/ancorado (5.26-C); bots: ~1,2%/semana (documentado na Fase 13.1, **não reverificado aqui**) | `docs/FASE_13_1_CAREER_PACE_VALIDATION.md` |
| Bots (mercado) | crescimento 0–2 OVR/mês até 24 anos; declínio 0–2/mês a partir de 34; aposentadoria 36–40 | `src/game-core/worldMarketLifecycle.js:170-178` |
| Economia/preset | `balanced` (5.27-B): moedas iniciais 900, prêmio ×3,0, patrocínio mensal ×0,22, staff ×1,25, loja ×1,2 | `src/lib/balance527.js` |

**Achado de configuração (verificado por leitura):** o padrão de `getBalance527()` é o preset
`balanced` (5.27-B). O "núcleo competitivo de entrada" da 5.27-E (`balanced-e`, que
mudava a escolha da 1ª dupla e a banda Silver) **só é aplicado se `PL527_PRESET` for
definido** — nenhum código de produção o define. As fases 5.27-E…J validaram *Balanced-E*,
não o padrão atual. Confirmar na CLOUD-6B se isso é intencional.

---

## 3. Simulações executadas, sementes, condições e custo

### 3.1 Reaproveitamento (nenhum simulador novo)

| Ferramenta | Uso | Determinística? |
|---|---|---|
| `sim-progression-economy-v526.mjs` (+ `scripts/lib/v526*.mjs`) | carreira completa pelo pipeline real (criação de carreira, `advanceCareerDays`, `simulateWorldDay`, mercado de duplas, world tour, motor de partida real, finanças) | **Sim** — RNG semeado, checkpoints com checksum; 5.26/5.27 provaram contínuo == recarregado |
| `run-progression-economy-v526.mjs` | orquestrador retomável por checkpoint | idem |
| `audit-cloud6a-analyze.mjs` (novo, somente leitura) | extrai marcos, atributos, temporadas, fadiga dos JSON brutos | n/a |

Os testes `test:career-pace*`/`massive-v32` **não** foram reutilizados: segundo a
Fase 13.1 eles reimplementam as fórmulas e injetam `potential` 78–91 (mais generoso que o
jogo real) e não usam o mundo de bots real.

### 3.2 Execuções

| Execução | Condições | Resultado | Custo |
|---|---|---|---|
| **Piloto** | `normal`, seed 1, 90 dias | 7 partidas, rank 910, OVR 38, 0 erros | 158 s, 865 MB (inclui semeadura do mundo) |
| casual · seed 1 | 1.826 dias (5 temporadas), dif. `normal` | completo, 0 erros | 112 min, pico 1,7 GB |
| normal · seed 1 | meta 1.826 dias; **parou em 1.440** (tempo limite) | 0 erros | ~3,2 h de relógio (3 processos em paralelo; ver nota) |
| otimizador · seed 1 | meta 1.826 dias; **parou em 1.440** | 0 erros | idem |

Nota de custo/limitação: o ritmo cai conforme o save cresce (180 dias ≈ 30 min no fim). Um
reinício do container interrompeu normal e otimizador no dia ~1.080; ambos foram **retomados do
checkpoint** (mecanismo do simulador) e depois cortados pelo teto de 60 min no dia 1.440. Os
dados parciais vêm do `out` do checkpoint (mesmo formato do JSON final). Nenhuma métrica
foi extrapolada para os dias não simulados.

Perfis (só comportamento; ver `POLICIES` no simulador): **casual** (tier aleatório, 50% de
inscrição, 1 treino/dia, parceiro aleatório), **normal** (melhor tier elegível, 2 treinos,
parceiro recomendado), **otimizador** (encaixe de tier, até 3 treinos intensos, parceiro mais
forte sustentável). Arquétipos gerados: casual esquerda/construtor, normal direita/finalizador,
otimizador direita/coringa — **builds diferentes**, logo a comparação entre perfis mistura
política e build.

Não foram executadas (não necessárias para o diagnóstico; custo): dificuldades `easy`/`hard`,
mais de 1 semente, 10 temporadas, carreiras acima de 21 anos.

---

## 4. Resultados observados

Dados: `data/weekly-*.csv`, `data/tournaments-*.csv`, `data/matches-*.csv`,
`data/career-analysis.json`.

### 4.1 Marcos de ranking (individual) — dia / idade

| Marco | casual (5 temp.) | normal (4 temp.) | otimizador (4 temp.) |
|---|---|---|---|
| Top 500 | d266 / 16a | d273 / 16a | d336 / 16a |
| Top 250 | d574 / 17a | d546 / 17a | d511 / 17a |
| Top 100 | d1820 / 20a | d686 / 17a | d630 / 17a |
| Top 50 | — | d1043 / 18a | d679 / 17a |
| Top 20 | — | d1246 / 19a | d819 / 18a |
| Top 10 | — | d1302 / 19a | d847 / 18a |
| Top 1 | — | — (melhor #8) | **d1162 / 19a** |
| Melhor rank | #100 | #8 | #1 |

Comparação com a auditoria histórica 5.26 (código anterior, 45 carreiras, mediana):
normal Top100 21 m (agora 22 m — igual), Top50 47 m (agora 34 m), Top10 apenas 1 carreira
aos 60 m (agora 43 m); otimizador Top50 55 m (agora 22 m); #1 nunca (agora d1162). O
aumento de velocidade é **observado**; a **causa não foi isolada** (a 5.26 tinha o bug de
parceiro OVR 1 no motor, corrigido depois — **Hipótese:** é a principal razão).

### 4.2 Evolução de atributos (média dos 10 atributos; máx.) e parceiro

| Dia | Idade | casual | normal | otimizador |
|---|---|---|---|---|
| 0 | 16 | 22 (máx 28) | 22 | 22 |
| ~180 | 16 | 41 | 48 (máx 86) | 48 |
| ~360 | 16–17 | 55 (máx 88) | 64 (máx 88) | 67 (máx 84) |
| ~720 | 17 | 69 | 76 (máx 88) | 81 |
| ~900 | 18 | 74 | 79 | 83 (máx 89) |
| ~1.260 | 19 | 79 | 82 (máx 88) | 84 |
| ~1.800 | 20–21 | 84 | — | — |
| **OVR do parceiro** (d360 / d720 / d1260) | | 34 / 34 / 34 | 41 / 76 / 83 | **90** / 91 / 93 |

Observações: (a) ganho de ~+42 de média no 1º ano; (b) o **teto (~88) é tocado por pelo
menos um atributo em ≤ 12 meses**; (c) depois de ~18 anos o OVR sobe 1–2 pontos por ano
(casual até 84 aos 20–21). Não há fase de "auge" distinta: a curva é concava e satura.

### 4.3 Partidas, torneios e resultados por temporada

| | casual T1…T5 | normal T1…T4 | otimizador T1…T4 |
|---|---|---|---|
| Torneios | 16/17/22/20/22 | 27/33/33/30 | 21/29/32/34 |
| Partidas | 28/17/23/21/24 | 45/36/51/54 | 54/74/95/110 |
| Títulos | 2/0/0/0/0 | 0/0/0/0 | 0/1/3/6 |
| Finais perdidas* | 0 | 4/0/1/0 | 0/0/4/5 |
| Eliminado na 1ª rodada | 9/17/22/19/21 | 19/32/22/17 | 13/15/12/9 |
| Tiers jogados (T4) | Masters/Gold/Plat./Elite | Masters/Plat./Gold/Crown/Elite | Masters/Plat./Gold/Elite/Crown/Circuit Finals |

\* `roundsWon == totalRounds−1` com `status=eliminated` (aproximação do script).

Calendário: 21–34 torneios por temporada (~1 a cada 2 semanas) é coerente com o circuito.
O casual joga **~1 partida por torneio** (eliminação na 1ª rodada em 17–22 de 17–22
torneios nas temporadas 2–5): pouca experiência de jogo por temporada (17–28 partidas).

Taxa de vitória por tier (partidas): casual — Bronze 11/17, Silver 3/7, **Gold 3/40,
Platinum 0/31, Masters 0/12**, Elite 1/6; normal — Bronze 15/29, Silver 3/16, Gold 12/38,
Platinum 21/59, Masters 4/26, Elite 7/14; otimizador — Bronze 25/38, Silver 12/20, Gold 36/53,
Platinum 91/125, Masters 45/64, Elite 13/22, Crown 5/8, Circuit/Legacy Finals 0/3.

Vitória × diferença de força exibida (Δ = dupla − adversário), normal/otimizador:
Δ<−10: 2/26 · −10..−3: 2/39 · −3..3: 68/166 (41%) · 3..10: 126/190 (66%) · >10: 92/98 (94%).
A relação é monotônica e sensata — **o motor de partida em si não parece "manipulado"**;
o desequilíbrio vem de *quem* o jogador enfrenta e com *qual parceiro*.

### 4.4 Treinamento, descanso, fadiga, lesão

- Energia/fadiga (snapshots semanais): normal e otimizador operam com fadiga alta
  (picos de 77–88 em alguns snapshots, energia 69–85), o casual fica em 100/0.
- Lesão: casual 4/262 semanas; normal 17/206 (8%); otimizador 13/206 (6%).
- W.O. por energia/lesão (`outcome='forfeit'`): casual 2, normal **14 de 138** inscrições
  (10%), otimizador **28 de 145** (19%). Treino intenso tem custo visível, como projetado.
- **Envelhecimento (achado de código, não simulação):** não há decaimento de atributos do
  jogador por idade em nenhum lugar; a idade só reduz o ganho de treino (×0,86/0,68/0,48) e
  eleva o risco de lesão >30. O declínio existe **apenas para bots** (≥34 anos). Portanto
  o jogador nunca "perde" nível, o que contrasta com a lógica de "auge e declínio" dos
  bots/parceiros (`athleteBehavior.getCareerPhase`: Ascensão/Auge/Declínio).

### 4.5 Parceiros (disponibilidade e qualidade)

| | casual | normal | otimizador |
|---|---|---|---|
| Sequência de parceiros (OVR, origem) | 19(oferta) → 33–34 por 5 anos | 9(oferta) → 23 (busca d92) → 43 (d492) → ~75–83 | 20(oferta) → **82 (busca d225) → 90 (d270)** |
| Rank da dupla × individual (d357) | 331 × 369 | 404 × 417 | **11 × 467** |

Observado: um parceiro de OVR 82–90 esteve disponível para um jogador de 16 anos, rank
~470, e a dupla passou a rank 11 em ~3 meses. **Hipótese:** o filtro de aceitação do
parceiro não depende suficientemente do status do jogador (a verificar lendo
`partnershipSystem`/`partnerOffers` na CLOUD-6B).

### 4.6 Economia

| Dia | Moedas casual / normal / otimizador | Patrocínio/mês | Staff/mês |
|---|---|---|---|
| ~360 | 884 / 1.160 / 4.499 | ~1,5–1,8k | 0–1,9k |
| ~720 | 1.112 / 928 / 9.377 | 1,4–2,5k | 0,95–3,9k |
| ~900 | 6.998 / 5.527 / **59.358** | 3,3–8,1k | 1,75–8,1k |
| ~1.260 | 7.167 / 20.656 / **75.739** | 5,1–8,2k | 2,5–13,3k |

Caixa abaixo de ~1.200 moedas no 1º ano (inscrições Bronze custam ~10; patrocínio é a renda
principal desde o dia 0) vira acúmulo de dezenas de milhares depois: **observado** que a
economia não restringe nem direciona a evolução depois do 2º ano (mesma conclusão da 5.26,
agora com código atual).

---

## 5. Gargalos e riscos de ritmo (por prioridade)

Formato: comportamento → evidência → sistema → impacto → alternativas → riscos.

### P1 — Crescimento de atributos satura em ~12–24 meses; não há "auge" nem progressão tardia
- **Comportamento/evidência:** média 22→64 em 12 meses, máx 88 no dia 357, OVR plano em 84 aos 18–19
  anos (§4.2). Meta de projeto: auge 22–25.
- **Sistema:** `trainingSystemV2.js` — multiplicadores de dificuldade `normal` (treino ×1,45, XP ×1,25),
  `ageMultiplier` 1,34/1,24 até 22, `potential` default 80 (teto ~88) e janela de desenvolvimento.
- **Impacto:** a partir de ~18 anos o treino não produz progresso perceptível; 7+ anos de carreira
  até o auge sem arco de evolução.
- **Alternativas (para decisão humana):** (a) desacelerar o ganho 16–19 e estender a janela até 24–25
  (reparametrizar `ageMultiplier`/`levelMultiplier`); (b) subir o teto gradualmente com a idade em vez de
  um teto fixo; (c) manter o teto e mover a progressão para estágios (novos tiers de treino).
- **Riscos:** muda a curva de todos os saves em andamento (os atributos já ganhos ficam, mas o ritmo
  futuro muda); interage com `difficultyConfig` (Fácil 2,0×); a Fase 13.1 já ajustou o teto uma vez.

### P1 — Parceiro é a variável dominante e fica acessível cedo demais
- **Evidência:** §4.5 — dupla rank 11 com jogador rank ~470; casual 5 anos com parceiro 34.
- **Sistema:** busca/oferta de parceiros (`partnershipSystem.js`, `partnerOffers.js`, `firstPartnershipScoring.js`).
- **Impacto:** a decisão mais importante da carreira vira "contratar o OVR mais alto que o caixa paga",
  e o jogador desatento é preso (renovação/limbo). Reduz a diversão de "evolução do parceiro e da dupla".
- **Alternativas:** exigir reputação/rank mínimo do jogador proporcional ao OVR do parceiro; sinalizar
  claramente parceiros "fortes demais" e "estagnados" na UI; evoluir parceiro estável ao longo do tempo.
- **Riscos:** mexe no mercado de duplas validado nas 5.17/5.27 (limbo de compromisso, 5.27-J); pode
  recriar o problema de parceiro fraco preso que a 5.27-E tentou resolver.

### P1 — Topo da escada alcançado antes do esperado (Hipótese a validar com mais sementes)
- **Evidência:** Top 1 no dia 1.162 (19 anos) em 1 de 1 otimizador; Top 10 aos 19 no normal (§4.1).
- **Sistema:** combinação P1 acima + âncoras de ranking + decaimento assimétrico (jogador vs bots).
- **Impacto:** perda de desafio de longo prazo; o jogador "termina" o jogo na 4ª temporada.
- **Alternativas:** só decidir após replicar em ≥5 sementes; ajustar primeiro crescimento/parceiro (acima) e
  medir o ranking depois, **sem mexer nas âncoras de pontos**.
- **Riscos:** n=1; o otimizador usa policy de maximização que um jogador humano pode ou não reproduzir.

### P2 — Início da carreira lento e caminho casual com "falsa dificuldade"
- **Evidência:** rank ~660–730 aos 6 meses mesmo com OVR 41–48; casual perde 0/31 em Platinum (Δ médio −23,6)
  e é eliminado na 1ª rodada em 17–22 de 17–22 torneios nas temporadas 2–5 (§4.3).
- **Sistema:** seleção/elegibilidade de torneio (`circuitCatalog`, `Tournaments.jsx`), parceiro (acima).
- **Impacto:** feedback negativo prolongado; 17–28 partidas/temporada para o casual.
- **Alternativas:** aviso de risco de inscrição em tier com Δ muito negativo; sugestão "melhor tier" mais visível.
- **Riscos:** o jogo hoje não tem barreira artificial (critério de projeto) — avisos são menos invasivos que bloqueios.

### P2 — Economia não limita nem direciona a evolução após o 2º ano
- **Evidência:** §4.6 (caixa 20k–75k parado; patrocínio como renda principal desde o dia 0).
- **Sistema:** `economy.js`, `sponsors.js`, `staffCatalog.js`, `balance527.js`.
- **Impacto:** decisões de gasto sem consequência; "Possibilidade real, sem garantia" perde pressão.
- **Alternativas:** sumidouros úteis (instalações, equipamento premium) ou escala de custo por nível — já
  levantado em 5.26/5.27 (`reports/progression-economy-526/recommendations.md`).
- **Riscos:** o balanceamento econômico foi iterado em ~10 fases; alta chance de regressão.

### P2 — Treino perde propósito depois do teto; sem declínio do jogador
- **Evidência:** §4.2 e §4.4; janela de desenvolvimento ×0,08 quando o restante <1.
- **Sistema:** `trainingSystemV2.js`; ausência de decaimento (leitura de código).
- **Impacto:** após ~18 anos, treino e recuperação têm pouco efeito além de manter a forma; nenhum arco
  de declínio na carreira longa (não observado em simulação; inferido de código).
- **Alternativas:** manutenção de atributos (custo para não cair) e declínio suave após ~30; foco em
  especialização em vez de volume.
- **Riscos:** altera saves antigos de jogadores veteranos; precisa de migração decidida pelo produto.

### P3 — Fadiga/W.O. no estilo intensivo e preset de produção
- **Evidência:** 19% das inscrições do otimizador viram W.O. por energia/lesão (a política do simulador
  não checa a energia ao inscrever — **pode ser artefato do harness**, não do jogador humano).
- **Ação:** validar com um jogador real no Windows antes de qualquer ajuste. Confirmar também por que a
  produção usa `balanced` e não `balanced-e` (§2).

---

## 6. Limitações e o que **não** foi medido

- n=1 por perfil; normal/otimizador até 19 anos; nada além de 21 anos. Envelhecimento e carreiras
  >5 temporadas **não observados**.
- Arquétipos diferentes entre perfis; a comparação mistura política e build.
- Apenas dificuldade `normal` (as outras têm multiplicadores 1,10× / 2,0× de treino).
- O rank do jogador no `weekly` é o rank mundial individual do jogo; o rank "Top1" foi reportado como
  tal, mas a coerência com o OVR dos bots do topo (~95 segundo `rankingPopulation.js`) **não foi verificada**
  (o jogador chegou a #1 com OVR 84 e parceiro 93).
- Causa da diferença contra a 5.26 não isolada.
- Não foi executada a bateria de testes de regressão do repositório (fora do escopo de diagnóstico).

Como reproduzir localmente (Windows ou Linux; 4+ núcleos e ≥8 GB livres):
```
npm ci
node scripts/run-progression-economy-v526.mjs --workers=3 --seeds=1 --longSeeds=0 --days=1826 --checkpointEvery=180 --root=<pasta>
node scripts/audit-cloud6a-analyze.mjs <pasta>/raw
```
Para um lote estatístico (ex.: `--seeds=5`, 3 perfis, 5 temporadas) estimar ~2–3 h de relógio por carreira
nas últimas temporadas; usar `--jobs=normal-1,optimizer-1,...` para restringir.

---

## 7. Testes a executar no Windows (humano)

1. Criar carreira nova, jogar manualmente as 2 primeiras temporadas e registrar: idade em que Top500/Top100
   ocorrem, atributos médios aos 12/24 meses, parceiro escolhido e rank da dupla.
2. Verificar se um parceiro de OVR ≥80 realmente aparece na Busca com jogador rank ~400–500 (§4.5).
3. Treinar de forma intensa por 2–3 meses e contar W.O. por energia/lesão (compara com os 10–19% do simulador).
4. Inscrever-se em torneios com Δ de força muito negativo e observar a UX de aviso.
5. Carregar um save de ≥3 temporadas e confirmar que o ritmo de treino é o esperado depois dos 18 anos.
6. Repetir com dificuldade `easy` e `hard` (não simuladas aqui).

---

## 8. Proposta de escopo — CLOUD-6B (não iniciada)

Somente após sua autorização.

1. **6B-1 (leitura + medição barata):** auditar as regras de aceitação de parceiro e o filtro da Busca
   (`partnershipSystem`, `partnerOffers`, `firstPartnershipScoring`); medir OVR/rank/idade disponíveis por
   estágio de carreira. Sem alterar código.
2. **6B-2 (varredura de curva, barata):** varrer a curva de ganho de treino *offline* usando a função pura
   `calculateTrainingGainBudget` (padrão de `test-career-ovr-curve.mjs`) para propor 2–3 candidatos de
   curva "16→25 anos" e comparar com o alvo (auge 22–25).
3. **6B-3 (replicação estatística controlada):** 3 sementes × 3 perfis × 5 temporadas, `easy`/`normal`/`hard`
   em lote reduzido; idealmente localmente.
4. **6B-4 (decisão):** só então propor mudanças numéricas pequenas, atrás de preset, com gate de regressão
   (`test:career-pace*`, `test:world-*`, `test-ranking-regression-v527h`) e sem tocar no schema de saves.

Fora do escopo da 6B sem decisão separada: âncoras de pontos de ranking, economia (5.27), mercado de duplas.
