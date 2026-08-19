# Mobile M3.7.1 — Multi-day, interrupção e contador

## Causa raiz

`CalendarPage` mantinha um perfil React local e, ao clicar em +3/+7, chamava `getFreshProfile()` antes do loop. No aparelho, a tela ainda mostrava 06/01, mas o snapshot confirmado já estava em 07/01. O loop começava corretamente em 07/01, detectava Miami Cup em 08/01 antes de abrir nova transação e retornava `daysAdvanced = 0`. Em seguida a UI aplicava o perfil fresco 07/01. Visualmente parecia que o mesmo clique havia avançado 06→07 e perdido o contador, embora aquela operação tivesse feito zero commits.

O teste determinístico reproduz os dois estados separadamente (`displayedStartDate = 06/01`, `initialDate confirmado = 07/01`) e prova o precheck 0 transações/0 commits.

## Correção

- A página reconcilia a data visível com o perfil confirmado antes de iniciar e relatar o lote.
- O resultado agora separa `requestedDays`, `processedDays`, `remainingDays` e `stopReason`.
- `processedDays` é incrementado somente depois de `withPersistenceTransaction()` retornar, isto é, depois do commit físico.
- Ao terminar, o contador é conferido contra a data do snapshot confirmado. Data final e dias processados não podem divergir.
- `daysAdvanced` continua como alias de compatibilidade.
- Treinos automáticos são contabilizados somente a partir dos registros dos dias confirmados.
- O lock síncrono `advanceLockRef` continua impedindo double click.

## Regra de torneio preservada

Eventos `scheduled` com `requires_decision === true` bloqueiam o avanço antes do dia em que ocorrem. Logo:

- 06/01 + Miami em 08/01: confirma 07/01 e para; 1 dia, 1 transação, 1 commit.
- 07/01 + Miami em 08/01: para sem mudar data; 0 dias, 0 transações, 0 commits.
- Miami no dia atual: `canAdvanceDay` bloqueia a transação; 0 dias e 0 commits (a tentativa transacional faz rollback).

Nenhum bloqueador novo foi criado. Inscrições, decisões pendentes, lesões e demais regras continuam usando a política existente.

## Perfdebug

O snapshot release mostra a última operação multi-day:

- dias pedidos/processados/restantes;
- motivo da interrupção;
- transactions/physical commits;
- datas inicial, final e exibida no início;
- treinos automáticos.

## Cenários determinísticos

| Cenário | Data final | Processados | Transactions | Commits | Motivo |
|---|---:|---:|---:|---:|---|
| +1, Miami em 08/01 | 07/01 | 1 | 1 | 1 | — |
| +3, Miami em 08/01 | 07/01 | 1 | 1 | 1 | `upcomingTournament` |
| +7, Miami em 08/01 | 07/01 | 1 | 1 | 1 | `upcomingTournament` |
| +3 livre | 09/01 | 3 | 3 | 3 | — |
| +7 livre | 13/01 | 7 | 7 | 7 | — |
| Evento amanhã, início 07/01 | 07/01 | 0 | 0 | 0 | `upcomingTournament` |
| Evento hoje, início 08/01 | 08/01 | 0 | 1 rollback | 0 | `upcomingTournament` |
| Falha no commit do segundo dia | 07/01 | 1 | 2 | 1 | `transactionError` |

## Checklist físico

1. Em 06/01 com Miami em 08/01, testar +1: data 07/01, 1/1 transaction/commit.
2. Recarregar 06/01 e testar +3: processado 1, restante 2, data 07/01.
3. Recarregar 06/01 e testar +7: processado 1, restante 6, data 07/01.
4. Em 07/01 com Miami em 08/01, testar +3/+7: data permanece 07/01 e zero commit.
5. Sem compromisso na semana, testar +3 e +7: respectivamente 3/3 e 7/7 transactions/commits.
6. Conferir contador de treinos automáticos e campos multi-day no perfdebug.
7. Tocar duas vezes rapidamente: somente uma operação deve executar.

## Validação e artefatos

- `npm run lint`: aprovado.
- `npm run typecheck`: permanece bloqueado pela dívida TypeScript preexistente; nenhum erro novo foi introduzido nos arquivos novos de probe/monitor.
- `npm run build`: aprovado (3991 módulos).
- `npm run test:mobile-multi-day-m3-7-1`: 20/20 gates aprovados.
- Suítes calendar, career, missions, tournaments, registration, mobile M1–M3.7, storage M3.6, persistence M3.7 e beta readiness: aprovadas.
- `test:tournament-round-availability`: bloqueada por alteração paralela fora deste hotfix (`ensureStarterCoach is not a function`).
- Windows MSI: `C:\Padel-Legacy-New\src-tauri\target\release\bundle\msi\Padel Legacy_0.9.0_x64_en-US.msi`.
- Windows NSIS: `C:\Padel-Legacy-New\src-tauri\target\release\bundle\nsis\Padel Legacy_0.9.0_x64-setup.exe`.
- APK release assinado: `C:\Padel-Legacy-New\src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release-signed-m3-7-1.apk`.
- APK SHA-256: `6424F6BB654B9E7F4E660E8A603207358339015AE2C7D813840EDA5BD35E334F`.
- Assinatura verificada: APK Signature Scheme v2/v3, certificado Android atual.
