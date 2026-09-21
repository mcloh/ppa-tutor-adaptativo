# Pesquisa de posicionamento e integração PagBank

## Referência concorrente

A página de créditos da Simulados ANAC consultada em 04 de setembro de 2026 apresenta R$ 47 por 10 simulados, R$ 77 por 50 e R$ 97 por 100, além de acesso às provas realizadas e bônus no plano Master. Fonte: <https://simuladosanac.com/creditos>.

O catálogo previsto para o PPA usa 100 questões como um simulado: 100 questões gratuitas na fase experimental; 100 por R$ 4,90; 500 por R$ 14,90; 1.000 por R$ 24,90; e 3.000 por R$ 44,90. O pacote de 3.000 equivale a 30 simulados e aproximadamente R$ 1,50 por simulado.

## PagBank

A implementação recomendada é checkout hospedado: o servidor cria o checkout, recebe a URL `PAY` e redireciona o aluno para o ambiente PagBank. A confirmação deve ocorrer somente por webhook autenticado; a URL de retorno não libera créditos. O PagBank documenta `notification_urls`, webhooks para estados como `PAID`, `IN_ANALYSIS`, `DECLINED`, `CANCELED` e `WAITING`, e confirmação de autenticidade via SHA-256. Fontes oficiais: <https://developer.pagbank.com.br/docs/checkout>, <https://developer.pagbank.com.br/reference/webhooks-checkout> e <https://developer.pagbank.com.br/reference/webhooks>.

Para a primeira versão, manter os valores em centavos exclusivamente no servidor, criar um pedido com `reference_id` próprio, registrar cada notificação recebida e aplicar um lançamento de crédito apenas uma vez para cada transação confirmada. O checkout de homologação deve ser validado antes de qualquer ativação em produção.

### Doutrina de dupla verificação

O webhook é tratado como um sinal de que o estado pode ter mudado, não como fonte financeira autossuficiente. Quando a assinatura `x-authenticity-token` é válida, o evento segue o processamento normal. Quando a assinatura está ausente, malformada ou divergente, o aplicativo só admite reconciliação se os cabeçalhos identificarem um pedido `ORDE_...`; o servidor então realiza `GET /orders/{order_id}` com o token guardado no cofre e valida, contra o pedido interno, a referência PPA, o pacote, o valor em centavos e o status. Apenas essa resposta TLS autenticada pode alimentar a transação idempotente de pedido, tentativa, ledger e saldo. O corpo não autenticado não atualiza dados financeiros por si só. Em eventos sem identificador `ORDER` válido, a aplicação responde tecnicamente e não processa nem consulta nada.

Essa confirmação independente é usada como defesa em profundidade também em produção. A assinatura continua sendo verificada e registrada; a reconciliação não elimina a exigência de validação do pedido e do ledger idempotente.

O PagBank documenta `GET /orders/{order_id}` com `Authorization: Bearer <token>` para consultar um `ORDE_...`, e o retorno contém referência, itens e cobranças. A reconciliação compara esses campos com o pedido PPA antes de usar o fluxo transacional já idempotente. Essa escolha permite comprovar a integração em Sandbox quando o header de assinatura estiver ausente, mas não reduz a validação de eventos assinados em produção.[5] [6]

## Procedimento Sandbox aprovado

O primeiro ambiente de integração será exclusivamente o Sandbox PagBank. O servidor criará cada checkout com `reference_id` próprio, `notification_urls` apontando para o endpoint autenticado do aplicativo e `redirect_url` exclusivamente informativa. A aplicação obterá o link cujo `rel` é `PAY` e apenas redirecionará o aluno; o retorno do navegador não altera pedido, saldo ou ledger.

O webhook receberá o corpo bruto, calculará SHA-256 sobre a concatenação `{token}-{payload-bruto}` e comparará o resultado, em tempo constante, com o cabeçalho `x-authenticity-token`. Eventos com assinatura inválida serão descartados. Para uma transação `PAID` válida, o servidor confirmará o pedido, registrará a tentativa e inserirá exatamente um lançamento de crédito na transação do banco; entregas repetidas do mesmo evento não poderão gerar créditos adicionais. O token de conta do Sandbox será armazenado apenas como segredo do servidor.

