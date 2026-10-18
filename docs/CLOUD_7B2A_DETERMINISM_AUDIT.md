# CLOUD-7B2A — Auditoria de entropia residual e determinismo em carreiras longas

## 1. Resumo executivo

- A divergência da CLOUD-7B1 (929 × 947 `TeamRanking` no dia 365) **não foi reproduzida entre processos separados** neste ambiente: 4 pares/grupos de execuções de 365 dias (harness novo, benchmark 7A com `--storage=tauri-mock`, benchmark 7A em memória, duas execuções concorrentes) deram o mesmo estado de jogo.
- Foi reproduzida, de forma determinística e barata (1 dia), uma divergência **entre duas carreiras sequenciais no mesmo processo** com seed, relógio e UUID idênticos. Primeiro dia divergente: **dia 1**; primeira divergência de estado de jogo: pareamento mensal de duplas (`TeamRanking` 940 × 945 já no dia 30).
- **Causa-raiz comprovada**: estado compartilhado de um singleton (`activeCareerAdapter`) com limitadores baseados em `Date.now()` → número de gravações de backup/índice difere → número de leituras do relógio simulado difere → ids com milissegundo embutido mudam → `selectPair` (ordena por hash FNV do id) forma outras duplas.
- **Nenhum código de produção foi alterado.** O defeito de isolamento estava no harness (o singleton não era reiniciado entre execuções). Com o isolamento correto no kit de teste, as divergências desaparecem (940/942/943/946 nas duas execuções).
- Resta uma **dependência de design** (não corrigida, deliberadamente): ids embutem `Date.now()` e o pareamento usa o hash desses ids. Em jogo real o relógio é real, portanto o pareamento depende do tempo de parede. Ver §10–12.

## 2. Base Git

- Branch de trabalho: `cloud/phase-7b2a-determinism-hardening`, derivada exatamente de `7795e8e`.
- `7795e8e` confirmado; descende de `9804adc` (CLOUD-7A) e `d264c22` (integração). Working tree limpo. `main` e branches anteriores intocadas; sem merge, force push ou PR.

## 3. Reprodução do problema

Comando padrão (CLOUD-7B1): `benchmark-cloud-7a-career-growth.mjs --fakeClock --seed=7b1 --days=365`.

| Execução | Condição | Resultado |
|---|---|---|
| Harness novo, 2 processos paralelos | 365 dias, seed `7b2a` | estado idêntico; único campo diferente: `AnnualCareerReport[0].generation.durationMs` (dia 361) |
| 7A tauri-mock, 2 processos paralelos | 365 dias, seed `7b1` | idêntico (954 `TeamRanking`, mesmos bytes em todos os checkpoints) |
| 7A memória, 6 processos concorrentes | 365 dias | 4 falharam ao carregar `vite.config.js` (concorrência do harness); os 2 que terminaram: mesmo digest |
| Harness novo, 2 carreiras no mesmo processo | seed igual | **divergem desde o dia 1** |

Hipótese para a divergência original (não verificada): as execuções da 7B1 compartilharam estado de processo ou algo equivalente. Não foi possível confirmar; é explicitamente uma limitação (§10).

## 4. Primeiro ponto divergente (mesmo processo)

- Dia 0: saves idênticos. Dia 1: diferem `updated_at`, `player.updated_date`, ids `worldevent-<ms>-…` e `created/updated_date` de atletas — todos deslocados por **ticks inteiros do relógio simulado** (4 ticks na criação da carreira, +1 no dia 1).
- Sufixos aleatórios dos ids idênticos ⇒ o RNG não é a fonte.
- Primeiro campo de estado de jogo afetado: pareamento mensal (`Partnership`/`TeamRanking`), `TeamRanking` 940 × 945 no dia 30.

## 5. Evidências técnicas

- Contagem de chamadas a `Date` por ponto de chamada (pilha) no dia 1: única diferença em `GameStorage.js` (nome do arquivo de backup).
- Sequência de I/O: run A faz `saveCareer(backup:true, updateIndex:true)` uma vez a mais; 3 × 2 escritas do índice; 4 × 2 backups de carreira.
- Compactos em `reports/cloud-phase-7b2a-determinism/data/evidence.json`.

## 6. Causa-raiz

