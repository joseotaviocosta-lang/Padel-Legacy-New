# Sistema de treinos v2

## Auditoria anterior

O catálogo anterior continha 16 cards. Sete técnicos treinavam um atributo isolado; três físicos convergiam para `agility`, três táticos para `strategy` e três mentais para `emotional_control`. Assim, nove opções tinham diferenças principalmente nominais. O ganho era arredondado em cada sessão, aplicado integralmente a um atributo e o histórico não representava progresso multiatributo. O plano semanal e o calendário armazenavam IDs antigos.

## Modelo atual

A fonte única de verdade é `trainingCatalog.js`: quatro grupos, 15 focos e três intensidades. Somente os dez atributos efetivamente consumidos pelo motor são treináveis. Conceitos sem atributo próprio, como potência, devolução e consistência, são expressos por combinações ponderadas de atributos reais, sem promessas decorativas.

- Quadra: golpes de fundo; controle de rede; golpes aéreos; definição; defesa e transição; saque e devolução.
- Físico: condicionamento; agilidade; potência.
- Mental: concentração; confiança; controle de pressão.
- Tático de dupla: entrosamento; posicionamento; estratégia.
- Intensidades: leve, normal (`moderado`, preservado como ID compatível) e intensa.

## Evolução

Cada sessão calcula um orçamento único e o distribui pelos pesos primários e secundários. A fórmula considera intensidade, nível ponderado atual, fadiga, potencial, idade, repetição, afinidade de estilo, clube e treinador. Afinidade melhora eficiência em 8%, mas nunca bloqueia um foco. O progresso fracionado fica em `attribute_progress`; ao alcançar 1, o atributo sobe e o excedente permanece.

Retornos por repetição na semana: 100%, 82%, 66% e 50% a partir da quarta sessão. A intensidade intensa entrega 28% mais orçamento-base, porém custa 18 de energia, 24 de fadiga e risco-base de 5%. Energia é validada antes da execução e nunca fica negativa.

## Compatibilidade

A migração de carreira v12 converte sessões, calendário e plano semanal por meio de aliases, preservando ganhos, energia já gasta, atributos e histórico. A normalização é idempotente. Novas sessões registram grupo, foco, intensidade, progresso por atributo, condições anterior/posterior, treinador e parceiro.
