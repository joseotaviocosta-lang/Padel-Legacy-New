# Auditoria consolidada — Fase 1F

Data: 30/07/2026

## Diagnóstico geral

O projeto já possuía os arquivos iniciais da Fase 1F (`GameRepository`, `PlayerAdapter`, `ActiveCareerAdapter`, `GameStateBridge` e `featureFlags`), mas a integração não estava concluída.

Problemas encontrados:

1. Existiam dois sistemas de carreira ativos ao mesmo tempo. A tela `src/pages/CareerManager.jsx` ainda usava o `careerManager` legado de `localDatabase.js`, enquanto o `CareerProvider` usava o novo `CareerManager` baseado em arquivos JSON.
2. O `PlayerAdapter` existia, mas nenhuma chamada comum a `base44.entities.PlayerProfile` passava por ele. Portanto, as dezenas de telas e serviços continuavam gravando no banco legado.
3. O feature flag do novo sistema não estava ativado no modo desktop.
4. O cache de `ActiveCareerAdapter` podia continuar apontando para a carreira anterior após uma troca.
5. `PlayerAdapter.create()` e `update()` faziam fallback silencioso para o armazenamento legado quando ocorria erro, o que poderia misturar dados de duas carreiras.
6. As rotas de gameplay não estavam protegidas por `ActiveCareerGuard`.
7. O `CareerProvider` não restaurava de forma confiável a última carreira ao iniciar.
8. Não havia teste específico de independência dos perfis entre duas carreiras.
9. O ZIP continha muitas cópias e diretórios de backup, dificultando identificar qual era o projeto oficial.

## Implementação realizada

- A fachada `localBase44` agora encaminha toda operação de `PlayerProfile` para `PlayerAdapter`.
- O adaptador legado foi desacoplado de `localBase44`, evitando importação circular.
- Foram removidos fallbacks silenciosos do novo sistema para o banco legado.
- Foi criado um singleton de runtime compartilhado entre contexto, bridge e adaptadores.
- O cache da carreira ativa agora é invalidado e atualizado ao trocar de carreira.
- A tela inicial passou a usar exclusivamente `CareerProvider`/`CareerManager` novos.
- O provider restaura a última carreira e sincroniza o runtime.
- As rotas internas passaram a exigir carreira ativa.
- O modo desktop ativa `VITE_USE_NEW_CAREER_SYSTEM=true`.
- Foi adicionado `window.PadelGameplayTest.run()` em desenvolvimento para validar troca de carreira sem vazamento do PlayerProfile.

## Limite desta fase

A Fase 1F migra a leitura e gravação de `PlayerProfile` para o arquivo da carreira ativa. As demais entidades ainda usam a infraestrutura local existente. A migração completa de mundo, torneios, calendário e demais coleções deve ser tratada nas fases seguintes, sem remover o sistema legado antes da validação funcional.

## Validação executada

- Verificação sintática dos módulos JavaScript da Fase 1F com `node --check`: aprovada.
- Auditoria das referências a `PlayerProfile`: todas passam pela fachada `base44`, que agora injeta `PlayerAdapter` centralmente.
- O build completo não pôde ser executado neste ambiente porque o registry interno não disponibilizou o pacote transitivo `zwitch@2.0.4`. Isso não é um erro identificado no código do projeto.

## Teste recomendado no aplicativo Tauri

Abra o console da janela Tauri em modo de desenvolvimento e execute:

```js
await window.PadelGameplayTest.run()
```

Resultado esperado:

```js
{
  success: true,
  switchedWithoutLeak: true,
  careerA: { id: 'player-a', xp: 99, ... },
  careerB: { id: 'player-b', xp: 55, ... }
}
```