### Observação de homologação — setembro de 2026

O reenvio real do PagBank Sandbox chegou ao endpoint com `Content-Type: application/json` e corpo não vazio, mas sem o cabeçalho `x-authenticity-token`; por isso a verificação SHA-256 respondeu HTTP 401. A documentação oficial exige essa assinatura e determina descartar notificações que não coincidam. Há discussões técnicas recentes no portal do PagBank sobre o mesmo cabeçalho ausente no Sandbox. Durante o desenvolvimento, esse caso específico passa a receber HTTP 202 apenas para cessar a retentativa do Sandbox, sem criar tentativa, mudar pedido ou lançar crédito. Em produção, a ausência de assinatura permanece HTTP 401. A compensação será reconhecida somente com notificação autenticada ou orientação oficial equivalente do PagBank.

### Incorporação do checkout — setembro de 2026

Uma inspeção do link hospedado efetivamente retornado pelo PagBank Sandbox identificou `X-Frame-Options: SAMEORIGIN` e a diretiva `Content-Security-Policy` `frame-ancestors 'self'`. Assim, o navegador bloqueará o carregamento do checkout dentro de um `iframe` do PPA, que tem outra origem. Essa proteção pertence ao PagBank e não pode ser relaxada pelo aplicativo. A alternativa segura é um módulo sobreposto PPA, com fundo sombreado, que explica a transição e abre o checkout em uma nova aba controlada; ao receber o retorno para o PPA, o módulo mostra o status informativo e permite fechamento, sem liberar créditos pelo retorno.

### Papéis e domínio de homologação — setembro de 2026

O controle de acesso separa três papéis: `user` para alunos comuns, `admin` para governança da plataforma e `homologation` para a conta técnica fornecida ao PagBank. A conta de homologação não recebe os procedimentos administrativos de cache, catálogo ou governança; ela pode somente abrir o checkout Sandbox quando a chave explícita `PAGBANK_HOMOLOGATION_MODE=sandbox` estiver configurada. O administrador permanece sem acesso ao checkout Sandbox por padrão, preservando a separação de deveres.

O domínio estável `https://ppa.simulados.apia.app.br` pode hospedar o fluxo de homologação usando `/api/webhooks/pagbank/sandbox`. A futura produção deverá usar rota e credenciais distintas, como `/api/webhooks/pagbank/production`, e não poderá ser ativada por essa chave de homologação.

### Retorno formal do PagBank — chamado 1442328681

Em 8 de setembro de 2026, a triagem do PagBank informou que o anexo com exemplos redigidos não é suficiente para a homologação. O provedor solicitou **logs JSON de request e response de testes reais no Sandbox** para cada recurso utilizado. A resposta não autoriza produção nem altera a regra de dupla verificação.

Para atender ao chamado com segurança, o PPA mantém uma auditoria exclusiva da conta com papel `homologation`. Cada ciclo registra criação de checkout, abertura do link hospedado, retorno ao PPA, webhook, consulta autenticada do pedido, reconciliação e liquidação idempotente de créditos. A exportação controlada preserva o URL literal do `PAY` e a evidência de cada etapa, pois o PagBank pode exigir reprodução do checkout. O URL não é exibido em tela nem entra em logs de aplicação ou documentação. Nomes, e-mails, telefones, documentos, endereço e campos de cartão são mascarados parcialmente; tokens, senhas, CVV, cabeçalhos de autorização e códigos de autorização são removidos. A exportação JSON só pode ser requisitada pela própria conta de homologação.

Em 9 de setembro de 2026, uma exportação acumulada confirmou eventos de retorno, webhook, consulta autenticada e liquidação para um ciclo homologado recente. O arquivo também continha registros históricos gerados antes da persistência literal do `PAY`; nesses eventos, o URL ainda aparece como estrutura redigida com hash. A presença do aviso atualizado no arquivo não reconstitui valores suprimidos em registros anteriores. Assim, a evidência definitiva para o PagBank requer um **novo checkout** iniciado após a disponibilização da versão que persiste o `PAY` literal.

