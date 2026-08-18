# Mobile M3.6 — Storage/I/O Performance

Escopo fechado: diagnóstico e otimização de Storage/I/O. Não inicia M4, não
altera gameplay, RNG, economia, progressão, calendário, UI de jogo ou schema
de save.

## Diagnóstico da métrica M3.5

`careerIOStats` media `CareerEntityRepository.withCareer()`, não o filesystem.
Uma consulta ao snapshot em memória que aguardasse `writeChain` era contada
como “read de Storage” e recebia toda a duração da espera. Consultas paralelas
podiam, portanto, somar várias vezes a mesma gravação de 11 segundos. O contador
foi preservado no overlay com o nome **Fila lógica**, para comparação, mas não é
mais tratado como IPC.

A M3.6 mede separadamente:

- `tauri-ipc`: read, write, exists, remove, rename, copy, mkdir, list e stat;
- `serialization`: JSON.parse e JSON.stringify do arquivo/chave correspondente;
- `memory-cache`: hit/miss da carreira ativa, query de entidade e checkpoint;
- caminho/chave, caller lógico, duração, bytes, falha, rota e número de chamadas;
- Top 20 agregado por camada/operação/chave/caller;
- últimos 300 eventos individuais, mantidos apenas enquanto perfdebug está ativo.

O probe não depende de `import.meta.env.DEV`. Ele fica no bundle release, inerte
por padrão, e só coleta quando `padel:perfdebug=1` está persistido pelo toggle
Performance ou quando existe `?perfdebug=1`.

## Causas comprovadas e correções

1. `GameStorage.readJsonIfExists` fazia exists → `readJson` (exists) →
   `TauriStorage.readText` (exists) → read. Agora faz um exists e um read.
2. `GameStorage.readCareer` repetia exists antes do mesmo pipeline. Agora delega
   a uma única leitura e apenas traduz FILE_NOT_FOUND para CAREER_NOT_FOUND.
3. Cada save atômico fazia mkdir do tmp, exists antes de read do tmp, exists
   repetidos do destino/remove, mkdir antes de rename, read+parse completo depois
   do rename e exists do tmp já movido. A M3.6 preserva serialize → tmp → releitura
   byte a byte → backup quando devido → replace → rename, mas reutiliza fatos já
   conhecidos e remove a releitura/parse final redundante. Não houve paralelização.
4. `CareerRepository.initialize` e `MatchCheckpointRepository.initialize`
   repetiam mkdir em chamadas quentes. A inicialização agora é idempotente e
   compartilha a Promise em andamento.
5. Missions executava `Mission.bulkUpdate` em toda montagem se o objeto ainda
   tivesse aliases legados, mesmo com campos normalizados idênticos. Agora gera
   patches apenas para diferenças reais e elimina a releitura imediata de
   MissionProgress, mesclando os registros retornados pela sincronização.
6. Shell, Matches, modal e banners podiam ler simultaneamente o mesmo arquivo de
   checkpoint. `MatchCheckpointRepository` agora mantém cache por carreira,
   atualiza-o em save/clear, compartilha a fila já existente e devolve clones.

Não foi criado debounce de save, transação global nem paralelização de estágios:
essas alternativas poderiam mudar ordem, expor estado parcial ou perder um
checkpoint. As gravações completas ainda são serializadas pela mesma writeChain.

## Benchmark local determinístico — Top Storage Operations

O benchmark usa o mesmo payload e protocolo M3.5/M3.6 em filesystem de memória.
Tempos sub-milisegundo não representam Android físico; contagens e ordem são
determinísticas. Há menos de 20 grupos distintos no caso isolado, então a lista
“Top 20” contém todas as operações existentes.

### Antes (modelo M3.5): 12 calls, 2 reads, 1 write

| # | operação/chave | caller | n |
|---:|---|---|---:|
| 1 | mkdir `temp` | temp-write:parent | 1 |
| 2 | write `temp/<save>-<timestamp>.tmp.json` | temp-write | 1 |
| 3 | exists tmp | temp-verify:preflight | 1 |
| 4 | read tmp | temp-verify | 1 |
| 5 | exists `careers/<id>.json` | destination-exists | 1 |
| 6 | exists `careers/<id>.json` | replace-remove:preflight | 1 |
| 7 | remove `careers/<id>.json` | replace-remove | 1 |
| 8 | mkdir `careers` | rename:parent | 1 |
| 9 | rename tmp → career | rename | 1 |
| 10 | exists career | final-verify:preflight | 1 |
| 11 | read career | final-verify | 1 |
| 12 | exists tmp | temp-cleanup-exists | 1 |

