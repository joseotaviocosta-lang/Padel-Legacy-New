# Regras de detecção do treinador ao vivo

## Regras gerais

- Somente eventos já concluídos entram nas métricas.
- Uma ocorrência isolada não gera recomendação, exceto energia crítica.
- Treinadores iniciantes exigem amostra maior e recebem penalidade de confiança.
- Especialidade compatível aumenta moderadamente a confiança, sem fabricar evidência.
- Padrões iguais respeitam pelo menos dois games de cooldown estimado.
- No máximo três sugestões por set.
- `sets_only` bloqueia sugestões entre games; `disabled` mantém apenas analytics.

| Padrão | Amostra | Gatilho inicial | Categoria | Ajuste suportado |
| --- | ---: | --- | --- | --- |
| `opponent_targeting_player` | 5 pontos | 4 bolas e ao menos 60% no mesmo jogador | Adversário | Defensivo, centro, mais lob |
| `opponent_more_lobs` | 5 pontos | 4 lobs adversários | Defensiva | Tático, recuperar após lob |
| `volley_errors` | 5 pontos | 3 erros de voleio | Técnica | Menor risco |
| `critical_energy` | até 5 pontos | energia mínima ≤ 35 | Física | Ritmo e consumo menores |
| `plan_not_executed` | 8+ golpes | plano agressivo com menos de 30% de golpes ofensivos | Plano | disciplina tática |

## Confiança

A pontuação combina tamanho da amostra e persistência. `high` começa em 0,78; `medium` em 0,52. Abaixo disso, a observação é hipótese de baixa confiança. O nível e a especialidade do treinador apenas calibram a apresentação.

## Determinismo

As regras não usam relógio, `Math.random()` nem resultado final. IDs derivam do número do ponto e do padrão. Mesma seed, plano e decisões produzem os mesmos eventos de coaching.
