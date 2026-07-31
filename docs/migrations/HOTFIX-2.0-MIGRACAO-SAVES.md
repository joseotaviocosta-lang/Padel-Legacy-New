# Hotfix 2.0 — Migração automática de saves

## Problema corrigido

Saves criados com `save_schema_version: 1` eram submetidos à validação do schema 2 antes da migração. Isso provocava a mensagem:

`save_schema_version desconhecido: 1`

## Correção

A leitura de uma carreira agora segue esta ordem:

1. ler o JSON bruto;
2. identificar a versão;
3. migrar sequencialmente até a versão atual;
4. validar o resultado no schema atual;
5. preservar um backup do arquivo antigo;
6. gravar a versão migrada;
7. devolver a carreira pronta para uso.

A migração v1 → v2 adiciona `entities: {}` e atualiza `save_schema_version` para 2.

## Compatibilidade futura

Versões inválidas e versões futuras continuam sendo recusadas explicitamente para evitar corrupção silenciosa.