### Depois (M3.6): 6 entradas, sendo 5 IPCs + 1 stringify; 1 read, 1 write

| # | operação/chave | caller | n |
|---:|---|---|---:|
| 1 | stringify `careers/<id>.json` | origem lógica da mutação | 1 |
| 2 | write `temp/<save>-<timestamp>.tmp.json` | temp-write | 1 |
| 3 | read tmp | temp-verify | 1 |
| 4 | exists `careers/<id>.json` | destination-exists | 1 |
| 5 | remove `careers/<id>.json` | replace-remove | 1 |
| 6 | rename tmp → career | atomic-rename | 1 |

Redução local: calls 12 → 6 (-50% contando stringify como operação), IPCs 12 →
5 (-58,3%), reads 2 → 1 (-50%), writes 1 → 1 (sem perda de persistência).
`readJsonIfExists` foi reduzido de três exists + um read para um exists + um read.

## Navegação e cache

Teste: Home → Missions → Home → Matches → Home, usando a carreira ativa já
hidratada.

- save principal: 0 reads físicos, 0 writes;
- aliases de Missions já normalizados: 0 writes;
- três consumidores do checkpoint ausente: 1 consulta física total;
- consultas repetidas de entidade: cache hit observado;
- o APK físico exibirá o hit rate acumulado no overlay.

## Advance-day: CPU x Storage

O `createStageProfiler` preserva `stages[name]` (wall time compatível com M3.5)
e adiciona `stageDetails[name]` com `wallMs`, `cpuMs`, `storageMs`, calls,
reads/writes e bytes. O overlay mostra `wall (CPU / I/O)` por estágio.

Baseline físico fornecido antes da M3.6:

| estágio | antes |
|---|---:|
| advance-day total | 7.451–14.501 ms |
| circuitLife | até 14.459 ms |
| livingWorld | ~5.310 ms |
| world | ~4.844 ms |
| partner | ~2.928 ms |
| medical | ~2.406 ms |
| staff | ~2.356 ms |
| relationships | ~2.168 ms |
| persist | ~2.287–3.206 ms |

O “depois” físico não pode ser obtido no host de build. Ele será preenchido pelo
mesmo roteiro no aparelho com este APK; o novo breakdown separará diretamente a
parcela de I/O, sem inferir nem fabricar números.

## Integridade e recovery

- payload final antes/depois: deep-equal;
- corrupção injetada no tmp: gravação rejeitada, save original preservado e tmp
  removido best-effort;
- atomicidade/rollback de advance-day: suíte existente aprovada;
- checkpoint treino/torneio, retomada, clear e corrupção: suítes existentes
  aprovadas;
- cache de checkpoint: clone defensivo, save atualiza e clear invalida;
- engine M3.5: placar e narração idênticos para lotes 1/2/5/10.

## Roteiro físico pós-M3.6

1. Ativar Performance em Configurações (ou manter `?perfdebug=1` no ambiente web).
2. Zerar contadores no overlay.
3. Executar Home → Missions → Home → Matches → Home.
4. Registrar Top Storage Operations, reads/writes, tempo, bytes e cache hit rate.
5. Zerar contadores, avançar um dia e registrar cada estágio CPU/I/O.
6. Repetir exatamente as medições M3.5 de FPS/frame em Home, Missions e Matches.

## Build e APK

- `npm run lint`: PASS;
- `npm run typecheck`: FAIL no débito global preexistente do projeto (erros de
  props/tipagem espalhados por componentes e testes; nenhum erro novo nos novos
  arquivos `storageIOProbe.js`/teste M3.6);
- `npm run build`: PASS, 3.990 módulos;
- `npm run test:mobile-performance-device`: PASS, 43 gates;
- `npm run test:mobile-storage-m3-6`: PASS, 15 gates;
- `npm run android:build`: PASS, APK universal + AAB;
- `apksigner verify`: PASS (v2/v3, Android Debug);
- `zipalign -c 4`: PASS.

APK assinado:
`C:\Padel-Legacy-New\src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release-signed.apk`

- tamanho: 53.438.416 bytes;
- SHA-256: `DD8C0E8EC2C00E857BEA9847A047C90CAAFAA236C7F2829C22B81C5B786FCAD3`;
- pacote: `com.padellegacy.game`;
- versão: `0.9.0` (`versionCode=9000`).
