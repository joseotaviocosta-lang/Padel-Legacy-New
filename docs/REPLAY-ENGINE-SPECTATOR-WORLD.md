# Replay Engine — Modo Espectador do World Tour

## Diagnóstico anterior

O World Tour processava torneios encerrados em lote: selecionava atletas, determinava campeão e vice, atualizava ranking e publicava notícia. Esse fluxo não produz partidas individuais canônicas para todas as rodadas. Além disso, a chave visual reconstrói uma história legada quando `bracket_history` não existe. Esses confrontos reconstruídos não são fatos esportivos e, por segurança, nunca recebem reserva, transmissão ou replay.

## Implementação

A fase adiciona serviços independentes em `src/gameplay/replay/spectator`: avaliação determinística de importância, política de replay, replay resumido, acompanhamento por carreira, reservas, configurações, notificações, lock persistente e o orquestrador `SpectatorMatchService`.

Partidas comuns usam resultado simples. Crown Finals, partidas históricas ou reservas podem usar replay completo. O nível intermediário guarda um resumo derivado da timeline real, usando os mesmos destaques do Broadcast Engine. O orçamento semanal rebaixa excedentes de completo para resumo e de resumo para resultado.

O serviço de espectador recebe funções canônicas de simulação e persistência. Ele não contém Match Engine, ranking ou economia. O lock garante uma execução; o resultado oficial é persistido antes do replay. Uma partida já concluída nunca é simulada novamente.

## Interface

- `/world-tour/live`: jogos canônicos recomendados, razões de relevância e modo sem spoilers.
- Atletas: seguir/deixar de seguir, separado de relacionamentos.
- Torneios: acompanhar/deixar de acompanhar.
- Chave: reservar somente partidas futuras que tenham `match_id` canônico; partidas reconstruídas oferecem apenas resultado.

## Compatibilidade e limitações honestas

Saves antigos recebem os campos padrão em leitura, sem migração destrutiva nem reservas retroativas. O Scheduler atual ainda não expõe partidas individuais pré-resolução na maioria dos torneios simulados. Assim, “Assistir ao vivo” só fica disponível quando um produtor canônico fornecer `match_id`, participantes e callback oficial de persistência. Inventar uma timeline depois de campeão/placar já definidos foi deliberadamente proibido.

O próximo passo recomendado é o Sistema de Análise Tática do Replay, mantendo a mesma separação entre observação e efeitos esportivos.
