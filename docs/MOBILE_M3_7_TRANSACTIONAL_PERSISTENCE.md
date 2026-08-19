# Mobile M3.7 — Transactional / Batched Persistence

## Escopo

Esta fase reduz a amplificação de persistência do mesmo JSON de carreira. Não altera gameplay, RNG, economia, ranking, progressão, calendário, missões, formato do save, motor de partida ou checkpoint. M4 e redesign permanecem fora do escopo.

## Arquitetura anterior e arquivo compartilhado

`PlayerProfile` vive em `career.player`; todas as demais entidades locais vivem em `career.entities`. `PlayerAdapter` e `CareerEntityRepository` convergem em `ActiveCareerAdapter.mutateActiveCareer()`, que chamava `CareerManager.saveCareer()` após cada mutação. O caminho físico autoritativo é:

```text
CareerEntityRepository / PlayerAdapter
  -> GameRepository
    -> ActiveCareerAdapter
      -> CareerManager
        -> CareerRepository
          -> GameStorage
            -> TauriStorage
              -> careers/<career-id>.json
```

Portanto, `Mission`, `MissionProgress`, `AthleteProfile`, `Partnership`, `TeamRanking`, `WorldEvent`, `CareerMessage`, `Relationship`, `Staff` etc. não são arquivos independentes: cada chamada reserializava o mesmo save completo.

`MatchCheckpoint` é a exceção deliberada. Ele usa `active-matches/<career-id>.json`, tem cache e durabilidade próprios e não participa do batching da carreira.

## Árvore real do advance-day

O benchmark reprodutível usa o pipeline de produção, carreira com 300 atletas, data de virada mensal (`2026-11-30`), data de relógio fixa e seed fixa. Antes da transação, ele observou 71 saves completos:

```text
advance-day
├─ core/calendário e fronteiras de período ........ 19 saves
└─ processGameStateDay
   ├─ partner ...................................... 0
   ├─ world ........................................ 4
   ├─ aiPartnerships .............................. 25
   ├─ aiCareerStrategy ............................. 2
   ├─ circuit ...................................... 5
   ├─ circuitLife .................................. 6
   ├─ athleteIntelligence .......................... 3
   ├─ medical ...................................... 1
   ├─ relationships ................................ 0
   ├─ staff ........................................ 1
   ├─ livingWorld .................................. 3
   ├─ notifications ................................ 1
   └─ persist ...................................... 1
```

Principais origens lógicas medidas: `create:WorldEvent` 17, `update:AthleteProfile` 16, `updatePlayerProfile` 14, `bulkUpdate:AthleteProfile` 7, `bulkCreate:ClubMember` 3, `bulkUpdate:Tournament` 2, `CareerEntityRepository.batch` 2, `create:Season` 2 e oito origens unitárias.

## API transacional

O ponto central é `GameRepository.withPersistenceTransaction(name, work)`, implementado por `ActiveCareerAdapter`:

```js
await gameRepository.withPersistenceTransaction('advance-day', async (transaction) => {
  await updateA();
  await transaction.withTransaction('nested-operation', async () => {
    await updateB();
  });
  await updateC();
});
```

- A transação externa entra na `writeChain` existente.
- Um clone do último snapshot confirmado vira o draft isolado.
- Repositories detectam a transação ativa automaticamente, aplicam a mutação imediatamente no draft e não chamam disco.
- Stages posteriores leem o mesmo draft e enxergam as alterações anteriores.
- Nesting explícito usa `transaction.withTransaction`; apenas o escopo externo pode confirmar.
- Duas transações externas concorrentes são serializadas pela `writeChain`.
- Mutações da carreira iniciadas enquanto a unidade está ativa participam do mesmo draft. O avanço de dia também mantém o single-flight/lock de UI.

## Dirty state e commit

Cada mutação é contabilizada, mas o commit só ocorre quando o draft realmente difere do snapshot inicial. Uma transação sem mudanças, ou cuja alteração líquida seja vazia, incrementa `skipped-clean-commits` e não grava.

