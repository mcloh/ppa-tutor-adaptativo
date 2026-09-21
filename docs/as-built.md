# As-Built — PPA Teórico / Tutor Adaptativo

> Estado real do sistema no commit `a502345` ("initial load"), branch `master`. Este documento descreve **o que existe hoje no código**, incluindo desvios entre intenção e implementação. Para o modelo de dados completo, ver `docs/modelo-er.md`; para arquitetura e integrações, `docs/arquitetura.md`; para requisitos, `docs/requisitos-funcionais.md` e `docs/requisitos-nao-funcionais.md`.

## 1. Estado do repositório

- Único commit no histórico git (`a502345 initial load`) — não há histórico incremental de mudanças versionado.
- **Divergência git ↔ disco**: `git status` mostra 18 arquivos `docs/*.md`/`.json` como **deletados** (ainda rastreados pelo git) enquanto o mesmo conjunto de arquivos existe, com nomes idênticos, em `docs/exec-plan/` como **não rastreado**. Ou seja, os documentos de planejamento foram reorganizados no disco (movidos de `docs/` para `docs/exec-plan/`) sem que essa reorganização tenha sido commitada. Isso não foi causado por esta sessão de engenharia reversa — o diretório `docs/exec-plan/` já existia com esse conteúdo antes de qualquer leitura ou execução realizada aqui. Recomenda-se ao responsável do projeto revisar e commitar (ou desfazer) essa reorganização — ver `docs/backlog.md`.
- Não há `node_modules` instalado no ambiente em que esta auditoria foi feita (não foi possível rodar `pnpm install`/`tsc`/testes como parte desta engenharia reversa).

## 2. Gap crítico confirmado: roteador de analytics ausente

`server/routers.ts:68` contém:
```ts
import { activityRouter, adminAnalyticsRouter } from "./routers/adminAnalytics";
```
O arquivo **`server/routers/adminAnalytics.ts` não existe** no working tree (confirmado por `find`/`ls`) nem em nenhum commit do histórico git. Os dois routers são montados em `appRouter` (`activity`, `adminAnalytics`) e são exercitados por testes de contrato (`server/admin-analytics-contract.test.ts`, `server/admin-analytics-read.integration.test.ts`), o que confirma que o arquivo existiu em algum ponto do desenvolvimento e foi perdido (possivelmente durante a reorganização de `docs/` mencionada acima, ou por um checkpoint incompleto). O `dist/index.js` pré-compilado presente no repositório contém o código desses routers embutido, reforçando que a perda é recente.

**Consequência**: no estado atual, `pnpm run build`, `pnpm run dev` e `pnpm run check` devem falhar por módulo ausente, e o Console Gerencial (`AdminAnalyticsDashboard.tsx`) e a telemetria de atividade (`usePlatformActivity`) ficam inoperantes até o arquivo ser restaurado ou reescrito a partir de `server/adminAnalyticsDb.ts` + `server/domain/adminAnalytics.ts` + os testes de contrato existentes (que documentam o comportamento esperado com bastante precisão). Este é o item de maior prioridade em `docs/backlog.md`.

## 3. Inventário de telas (client/src/pages)

| Rota / view | Componente | Auth | Papel | Estado |
|---|---|---|---|---|
| `/` (não logado) | `AuthScreen` | — | — | Ativo |
| `/` (logado, view `study`) | `StudyWorkspace` | sim | qualquer | Ativo — núcleo do produto |
| `/` (view `dashboard`) | `ReadinessDashboard` | sim | qualquer | Ativo — **sem bloco de erro dedicado** (fica preso no skeleton se a query falhar) |
| `/` (view `plans`) | `PlansPage` | sim | qualquer | Ativo |
| `/` (view `profile`) | `StudentProfilePage` | sim | qualquer | Ativo |
| `/` (view `management`) | `AdminAnalyticsDashboard` | sim | admin | **Depende do gap da seção 2** |
| `/planos` | `PlansPage` (wrapper público) | não | — | Ativo |
| `/mapa-de-conceitos` | `CanonicalConceptMapPage` | não | — | Ativo |
| `/politicas` | `PoliciesPage` | não | — | Ativo — data de "última atualização" hardcoded no componente |
| `/404` e fallback | `NotFound` | não | — | Ativo, mas em inglês/estilo genérico fora do design system |
| — | `ComponentShowcase` | — | — | **Código morto**: não roteado, não referenciado |

## 4. Código residual do template (não faz parte do produto)

Confirmado via grep de importações — nenhum destes é usado por qualquer rota/página real:
- `client/src/pages/ComponentShowcase.tsx`
- `client/src/components/AIChatBox.tsx`
- `client/src/components/DashboardLayout.tsx` e `DashboardLayoutSkeleton.tsx` (menu com placeholders "Page 1"/"Page 2")
- `client/src/components/ManusDialog.tsx` ("Please login with Manus")
- `client/src/components/Map.tsx` (integração Google Maps, sem uso de negócio)
- `server/_core/sdk.ts`, `oauth.ts`, `dataApi.ts`, `heartbeat.ts`, `notification.ts`, `imageGeneration.ts`, `voiceTranscription.ts`, `map.ts`, `systemRouter.ts`
- Dependências `@aws-sdk/client-s3` e `@aws-sdk/s3-request-presigner` (instaladas, nunca importadas)

