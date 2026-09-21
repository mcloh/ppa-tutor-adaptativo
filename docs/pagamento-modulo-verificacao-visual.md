# Verificação visual — módulo de pagamento PPA

## Retorno informativo

Em 08 de setembro de 2026, o estado `checkout=sandbox` foi verificado no ambiente de desenvolvimento nas larguras de 1280 px e 375 px. Em ambos os casos, o módulo sobreposto escureceu a página de planos, preservou o padrão azul blueprint e apresentou ações visíveis de confirmação e fechamento.

O texto exibido informa que o retorno do PagBank não confirma pagamento nem libera créditos, e direciona o aluno a aguardar confirmação autenticada do servidor. Não há `iframe` no módulo. A abertura do checkout utiliza nova aba por ação explícita do usuário, pois o PagBank bloqueia incorporação entre origens.

## Pendência de homologação

A validação visual de retorno não constitui confirmação financeira. A compensação continuará dependente de evento autenticado pelo PagBank; notificações Sandbox sem `x-authenticity-token` são apenas reconhecidas tecnicamente e não processadas.
