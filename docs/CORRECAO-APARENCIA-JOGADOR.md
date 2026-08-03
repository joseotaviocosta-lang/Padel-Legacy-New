# Correção da aparência do jogador

## Fluxo encontrado

As opções vêm de `src/lib/characterCatalog.js`. `CharacterEditor` carrega uma entidade `CharacterCustomization` pelo `profile_id`, mantém um rascunho local único e o entrega simultaneamente aos editores e ao `CharacterPreview`. O botão de salvar usa `create` para a primeira gravação e `update` nas seguintes. A entidade fica na coleção da carreira ativa e é restaurada pelo mesmo filtro ao abrir a página novamente.

Não existem sprites ou imagens externas nessa tela: o avatar é composto por camadas CSS. Portanto, não havia assets de aparência sujeitos a 404.

## Causas raiz

- A paleta `COLORS` usa itens `{ id: '#hex', label }`, mas `ColorPicker` aplicava o objeto inteiro como valor de `background`. Isso tornava as opções de roupa, calçado, raquete e identidade visual invisíveis.
- `eye_color` e `face_type` eram selecionáveis, porém o preview não os utilizava. Vários estilos de cabelo também compartilhavam a mesma camada visual.
- A normalização anterior preenchia defaults e números, mas não validava IDs contra o catálogo nem convertia campos antigos. O próprio seed continha `hair_color` hexadecimal, `accessory`, `shirt_style` e `fist_pump`.
- Defaults duplicados em `CharacterEditor` e na biblioteca permitiam divergência.
- Uma falha de carregamento encerrava o estado `loading`, mas mantinha `customization` nulo, fazendo a tela voltar ao loading indefinidamente.

## Fluxo corrigido

1. A entidade é carregada e enviada a `normalizeCharacterCustomization`.
2. A normalização migra aliases e índices antigos, valida IDs, limita números e preenche somente campos ausentes ou inválidos.
3. Cada seleção gera um novo objeto completo por `applyCharacterCustomizationChange`; nenhuma outra categoria é apagada.
4. O preview recebe imediatamente o mesmo rascunho e renderiza cabelo, cor do cabelo, olhos, rosto, pele, corpo, roupas, acessórios e raquete.
5. O botão mostra se há alterações pendentes e persiste um payload novamente normalizado.
6. Ao recarregar, a entidade persistida é restaurada pelo `profile_id`.

## Catálogo e interface

- O catálogo existente continua sendo a fonte única; nenhuma opção fictícia foi adicionada.
- Controles agora ignoram entradas nulas, exibem a cor correta, usam IDs estáveis, `type="button"`, `aria-label`, `aria-pressed` e bloqueiam opções marcadas como indisponíveis.
- O preview expõe atributos `data-*` estáveis para testes e diagnóstico.
- Olhos, formato de rosto e estilos de cabelo agora produzem alterações visuais independentes.
- O seed local foi atualizado para os IDs canônicos atuais.

## Compatibilidade e migration

O schema da carreira passou para a versão 6. A migration:

- normaliza todas as entidades `CharacterCustomization` existentes;
- converte aliases como `hairStyle`, `hairColor`, `skinTone`, `accessory` e valores antigos como `fist_pump`;
- converte índices antigos em IDs estáveis quando possível;
- cria uma personalização canônica a partir de `player.appearance` ou `player.customization` quando a entidade ainda não existe;
- aplica fallback apenas ao campo inválido;
- preserva atributos, moedas, entidades e demais dados do jogador;
- é determinística e idempotente.

## Validação

- `npm run lint`: aprovado.
- `npm run test:career-systems`: aprovado.
- `npm run build`: aprovado, com 3.771 módulos transformados.
- Vite iniciou em `127.0.0.1:5174` em 873 ms.
- Página inicial, `CharacterEditor`, `AppearanceEditor`, `CharacterPreview` e catálogo responderam HTTP 200.
- Nenhum asset externo é usado pela composição atual, logo não há requisições de imagem quebradas nessa aba.

Os testes cobrem catálogo, opções básicas, item equipado, bloqueio, cabelo/roupa/pele sem sobrescrita, atualização do preview, normalização de saves antigos e IDs inválidos, persistência/restauração, migration repetida e preservação de dados não relacionados.

Permanecem apenas avisos globais preexistentes sobre Browserslist, tamanho do bundle e imports mistos estáticos/dinâmicos.
