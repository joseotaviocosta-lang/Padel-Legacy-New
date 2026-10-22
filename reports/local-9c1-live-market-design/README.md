# LOCAL-9C.1 — Evidências da auditoria do Mercado Vivo

Documento principal: `docs/LOCAL_9C1_LIVE_MARKET_DESIGN_AUDIT.md`. HEAD auditado: `b24eef3`. Somente leitura: nenhum arquivo de `src/` alterado, nenhum save real lido ou gravado.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `catalog-audit.json` | Os 125 itens, campo a campo, contagens e achados de integridade (`issues`) |
| `category-analysis.json` | 9 categorias: preço, bônus, custo por ponto, escada por raridade, opções por marca |
| `brand-analysis.json` | 24 marcas: categorias, raridades, perfil de atributos, patrocinador; patrocinadores sem item |
| `rarity-economics.json` | Raridades: requisitos, preço, bônus, custo por ponto, kit por raridade, decomposição do 58 × 676–815 |
| `equipment-impact.json` | Motor real: 8 kits, +k OVR natural e +5 por atributo em 3 níveis (300 partidas pareadas cada); sessões de treino por +k OVR |
| `economy-progression.json` | Baseline 9E.1 e comparabilidade com a H1; meses de sobra até cada kit; vitrine por estágio |
| `inventory-achievement-probe.json` | Itens comprados × conquistas de coleção (defeito confirmado) |
| `tests.json` | Verificações da auditoria (catálogo, sondas de compra, 9B, persistência, motor) |
| `design-options.md` | Modelos A, B e C com benefícios, riscos e escopo |
| `implementation-plan.md` | Plano da 9C.2 em 9 etapas, com critérios de aceite |
| `tools/live-market-audit.mjs` | Gera todos os JSONs acima, exceto a sonda de conquistas |
| `tools/inventory-achievement-probe.mjs` | Gera `inventory-achievement-probe.json` |

## Reproduzir

```
TZ=UTC node --max-old-space-size=4096 reports/local-9c1-live-market-design/tools/live-market-audit.mjs --matches=300
TZ=UTC node --max-old-space-size=3072 reports/local-9c1-live-market-design/tools/inventory-achievement-probe.mjs
```

~10 minutos para a auditoria (motor: ~20 mil partidas). `--skip-engine` pula o motor (e grava `equipment-impact.json` sem a seção de partidas). Determinístico: mesma versão do código, mesmos resultados.

## Método e limites

- Carreira de memória (`scripts/lib/v526bTestKit.mjs`); catálogo pelo caminho real de ativação (`seedMarket` + `ensureExpandedShopCatalog`).
- Regras reutilizadas, nunca reimplementadas. **Exceção declarada:** compra e venda repetem os passos de `Shop.jsx buy()` e `Inventory.jsx sellItem()`, porque não há função de domínio.
- Motor: atributos planos, adversários e parceiro no mesmo nível, energia 100, química 0. IC 95% de ±4 a 8 pp com 300 partidas.
- Economia: sem carreiras novas; usa `reports/local-9e1-decision-simulator/summary.json` (pré-H1) e `reports/local-9e1-h1-sponsorship-renewal/economy-before-after.json`. Ver a comparabilidade em `economy-progression.json`.
