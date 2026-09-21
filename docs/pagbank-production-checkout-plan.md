# Plano técnico — homologação PagBank Produção

## Fluxo correto de Checkout hospedado

O Checkout PagBank é um fluxo de seis etapas: criar o checkout, receber o `id` e o link cujo `links[].rel` é `PAY`, redirecionar o comprador ao `PAY`, concluir o pagamento, retornar para `redirect_url` e processar as notificações de status. A documentação também confirma que `notification_urls` recebe chamadas `POST` para eventos de checkout e de transação.[[1]](https://developer.pagbank.com.br/docs/checkout) [[2]](https://developer.pagbank.com.br/reference/webhooks-checkout)

| Etapa de homologação | Evidência esperada no PPA | Política de proteção |
|---|---|---|
| Criação de checkout | Payload de produção, resposta, `CHEC_*` e link `PAY` literal | Token removido; nenhum dado de cliente no payload inicial |
| Abertura do `PAY` | Evento `checkout_opened` | URL PAY literal somente na exportação da conta homologation |
| Pagamento por cartão | Evento transacional `PAID` e `CHAR_*` | Dados de cartão, código de autorização e NSU removidos; identidade mascarada |
| Retorno | Evento `checkout_return` com referência própria | Nenhum identificador de comprador exposto na UI |
| Webhook | Evento recebido, assinatura ou reconciliação GET autenticada | Corpo não confiável nunca é usado como estado financeiro sem dupla verificação |
| Liquidação | `credit_settlement`, pedido `paid` e crédito idempotente | Livro de créditos sem atualização destrutiva |

O artefato Sandbox recebido em 9 de setembro de 2026 contém esse ciclo completo. A produção deve reproduzi-lo com URL de retorno `checkout=production` e endpoint de webhook `/api/webhooks/pagbank/production`, sem reutilizar o ambiente, token ou webhook Sandbox.

## Controles implementados antes do teste real

O PPA separa cada registro financeiro e de auditoria como `sandbox` ou `production`. O Checkout de produção aceita exclusivamente `CREDIT_CARD` para este teste e permanece inacessível ao público: ele exige o papel `homologation`, token de produção e a configuração explícita `PAGBANK_PRODUCTION_HOMOLOGATION_MODE=enabled`. Essa configuração será aplicada somente após a confirmação do responsável sobre o pacote e a cobrança de homologação.

A criação aprovada registrará o link `PAY` literal apenas no JSON exportado pela conta de homologação. A interface nunca mostrará o link, token, chave Pix, dados de cartão, códigos de autorização ou identidade do comprador. Notificações de produção seguem em endpoint próprio e, sem assinatura confiável, acionam reconciliação autenticada do pedido no ambiente correspondente antes de qualquer crédito idempotente.

## Política comercial preparada

Após a homologação concluída, o modo comercial será controlado de forma independente por `PAGBANK_PRODUCTION_COMMERCIAL_MODE=enabled` e apenas no runtime de produção. Com essa configuração, alunos autenticados podem criar Checkout hospedado de produção para os pacotes pré-pagos; visitantes são conduzidos ao cadastro ou login antes da compra. O checkout oferece cartão de crédito e Pix, conforme as opções suportadas pelo PagBank e a chave Pix já cadastrada na conta.

Cada nova conta recebe 100 créditos iniciais para o diagnóstico. Quando o modo comercial estiver ativo, uma questão exibida consome exatamente um crédito de saldo, dentro da transação que a persiste. A ausência de saldo impede a entrega da questão, e créditos comprados só são concedidos após retorno ou webhook reconciliado autenticadamente pelo servidor. A habilitação de homologação técnica é distinta e permanece desativada após o teste concluído.

## Connect Token Challenge

O Connect Challenge é uma etapa de autenticação em duas fases associada a APIs específicas, com chave pública PEM disponibilizada em endpoint `GET` e chave privada PKCS8 armazenada de modo protegido. A documentação o descreve como mecanismo para APIs que exigem esse segundo fator; ele não substitui a criação normal do Checkout hospedado nem seu link `PAY`.[[3]](https://developer.pagbank.com.br/docs/connect-challenge)

O endpoint público já registrado pelo PPA é:

```
https://ppa.simulados.apia.app.br/api/pagbank/connect/public-key
```

## Fontes

[1] [Checkout e Link de Pagamento — PagBank](https://developer.pagbank.com.br/docs/checkout)

[2] [Webhooks de Checkout — PagBank](https://developer.pagbank.com.br/reference/webhooks-checkout)

[3] [Connect Challenge — PagBank](https://developer.pagbank.com.br/docs/connect-challenge)
