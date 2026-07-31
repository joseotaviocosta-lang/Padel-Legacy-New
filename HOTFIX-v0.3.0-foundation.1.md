# Padel Legacy — Hotfix v0.3.0-foundation.1

## Objetivo

Unificar o runtime de carreira e persistência no fluxo:

`CareerProvider -> CareerManager -> CareerRepository -> GameStorage -> TauriStorage`

## Alterações implementadas

- O cliente compatível com Base44 agora usa exclusivamente os dados da carreira ativa.
- Removida a alternância de runtime por `VITE_USE_NEW_CAREER_SYSTEM`.
- `EntityAdapter` e `PlayerAdapter` não acessam mais o banco legado.
- Leituras de entidades (`list`, `filter`, `get`) não salvam o arquivo.
- Escritas de entidades passam por uma fila transacional da carreira ativa.
- O bootstrap do mundo aguarda `CareerProvider` concluir e existir carreira ativa; removido timeout fixo de 700 ms.
- A fachada `localDatabase` foi mantida apenas por compatibilidade de API, sem armazenamento próprio.
- O botão “Trocar carreira” limpa o `last_career_id` do índice oficial.
- A inicialização do `CareerManager` deixou de regravar o índice durante uma leitura normal.
- Leituras frescas da carreira não atualizam `last_played_at` nem criam backups desnecessários.

## Arquivos modificados

- `package.json`
- `src/careers/CareerManager.js`
- `src/components/system/SaveFoundationBootstrap.jsx`
- `src/gameplay/adapters/ActiveCareerAdapter.js`
- `src/gameplay/adapters/EntityAdapter.js`
- `src/gameplay/adapters/PlayerAdapter.js`
- `src/gameplay/config/featureFlags.js`
- `src/gameplay/repositories/CareerEntityRepository.js`
- `src/gameplay/repositories/GameRepository.js`
- `src/gameplay/services/GameStateBridge.js`
- `src/local/localDatabase.js`

## Validação executada neste ambiente

- Verificação de sintaxe com `node --check` em todos os arquivos JavaScript alterados: aprovada.
- Busca estática confirmou que `padel-legacy-careers.json` e `active-career-id` não são mais utilizados em `src`.

## Validação que deve ser feita no computador de desenvolvimento

O build não pôde ser executado neste ambiente porque as dependências não estavam presentes no ZIP e o registro npm interno não disponibilizou `@eslint/js`. Execute no projeto local:

```powershell
npm install
npm run build
npm run app:dev
```

Teste manual obrigatório:

1. Criar carreira.
2. Entrar na carreira.
3. Alterar algum dado do perfil ou progresso.
4. Voltar à tela de carreiras e abrir novamente.
5. Fechar completamente o aplicativo.
6. Reabrir e confirmar a persistência.
7. Duplicar, renomear e excluir uma carreira.
8. Confirmar que não aparecem “Nenhuma carreira selecionada” ou “Não foi possível salvar”.

## Observação

O `package.json` já continha o script `validate:architecture`, mas o ZIP recebido não contém `scripts/validate-architecture.mjs`. Isso é uma inconsistência anterior ao hotfix e não foi inventado um substituto sem conhecer as regras originais desse validador.
