# Fase 2.7, item 4 — Nova baseline oficial congelada

Rodada aprovada disparada e concluída: **900 bots procedurais, 450 duplas
procedurais, 100 reais, 1 temporada**, seed fixa `official-900-100-s1`, via
`node scripts/audit-real-athletes-simulation.mjs --seasons=1
--proceduralAthletes=900 --proceduralTeams=450 --seed=official-900-100-s1`.

Congelada em [docs/baseline-pre-fase3.json](../../docs/baseline-pre-fase3.json)
e [docs/baseline-pre-fase3-season-tier.md](../../docs/baseline-pre-fase3-season-tier.md).
Cópia arquivada com nome específico em
[official-baseline-900bots-100reais-1season.json](official-baseline-900bots-100reais-1season.json) /
[-tournaments.csv](official-baseline-900bots-100reais-1season-tournaments.csv) /
[-season-tier.md](official-baseline-900bots-100reais-1season-season-tier.md).

A baseline anterior (`docs/baseline-pre-refactor.json`, 970 bots + 24
reais) foi **arquivada, não substituída** — nota adicionada no próprio
arquivo e no `-season-tier.md` explicando que ela é o registro do estado
pré-Fase-2 e não é comparável numericamente a esta.

## Contexto: por que esta baseline é de 1 temporada, não 5

O regime-check de 5 temporadas foi tentado (mesma seed) e travou por
`FATAL ERROR: JavaScript heap out of memory` na temporada 2, antes de
gravar qualquer resultado em disco (o harness só grava ao final de TODAS
as temporadas). Decisão explícita: não insistir agora — o regime-check
completo fica adiado para depois da correção do achado #18 (clone do save
inteiro a cada transação, documentado nesta mesma fase), que é a causa
raiz tanto do crescimento de custo quanto do crash de memória. Ver
[FASE-2.7-RELATORIO.md](FASE-2.7-RELATORIO.md), item 5, para a análise
completa. Esta baseline de 1 temporada é suficiente como ponto de partida
da Fase 3, como pedido.

## Números — ponto de partida da Fase 3

- **Elenco**: 100 reais + 894 procedurais (amostra gerada) = 1000
  atletas · 27 duplas reais + 450 procedurais = 479 duplas semeadas
  (`roster.totalTeams`).
- **Torneios**: 32/32 resolvidos · **13/32 (40,6%) com chave
  incompleta** · classificação dos campeões: **31/32 100%-reais, 1
  mista, 0 100%-bots**.
- **Reais no Top 20 do ranking mundial ao fim do ano**: **19/20**.
- **Torneios disputados por atleta**: reais média 11,86/mediana 12 · bots
  média 18,77/mediana 19.
- **Reais que nunca disputaram nenhum torneio na temporada**: **13/100**
  (era 41/100 na primeira baseline pós-Fase-2, antes da correção de
  vazão do mercado da Fase 2.6 — e 17/100 na validação intermediária da
  própria Fase 2.6; a diferença 17→13 reflete só variação de seed, não
  mudança de código entre a validação da Fase 2.6 e esta rodada).
- **#1000 elegível para 13/32 torneios do calendário**, maior intervalo
  entre datas elegíveis: 42 dias.
- **Duplas históricas**: das 27 semeadas, a maioria pareada 100% do ano;
  algumas entre 41,7% e 83,3% (as que não são protegidas — "prováveis",
  Fase 2G — dissolvem e reformam normalmente pelo mercado). Tabela
  completa em
  [docs/baseline-pre-fase3-season-tier.md](../../docs/baseline-pre-fase3-season-tier.md).

Estes são os números contra os quais a Fase 3 (escada de 7 tiers + 2
finais, 80 eventos/temporada) deve ser comparada.