## 5. Endpoints tRPC implementados (`server/routers.ts`)

| Namespace | Procedures | Papel mínimo |
|---|---|---|
| `auth` | `me`, `register`, `login`, `requestPasswordReset`, `changePassword`, `logout` | público / passwordChange |
| `canonicalCatalog` | `publicMap` | público |
| `studentProfile` | `get`, `update`, `attempts.list`, `attempts.create` | protected |
| `credits` | `catalog`, `summary`, `createSandboxCheckout`, `createProductionHomologationCheckout`, `createProductionCheckout`, `recordSandboxCheckoutLifecycle`, `recordProductionCheckoutLifecycle`, `checkoutReturnStatus` | protected / homologation conforme procedure |
| `homologationAudit` | `list`, `export` | homologation |
| `study` | `program`, `selectMode`, `current`, `answer` | protected |
| `dashboard` | `overview` | protected |
| `notifications` | `list`, `markRead` | protected |
| `cacheAdmin` | `metrics`, `retire` | admin |
| `activity`, `adminAnalytics` | (ver seção 2 — arquivo fonte ausente) | protected / admin |

## 6. Rotas REST fora do tRPC

- `POST /api/webhooks/pagbank/sandbox`, `POST /api/webhooks/pagbank/production` — corpo bruto (`express.raw`, limite 256kb), verificação de assinatura HMAC + reconciliação.
- `GET /api/auth/google/start`, `GET /api/auth/google/callback` — fluxo OAuth.
- `GET /api/pagbank/connect/public-key` — desafio de chave pública PagBank Connect (`Cache-Control: no-store`).
- `GET /manus-storage/*` — proxy de download de objetos (redirect 307 para URL pré-assinada).
- `GET /api/health` — `SELECT 1` no MySQL; `200 ok` ou `503 degraded`.

## 7. Estado da integração PagBank

- **Sandbox**: implementado, testado e homologado tecnicamente ponta a ponta (checkout, webhook, reconciliação, ledger idempotente), com trilha de auditoria completa exportável pela conta `homologation`.
- **Produção**: Connect Token Challenge validado publicamente (HTTP 200); segundo o histórico do projeto (`docs/exec-plan/`), a homologação de produção foi concluída e `PAGBANK_PRODUCTION_COMMERCIAL_MODE=enabled` foi habilitada, abrindo compra ao público (cartão, PIX, boleto). **Este estado não pôde ser reverificado nesta auditoria** (não há acesso ao ambiente publicado nem às variáveis de ambiente reais) — recomenda-se confirmação operacional direta antes de tratar como definitivo. Ver `docs/backlog.md`.

## 8. Estado da entrega de e-mail transacional (SMTP)

Segundo o histórico do projeto, múltiplas camadas de correção foram aplicadas (SPF, alinhamento de envelope, correção de HELO/EHLO para evitar o roteador anti-spam `fightspamHG` do provedor de hospedagem) mas **a confirmação definitiva de entrega ao Gmail via SMTP remoto autenticado da aplicação segue pendente** — falta o rastreio Exim do provedor de hospedagem para fechar o diagnóstico. No código, `EMAIL_AUTOMATIONS_ENABLED = false` em `server/domain/email.ts:10` sinaliza uma trava adicional de automação que deve ser confirmada com o time como intencional ou remanescente. Ver `docs/backlog.md`.

## 9. Cobertura de testes observada

Suíte Vitest extensa em `server/`, incluindo (lista não exaustiva): `access-control.test.ts`, `admin-analytics-*.test.ts`, `auth-password-flow.integration.test.ts`, `auth.logout.test.ts`, `cache-contract.test.ts`, `db.selection.test.ts`, `domain/*.test.ts` (assessmentMatrix, billing, cache, cacheWarmup, email, homologationAudit, learning, pagbankSandbox, password, publicCanonicalCatalog, rag, studyProgram, tutorLlmSafety), `google-account.integration.test.ts`, `google-oauth-config.integration.test.ts`, `googleAuth.test.ts`, `homologation-audit.integration.test.ts`, `pagbank-*.test.ts` (7 arquivos), `pagbankConnectChallenge.test.ts`, `pagbankWebhook.*.test.ts`, `question-contract.test.ts`, `smtp-config.test.ts`, `smtp-delivery.integration.test.ts`, `student-profile.integration.test.ts`, `study-program*.test.ts`, `ui-contract.test.ts`. Testes que dependem de rede real ficam atrás de flags (`RUN_SMTP_LIVE`, `RUN_PAGBANK_PIX_KEY_VALIDATION`, `PAGBANK_ENABLE_PRODUCTION_AUTH_PROBE`).

## 10. Scripts operacionais (`scripts/*.mjs`)

Nenhum está registrado em `package.json > scripts` — todos são invocados manualmente. Ver detalhamento completo em `docs/how-to.md`.
