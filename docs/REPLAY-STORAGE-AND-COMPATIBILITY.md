# Armazenamento e compatibilidade de replays

Os replays são JSON legível em `AppData/replays/{careerId}/{replayId}.json`. O índice leve fica em `AppData/replays/replay-index.json`, com cópia de recuperação em `replay-index.backup.json`. Escritas usam arquivo temporário e renomeação, e operações de índice são serializadas para evitar concorrência dentro da aplicação.

Cada replay recebe checksum SHA-256 (com fallback FNV-1a em ambientes sem Web Crypto). Na leitura, schema, versão e checksum são validados. Arquivos corrompidos são marcados como tal e isolados. Versões futuras do índice são recusadas de modo explícito; saves antigos sem replay permanecem compatíveis.

Importação aceita o envelope `padel-legacy-replay` ou um replay JSON direto, sempre validado. Conteúdo importado é marcado como externo. A implementação mantém JSON sem compressão nesta versão para facilitar inspeção e migração futura.

O limite padrão é 500 MB por carreira. A limpeza automática só considera os replays comuns mais antigos; favoritos e registros históricos são preservados. Se apenas itens protegidos excederem o limite, a biblioteca informa a situação e não apaga esses itens.
