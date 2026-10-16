# CLOUD-3A — Deterministic Post-Separation Market Test Hardening

Branch: `cloud/phase-3a-deterministic-market-test` (a partir de `cloud/phase-2-integrity-hardening` @ `c969662`, worktree limpo na partida).

## 1. Arquivos alterados
- `scripts/test-player-post-separation-market-v518.mjs` (único arquivo de código)
- `reports/cloud-phase-3a-deterministic-market-test/CLOUD_PHASE_3A_REPORT.md` (este relatório)

## 2. Causa confirmada
`CareerEntityRepository.makeId` gera ids `<prefixo>-<Date.now()>-<Math.random base36>`. Esses ids entram no hash FNV-1a usado por renovação/separação das duplas de IA, então o número de livres após 210 dias de aquecimento variava por execução. Com 1 livre elegível o mercado real oferece 1 proposta em D+3 e, corretamente, nada depois (dedupe + sem candidato). O teste exigia `D+30 > D+3` e `D+3 >= 2`, o que as regras reais não garantem. (O diagnóstico local `reports/hotfix-531c/DIAGNOSTICO_531C.md` não existe na nuvem; confirmei as fontes lendo o código.)

## 3. Estratégia de determinismo
- `Math.random` substituído por mulberry32 com seed fixa (`cloud-3a-market-v518:<perfil>`), e `Date.now()`/`new Date()` sem argumentos por relógio sintético — mesmo padrão de `installDeterminism` de `scripts/audit-real-athletes-simulation.mjs`. Instalado **antes** de criar carreira/mundo, restaurado em `finally` (Math.random e Date originais).
- Formato dos ids não foi alterado; só a fonte de aleatoriedade/tempo do processo de teste.
- `MARKET_TEST_SEED` (env, opcional) permite trocar a seed. Com seed alternativa (`alt-seed-robustness`) o teste também passou, com pools bem diferentes (inclusive Rank250 com 1 elegível) — a seed não é um número "favorável".

## 4. Asserções (novas/preservadas)
- Elegíveis calculados como a produção (mesmos 2000 vínculos mais recentes, mesmo filtro, descontando já oferecidos) imediatamente antes de cada janela (D+3, D+10, D+17, D+24).
- Por janela: ofertas criadas ≤ min(4, elegíveis); 0 elegíveis ⇒ 0 ofertas; elegível ≥ 1 na 1ª janela ⇒ ≥ 1 oferta, sem abrir a busca; ofertas só nos dias de janela; contagem monótona; nº de janelas ≤ 4.
- Removido: `D+30 > D+3` e `D+3 >= 2`. Substituído por "só esgota quando elegíveis esgotam".
- Preservados: sem duplicatas, candidato comprometido não ofertado (agora checado **no momento da oferta**, não no estado final, que podia mudar por contratação legítima posterior), sem spam de avisos (≤ 6 e ≤ nº de janelas), todo perfil tem mercado (≥ 1 oferta).
- Cenários controlados (pool congelado em 1, 2 e 3 livres, nearest-rank, mercado de IA desligado para não consumir o pool): D+3 oferece todo o pool, nenhuma oferta/aviso depois, sem falha. Montagem dos dados só em memória do teste.

## 5. Resultados (2 execuções, seed padrão)
Saída das duas execuções **idêntica** (diff vazio), `8 passed, 0 failed`:
```
Rank1000: D+3=4 D+7=4 D+14=8 D+30=11   Rank500: 4/4/8/15   Rank250: 4/4/8/11
Rank100:  D+3=3 D+30=3                 Top20:   D+3=1 D+30=1
Ctrl1: 1/1  Ctrl2: 2/2  Ctrl3: 3/3  (D+3 / D+30)
```
Extra: seed alternativa → 8 passed, 0 failed. Lint: `npx eslint` no arquivo → exit 0 (também com `--no-ignore`). Cada execução ≈ 5 min.

## 6. Produção não alterada
`git diff --stat` contém apenas o arquivo de teste (+ este relatório). Nenhum arquivo em `src/`, `base44/`, saves, schema, versões ou balanceamento foi tocado. `npm ci --ignore-scripts` foi usado só para instalar dependências (node_modules ignorado pelo git).

## 7. Limitações / pendências
- A métrica "livres no mundo" (separação) é calculada com o mesmo critério da produção; o pool cresce nos dias seguintes pelo mercado de IA, por isso a asserção usa elegíveis por janela.
- Não foi rodada a suíte completa nem o teste `long-career-partner-ecology-v518` (fora do escopo).
- Ruído de stderr "backup nativo não criado / Tauri indisponível" é pré-existente e inofensivo.
- Busca manual e demais itens fora de escopo não foram tocados.

## 8. Git
Ver commit no final da sessão (`git log -1`); sem push/merge/PR.
