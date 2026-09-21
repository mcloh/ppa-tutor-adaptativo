# Validação de Produção PagBank — Connect e Allowlist

## Estado verificado em 10 de setembro de 2026

A URL pública do Connect Token Challenge do PPA respondeu `HTTP 200` no domínio publicado, com `Content-Type: application/json`, `Cache-Control: no-store` e somente os campos `public_key` e `created_at`. A chave privada não foi exposta.

A sonda autenticada de produção consultou apenas um identificador de checkout inexistente (`CHEC_PPA_AUTH_PROBE`). A operação não criou checkout, pedido, cobrança ou crédito. O PagBank respondeu `HTTP 403` com os campos públicos abaixo:

```json
{
  "error": "allowlist_access_required",
  "description": "Allowlist access required. Contact PagBank."
}
```

O resultado indica que a solicitação alcança a API com a credencial configurada, porém a conta ou aplicação ainda não possui liberação de allowlist para o endpoint de Checkout em produção. Não há evidência, nesta sonda, de necessidade de substituir o token.

## Reteste posterior

Após a confirmação de publicação da aplicação e a validação pública contínua da URL Connect, a mesma sonda `GET` somente leitura foi repetida contra um identificador de checkout inexistente. O resultado permaneceu `HTTP 403` com `allowlist_access_required`. Nenhum checkout, pedido, cobrança ou crédito foi criado. O estado é consistente com a homologação PagBank ainda em andamento e não altera o bloqueio de produção comercial.

## Referências oficiais

1. [Connect Challenge — PagBank Developers](https://developer.pagbank.com.br/docs/connect-challenge): o endpoint público deve servir a chave pública e a data de criação; em produção, o cadastro da URL é realizado na conta PagBank.
2. [Erro `allowlist_access_required` — Comunidade PagBank](https://developer.pagbank.com.br/discuss/6a65c3a621b9dcb3e544c492): a orientação do time de integrações é abrir a solicitação de homologação/liberação para uso do endpoint de Checkout em produção.
3. [Obter access token — PagBank Developers](https://developer.pagbank.com.br/reference/obter-access-token): descreve o fluxo Connect e o challenge para criação de certificado; esse fluxo não substitui a liberação de allowlist do Checkout.

## Próximo passo seguro

Solicitar ao PagBank a liberação de allowlist para o endpoint `/checkouts` em produção, informando que a URL pública Connect já está disponível e validada. Após a confirmação formal de liberação, repetir a mesma sonda somente leitura antes de habilitar qualquer checkout comercial.
