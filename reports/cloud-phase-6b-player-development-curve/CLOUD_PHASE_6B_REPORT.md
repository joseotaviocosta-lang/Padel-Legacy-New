# CLOUD-6B — Player Development Curve & Training Rebalance

| Item | Valor |
|---|---|
| Repositório | `joseotaviocosta-lang/Padel-Legacy-New` |
| Origem | `cloud/phase-6a-career-progression-audit` @ `b19d96f` (confirmado, worktree limpo) |
| Branch | `cloud/phase-6b-player-development-curve` (local, **sem push**) |
| Simulação de carreira completa | **Não executada** (controle de créditos). Só fórmulas reais + cenários determinísticos. |

> **Limite de prova:** as curvas abaixo são **projeções de fórmula** com uma política de treino fixa (sessões/dia e intensidade constantes, sem partidas, sem lesão, sem limite de energia). Elas mostram que a *fórmula* já não satura aos 18 anos. **Não provam** o auge aos 22–25 anos numa carreira real; isso exige a simulação completa (sugerida abaixo).

## 1. Causa do crescimento acelerado

Confirmada por leitura de código + projeção com as funções reais:

1. **Causa principal — fórmula (`getDevelopmentWindow`, `trainingSystemV2.js`).** O fator de "janela de desenvolvimento" era um degrau: ×1,0 enquanto faltassem ≥15 pontos para o teto (média). Como o jogador começa em ~22 e o teto padrão é ~86, o ganho ficou **no máximo por ~70% do caminho** (média até ~71). Somado a `ageMultiplier` 1,34 (≤18 anos) e `trainingGainMultiplier` 1,45 (dificuldade `normal`), o resultado é crescimento quase linear e rápido, seguido de parede.
2. **Teto igual para todos por padrão.** `potential` não é definido na criação de carreira → fallback 80 → teto ≈ 85–88 para todos (Fase 13.1). Não é bug, mas explica o platô ~84–88.
3. **Frequência de treino não é a causa.** Calibrando a projeção contra a 6A, o jogador "normal" equivale a **~1 sessão normal/dia** (2/dia e 3 intensas têm limite de energia: recuperação 16/dia com treino vs. custo 10–16 por sessão). Com 1 sessão/dia a fórmula antiga reproduz a 6A: média 52 (0,5 ano), 69 (1 ano), 81 (2 anos), 84 (3 anos).
4. **Simulador não é a causa.** Usa o pipeline real; a projeção direta das fórmulas reproduz a mesma curva.
5. **Fonte secundária (NÃO alterada): bônus de vitória.** `buildMatchRewardsPatch` (`padel.js:1093`) dá +1/+2 a um atributo aleatório por vitória (probabilidade cai com o nível: 70% em 50–59, 25% em 80–89), **limitado a 100, sem consultar o teto/potencial**. Estimativa de fórmula (não medida): ~77 vitórias/ano (otimizador, T4 da 6A) ≈ +2 a +5 pontos de média/ano. Explica o OVR continuar subindo 1–2/ano e atributo máx. 89 > teto 88 na 6A. Corrigir exige tocar `padel.js` (import circular com `trainingSystemV2`) e é decisão de design → **pendência §8**.

## 2. Fórmulas anteriores e novas

Única mudança de balanceamento: `getDevelopmentWindow().multiplier` (fator multiplicativo do ganho por sessão).

| Faltando p/ o teto (média) | Antes | Agora |
|---|---|---|
| ≥ 60 (início, ~16 anos) | 1,00 | 0,56 |
| 50 | 1,00 | 0,47 |
| 30 | 1,00 | 0,28 |
| 15 | 0,82 | 0,22 |
| 8 | 0,58 | 0,22 |
| 4 | 0,30 | 0,22 |
| 1–3 | 0,30 | 0,22 |
| < 1 | 0,08 | 0,08 (inalterado) |

Nova fórmula: `mult = 0,56 × max(0,40, min(1, faltando / 60))` (se `faltando ≥ 1`, senão 0,08). Constantes em `DEVELOPMENT_WINDOW`. Contínua (sem degraus). Ritmo proporcional ao que falta ⇒ saturação gradual; teto maior (potencial) ⇒ cresce por mais tempo; sem teto artificial novo.

Inalterados: `ageMultiplier` (1,34/1,24/1,06/…), intensidade, nível, fadiga, potencial, repetição, afinidade, staff, instalações, dificuldade, teto por atributo, custo/energia/lesão.

Mudança de robustez (comportamento): `executeTrainingWork` passou a usar `applyAttributeGains` (extraída, mesma regra) e **não rebaixa mais** atributo que esteja acima do teto (antes `min(teto, atual)` rebaixava ao teto, ex.: 89→88 após bônus de vitória). Cumpre "não reduzir retroativamente".

## 3. Comparação da curva (média dos 10 atributos; início 22; dificuldade `normal`; potencial 80, teto ≈ 86)

Anos desde o início (16 anos = 0). Projeção de fórmula, política fixa.

| Anos (idade) | Casual* antes→agora | Normal** antes→agora | Otimizador*** antes→agora |
|---|---|---|---|
| 0,5 (16) | 38 → 31 | 52 → 38 | 74 → 53 |
| 1 (17) | 53 → 38 | 69 → 49 | 83 → 65 |
| 2 (18) | 69 → 49 | 81 → 61 | 86 → 77 |
| 3 (19) | 77 → 57 | 84 → 68 | 87 → 83 |
| 4 (20) | 81 → 62 | 86 → 73 | 87 → 86 |
| 6 (22) | — → 68 | — → 79 | 87 → 87 |
| 9 (25) | 86 → 74 | 87 → 84 | 87 → 87 |

