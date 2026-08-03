# Correção DevTools: Vite, CSS, Missões e jornalistas

## Causas raiz

### CSS e conexão do Vite

`src/index.css` importava `padel-inputs.css` depois das diretivas `@tailwind`. O PostCSS exige que `@import` venha antes das demais declarações (exceto `@charset` e camadas vazias). O build já registrava esse primeiro aviso real. As mensagens de HMR, WebSocket e `ERR_CONNECTION_REFUSED` eram efeitos posteriores de não haver um servidor acessível durante a tentativa de recarga, e não um defeito independente do WebSocket.

O alias `@`, a porta `5174`, `strictPort`, os caminhos Tailwind e o arquivo importado foram verificados e estão consistentes. Não havia conflito de merge, JSX acidental no CSS, import inexistente ou erro sintático em `Missions.jsx`.

### `PressJournalist` com ID `j12`

`j12` é o ID canônico de Anya Petrov em `JOURNALISTS`, dentro de `src/lib/pressData.js`. A página de imprensa só criava o catálogo quando a coleção inteira estava vazia. Saves antigos com uma coleção parcial passavam nessa verificação. Quando Anya era escolhida, a UI usava o template `j12` como fallback e depois executava `PressJournalist.update('j12', ...)`; como o template ainda não existia na coleção persistida, o repositório lançava o erro corretamente.

## Correção implementada

- O `@import` local foi movido para o início de `src/index.css`, preservando todos os estilos.
- O catálogo de jornalistas agora é reconciliado por ID ou nome em toda abertura da página de imprensa.
- Apenas jornalistas realmente ausentes são materializados; viés, quantidade de entrevistas e IDs persistidos existentes são preservados.
- Foi criado um `upsert` explícito e atômico em `CareerEntityRepository`, exposto pelo adaptador de entidades. `update` continua lançando erro para IDs inválidos, evitando esconder inconsistências.
- O schema de carreira passou da versão 4 para 5.
- A migration v5 normaliza a coleção `PressJournalist`, preserva referências canônicas recuperáveis (`j1` a `j12`) e remove somente referências órfãs não recuperáveis dos campos legados conhecidos em `metadata`, `player` e `world`.
- A migration não altera artigos históricos nem outras coleções e é idempotente.

## Testes cobertos

- Atualização de jornalista existente.
- Rejeição de `update` para jornalista ausente.
- Criação e atualização por `upsert`.
- Save v4 parcial com referência `j12`.
- Segunda execução da migration sem novas alterações.
- Preservação de entidades e metadados não relacionados.
- Reconciliação de `j12` em catálogo parcial.
- Resolução e export padrão de `Missions.jsx`.
- Build completo para validar a árvore de imports da aplicação.

## Resultados

- `npm run lint`: aprovado.
- `npm run test:career-systems`: aprovado.
- `npm run build`: aprovado; 3.771 módulos transformados.
- Vite: iniciou em `127.0.0.1:5174` em 705 ms.
- `/`: HTTP 200.
- `/src/index.css`: HTTP 200.
- `/src/pages/Missions.jsx`: HTTP 200.

O antigo aviso de ordem do `@import` não aparece mais. Permanecem avisos não bloqueantes e anteriores sobre dados do Browserslist, bundle principal grande e módulos específicos importados tanto estática quanto dinamicamente.
