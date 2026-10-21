# MERCADO VIVO — MARCAS, EQUIPAMENTOS E PATROCÍNIOS

> **Status: backlog de produto. NÃO é um plano de implementação autorizado.**
> Registrado na LOCAL-8E por decisão de produto. Nenhuma linha de código,
> marca, equipamento, contrato, desconto ou regra de economia foi criada ou
> alterada por este documento. A fase futura depende de autorização própria.

## 1. Intenção

Transformar Loja e Patrocínios em sistemas integrados que acompanham a
evolução da carreira. Hoje são telas praticamente independentes. A ideia é
que a relação do atleta com as marcas passe a ser um eixo de carreira: um
contrato com uma marca muda o que o atleta usa, quanto paga e o que precisa
entregar.

## 2. Visão inicial

O jogador recebe propostas de marcas, reais ou fictícias, conforme a política
de licenciamento que vier a ser adotada.

Exemplo conceitual: a marca Nox oferece patrocínio ao atleta. O contrato pode
incluir:

- pagamento fixo;
- bônus por resultados;
- raquete fornecida pela marca;
- equipamentos exclusivos;
- descontos na Loja;
- reposição periódica de equipamentos;
- benefícios conforme o ranking;
- exigência de uso dos produtos;
- objetivos esportivos;
- renovação ou rescisão.

O jogador compara propostas de marcas diferentes e escolhe pelos benefícios
financeiros, esportivos e contratuais. A Loja reconhece os contratos ativos e
aplica os benefícios correspondentes.

## 3. Evoluções candidatas

São ideias candidatas, não requisitos aprovados:

- marcas com reputação e posicionamento;
- patrocínios por categoria de equipamento;
- exclusividade contratual;
- linhas de entrada, intermediária e profissional;
- equipamentos exclusivos para atletas patrocinados;
- descontos progressivos;
- bônus por vitórias e títulos;
- recompensas por ranking;
- renovação e negociação de contratos;
- patrocínios concorrentes;
- mercado dinâmico por temporada;
- equipamentos de temporadas anteriores;
- ofertas limitadas;
- integração com a evolução e a reputação do atleta.

## 4. O que já existe hoje (inventário, sem proposta de mudança)

Levantado durante a auditoria da Loja da LOCAL-8E, apenas como ponto de
partida para a futura análise:

| Ponto | Onde | Comportamento atual |
|---|---|---|
| Ponte marca → patrocinador | `src/lib/storeCatalog.js` (`catalogItem`, `sponsor_id`) | Correspondência exata de `manufacturer` com `SPONSOR_CATALOG`; `null` para marcas sem patrocinador |
| Desconto por patrocínio | `src/lib/marketEngine.js` (`computeItemPrice`) | 15% com `sponsor_id` exato; 10% por correspondência aproximada de nome quando o item não tem `sponsor_id` |
| Catálogo de patrocinadores | `src/lib/sponsors.js` | Catálogo estático; mercado mensal em `src/lib/sportsEconomyV26.js` |
| Catálogo da Loja | `src/lib/storeCatalog.js` (`EXPANDED_ITEMS`) | Reconciliado por nome; preço escalado em `normalizeShopItem` pelo balanceamento 5.27 |
| Relíquias históricas | `src/lib/marketEngine.js` (`HISTORICAL_RARE_ITEMS`) | 10 itens "Padel Heritage", raridade `exclusivo`, sem `catalog_order` |

## 5. Como a fase futura deve começar

Antes de qualquer código, uma análise de:

1. **Design:** fluxo de propostas, comparação e escolha, e o lugar na navegação.
2. **Economia e balanceamento:** impacto de pagamentos, bônus e descontos sobre
   a progressão (Playthrough 5.26/5.27).
3. **Licenciamento de marcas:** usar marcas reais ou fictícias e qual política
   adotar.
4. **Compatibilidade de saves:** contratos e itens novos sem migração
   destrutiva. Os saves atuais podem conter cópias de colecionáveis renomeadas
   pelo defeito corrigido na LOCAL-8E; elas não devem ser tratadas como
   produto válido sem uma fase própria de recuperação.
5. **Interface:** Loja, Patrocínios e o perfil do atleta.

## 6. Restrições que valeram na LOCAL-8E

A LOCAL-8E **não**:

- criou marcas ou equipamentos;
- alterou o sistema de patrocínios;
- introduziu contratos comerciais;
- criou descontos;
- alterou a economia;
- redesenhou a Loja;
- modificou raridade ou progressão;
- adicionou bônus de equipamento;
- criou mercado dinâmico.

A correção da Loja na LOCAL-8E foi mínima: idempotência da abertura, sem
apagar, repreçar ou recriar itens. A arquitetura atual continua aberta para
essa integração futura.
