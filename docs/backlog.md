# Backlog — Faltas, Problemas e Melhorias

> Consolidado a partir da engenharia reversa do código-fonte e do histórico de execução em `docs/exec-plan/` e `todo.md`. Itens marcados **[verificado nesta auditoria]** foram confirmados diretamente no repositório. A seção 1 registra o que já foi corrigido em uma rodada de limpeza e implementação subsequente; a seção 2 lista o que permanece em aberto.

## 0. Ação obrigatória antes do próximo deploy

A dependência da plataforma Manus para LLM e armazenamento de objetos foi **substituída por provedores diretos** (OpenAI oficial e AWS S3 — ver seção 1, B-06/B-07). Isso significa que, a partir desta mudança, o ambiente de execução **exige credenciais próprias** que antes não eram necessárias:

- `OPENAI_API_KEY` (geração de questões, feedback e avaliações deixa de funcionar sem ela).
- `AWS_REGION` e `AWS_S3_BUCKET` (upload de novos arquivos; leitura de arquivos existentes via `/storage/*`).
- Os ativos de marca já publicados (logotipos, favicons, selo PagBank) hoje só existem no bucket antigo da Manus/Forge. Rode **uma única vez**, com as credenciais antigas (`FORGE_API_URL`/`FORGE_API_KEY`) e as novas (`AWS_REGION`/`AWS_S3_BUCKET`), o script `scripts/migrate-brand-assets-to-s3.mjs` para copiá-los ao novo bucket antes de publicar — sem isso, logotipo, favicon e selo PagBank ficarão quebrados em produção.

Ver `.env.example` para a lista completa de variáveis.

## 1. Resolvido nesta rodada

### B-01 — Roteador de analytics ausente do repositório — **RESOLVIDO**
Recriado em `server/routers/adminAnalytics.ts` (`activityRouter` + `adminAnalyticsRouter`), reconstruído a partir de `adminAnalyticsDb.ts`, `domain/adminAnalytics.ts` e dos testes de contrato. Validado com `tsc --noEmit`, build de produção completo e a suíte Vitest inteira rodando contra um MySQL real (120 testes, apenas falhas esperadas por ausência de credenciais externas reais — ver seção 2).

### B-02 — Divergência entre git e disco em `docs/` — **RESOLVIDO**
Um checkpoint automático do ambiente (`commit 63b3614`) já havia sincronizado a reorganização de `docs/exec-plan/` com o índice do git antes desta rodada. Confirmado: `git status` não mostra mais divergência.

### B-06 — Código residual do template "Manus" — **RESOLVIDO**
Removidos por completo: `server/_core/sdk.ts`, `oauth.ts`, `dataApi.ts`, `heartbeat.ts`, `notification.ts`, `imageGeneration.ts`, `voiceTranscription.ts`, `map.ts`, `systemRouter.ts`, `types/manusTypes.ts`; `client/src/components/ManusDialog.tsx`, `DashboardLayout.tsx`, `DashboardLayoutSkeleton.tsx`, `AIChatBox.tsx`, `Map.tsx`; `client/src/pages/ComponentShowcase.tsx`; `client/src/const.ts` (helpers do OAuth "Manus" mortos); `client/public/__manus__/`; `template.json`; o plugin `vite-plugin-manus-runtime` e o "Manus Debug Collector" em `vite.config.ts`. `shared/const.ts` perdeu os exports órfãos (`COOKIE_NAME`, `ONE_YEAR_MS`, `OAUTH_STATE_COOKIE`, `encodeOAuthState`, `decodeOAuthState`, `OAuthState`).

### B-07 — Dependências AWS instaladas e nunca usadas — **RESOLVIDO (de outra forma)**
`@aws-sdk/client-s3` e `@aws-sdk/s3-request-presigner` agora são efetivamente usados: `server/storage.ts` foi reescrito para falar diretamente com AWS S3 (upload via `PutObjectCommand`, download via URL presignada ou base pública de CDN), substituindo o proxy Forge/Manus. A rota de download mudou de `/manus-storage/*` para `/storage/*` (`server/_core/storageProxy.ts`), com todas as referências no cliente, `index.html`, `manifest.json` e testes atualizadas. **Atenção**: ver seção 0 — os arquivos binários precisam ser migrados manualmente para o novo bucket.

O LLM (`server/_core/llm.ts`, `server/domain/tutorLlm.ts`) também deixou de apontar para `forge.manus.im`: agora usa `OPENAI_API_KEY`/`OPENAI_BASE_URL`/`OPENAI_MODEL`, com padrão para a API oficial da OpenAI (`https://api.openai.com/v1`). `axios` e `jose` (usados só pelo SDK morto) e `@types/google.maps` (usado só pelo `Map.tsx` morto) foram removidos de `package.json`.