No commit externo ocorre exatamente uma chamada de `saveCareer()` para o arquivo autoritativo. Ela mantém validação, `JSON.stringify`, temp write, releitura/verificação byte a byte, backup periódico, cópia de recuperação, replace e rename final. O índice de carreiras é um catálogo separado e não é regravado no caminho quente diário; continua sincronizado por saves explícitos/rotineiros fora da transação.

## Rollback, falha de commit e crash safety

`activeCareer` continua apontando para o último snapshot confirmado enquanto a transação roda. O draft só substitui esse snapshot depois de o commit físico retornar com sucesso.

- Erro de stage/mutator marca a transação como rollback-only, mesmo se um consumidor intermediário capturar o erro.
- Rollback descarta o draft; memória e disco permanecem no estado anterior.
- Erro de stringify/temp/verify ocorre antes da remoção do target e preserva o arquivo antigo.
- Antes do replace, commits transacionais copiam o target para `temp/<arquivo>.rollback.json`.
- Falha de rename restaura imediatamente essa cópia.
- Se o processo morrer entre remove e rename, a próxima leitura restaura o rollback completo.
- Se morrer depois do rename, o target novo completo tem precedência; a cópia antiga restante é inofensiva.
- Falha de commit nunca publica o draft como confirmado em memória.

O teste injeta falha em stringify, temp write, verify e rename, além de simular crash antes do commit, entre remove/rename e depois do rename.

## Cache, writeChain e concorrência

Durante a transação, leituras de `ActiveCareerAdapter` e `CareerEntityRepository` usam o draft. Invalidações por entidade continuam ocorrendo. No sucesso, `setActiveCareer(saved)` publica uma nova referência confirmada e o cache de queries se reconcilia pela referência; no rollback, a referência confirmada antiga nunca foi substituída. O cache separado de checkpoint não é tocado.

Antes, o cenário medido inseria 71 saves completos na fila. Depois, há uma entrada externa na `writeChain`, 71 mutações sequenciais somente em memória e um commit. O profiler registra queue size antes/depois e separa espera lógica de operações Tauri IPC.

## Advance-day, múltiplos dias e background

O fluxo de um dia usa o novo caminho `runTransactional`: calendário e `processGameStateDay` preservam a ordem original e terminam antes do commit único. O evento consolidado de perfil/UI é emitido somente após confirmação. Eventos internos existentes não foram removidos indiscriminadamente.

Avanços de range preservam o processamento global único do intervalo. Dias intermediários confirmam individualmente; no último dia, o processamento global entra no mesmo draft antes do commit. Medição real:

- +3 dias: 3 commits;
- +7 dias: 7 commits;
- chamada legada posterior de `finalizeCareerAdvanceRange`: detecta `game_state_last_processed_date` e não duplica commit;
- avanço por lesão: resoluções automáticas e calendário entram na transação do respectivo dia; o último dia inclui a finalização global.

Não há autosave retardado nem transação de uma semana inteira. Em background/suspensão, não se publica estado parcial nem se força commit intermediário: o disco antigo continua válido até o rename atômico final; a cópia rollback cobre interrupção durante o replace. Checkpoints de partida continuam salvando imediatamente nos pontos seguros próprios.

## Finalização de partida e torneio

A finalização de treino tinha dois batches do mesmo resultado (núcleo e derivados). Ambos agora executam no draft `practice-match-finalization`, preservando `idempotencyKey`; o evento de UI só é emitido depois do commit. `secondary` continua sendo retornado como Promise compatível, já resolvida quando a função conclui.

A finalização de torneio já reunia suas alterações em um único `localGame.batch`; não recebeu uma camada redundante. Idempotência e lifecycle de torneio não foram alterados.

## Profiler release

Nada da instrumentação M3.7 usa `import.meta.env.DEV`. Ela sobrevive no APK release de diagnóstico, fica inerte/oculta por padrão e aparece somente com o `perfdebug` persistido.

Cada operação de Storage recebe `transaction id`, `transaction name`, `transaction depth` e stage lógico. O overlay atualiza no máximo uma vez por segundo e mostra:

