# Backlog — Faltas, Problemas e Melhorias

> Lista do que permanece em aberto no estado atual do sistema. Itens marcados **[verificado]** foram confirmados diretamente no código; os demais exigem confirmação operacional (acesso a ambiente publicado, credenciais reais ou decisão de negócio) antes de qualquer ação.

## P1 — Pendências ativas de negócio

### B-01 — Entregabilidade de e-mail transacional (SMTP → Gmail)
Mesmo após corrigir SPF, alinhamento de envelope e HELO/EHLO, não há confirmação definitiva de entrega ao Gmail via SMTP remoto autenticado. Requer rastreio Exim do provedor de hospedagem (cPanel Track Delivery) — não é algo que uma alteração no código deste repositório resolva sozinha. Confirmar também se `EMAIL_AUTOMATIONS_ENABLED = false` (`server/domain/email.ts`) é intencional.

### B-02 — Confirmar estado real da homologação/produção PagBank
Confirmar em ambiente publicado: segregação de endpoint/webhook/assinatura/reconciliação entre Sandbox e Produção; estado do cadastro da aplicação PagBank de produção (nome, identificador, descrição, URL); URL de notificação com autenticação técnica dedicada.

### B-03 — Doutrina de dupla verificação em produção
Confirmar que a política de dupla verificação (assinatura de webhook + reconciliação TLS autenticada) está testada especificamente sobre as credenciais/endpoint de produção, não só Sandbox.

## P2 — Débito técnico

### B-04 — Ausência de `relations()` do Drizzle
`drizzle/relations.ts` está vazio; associações centrais (`study_sessions.programId`, `readiness_map_versions.eventId`) seguem sem constraint declarada — funcional, mas dificulta uso de `db.query.*` relacional do Drizzle.

### B-05 — Retenção/expurgo de `homologation_audit_events`
Sem política de retenção aparente no schema. Avaliar arquivamento após prazo definido se o volume crescer.

### B-06 — Cobertura de testes de UI/E2E fora do servidor
Validação de frontend ainda depende de scripts manuais via Chrome DevTools Protocol (`scripts/capture-*.mjs`, `scripts/verify-*.mjs`), não integrados ao CI. O workflow de CI cobre apenas backend/build.

## P3 — Melhorias sugeridas

### B-07 — Política de retenção/exclusão de conta
`ON DELETE CASCADE` em todas as FKs de dados pessoais remove todo o histórico ao excluir a conta, sem anonimização. Confirmar alinhamento com a política pública de privacidade (`/politicas`) e com eventuais obrigações de retenção de registros financeiros.

### B-08 — Data de atualização das políticas é manual
`POLICIES_LAST_UPDATED` em `client/src/pages/PoliciesPage.tsx` precisa ser editada manualmente a cada revisão de conteúdo — sem CMS ou versionamento dinâmico.

### B-09 — Chunks de build grandes
O build de produção do cliente gera alguns chunks acima de 500kB (bibliotecas de realce de sintaxe usadas pelo `streamdown`/mermaid). Considerar `manualChunks`/import dinâmico se o tamanho do bundle inicial se tornar um problema de performance percebida.
