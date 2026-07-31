# Arquitetura consolidada — Sprint 2.5

## Pastas principais

- `src/careers`: ciclo de vida, validação, migração e seleção de carreiras.
- `src/storage`: acesso ao sistema de arquivos, backups e persistência Tauri.
- `src/gameplay/adapters`: compatibilidade entre a API de entidades e os repositórios.
- `src/gameplay/repositories`: leitura e escrita do estado persistente da carreira.
- `src/gameplay/services`: objetos compartilhados e coordenação do estado.
- `src/gameplay/config`: feature flags e configuração do domínio.
- `src/gameplay/tests`: testes de integração executáveis no DevTools.
- `src/game-core`: regras e sistemas de jogo existentes; será a base da Sprint 3.
- `src/pages` e `src/components`: interface do usuário.

## Fluxo persistente

`localBase44Client` → adapter → repository → carreira ativa → armazenamento Tauri.

`PlayerProfile` usa `PlayerAdapter`. As demais entidades usam `EntityAdapter` e
`CareerEntityRepository`. A entidade `User` permanece local e global apenas para
autenticação offline.

## Compatibilidade

Os arquivos antigos diretamente em `src/gameplay/*.js` são pequenos pontos de
reexportação. Eles evitam quebrar imports externos, mas não contêm implementação.
Código novo deve importar de `@/gameplay` ou das subpastas canônicas.