### B-08 — Página 404 fora do design system — **RESOLVIDO**
`client/src/pages/NotFound.tsx` reescrita no padrão visual "blueprint aeronáutico" (`blueprint-grid`, `cad-frame`, `eyebrow`) e traduzida para pt-BR.

### B-09 — `ReadinessDashboard` sem tratamento de erro — **RESOLVIDO**
Adicionado bloco de erro dedicado (mesmo padrão do `AdminAnalyticsDashboard`) com botão "Tentar novamente" quando `dashboard.overview` falha.

### B-10 — Data hardcoded na página de políticas — **RESOLVIDO (parcialmente)**
Extraída para a constante nomeada `POLICIES_LAST_UPDATED` no topo de `PoliciesPage.tsx`, com comentário explícito de que deve ser atualizada manualmente a cada revisão de conteúdo. Continua sendo edição manual — não há CMS ou versionamento dinâmico de conteúdo legal, o que seria escopo maior que uma correção pontual.

### B-11 — Ausência de infraestrutura como código / CI — **RESOLVIDO**
Adicionados `.env.example` (todas as variáveis documentadas), `Dockerfile` multi-stage + `.dockerignore`, e `.github/workflows/ci.yml` (type-check, migração em MySQL de serviço, testes, build) para GitHub Actions.

### B-15 — Variáveis de ambiente legadas — **RESOLVIDO**
`JWT_SECRET`, `VITE_APP_ID`, `OAUTH_SERVER_URL`, `OWNER_OPEN_ID` removidas de `server/_core/env.ts` junto com a remoção do SDK Manus que as consumia (B-06).

## 2. Ainda em aberto

### B-03 — Entregabilidade de e-mail transacional (SMTP → Gmail) — **pendência operacional, fora do alcance de uma mudança de código**
Segundo o histórico do projeto, mesmo após corrigir SPF, alinhamento de envelope e HELO/EHLO, não há confirmação definitiva de entrega ao Gmail via SMTP remoto autenticado. Requer rastreio Exim do provedor de hospedagem (cPanel Track Delivery) — não é algo que uma alteração no código deste repositório resolva sozinha. Confirmar também se `EMAIL_AUTOMATIONS_ENABLED = false` (`server/domain/email.ts`) é intencional.

### B-04 — Confirmar estado real da homologação/produção PagBank — **requer acesso ao ambiente publicado**
Não foi possível reverificar nesta auditoria (sem acesso a variáveis/ambiente reais de produção). Vários itens `[ ]` do `todo.md` sobre "antes de ativar cobrança comercial" parecem superados por entradas `[x]` posteriores — recomenda-se auditoria operacional rápida para confirmar e oficialmente encerrar esses itens.

### B-05 — Doutrina de dupla verificação em produção — **requer confirmação operacional**
Confirmar que a política de dupla verificação (assinatura de webhook + reconciliação TLS autenticada) está testada especificamente sobre as credenciais/endpoint de produção, não só Sandbox. Não foi alterada nesta rodada (fora do escopo da limpeza Manus).

### B-12 — Ausência de `relations()` do Drizzle
`drizzle/relations.ts` continua vazio; associações centrais (`study_sessions.programId`, `readiness_map_versions.eventId`) seguem sem constraint declarada. Funcional, mas dificulta uso de `db.query.*` relacional. Deferido — é uma refatoração de schema com escopo próprio, não uma correção pontual.

### B-13 — Retenção/expurgo de `homologation_audit_events`
Sem política de retenção aparente no schema. Avaliar arquivamento após prazo definido se o volume crescer.

### B-14 — Cobertura de testes de UI/E2E fora do servidor
Validação de frontend ainda depende de scripts manuais via Chrome DevTools Protocol, não integrados a CI. O workflow de CI adicionado (B-11) cobre apenas backend/build; formalizar regressão visual automatizada fica para uma iniciativa própria.

### B-16 — Política de retenção/exclusão de conta
`ON DELETE CASCADE` em todas as FKs de dados pessoais remove todo o histórico ao excluir a conta, sem anonimização. Confirmar alinhamento com a política pública de privacidade e com obrigações de retenção de registros financeiros.

---

## Itens do histórico já concluídos antes desta rodada (referência)

Modelagem completa da taxonomia PPA (872 conceitos), motor determinístico de aprendizagem, seleção adaptativa, cache pedagógico com barreira anti-vazamento RAG, diagnóstico de 100 questões com regra transversal REG aprovada, branding oficial, homologação Sandbox PagBank completa, páginas públicas de planos/políticas/mapa de conceitos, fluxo de senha temporária/ativação/recuperação (implementação — entrega SMTP ainda pendente conforme B-03), login Google OAuth completo.
