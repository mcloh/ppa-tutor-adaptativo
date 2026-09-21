# Rascunho — chamado técnico PagBank

## Assunto

Sandbox não envia `x-authenticity-token` em notificações de Checkout/Order — confirmação de procedimento de homologação

## Texto sugerido

Estamos em homologação da API Checkout/Order. Implementamos a confirmação de autenticidade conforme a documentação: cálculo SHA-256 de `{token}-{payload bruto}` e comparação em tempo constante com o header `x-authenticity-token`.

Nas notificações recebidas no Sandbox, o header `x-authenticity-token` não está presente. Recebemos os cabeçalhos de identificação do produto, mas não uma assinatura verificável. Por segurança, o evento de entrada não é tratado como confirmação financeira autônoma.

Como defesa adicional, adotamos reconciliação server-to-server: quando recebemos um evento de pedido sem assinatura, consultamos o pedido `ORDE_...` diretamente na API do PagBank com `Authorization: Bearer <token>`, validamos referência interna, item, valor e status, e só então aplicamos um lançamento idempotente. Em produção, a assinatura continua a ser validada e registrada; a reconciliação não substitui as verificações do pedido, do ledger e do saldo.

Solicitamos confirmação formal dos pontos abaixo:

1. Há configuração no Sandbox ou no Portal do Desenvolvedor para habilitar `x-authenticity-token` em notificações de Checkout/Order?
2. Caso essa ausência seja uma limitação esperada do Sandbox, qual é o procedimento oficial de homologação da validação criptográfica?
3. Em produção, o header é enviado para todos os webhooks transacionais da API Checkout/Order? Há exceções por produto, origem ou status?
4. A estratégia de reconciliar um `ORDE_...` via consulta autenticada ao endpoint oficial de pedidos é aceita como defesa complementar para notificações sem assinatura?

## Evidências a anexar pelo titular

Inclua a URL de notificação, o horário com fuso, o `ORDE_...` de exemplo e os headers recebidos. Não inclua token de autenticação, CPF, dados do cartão, conteúdo completo do pedido ou dados pessoais do pagador.

## Referências

| Tema | Fonte oficial |
|---|---|
| Assinatura SHA-256 e corpo bruto | https://developer.pagbank.com.br/reference/confirmar-autenticidade-da-notificacao |
| Webhooks da API Order | https://developer.pagbank.com.br/reference/webhooks |
| Consulta autenticada de pedido `ORDE_...` | https://developer.pagbank.com.br/reference/consultar-pedido |
| Homologação obrigatória | https://developer.pagbank.com.br/docs/solicitar-homologacao |
