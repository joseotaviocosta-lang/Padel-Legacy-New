# Criação estratégica do atleta

## Auditoria anterior

O sistema oferecia quatro presets rígidos: direita aceitava somente `controle` e `defensivo`; esquerda aceitava somente `agressivo` e `tecnico`. A mão dominante e a função tática não existiam na criação. O clique no estilo aplicava imediatamente três atributos em 15 e os sete restantes em 10, sem comparação ou confirmação.

O motor já separava parcialmente intenção e execução: tendências e estilo alteravam pesos de escolha de golpe, enquanto atributos determinavam a habilidade do golpe. Essa separação foi preservada e ampliada.

## Eixos independentes

- mão dominante: destro ou canhoto;
- lado preferencial: direita, esquerda ou versátil;
- estilo: controle, ofensivo, defensivo, equilibrado, contra-atacador, construtor ou finalizador;
- função derivada: controlador, pressionador, defensor, coringa, construtor ou finalizador;
- arquétipo: resultado identificável da combinação, com efeito nas tendências, recomendações e compatibilidade.

As 42 combinações são permitidas. Afinidade usa as classificações Excelente, Muito boa, Boa, Exigente e Especializada; nunca funciona como bloqueio.

## Atributos e orçamento

O projeto mantém os dez atributos já consumidos pelo motor: saque, forehand, backhand, voleio, bandeja, smash, defesa, agilidade, estratégia e controle emocional. Eles continuam organizáveis conceitualmente entre técnicos, físicos, táticos e mentais sem criar campos redundantes que o motor não utilizaria.

Todos os presets usam a mesma curva `15, 14, 13, 12, 11, 11, 10, 10, 10, 9`, totalizando 115 pontos. Cada estilo muda a ordem da curva e mantém pelo menos três forças e uma fraqueza. Modificadores de mão/lado transferem pontos, nunca aumentam o orçamento.

O canhoto finalizador ou ofensivo pela direita recebe ângulos ofensivos, maior smash e tendência de rede, mas mantém defesa inicial inferior. Não existe regra por nome nem bônus direto no resultado.

## Motor e dupla

`DecisionEngine` reconhece ofensivo/finalizador, controle/construtor e contra-ataque como preferências de decisão. A qualidade continua vindo dos atributos. `playerModel` preserva lado, mão e função do atleta em vez de inferir tudo pela ordem da dupla.

A compatibilidade considera lado, adaptação, função, mão e nível. Funções complementares recebem melhor leitura; dois finalizadores alertam sobre falta de construção e dois controladores sobre falta de definição.

## Interface e progressão

O tutorial agora seleciona mão e lado separadamente, apresenta todos os estilos e só persiste após um resumo com arquétipo, afinidade, dificuldade, forças, fraquezas e os dez atributos. Antes da confirmação, qualquer estilo pode ser comparado. Depois, os atributos continuam evoluindo livremente; o preset não cria teto.

O primeiro treino recomendado usa `recommended_training_attributes` do perfil escolhido. Bots usam o mesmo vocabulário de estilos, funções e arquétipos, incluindo canhotos ofensivos de direita e esquerdas defensivos.

## Migração

O schema v11 adiciona mão segura, função e arquétipo sem redistribuir atributos existentes. Estilos antigos são mapeados (`agressivo → ofensivo`, `tecnico → construtor`), lado e evolução são preservados e a migração é idempotente. `handedness_inferred` indica quando foi necessário aplicar o padrão seguro destro.
