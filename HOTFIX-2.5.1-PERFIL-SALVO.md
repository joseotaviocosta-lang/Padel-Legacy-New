# Hotfix 2.5.1 — carregamento de perfil salvo

## Problema

Ao abrir uma carreira já existente, `ensureMyProfile()` pesquisava apenas por
`created_by_id`. Saves antigos não possuíam esse campo, então o fluxo tentava
criar um segundo jogador. O adapter recusava a duplicação e a interface exibia
“Não foi possível carregar seu perfil”.

Também havia possibilidade de duas gravações simultâneas do mesmo save
interferirem na criação do backup.

## Correções

- Busca alternativa pelo único PlayerProfile da carreira ativa.
- Reparação automática de `created_by_id` em saves antigos.
- Criação de PlayerProfile idempotente: perfil existente é reutilizado.
- Serialização de gravações por caminho no `GameStorage`.
- Registro independente do teste de migração.
- Teste `window.PadelProfileHotfixTest.run()`.
