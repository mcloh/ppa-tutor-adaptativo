# As-Built — PPA Teórico / Tutor Adaptativo

> Estado real do sistema após a rodada de limpeza da plataforma Manus e implementação das correções de `docs/backlog.md` (branch `master`). Este documento descreve **o que existe hoje no código**. Para o modelo de dados completo, ver `docs/modelo-er.md`; para arquitetura e integrações, `docs/arquitetura.md`; para requisitos, `docs/requisitos-funcionais.md` e `docs/requisitos-nao-funcionais.md`.

## 1. Estado do repositório

- Histórico git com checkpoints incrementais (commit inicial `a502345`, seguido de checkpoints automáticos do ambiente de desenvolvimento).
- A divergência antes existente entre git e disco em `docs/` (arquivos de planejamento reorganizados sem commit) já foi sincronizada por um checkpoint automático — não há mais pendência aqui.
- `tsc --noEmit`, a suíte Vitest completa (contra MySQL real) e `pnpm run build` (client + server) foram executados com sucesso após todas as mudanças descritas neste documento.

## 2. Roteador de analytics — reconstruído

`server/routers/adminAnalytics.ts` estava ausente do repositório (importado em `server/routers.ts` mas inexistente) e foi **reconstruído** a partir de `server/adminAnalyticsDb.ts`, `server/domain/adminAnalytics.ts` e dos testes de contrato existentes (`server/admin-analytics-contract.test.ts`, `server/admin-analytics-read.integration.test.ts`). Exporta:
- `activityRouter` — `touch` (mutation, protegida, best-effort) para telemetria de presença por sessão.
- `adminAnalyticsRouter` — `overview`, `operations`, `costs.summary` (queries, exclusivas de `admin`).

Validado ponta a ponta contra um MySQL real: os dois testes de contrato/integração passam, e o Console Gerencial (`AdminAnalyticsDashboard.tsx`) volta a ser funcional.

## 3. Inventário de telas (client/src/pages)

| Rota / view | Componente | Auth | Papel | Estado |
|---|---|---|---|---|
| `/` (não logado) | `AuthScreen` | — | — | Ativo |
| `/` (logado, view `study`) | `StudyWorkspace` | sim | qualquer | Ativo — núcleo do produto |
| `/` (view `dashboard`) | `ReadinessDashboard` | sim | qualquer | Ativo — com bloco de erro dedicado e retry |
| `/` (view `plans`) | `PlansPage` | sim | qualquer | Ativo |
| `/` (view `profile`) | `StudentProfilePage` | sim | qualquer | Ativo |
| `/` (view `management`) | `AdminAnalyticsDashboard` | sim | admin | Ativo (ver seção 2) |
| `/planos` | `PlansPage` (wrapper público) | não | — | Ativo |
| `/mapa-de-conceitos` | `CanonicalConceptMapPage` | não | — | Ativo |
| `/politicas` | `PoliciesPage` | não | — | Ativo — data de "última atualização" isolada em `POLICIES_LAST_UPDATED`, ainda editada manualmente |
| `/404` e fallback | `NotFound` | não | — | Ativo, no padrão visual "blueprint aeronáutico" e em pt-BR |

`ComponentShowcase.tsx` (vitrine morta do template) foi removido — ver seção 4.

## 4. Limpeza da plataforma Manus

Toda a dependência de código morto do template inicial da plataforma Manus foi removida: `server/_core/sdk.ts`, `oauth.ts`, `dataApi.ts`, `heartbeat.ts`, `notification.ts`, `imageGeneration.ts`, `voiceTranscription.ts`, `map.ts`, `systemRouter.ts`, `types/manusTypes.ts`; `client/src/components/ManusDialog.tsx`, `DashboardLayout.tsx`, `DashboardLayoutSkeleton.tsx`, `AIChatBox.tsx`, `Map.tsx`; `client/src/pages/ComponentShowcase.tsx`; `client/src/const.ts`; `client/public/__manus__/`; `template.json`; o plugin `vite-plugin-manus-runtime` e o "Manus Debug Collector" em `vite.config.ts`.

