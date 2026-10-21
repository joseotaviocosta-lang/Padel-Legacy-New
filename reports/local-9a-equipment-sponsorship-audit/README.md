# LOCAL-9A — evidências

Documento: `docs/LOCAL_9A_EQUIPMENT_SPONSORSHIP_ECONOMY_AUDIT.md`. Todas as ferramentas rodam da raiz do repositório, em carreiras de **memória** (sem IndexedDB e sem saves do usuário), e não alteram `src/`.

| Arquivo | Gerado por | Conteúdo |
|---|---|---|
| `catalog-economy.json`, `catalog-table.md` | `node reports/local-9a-equipment-sponsorship-audit/tools/catalog-economy-extract.mjs` | Os 125 itens reais (preço, bônus, requisito, disponibilidade em 120 meses), tabelas de prêmio, patrocínio, staff e treinador |
| `equipment-impact.json` | `node reports/local-9a-equipment-sponsorship-audit/tools/equipment-impact.mjs --matches=400` | Cenários A–D2, 400 partidas pareadas por cenário, troca, duplicado, save/load, interação com o teto de treino (25/25) |
| `sponsor-eligibility-diagnosis.json` | `node reports/local-9a-equipment-sponsorship-audit/tools/sponsor-eligibility-diagnosis.mjs` | As 7 asserções do teste v526c com e sem `tournaments_played` (3/7 → 7/7) |
| `market-events-probe.json` | `node reports/local-9a-equipment-sponsorship-audit/tools/market-events-probe.mjs` | Eventos de mercado de uma carreira nova; `processMarketTick` sem chamador |
| `economy-observed.json` | `node reports/local-9a-equipment-sponsorship-audit/tools/economy-observed.mjs` | Ledger por ano das execuções 5.26/5.27 já versionadas em `reports/` |
| `head-harness-normal-365d-summary.json` | `TZ=UTC node --max-old-space-size=6144 scripts/sim-progression-economy-v526.mjs --profile=normal --seeds=1-1 --days=365 --out=<fora do repo>` | Resumo da execução do harness de decisões no HEAD `b270e04` (a saída bruta não é versionada) |

O aviso `[Save Foundation] backup nativo não criado … TAURI_UNSUPPORTED` aparece em todas as ferramentas: é o backup nativo, indisponível no Node. Não afeta os resultados.
