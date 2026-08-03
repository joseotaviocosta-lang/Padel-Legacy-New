# Correção de torneios, eventos mundiais e mercado

## Causas raiz

### IDs duplicados

`buildSeasonTournaments` já produzia IDs determinísticos com ano, cidade, tier, semana e slot. As colisões observadas (`tournament-2027-nai-sil-w02-1`, `tournament-2027-riy-gol-w02-2` e semelhantes) eram duas cópias da mesma edição, não eventos legítimos diferentes.

Duas chamadas concorrentes de `ensureFutureTournaments` liam o mesmo snapshot e ambas executavam `create`. O repositório não rejeitava um ID explícito já existente e cada operação era persistida separadamente. `Tournaments.jsx` recebia, portanto, dados realmente duplicados; `key={t.id}` apenas expunha a corrupção.

### Timeout de eventos mundiais

`ensureWorldEvents` podia criar 15 registros via `bulkCreate`, mas o antigo `bulkCreate` chamava `create` item a item. Cada item regravava a carreira, backup e índice. Chamadas simultâneas também podiam gerar dois lotes após ler o mesmo estado vazio.

### Timeout do mercado mundial

Na primeira abertura, o mercado criava os bots sequencialmente e depois atualizava cada atleta. Mesmo `Promise.all` era serializado pela fila de escrita do save. O timeout media essa execução/persistência pesada, não a importação do módulo.

## Estratégia aplicada

- IDs de edições são gerados por `createTournamentEditionId`, preservando o formato atual e usando código real do circuito.
- O repositório agora rejeita `create` com ID existente.
- `bulkCreate` e `bulkUpdate` fazem uma única transação por lote.
- O calendário anual acumula todos os updates/inserts e persiste um único lote.
- Inicializações simultâneas compartilham a mesma Promise por chave e liberam retry após erro.
- Eventos mundiais e mercado não ficam mais atrás de um timeout que abandona a espera enquanto a escrita continua.
- Mercado inicial e evolução mensal usam lotes para atletas e ranking.
- Falhas auxiliares registradas por `safeModuleTask` são deduplicadas e identificadas como falha de execução, não como erro de importação.
- As páginas de Eventos e Mercado exibem erro contextual e tentativa controlada.

## Migration v7

A migration:

- cria ID determinístico para torneio sem ID;
- combina somente duplicatas com a mesma identidade lógica;
- preserva participantes, partidas, resultados, campeão e datas de conclusão;
- mantém o ID original, portanto referências existentes continuam válidas;
- quando dois eventos diferentes colidem, cria um sufixo determinístico para o segundo e atualiza referências identificáveis por nome;
- é idempotente e não apaga outras entidades da carreira.

## Integridade e testes

`validateTournamentIntegrity` verifica ID ausente/duplicado, semana, data, cidade e tier. A página impede a renderização de identidades duplicadas em vez de produzir warnings React.

Testes cobrem calendário anual, estabilidade de IDs, eventos simultâneos, detecção/reparo de duplicatas, preservação de resultados, migration repetida, referências, inicialização concorrente, recuperação após falha e quantidade de transações em lote.

## Resultados

- `npm run lint`: aprovado.
- `npm run test:career-systems`: aprovado.
- `npm run build`: aprovado, 3.773 módulos transformados.
- Vite iniciou em 583 ms.
- `/tournaments` e todos os módulos alterados responderam HTTP 200.
- Eventos mundiais: até 15 transações de criação passaram a 1 transação em lote.
- Mercado inicial: N transações de criação + N atualizações passaram a no máximo 2 transações em lote, além das leituras.

Não foi encontrado ciclo bidirecional entre Torneios, Eventos Mundiais e Mercado. Permanecem avisos globais preexistentes sobre Browserslist, bundle grande e imports mistos estáticos/dinâmicos.
