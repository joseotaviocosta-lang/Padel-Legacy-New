# Política de replay das partidas do universo

## Classificação

- `result`: participantes, vencedor, placar e estatísticas já persistidas pelo sistema esportivo; não cria JSON de replay.
- `summary`: abertura, mudanças de placar, pontos destacados, finais de set e ponto final, sempre derivados de uma timeline real.
- `full`: timeline integral, reservada a partidas solicitadas, Crown Finals e marcos históricos.

A importância soma pesos determinísticos de categoria, fase, ranking, número 1, atleta/dupla/torneio seguido, rival, liderança, recorde e contexto histórico. Cada recomendação carrega as razões que produziram a pontuação.

## Orçamento

O padrão separa 500 MB para replays do jogador e 250 MB para o universo. Por semana, no máximo quatro replays completos e doze resumos são escolhidos automaticamente; excedentes são rebaixados. Favoritos, reservas e históricos são protegidos. A remoção automática deve começar pelos comuns mais antigos e nunca apagar silenciosamente itens protegidos.

## Concorrência e falhas

O lock persistente usa estados `processing`, `completed` e `failed`. O Scheduler ou espectador que encontrar `completed` reutiliza o resultado. Após falha visual, placar/texto continuam disponíveis e não ocorre ressimulação. Fechar o app pode reiniciar a reprodução da timeline, mas não a simulação oficial.

Notícias e botões só podem referenciar `source_match_id`, `replay_id` e `highlight_ids` existentes. Chaves reconstruídas para visualização legada não são fontes válidas.
