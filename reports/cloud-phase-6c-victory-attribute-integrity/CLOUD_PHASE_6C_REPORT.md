# CLOUD-6C — Victory Rewards & Attribute Potential Integrity

| Item | Valor |
|---|---|
| Repositório | `joseotaviocosta-lang/Padel-Legacy-New` |
| Origem | `cloud/phase-6b-player-development-curve` @ `7caab6e` (confirmado, worktree limpo) |
| Branch | `cloud/phase-6c-victory-attribute-integrity` (local, **sem push**) |
| Simulação de carreira completa | **Não executada** (conforme escopo). |

## 1. Causa identificada

`buildMatchRewardsPatch` (`src/lib/padel.js`) sorteava um atributo após cada vitória, calculava +1/+2 com `calculateTrainingGain(valorAtual)` e aplicava `min(100, atual + ganho)`. Só o limite 100 era consultado; o teto individual (`getAttributeDevelopmentCeiling`, derivado de `potential`, estilo e atributos iniciais) era ignorado. Assim a vitória contornava a curva de treino da 6B.

**Reproduzido antes de qualquer alteração** (teste novo contra o código original): atributo exatamente no teto recebeu +1 → `FAIL — exatamente no teto: nenhum ganho`.

## 2. Caminhos de recompensa analisados

| Caminho | Concede atributo permanente? |
|---|---|
| `buildMatchRewardsPatch` (padel.js) — usado por `applyMatchRewards` (partidas/bots) e por `TournamentModal.jsx:696` (torneio oficial) e `scripts/lib/v526Tournament.mjs` | **Sim**, só quando `won` — único ponto, corrigido |
| `applyMatchRewards` | Delega ao anterior (sem lógica própria) |
| `applyPracticeRewards` (padel.js) | Não (apenas XP/moedas/energia) |
| `trainingSystem.js:276` (V1) usa `calculateTrainingGain` | Treino legado, fora do escopo (não é recompensa de vitória) |
| Treino V2 (`executeTrainingWork`/`applyAttributeGains`) | Já respeita o teto (6B) |

Partidas comuns e torneios usam exatamente a mesma função; não há diferença de regra entre eles. Missões/conquistas não alteram atributos nos caminhos inspecionados (busca localizada por `buildMatchRewardsPatch`/`calculateTrainingGain`; não foi feita auditoria exaustiva).

## 3. Arquivos modificados

- `src/lib/attributeCeiling.js` (**novo**): `getAttributeDevelopmentCeiling` e helpers movidos **sem mudar a fórmula** de `trainingSystemV2.js`. Necessário porque `trainingSystemV2.js` importa `padel.js` e usa `ATTRIBUTE_KEYS` em nível de módulo — importar V2 em `padel.js` criaria ciclo com erro em tempo de carga. O novo módulo só depende de `attributes.js`.
- `src/lib/trainingSystemV2.js`: importa e **reexporta** `getAttributeDevelopmentCeiling` (API pública inalterada).
- `src/lib/padel.js`: limita o ganho de vitória pelo teto.
- `scripts/test-victory-attribute-integrity-6c.mjs` (**novo**) e script `test:victory-attribute-integrity-6c` em `package.json`.
- Este relatório.

## 4. Regra aplicada

```
headroom   = tetoIndividual(profile, atributo) - valorAtual
ganhoFinal = min(ganhoSorteado, headroom)
se ganhoFinal > 0: atributo = min(100, atual + ganhoFinal)   // senão, atributo não entra no patch
```

- Mesma função canônica do treino (nenhuma fórmula nova).
- Sorteio do atributo e rolagem de `calculateTrainingGain` **inalterados** → mesmo consumo de RNG, mesma distribuição; o atributo sorteado que não pode crescer simplesmente não recebe nada (sem redistribuição, sem compensação).
- Atributo no/acima do teto: sem alteração (chave ausente do patch) → nunca reduzido.
- Nota: com o teto mínimo de 65 e `+2` só ocorrendo abaixo de 25, o corte de `+2` para `+1` pelo teto não é alcançável na prática; o corte relevante é +1 → 0. A rotina cobre ambos de forma genérica.

## 5. Resultados dos testes

- `test:victory-attribute-integrity-6c` (novo, determinístico, `Math.random` substituído): **21 gates PASS**. Cobre: abaixo/no/acima do teto, +1 e +2, potenciais 50/80/95, estilo (teto por atributo), derrota sem ganho, demais atributos intactos, RNG igual entre bloqueado e permitido, sem redistribuição, varredura (10 atributos × 10 valores × 3 rolagens: nunca reduz, nunca excede `max(atual, teto)` nem 100), compatibilidade com 6B (treino não rebaixa atributo acima do teto; vitória e treino usam o mesmo teto), XP/moedas/vitórias preservados.
- Regressão (exit 0): `test:player-development-6b` (26 PASS), `test:training-v2`, `test:career-ovr-curve`, `test:elite-progression`, `test:phase15-5-3-training-center-effects`, `test:phase15-5-1-critical-training-center`, `test:career-pace`.
- ESLint nos arquivos alterados: limpo. `npm run build`: sucesso.
- Falhas pré-existentes da 6B (`test-fatigue-integrity-rc`, `test-career-difficulty`) **não** foram reexecutadas nesta fase.

## 6. Riscos de regressão

- Jogadores perto do teto deixam de ganhar atributo por vitória: o OVR tardio sobe menos (era a intenção; o teto efetivo agora é de fato o teto).
- Estimativa da 6B (+2 a +5 de média/ano via vitórias) cai para perto de zero perto do teto; impacto no ritmo total não medido (sem simulação completa).
- O mesmo atributo no teto pode ser sorteado novamente: vitórias "desperdiçam" o bônus em vez de redirecioná-lo (decisão explícita: sem compensação).
- Reexportação de `getAttributeDevelopmentCeiling` mantém os imports existentes; nenhuma outra assinatura mudou.

## 7. Compatibilidade com saves

Sem alteração de schema, versão ou dados persistidos. Atributos já acima do teto (inclusive os herdados de bônus antigos) são preservados e nunca reduzidos; apenas deixam de crescer. `potential` ausente usa o fallback canônico (80), igual ao treino.

## 8. Questões pendentes

1. Redirecionar o bônus bloqueado para outro atributo elegível? (Não implementado — exigiria decisão de design.)
2. Validar o efeito no ritmo de carreira com simulação completa (fora do escopo desta fase).
3. `trainingSystem.js` (V1) ainda usa `calculateTrainingGain`; confirmar se está efetivamente em desuso.

## 9. Commit final

Ver `git log -1` na branch `cloud/phase-6c-victory-attribute-integrity` (sem push, sem PR).
