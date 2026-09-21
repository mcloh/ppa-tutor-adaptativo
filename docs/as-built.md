# As-Built — PPA Teórico / Tutor Adaptativo

> Estado real do sistema (branch `master`). Este documento descreve **o que existe hoje no código**. Para o modelo de dados completo, ver `docs/modelo-er.md`; para arquitetura e integrações, `docs/arquitetura.md`; para requisitos, `docs/requisitos-funcionais.md` e `docs/requisitos-nao-funcionais.md`; para pendências, `docs/backlog.md`.

## 1. Estado do repositório

`tsc --noEmit`, a suíte Vitest completa (contra MySQL real) e `pnpm run build` (client + server) rodam sem erros.

## 2. Inventário de telas (client/src/pages)

| Rota / view | Componente | Auth | Papel | Estado |
|---|---|---|---|---|
| `/` (não logado) | `AuthScreen` | — | — | Ativo |
| `/` (logado, view `study`) | `StudyWorkspace` | sim | qualquer | Ativo — núcleo do produto |
| `/` (view `dashboard`) | `ReadinessDashboard` | sim | qualquer | Ativo — com bloco de erro dedicado e retry |
| `/` (view `plans`) | `PlansPage` | sim | qualquer | Ativo |
| `/` (view `profile`) | `StudentProfilePage` | sim | qualquer | Ativo |
| `/` (view `management`) | `AdminAnalyticsDashboard` | sim | admin | Ativo |
| `/planos` | `PlansPage` (wrapper público) | não | — | Ativo |
| `/mapa-de-conceitos` | `CanonicalConceptMapPage` | não | — | Ativo |
| `/politicas` | `PoliciesPage` | não | — | Ativo — data de "última atualização" isolada em `POLICIES_LAST_UPDATED`, editada manualmente a cada revisão |
| `/404` e fallback | `NotFound` | não | — | Ativo, no padrão visual "blueprint aeronáutico" |

## 3. Endpoints tRPC implementados (`server/routers.ts`)

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

## 4. Rotas REST fora do tRPC

- `POST /api/webhooks/pagbank/sandbox`, `POST /api/webhooks/pagbank/production` — corpo bruto (`express.raw`, limite 256kb), verificação de assinatura HMAC + reconciliação.
- `GET /api/auth/google/start`, `GET /api/auth/google/callback` — fluxo OAuth.
- `GET /api/pagbank/connect/public-key` — desafio de chave pública PagBank Connect (`Cache-Control: no-store`).
- `GET /storage/*` — proxy de download de objetos (redirect 307 para URL pública de CDN ou URL S3 pré-assinada).
- `GET /api/health` — `SELECT 1` no MySQL; `200 ok` ou `503 degraded`.

## 5. Estado da integração PagBank

- **Sandbox**: implementado, testado e homologado tecnicamente ponta a ponta (checkout, webhook, reconciliação, ledger idempotente), com trilha de auditoria completa exportável pela conta `homologation`.
- **Produção**: Connect Token Challenge validado publicamente (HTTP 200). `PAGBANK_PRODUCTION_COMMERCIAL_MODE=enabled` habilita compra ao público (cartão, PIX, boleto) quando configurada. Ver `docs/backlog.md` para itens de confirmação operacional pendentes.

## 6. Estado da entrega de e-mail transacional (SMTP)

Pendência operacional externa ao código — ver `docs/backlog.md`, B-01. Múltiplas camadas de correção já foram aplicadas (SPF, alinhamento de envelope, correção de HELO/EHLO), mas a confirmação definitiva de entrega ao Gmail depende de rastreio Exim do provedor de hospedagem.

## 7. Cobertura de testes

Suíte Vitest completa em `server/` (120 testes), cobrindo domínio, contratos de API e integração ponta a ponta contra MySQL real. Testes que dependem de rede/credenciais reais ficam atrás de flags (`RUN_SMTP_LIVE`, `RUN_PAGBANK_PIX_KEY_VALIDATION`, `PAGBANK_ENABLE_PRODUCTION_AUTH_PROBE`) para não comprometer a confiabilidade da suíte padrão.

## 8. Scripts operacionais (`scripts/*.mjs`)

Nenhum está registrado em `package.json > scripts` — todos são invocados manualmente. Ver detalhamento completo em `docs/how-to.md`.

## 9. Infraestrutura como código

`.env.example` (variáveis documentadas), `Dockerfile` multi-stage + `.dockerignore`, e `.github/workflows/ci.yml` (type-check, migração contra MySQL de serviço, testes, build) para GitHub Actions.
