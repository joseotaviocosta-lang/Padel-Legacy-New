# Playthrough 5.18 — auditoria temporal (Parte S da 5.18-G)

Registro das conclusões das fases 5.18-D e 5.18-E que dependiam de um índice
histórico construído incorretamente, e o estado de cada uma após a medição
temporal correta introduzida na 5.18-F/G.

## O defeito

O índice de "quem competiu em cada semana" era montado **uma vez, ao fim da
simulação**, traduzindo `draw_pair_ids` (gravado no sorteio) pelas linhas de
`Partnership` do **estado final**. Ao longo de 3 temporadas as parcerias se
dissolvem e se reformam, de modo que um sorteio de 2026 lido pela linha de
2029 é creditado à dupla errada — ou a nenhuma.

Medição do erro (5.18-F, mesma simulação, duas atribuições lado a lado):

| dupla | semanas jogadas (semanal) | (estado final) | lacuna real | lacuna falsa |
|---|---|---|---|---|
| #4 Stupaczuk/Yanguas | 14 | 1 | 6 | 30 |
| #10 Tello/Garrido | 12 | 1 | 5 | 30 |
| #15 Jiménez/Aguirre | 7 | 1 | 8 | 30 |
| #17 Jofre/Gala | 13 | 0 | 7 | 34 |
| #18 Hernández/Goñi | 29 | 20 | 9 | 30 |
| #19 Collado/García | 14 | 0 | 8 | 34 |

As outras 14 duplas do cohort batiam exatamente entre os dois métodos. Numa
run de **1 temporada** o erro não aparece (ainda não houve rotatividade de
parcerias), que é por que passou despercebido em 5.18-D e 5.18-E.

## Afirmações retiradas

| Afirmação | Fase | Dependia do índice ruim? | Status |
|---|---|---|---|
| "2 duplas Top10 com 54 semanas consecutivas sem competir" | D | sim | **invalidada** |
| "6 duplas de elite com lacunas de 30–34 semanas" | E | sim | **invalidada** |
| "todas as lacunas começam em 2026-01-08 → fenômeno de abertura de mundo" | E | sim | **invalidada** (o padrão de datas era a assinatura do artefato) |
| "Stupaczuk/Yanguas e Tello/Garrido Top10 em 100% da lacuna" | E | sim | **invalidada** — eram Top10 e **competiam** |
| "HK (parceria stale) refutada" | E | sim | conclusão mantida, mas **sem objeto**: não havia lacuna a explicar |
| "HO (survivor bias) refutada" | E | sim | idem |
| "ciclo pontos→rank→seleção segue fechado para dupla de fundo de tabela" | E | não (fixture) | **invalidada** por outro motivo: amostra de tamanho 1; na população, 100% das duplas novas maduras estreiam |
| "0 aparições em torneio em 12 meses para o ex-parceiro" | E | não (fixture) | **invalidada**: latência mediana real de 3–4 semanas |
| "94 eventos com inversão de capacidade / excesso 940" | F | sim (deriva de 62%) | **invalidada** — autoridade errada (`applyEntryPriority` em vez de `blendedCutScore`) e instante errado |
| "mercado inerte por arredondamento em `formNewPartnerships`" | E | não | **mantida** — causa provada, correção de 3 linhas aplicada e verificada |
| "headless não simulava o mesmo mundo da produção" | B | não | **mantida** |

## Conclusões de gameplay que NÃO mudaram

Nenhuma conclusão de 5.15–5.17 depende do índice histórico corrompido: elas
foram medidas em runs de 1 temporada ou sobre estado final legítimo
(integridade estrutural, identidade de TeamRanking, paridade Race/Circuit,
hierarquia de tiers, Masters=24, Finals). As regressões correspondentes
seguem verdes.

## Regra em vigor

`scripts/lib/temporalIntegrity.mjs` declara a regra e a torna executável:

> Nenhum fato histórico pode ser reconstruído a partir de estado final.

`scripts/test-historical-partnership-resolution-v518.mjs` reproduz o erro de
forma determinística (uma dupla que competiu em 30 de 30 semanas vira "1
lacuna de 30 semanas" quando traduzida pelo estado final) e fica vermelho se
o padrão voltar.
