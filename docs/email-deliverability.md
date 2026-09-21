# Diagnóstico de entregabilidade — `apia.app.br`

**Data da verificação:** 8 de setembro de 2026.

## Evidência observada

O painel de hospedagem sinalizou erro de autenticação de e-mail e sugeriu completar o SPF com o IP de envio do servidor. A consulta pública confirmou um SPF, um DMARC de monitoramento e um DKIM no seletor `default`.

| Registro | Estado público observado | Avaliação |
|---|---|---|
| SPF em `apia.app.br` | `v=spf1 a mx include:websitewelcome.com ~all` | Preserva o host principal, o MX e o relé do provedor, mas não declara explicitamente o IP sugerido pelo próprio painel. |
| DKIM em `default._domainkey.apia.app.br` | Chave pública presente | Registro publicado; a assinatura deve ser confirmada no cabeçalho de um e-mail entregue após a correção. |
| DMARC em `_dmarc.apia.app.br` | `v=DMARC1; p=none;` | Política de monitoramento válida; não bloqueia mensagens por si só. |

## Correção mínima proposta

Antes de qualquer alteração, confirmar que não há outro serviço legítimo de envio além do servidor de hospedagem e do relé `websitewelcome.com`. Com essa condição satisfeita, instalar pelo painel o SPF sugerido, que mantém os mecanismos existentes e acrescenta o IP indicado pelo próprio servidor:

```text
v=spf1 +a +mx +ip4:162.241.203.112 +include:websitewelcome.com ~all
```

Não criar um segundo TXT SPF. A alteração deve substituir o SPF atual em `apia.app.br`. Após a propagação, revalidar SPF/DKIM/DMARC e então emitir **uma única** recuperação de senha para a conta já confirmada. O estado `sent` do PPA será tratado apenas como aceite SMTP; a chegada à caixa Gmail precisará de confirmação humana e, se possível, inspeção dos cabeçalhos de autenticação.

## Limites e próximos passos

O PPA não controla a zona DNS do domínio nem a fila de entrega posterior ao SMTP. A aplicação não deve repetir a recuperação enquanto o diagnóstico estiver em andamento, pois cada emissão invalida a credencial temporária anterior.

### Observação de produção

Após a correção do SPF, solicitações realizadas no ambiente publicado obtiveram aceite técnico do servidor SMTP. Esse estado confirma apenas que o servidor de saída assumiu a mensagem; ele não confirma a entrega pelo servidor destinatário. A ausência de uma mensagem em Gmail e de uma devolução para o remetente aponta a investigação para a fila e o rastreio do servidor de hospedagem, ou para critérios de autenticação e reputação avaliados depois do aceite.

As diretrizes do Gmail exigem autenticação por SPF ou DKIM para todos os remetentes e recomendam ambos, com alinhamento ao domínio do cabeçalho `From`. Elas também destacam que uma reputação negativa de IP compartilhado pode afetar a taxa de entrega. O próximo dado necessário é o registro de rastreamento da mensagem no painel do provedor, filtrado por horário e caixa de destino; não é necessário compartilhar senha, corpo da mensagem ou chave DKIM.

### Rota local comprovada e investigação correta

Os cabeçalhos completos de uma mensagem entregue via Cube comprovam que a rota local do provedor está saudável: o Exim encaminhou a mensagem por `srv260.prodns.com.br`, o relé externo aplicou autenticação, e o Gmail aprovou SPF, DKIM e DMARC. Dessa forma, a divergência de PTR observada no host de submissão `mail.apia.app.br` não é, por si só, causa demonstrada para o problema do PPA.

A investigação correta é a passagem da mensagem submetida remotamente pelo PPA, por SMTP autenticado, para a fila Exim que encaminha ao mesmo relé externo. No cPanel, a interface **Email → Track Delivery** permite filtrar por destinatário e horário e exibe autenticação, host de origem, roteador, transporte, resultado e ID Exim. Esses campos devem ser comparados entre o teste Cube entregue e a última recuperação do PPA [1].

> **Solicitação sugerida ao suporte de hospedagem:** “A rota local via Roundcube entrega ao Gmail com SPF, DKIM e DMARC aprovados. Já as recuperações originadas por SMTP autenticado no PPA são aceitas pela aplicação, mas não chegam ao Gmail. Solicito rastrear no Exim a mensagem submetida por SMTP AUTH no horário informado, indicando host/IP de origem, autenticação, ID Exim, roteador, transporte, resultado da fila e se a mensagem foi encaminhada ao relé externo ou filtrada antes disso.”

### Diferença entre Cube e aplicação

O teste que chegou ao Gmail foi produzido no Roundcube/Cube e injetado localmente no servidor de hospedagem por HTTP. Esse fluxo é diferente da submissão SMTP autenticada originada no ambiente do PPA. A entrega via Cube confirma que a caixa `noreply@apia.app.br` e o transporte local do provedor estão funcionais, mas não confirma a fila empregada para conexões SMTP remotas.

Como medida de alinhamento, o PPA agora constrói explicitamente o envelope SMTP com `MAIL FROM` igual à caixa autenticada, define o cabeçalho `Sender` para a mesma caixa e gera `Message-ID` no domínio dela. Também rejeita configuração em que `EMAIL_FROM` e `SMTP_USER` apontem para caixas diferentes. Essa alteração não realiza novo envio e não substitui a necessidade de o provedor investigar a fila posterior ao aceite SMTP.

### Diagnóstico Exim recebido e correção de HELO/EHLO

O rastreio fornecido pela HostGator identificou que a submissão SMTP autenticada chegou ao Exim com um nome de cliente equivalente a `[127.0.0.1]` e foi desviada pelo roteador global `fightspamHG` para `/dev/null`. Pela especificação do Exim, o nome entre parênteses no campo `H=` é o valor anunciado pelo cliente em `HELO` ou `EHLO`, enquanto o endereço final entre colchetes é a origem de rede observada pelo servidor [4].

O fallback padrão do Nodemailer é anunciar `[127.0.0.1]` quando o hostname local não é um nome de domínio plenamente qualificado [5]. Por isso, o transporte do PPA passa agora um nome público, validado e configurado: `ppa.simulados.apia.app.br`, no comando `EHLO`. A configuração recusa IPs, valores sem domínio e caracteres de quebra de linha.

Uma conexão TLS autenticada ao SMTP foi validada sem envio de mensagem após a alteração. Essa verificação confirma a negociação e a autenticação, mas não prova a decisão do filtro de entrega — que só poderá ser observada em um novo envio autorizado e em seu rastreio Exim. Nenhuma recuperação de senha foi emitida durante esta correção.

## Referências

1. [cPanel — Email Deliverability](https://docs.cpanel.net/cpanel/email/email-deliverability-in-cpanel/)
2. [cPanel — How to build a DMARC record](https://support.cpanel.net/hc/en-us/articles/360055638973-How-to-build-a-DMARC-record)
3. [cPanel — Track Delivery](https://docs.cpanel.net/cpanel/email/track-delivery/)
4. [Exim — Log files, campos H e HELO/EHLO](https://www.exim.org/exim-html-current/doc/html/spec_html/ch-log_files.html)
5. [Nodemailer — SMTP transport, opção `name`](https://nodemailer.com/smtp)