O próximo teste deve ser iniciado pela conta técnica de homologação, no ambiente Sandbox, criando um novo checkout. Após a resposta do PagBank e a reconciliação, a conta poderá exportar o JSON sanitizado na seção técnica da página de planos. A evidência deve ser revisada pelo responsável antes de ser anexada ao chamado. Nenhuma credencial deve ser enviada por e-mail ou incluída no anexo.

Em 8 de setembro de 2026, esse ciclo foi executado com êxito pela conta de homologação: criação de checkout, reconciliação autenticada, processamento idempotente do webhook e pagamento Sandbox foram registrados. A evidência foi exportada pela conta técnica e encaminhada pelo responsável ao PagBank. O próximo passo é exclusivamente externo: aguardar o parecer formal do provedor. O ambiente de produção continua desativado.

### Análise interna final do PagBank — 9 de setembro de 2026

O PagBank confirmou o recebimento da evidência e informou que a solicitação entrou em análise interna final antes da habilitação de produção, com previsão de retorno pelo mesmo chamado em até quatro dias úteis. Esse aviso **não é aprovação para produção**. Até a manifestação formal de habilitação, o PPA manterá: (a) o checkout limitado ao Sandbox e ao papel `homologation`; (b) a chave de homologação sem efeito sobre rotas ou credenciais de produção; (c) a auditoria técnica separada das operações de alunos e administradores; e (d) a doutrina de consulta autenticada e liquidação idempotente inalterada.

Após a aprovação formal, a transição deve ocorrer em uma mudança independente e revisável: credenciais de produção em segredos novos, rota de webhook exclusiva, validação de assinatura de produção, teste controlado de criação/consulta de pedido e confirmação explícita do responsável antes de qualquer publicação. A habilitação não será inferida apenas do prazo informado pelo PagBank.

O PagBank disponibiliza ambiente Sandbox, cartões de teste e simulador de transações antes da homologação da integração.[1] A documentação informa que o checkout retorna um link `PAY` para redirecionamento e que as notificações de mudanças de transação são enviadas por `POST` às URLs declaradas.[2] [3] A validação de autenticidade usa o token da conta e o payload não formatado, comparados com o cabeçalho `x-authenticity-token` via SHA-256.[4]

As credenciais de Sandbox foram fornecidas visualmente pelo titular. O valor sensível não é transcrito nesta documentação nem será incluído em código, logs, capturas ou checkpoints; sua única destinação será o armazenamento seguro de segredos do projeto.

A inspeção técnica da imagem confirmou a identificação de ambiente de testes e a presença do campo de credencial Sandbox. Nenhum identificador pessoal ou token é preservado nos artefatos de projeto.

A faixa de credencial foi conferida em recortes sobrepostos, com o valor encaminhado somente ao armazenamento seguro de segredos. A verificação não gerou cópias de credenciais em documentação, testes ou código-fonte.

A leitura visual foi concluída em todos os recortes ordenados, incluindo as regiões de sobreposição. O token conferido não permanece nos arquivos intermediários do projeto e será utilizado somente na configuração segura de Sandbox.

## Referências

[1]: https://developer.pagbank.com.br/devpagbank/reference/primeiros-passos "Primeiros passos — PagBank"
[2]: https://developer.pagbank.com.br/docs/checkout "Checkout e Link de Pagamento — PagBank"
[3]: https://developer.pagbank.com.br/reference/webhooks-checkout "Webhooks — PagBank"
[4]: https://developer.pagbank.com.br/devpagbank/reference/confirmar-autenticidade-da-notificacao "Confirmar autenticidade da notificação — PagBank"
[5]: https://developer.pagbank.com.br/reference/consultar-pedido "Consultar pedido — PagBank"
[6]: https://developer.pagbank.com.br/docs/solicitar-homologacao "Solicitar homologação — PagBank"