\* 1 treino leve/dia, 5 dias/sem. \*\* 1 treino normal/dia. \*\*\* 2 treinos intensos/dia (limite teórico; na prática limitado por energia/fadiga).

Potencial (normal, 1/dia), anos 2 / 6 / 9: pot 60 antes 74/78/78 → agora 56/73/77; pot 80 81/87/87 → 61/79/84; pot 95 87/94/95 → 66/85/90. Teto de cada um preservado (≈ 78, 86, 95).

Leitura: aos 18 anos o normal passa de 94% para 71% do teto; ainda +5 pontos de média entre 22 e 25 anos (antes ~0,4). Primeiro ano segue com +27 pontos (antes +47). Diferença casual/normal/otimizador preservada (ordem estrita em todos os pontos testados).

## 4. Resultados dos testes

`npm run test:player-development-6b` (novo, determinístico, 25 gates, **25 PASS**): janela contínua/monótona; evolução 16→17, 17→19, 19→22, 22→25; intensidades e perfis; potencial 60/80/95; limites; integridade de save.

Regressão (exit 0 antes e depois): `test-training-system-v2`, `test-career-ovr-curve` (17 gates de idade), `test-elite-progression`, `test-phase15-5-3-training-center-effects` (190), `test-career-pace-v17`, `test-massive-careers-v32`. ESLint nos arquivos alterados: limpo.

Falhas **pré-existentes** (idênticas na base `b19d96f`, não relacionadas): `test-fatigue-integrity-rc` (exit 1, "toast deve usar valor canônico") e `test-career-difficulty` (3 FAIL de orçamento inicial — `initialAttributeMultiplier` 1,8 do preset 5.27). `test-career-difficulty-pace` estourou 280 s e não foi concluído; além disso reimplementa fórmulas (6A), então não valida este código.

## 5. Impacto esperado na duração da carreira

Hipótese (não medida): se a 6A atingiu o Top 1 aos 19 anos com OVR ~84, com a nova curva o OVR equivalente chega ~1–2 anos depois (normal ~20–21, otimizador ~19–20), alongando o caminho ao topo sem aproximar de 15 temporadas. "Topo antes de 15 temporadas" tende a continuar viável para quem administra bem; a meta é mais coerente que um Top 1 aos 19. Isto depende de parceiro e ranking, que não foram simulados.

## 6. Riscos de balanceamento

- **Começo mais lento** (~20 pontos de média a menos ao fim do 1º ano: 49 vs 69 no normal): a 6A já apontou o início como frustrante para o casual. Mitigação possível: suavizar `scale` (0,56→0,62) ou usar `floor` menor. Valores calibráveis em `DEVELOPMENT_WINDOW`.
- **Competitividade inicial**: a progressão do jogador diminui, mas bots/IA não mudaram ⇒ o jogador pode demorar a atingir os mesmos adversários. Precisa de simulação completa (1 semente por perfil, 6 temporadas).
- **Bônus de vitória** (§1.5) fica relativamente maior frente ao treino mais lento; pode virar fonte dominante tardia.
- Jogador "otimizador" ainda satura por volta dos 20–21 anos (limite teórico de 2 sessões intensas/dia).
- Dificuldades `easy` (treino ×2,0) e `hard` (×1,10) escalam linearmente; `easy` pode acelerar demais. Não avaliado.

## 7. Compatibilidade com saves existentes

- Nenhum schema, `CAREER_SAVE_SCHEMA_VERSION` (21) ou versão do app (`0.9.0-rc.1.9`) alterados.
- Atributos e `attribute_progress` gravados são lidos/preservados; nenhuma sessão reduz atributo (gate de teste cobre todos os focos). Mudança: o rebaixamento acidental ao teto deixa de ocorrer.
- Efeito prospectivo: saves já avançados (média >70) terão ganhos futuros menores que antes (ex.: 8 faltando: 0,58→0,22). Nada é removido.
- Nenhuma migração.

## 8. Questões pendentes sobre envelhecimento

- Continua sem declínio de atributos do jogador (não implementado, por instrução). Idade só reduz ganho (×0,86 a partir dos 27, ×0,68 após 30, ×0,48 após 35).
- Decisões: (a) quando começa o declínio (bots: a partir de 34); (b) se aplica a atributos físicos primeiro; (c) se o treino pode mitigar.
- Decisão sobre o bônus de vitória: limitar ao teto individual? mover para o sistema de treino? Requer autorização.
- Dificuldade `normal` multiplica o treino ×1,45; avaliar se parte dessa folga deve migrar para a curva.
- Preset: `balanced` = `balanced-e` menos o bloco `competition` (5.27-E: 1ª dupla alvo OVR 36 / peso 0,45, pico Silver 900, janela Silver 15%, perda 1ª rodada 1%). Economia e `initialAttributeMultiplier` (1,8) idênticos; **não afetam treino/atributos**. Consumidores: `firstPartnershipScoring.js`, `circuitCatalog.js`, `WorldTourLifecycle.js`. Preset padrão **não alterado**; nenhum código de produção define `__PL527_PRESET`.

## 9. Arquivos modificados

- `src/lib/trainingSystemV2.js` — `getDevelopmentWindowMultiplier`/`DEVELOPMENT_WINDOW`, `applyAttributeGains` (extraída), não rebaixar atributo acima do teto.
- `scripts/test-player-development-curve-6b.mjs` (novo).
- `package.json` — só o script `test:player-development-6b` (sem dependências).
- `reports/cloud-phase-6b-player-development-curve/CLOUD_PHASE_6B_REPORT.md` (este).

Fora de escopo e intocados: ranking, calendário, partidas, contratos/IA, economia, fadiga, preset, schema.

## 10. Commit final

Ver `git log -1` na branch `cloud/phase-6b-player-development-curve` (hash informado na mensagem de encerramento; não publicado).
