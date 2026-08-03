# Correção dos erros de DevTools: personagem, patrocinadores e missões

## Diagnóstico

### Input não controlado no editor de personagem

O editor carregava registros antigos de `CharacterCustomization` diretamente no estado. Saves criados antes da inclusão de campos como `height_cm`, `voice_pitch` e `voice_speed` podiam devolver `undefined`. O `input[type=range]` começava sem valor e, após uma edição, passava a receber um número, gerando o aviso de componente não controlado para controlado.

### Falha fatal em patrocinadores

`validateSponsorSlot` assumia que o patrocinador, todos os contratos e todos os itens consultados possuíam estrutura completa. Registros legados nulos/incompletos ou uma chamada sem patrocinador chegavam a acessos como `item.id`, interrompendo toda a tela de Economia.

### Timeout do catálogo de missões

A página executava duas sincronizações sequenciais: primeiro o catálogo do tutorial e depois uma nova listagem para as missões mensais/sazonais. A operação inteira era colocada em uma corrida de 10 segundos. Quando o prazo vencia, a Promise original continuava escrevendo em segundo plano, permitindo concorrência, releituras e tentativas duplicadas. Portanto, aumentar o timeout apenas esconderia o defeito.

## Alterações

- O carregamento do personagem agora mescla defaults com qualquer save antigo e normaliza campos numéricos e listas antes do primeiro render.
- `SliderRow` sempre recebe um número finito, inclusive durante estados intermediários.
- A validação de patrocínio rejeita de forma controlada patrocinador ausente, categoria inválida e contrato malformado.
- Contratos legados válidos são normalizados; registros impossíveis de identificar são ignorados com aviso visível.
- O catálogo de missões é obtido com uma leitura e criado em um lote único para tutorial, mensal e sazonal.
- Um lock de Promise impede sincronizações concorrentes dentro da página.
- O catálogo obrigatório não usa mais timeout que abandona a espera sem cancelar a escrita.
- Foram adicionados Error Boundaries independentes para Economia, Patrocinadores e Editor de Personagem, com fallback e tentativa de recarga local.

## Persistência e compatibilidade

Nenhuma migração destrutiva foi aplicada. A normalização ocorre na borda de leitura/renderização e mantém IDs e campos extras existentes. O catálogo continua persistido na entidade `Mission`; contratos continuam na entidade `PlayerContract`; customização continua em `CharacterCustomization`.

## Validação executada

- `npm run lint`: aprovado sem erros.
- `npm run test:career-systems`: aprovado, incluindo regressões para save antigo, patrocinador ausente, contrato nulo, categoria inválida e deduplicação de catálogo.
- `npm run build`: aprovado (3.771 módulos transformados).

O build ainda informa avisos preexistentes de ordem de `@import` no CSS, tamanho do bundle e módulos importados de forma estática e dinâmica. Eles não são causados por esta correção e não impedem a compilação.

## Arquivos principais

- `src/lib/characterCustomization.js`
- `src/pages/CharacterEditor.jsx`
- `src/components/character/CharacterShared.jsx`
- `src/lib/sponsors.js`
- `src/components/economy/SponsorPanel.jsx`
- `src/pages/Missions.jsx`
- `src/lib/missionCatalogLogic.js`
- `src/components/system/ModuleErrorBoundary.jsx`
- `src/App.jsx`
- `src/pages/Economy.jsx`
- `scripts/test-career-systems.mjs`