1. `ActiveCareerAdapter.lastRoutineBackupAt` (5 min) e `lastIndexSyncAt` (15 s) são comparados a `Date.now()` (`ActiveCareerAdapter.js`).
2. O adapter é um singleton do processo. Com a mesma seed o `career_id` (UUID derivado) se repete, então a 2ª carreira "herda" os limitadores da 1ª e grava menos backups/índices.
3. Cada gravação chama `formatTimestamp()` (`new Date()`); com o relógio determinístico de 1 tick por leitura, menos gravações = relógio em outro ponto.
4. `makeId()` (`CareerEntityRepository.js`) embute `Date.now()`; `selectPair` (`aiPartnershipLifecycle.js`) ordena atletas por hash FNV do id. Ids diferentes ⇒ ordem diferente ⇒ duplas diferentes ⇒ rankings diferentes.

Hipótese testada e descartada: reiniciar os limitadores quando o `career_id` muda. Não surtiu efeito porque o `career_id` é idêntico; mudança revertida.

## 7. Correção implementada

**Somente no kit de teste** (`scripts/lib/cloud7b2aDeterminismKit.mjs`): `resetSharedState` reinicia o singleton do adapter (limitadores, cadeia de escrita, transação) e `resetIdCollisionSequence()` antes de cada execução; a recarga restaura o relógio simulado.

Não foi alterado código de produção: o dano em jogo real é nulo (o relógio é real e o limitador é por design), e as alternativas (remover o ms do id, trocar o hash do `selectPair`) mudam os pareamentos futuros de todas as carreiras — fora do escopo e arriscadas (§9, §12).

## 8. Testes antes e depois

`npm run test:cloud-7b2a-determinism` (T1–T7, 365 dias na longa duração):

- **Antes** (sem isolamento): T1b mostra a divergência (controle negativo) e o experimento de 120 dias dava 940/942/943/946 × 945/946/947/948.
- **Depois**: 10/10 verificações (T1, T1b, T2, T3 com 365 dias e checkpoints a cada 30 dias, T4, T5, T6, T7, T7b, T7c), 4 min 30 s. Detalhe em `reports/cloud-phase-7b2a-determinism/data/acceptance-365d.json`.
- **Regressões** (todas com saída 0): `test:cloud-6n-career-flows`, `test:cloud-7b1-save-pipeline`, `test:browser-career-storage`, `test:mobile-storage-m3-6`, `test:mobile-persistence-m3-7`, `test:career-persistence-integrity`, `test:world-save-load`, `lint`, `build`; `git diff --check` limpo. Como nenhum código de jogo mudou, são garantias de não regressão do restante do repositório.

Exceções justificadas (únicas): `generation.durationMs` do `AnnualCareerReport` (medição de `performance.now()`, telemetria) e, apenas no T4, `last_played_at` (atualizado por definição ao reabrir a carreira). Nenhum campo de estado de jogo é excluído.

## 9. Impacto em carreiras existentes

Nenhum: não há mudança em código de jogo, formato de save, migração, RNG, probabilidades ou ids. T7 carrega o fixture anterior (`career-day30-pre7b1.json.gz`), avança 10 dias, grava, recarrega e avança, sem perder torneios, partidas ou atletas.

## 10. Limitações

- A divergência entre processos (929 × 947) **não foi reproduzida**; a causa comprovada explica a divergência entre execuções no mesmo processo. Se a divergência original ocorreu entre processos limpos, ela ainda não foi explicada.
- O relógio simulado é "um tick por leitura": qualquer diferença no número de leituras (por exemplo, uma recarga extra) desloca ids e, com o tempo, o pareamento. O kit restaura o relógio na recarga; não é uma propriedade do jogo real.
- Não foi testado Android físico nem Tauri real.

## 11. Riscos remanescentes

- Em jogo real, o pareamento depende do ms dos ids (relógio real): duas carreiras com a mesma seed (se existisse conceito de seed) não repetem pareamentos. É o comportamento documentado em `CareerEntityRepository.js` ("saves não devem ser determinísticos").
- O hash do `selectPair` é sensível ao comprimento/formato do id.

## 12. Recomendação para a CLOUD-7B2B

- Só iniciar após decisão do dono do produto sobre o requisito: "mesma seed ⇒ mesmo resultado" também em jogo real?
- Se sim: desacoplar o pareamento da parte temporal do id (por exemplo, hash apenas do sufixo/contador ou de uma chave estável), com avaliação do impacto nos pareamentos futuros, flag de compatibilidade e ressimulação comparativa de carreiras existentes.
- Opcional: reexecutar a investigação cross-process da CLOUD-7B1 com os mesmos comandos e com `--dumpAt` em intervalos curtos para tentar capturar a divergência original.
