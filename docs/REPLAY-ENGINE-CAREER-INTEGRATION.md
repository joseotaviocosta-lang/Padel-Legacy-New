# Replay Engine — integração com a carreira

Esta etapa conecta o Replay Engine à carreira sem alterar o Match Engine nem o resultado oficial. A partida é persistida primeiro; o replay entra depois em uma fila assíncrona e uma falha nessa fila produz apenas um aviso não bloqueante.

## Modos de visualização

Cada carreira mantém preferência própria para Texto, 2D, Pontos-chave ou Resultado rápido. É possível trocar de modo durante a partida. A preferência inicial, o último modo e a política de gravação ficam em `replays/{careerId}/preferences.json` no AppData do Tauri.

## Biblioteca

A rota protegida `/replays` lista somente os metadados da carreira ativa e carrega o JSON completo apenas ao assistir ou exportar. Busca, ordenação, favoritos, exclusão e exportação funcionam sem duplicar os eventos. Destaques guardam intervalos que apontam para o replay original.

Partidas antigas continuam válidas e mostram “Replay não disponível”. Excluir um replay nunca exclui o registro da partida.

## Diagnóstico

Em desenvolvimento, `window.PadelReplayLibraryDebug` inspeciona índice, órfãos, armazenamento e integridade. O aceite automatizado está em `window.PadelReplayCareerIntegrationTest.run()` e em `npm run test:replay-career`.