- última transação, mutações lógicas, commits físicos, duração, commit I/O e rollback;
- totais de transactions/commits/rollbacks/skipped-clean;
- queue antes/depois;
- Top 5 Storage por padrão, com botão opcional para Top 20;
- FPS, frames, long tasks, cache, IPC e CPU/I/O por stage do advance-day.

## Benchmark local antes/depois

Valores locais de uma execução; não representam tempo do aparelho físico:

| Métrica | Antes | Depois |
|---|---:|---:|
| Logical mutations | 71 | 71 |
| Commits físicos principais | 71 | 1 |
| Primitivas Tauri simuladas | 366 | 14 |
| JSON.stringify do save | 71 | 1 |
| Temp writes | 71 | 1 |
| Renames para o save | 71 | 1 |
| Wall total local | 3.872,1 ms | 963,2 ms |
| Commit I/O local | embutido em 71 saves | 32,9 ms |

Após a transação, todos os stages registraram zero reads/writes físicos internos; o único I/O ficou no commit externo. Exemplos de wall local antes/depois: `aiPartnerships` 1.293,7/313,5 ms, `circuitLife` 373,9/69,6 ms, `circuit` 338,1/71,2 ms, `world` 202,0/41,4 ms e `livingWorld` 192,0/39,2 ms. O estado final completo antes/depois foi `deepEqual` com seed e relógio fixos.

## Testes e failure injection

`scripts/test-mobile-persistence-m3-7.mjs` cobre nesting, dirty tracking, single commit, rollback, falha de commit, stringify/temp/verify/rename, crash recovery, concorrência, write order, multi-day +3/+7, checkpoint independente, determinismo e idempotência. O script imprime o benchmark e a árvore real por stage/caller.

Também permanecem obrigatórias as suítes mobile anteriores, sistemas de carreira, calendário, mundo, lesão/fadiga, ranking, comunicações, parceiro, técnico, finalização/checkpoint, tournament lifecycle e beta readiness, além de lint/typecheck/build, Windows e Android release.

## Checklist físico

1. Home: ativar Performance, zerar contadores e aguardar 10 s; esperado ~0 IPC idle.
2. Missions: abrir, aguardar e fazer scroll; verificar ausência de writes de navegação.
3. Advance 1 Day: zerar, avançar e registrar wall, logical mutations, physical commits, IPC, Top Storage e CPU/I/O por stage; alvo: 1 commit principal.
4. Advance 3 Days: alvo 3 commits.
5. Match: finalizar e conferir uma transação de finalização; checkpoint continua separado/imediato.
6. Rotação portrait/landscape: confirmar overlay e app estáveis.

Somente o aparelho físico pode validar os novos tempos reais. Após M3.7, parar e aguardar esses números antes de qualquer nova otimização.

## Resultado final de validação e artefatos

- `npm run lint`: passou.
- `npm run typecheck`: executado; permanece bloqueado pela dívida global preexistente de tipagem do projeto. O único erro novo inicialmente detectado na M3.7 (retorno booleano de unsubscribe) foi corrigido; a filtragem dos arquivos/linhas novos da fase não encontrou regressão nova.
- `npm run build`: passou, com 3.991 módulos transformados.
- Todas as suítes mobile M1–M3.7 e as suítes de domínio exigidas passaram, incluindo determinismo, atomicidade, recuperação, calendário, lesões/fadiga, ranking, comunicações, parcerias, técnicos, lifecycle de partida/torneio e beta readiness.
- Windows release: `src-tauri/target/release/bundle/msi/Padel Legacy_0.9.0_x64_en-US.msi` e `src-tauri/target/release/bundle/nsis/Padel Legacy_0.9.0_x64-setup.exe`.
- Android universal release assinado: `src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-signed.apk`.
- Tamanho do APK: 53.442.512 bytes.
- SHA-256 do APK: `F310E242E4C25A2FD3899DAA79B28B16D0CC0BE9241F4024A3AC5023EA716E15`.
- Assinatura verificada com sucesso por `apksigner` nos esquemas v2 e v3; certificado `CN=Android Debug`, SHA-256 `2924f0d2cf44e8fa45c9704088dc950eecf3a65825487acc647846b3417e90a6`.