As duas integrações que **estavam ativas** (não eram código morto) foram substituídas por provedores diretos, não apenas removidas:
- **LLM** (`server/_core/llm.ts`, `server/domain/tutorLlm.ts`): antes apontava para o proxy `forge.manus.im`; agora usa a API oficial da OpenAI por padrão (`OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`).
- **Armazenamento de objetos** (`server/storage.ts`, `server/_core/storageProxy.ts`): antes usava presign via Forge; agora fala diretamente com AWS S3 (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_S3_PUBLIC_BASE_URL` opcional). A rota de download mudou de `/manus-storage/*` para `/storage/*`.

**Ação pendente do operador**: os arquivos binários de marca (logotipos, favicons, selo PagBank) só existem hoje no bucket antigo da Manus/Forge. É necessário rodar `scripts/migrate-brand-assets-to-s3.mjs` uma única vez (com credenciais antigas e novas) antes de publicar — ver `docs/backlog.md` seção 0.

## 5. Endpoints tRPC implementados (`server/routers.ts`)

| Namespace | Procedures | Papel mínimo |
|---|---|---|
| `activity` | `touch` | protected |
| `adminAnalytics` | `overview`, `operations`, `costs.summary` | admin |
| `auth` | `me`, `register`, `login`, `requestPasswordReset`, `changePassword`, `logout` | público / passwordChange |
| `canonicalCatalog` | `publicMap` | público |
| `studentProfile` | `get`, `update`, `attempts.list`, `attempts.create` | protected |
| `credits` | `catalog`, `summary`, `createSandboxCheckout`, `createProductionHomologationCheckout`, `createProductionCheckout`, `recordSandboxCheckoutLifecycle`, `recordProductionCheckoutLifecycle`, `checkoutReturnStatus` | protected / homologation conforme procedure |
| `homologationAudit` | `list`, `export` | homologation |
| `study` | `program`, `selectMode`, `current`, `answer` | protected |
| `dashboard` | `overview` | protected |
| `notifications` | `list`, `markRead` | protected |
| `cacheAdmin` | `metrics`, `retire` | admin |

## 6. Rotas REST fora do tRPC

- `POST /api/webhooks/pagbank/sandbox`, `POST /api/webhooks/pagbank/production` — corpo bruto (`express.raw`, limite 256kb), verificação de assinatura HMAC + reconciliação.
- `GET /api/auth/google/start`, `GET /api/auth/google/callback` — fluxo OAuth.
- `GET /api/pagbank/connect/public-key` — desafio de chave pública PagBank Connect (`Cache-Control: no-store`).
- `GET /storage/*` — proxy de download de objetos (redirect 307 para URL pública de CDN ou URL S3 pré-assinada).
- `GET /api/health` — `SELECT 1` no MySQL; `200 ok` ou `503 degraded`.

## 7. Estado da integração PagBank

- **Sandbox**: implementado, testado e homologado tecnicamente ponta a ponta (checkout, webhook, reconciliação, ledger idempotente), com trilha de auditoria completa exportável pela conta `homologation`.
- **Produção**: Connect Token Challenge validado publicamente (HTTP 200); segundo o histórico do projeto (`docs/exec-plan/`), a homologação de produção foi concluída e `PAGBANK_PRODUCTION_COMMERCIAL_MODE=enabled` foi habilitada, abrindo compra ao público (cartão, PIX, boleto). **Este estado não pôde ser reverificado nesta auditoria** (não há acesso ao ambiente publicado nem às variáveis de ambiente reais) — recomenda-se confirmação operacional direta antes de tratar como definitivo. Ver `docs/backlog.md`.

## 8. Estado da entrega de e-mail transacional (SMTP)

Sem alteração nesta rodada — permanece uma pendência operacional externa ao código (ver `docs/backlog.md`, B-03). Múltiplas camadas de correção já foram aplicadas (SPF, alinhamento de envelope, correção de HELO/EHLO), mas a confirmação definitiva de entrega ao Gmail depende de rastreio Exim do provedor de hospedagem.

## 9. Cobertura de testes

Suíte Vitest completa em `server/` (120 testes). Executada nesta rodada contra um MySQL 8 real e com credenciais de teste para Google OAuth/PagBank: **119 de 120 passam**; a única falha restante (`google-oauth-config.integration.test.ts`) exige credenciais OAuth do Google genuinamente válidas registradas no Google Cloud Console (faz uma chamada de rede real ao endpoint de token do Google) — não é uma regressão de código. Testes que dependem de rede/credenciais reais ficam atrás de flags (`RUN_SMTP_LIVE`, `RUN_PAGBANK_PIX_KEY_VALIDATION`, `PAGBANK_ENABLE_PRODUCTION_AUTH_PROBE`).

## 10. Scripts operacionais (`scripts/*.mjs`)

Nenhum está registrado em `package.json > scripts` — todos são invocados manualmente. Inclui agora `migrate-brand-assets-to-s3.mjs` (migração única de ativos binários, ver seção 4). Ver detalhamento completo em `docs/how-to.md`.

## 11. Infraestrutura como código (nova)

Adicionados nesta rodada: `.env.example` (todas as variáveis documentadas), `Dockerfile` multi-stage + `.dockerignore`, e `.github/workflows/ci.yml` (type-check, migração contra MySQL de serviço, testes, build) para GitHub Actions.
