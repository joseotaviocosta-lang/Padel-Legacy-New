# Padel Legacy — Polish Final v36.4.1

## Escopo

Primeira entrega do Polish Final, focada em consistência global sem alterar regras de gameplay.

## Alterações

- ModalShell reforçado com Portal, restauração de foco, compensação da scrollbar, fechamento por ESC e limites de viewport.
- Novo ActionFeedback para estados de processamento, sucesso, aviso e erro.
- Novo IconFrame para padronizar ícones em cards e cabeçalhos.
- Proteções globais contra overflow horizontal e scroll duplo.
- Superfícies, cards e páginas com largura mínima segura.
- Tabelas, áreas de ação fixas e containers roláveis com padrões reutilizáveis.
- Controles mobile com área de toque mínima.
- Microtransições uniformizadas e compatibilidade com reduced motion.

## Validação

Execute:

```bash
npm run test:polish-ui-v36
npm run lint
npm run typecheck
npm run build
```
