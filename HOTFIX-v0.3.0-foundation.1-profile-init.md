# Hotfix — criação inicial do perfil

## Problema corrigido

Ao criar uma carreira e navegar imediatamente para `/game`, o primeiro acesso ao
`PlayerProfile` podia falhar com:

- `Nenhuma carreira ativa encontrada`
- `Não foi possível salvar`

A carreira já estava criada e selecionada em memória, mas
`ActiveCareerAdapter.getActiveCareer({ fresh: true })` ignorava essa seleção e
consultava novamente `last_career_id`. Durante a transição de tela/bootstrap,
essa leitura podia retornar vazio e o adaptador limpava a carreira ativa.

## Alteração

Arquivo modificado:

- `src/gameplay/adapters/ActiveCareerAdapter.js`

O adaptador agora:

1. reutiliza imediatamente a carreira ativa em memória para leituras normais;
2. usa `activeCareerId` como primeira opção em leituras frescas;
3. consulta `last_career_id` apenas como fallback ao reabrir/inicializar o jogo;
4. não perde a seleção recém-criada durante a navegação para o Career Hub.

## Teste manual recomendado

1. Excluir ou arquivar uma carreira de teste antiga, se necessário.
2. Clicar em **Nova carreira**.
3. Informar nome e clicar em **Criar e jogar**.
4. Confirmar que o Career Hub abre sem os dois erros.
5. Fechar e reabrir o aplicativo.
6. Confirmar que a mesma carreira e o perfil continuam carregando.
