# Sprint 2 — Estado global isolado por carreira

## Implementação

A camada `base44.entities` agora encaminha todas as entidades de jogo, exceto `User` e `PlayerProfile`, para o arquivo da carreira ativa quando `VITE_USE_NEW_CAREER_SYSTEM=true`.

Cada carreira possui um objeto `entities`, com coleções independentes para calendário, torneios, atletas IA, ranking, mercado, economia, histórico, notícias, relacionamentos, clubes, patrocinadores, inventário e demais entidades usadas pelo jogo.

A inicialização é preguiçosa: na primeira leitura de uma coleção, ela recebe uma cópia independente do seed local. Alterações posteriores são gravadas pelo `CareerManager`, com backup nativo.

## Compatibilidade

- PlayerProfile continua usando o PlayerAdapter da Fase 1F.
- User permanece global e somente leitura.
- O modo legado continua disponível quando a feature flag está desligada.
- Saves v1 são migrados automaticamente para schema v2 com `entities: {}`.

## Teste manual

Na janela Tauri, abra o console e execute:

```js
await window.PadelSprint2Test.run()
```

Esperado: `success: true` e `switchedWithoutLeak: true`.
