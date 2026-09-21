# Verificação visual — diagnóstico inicial

Data da verificação: 2026-09-06.

| Ambiente | Resultado observado |
|---|---|
| Desktop 1280×720 | A primeira questão apresentou o rótulo **Avaliação inicial**, a numeração `001`, o indicador de diagnóstico `0 de 100 concluídas` e o fluxo de alternativas sem revelar metadados internos. |
| Celular 375×812 | O cabeçalho, a barra de progresso, o enunciado e as alternativas permaneceram legíveis e alcançáveis sem sobreposição no primeiro viewport. |
| Escolha de modo, desktop 1280×720 | O painel pós-diagnóstico apresentou os cartões Simulado e Tutor lado a lado, com contraste, hierarquia e ações claramente distintas. |
| Escolha de modo, celular 375×812 | Os cartões empilharam em uma coluna, mantiveram leitura e área de toque adequadas e conservaram as duas opções visíveis na página completa. |
| Simulado e Tutor ativos, celular 375×812 | Cada percurso apresentou o rótulo de modalidade no cabeçalho e retirou o progresso do diagnóstico, preservando o enunciado, alternativas e controle de resposta. |
| Runtime normal, escolha de modo em desktop | Uma conta temporária que concluiu 100 respostas diagnósticas exibiu a tela “Defina seu próximo percurso” sem parâmetros de preview ou alteração manual de estado. |
| Runtime normal, Simulado ativo em desktop | Uma conta temporária que selecionou Simulado exibiu a questão 001, o rótulo “Modo Simulado”, alternativas e submissão, sem barra do diagnóstico. |
| Runtime normal, Tutor ativo em desktop | Uma conta temporária que selecionou Tutor exibiu a questão 101, o rótulo “Modo Tutor”, alternativas e submissão, confirmando a continuidade após o diagnóstico sem matriz fixa. |
| Runtime normal, escolha de modo end-to-end | O percurso completo de cadastro, 100 respostas e liberação exibiu a escolha de modalidade em desktop e celular, sem semeadura direta de progresso. |
| Runtime normal, Simulado após escolha | O percurso integral de uma conta temporária alcançou a questão 001 com o rótulo “Modo Simulado”, alternativas e controle de envio. A captura foi feita após a transição real da interface. |
| Runtime normal, Tutor após escolha | Um segundo percurso integral independente alcançou a questão 101 com o rótulo “Modo Tutor”, alternativas e controle de envio. A captura foi feita após a seleção real na tela. |
| Simulado, celular 375 px | A questão 001 mantém o rótulo de modalidade, enunciado, alternativas e o botão de envio com leitura vertical e área de toque adequada. |
| Tutor, celular 375 px | A questão 101 mantém o rótulo de modalidade, alternativas e o botão de envio sem indicador de diagnóstico, preservando a leitura de enunciado mais longo. |
| Escolha de modalidade, celular 375 px | O percurso concluído apresenta os cartões Simulado e Tutor em sequência vertical, com títulos, descrições e áreas de seleção legíveis e alcançáveis. |
| Avaliação de marco, desktop | A resposta 100 exibiu a avaliação diagnóstica, o resumo auditável, a tabela de prontidão e o botão “Escolher modalidade” no rodapé, todos gerados no fluxo normal da interface. |
| Avaliação de marco, celular 375 px | O relatório longo preserva leitura vertical e a ação “Escolher modalidade” permanece disponível ao final da página, sem sobreposição ou perda de conteúdo. |

As verificações foram realizadas com uma conta de validação. Nenhuma resposta foi submetida como parte da inspeção visual.
