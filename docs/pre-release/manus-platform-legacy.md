# A plataforma Manus e a migração para a fase release

## O que era

O projeto foi originalmente gerado a partir de um template da plataforma **Manus** (`web-db-user`), que fornecia um SDK server-side próprio em `server/_core/`:

- `sdk.ts` / `oauth.ts` — login OAuth "Manus" (com emissão de JWT via `jose`), nunca conectado ao fluxo real de autenticação do produto.
- `heartbeat.ts` — agendamento de cron jobs via o serviço `WebDevService` do Forge (backend proprietário da Manus). Nenhum job chegou a ser criado.
- `notification.ts` — notificação ao dono do projeto via Forge.
- `dataApi.ts`, `map.ts` — proxies para busca web e Google Maps via Forge.
- `imageGeneration.ts`, `voiceTranscription.ts` — proxies para geração de imagem e transcrição de voz via Forge.
- `systemRouter.ts` — expunha parte desse SDK via tRPC, mas nunca foi montado no roteador principal.
- `types/manusTypes.ts` — tipos de suporte ao SDK acima.

No cliente: `client/src/components/ManusDialog.tsx` (modal "Login with Manus"), `DashboardLayout.tsx`/`DashboardLayoutSkeleton.tsx` e `AIChatBox.tsx` (layout e chat genéricos do template, nunca usados pelo produto real), `Map.tsx` (integração Google Maps sem uso de negócio), `ComponentShowcase.tsx` (vitrine de todos os componentes shadcn/ui do template). `client/src/const.ts` e parte de `shared/const.ts` continham os helpers (`startLogin`, `OAUTH_STATE_COOKIE`, `encodeOAuthState`/`decodeOAuthState`) do fluxo OAuth "Manus" acima, igualmente mortos.

Também faziam parte do scaffold: `template.json` (cópia serializada dos arquivos originais do template), `client/public/__manus__/` (runtime de debug da IDE Manus), o plugin `vite-plugin-manus-runtime` e um "Manus Debug Collector" customizado em `vite.config.ts` (gravava logs de console/rede/replay do navegador em `.manus-logs/` durante o desenvolvimento).

### O que estava realmente em uso

Diferente do SDK acima (nunca conectado), duas integrações **estavam** ativas e eram essenciais ao produto:

- **LLM**: `server/_core/llm.ts` chamava `https://forge.manus.im/v1/chat/completions` (autenticado com `BUILT_IN_FORGE_API_KEY`) para gerar questões, feedback e avaliações pedagógicas (`server/domain/tutorLlm.ts`).
- **Armazenamento de objetos**: `server/storage.ts` e `server/_core/storageProxy.ts` faziam upload via URL pré-assinada do Forge e serviam downloads pela rota `GET /manus-storage/*` (redirect 307 para uma URL assinada obtida do Forge).

A autenticação real do produto (cadastro por e-mail/senha, sessão por cookie opaco, login com Conta Google) sempre foi implementação própria, independente desse SDK.

## O que mudou na migração para a fase release

1. **Todo o SDK morto foi removido sem substituição** — nenhuma funcionalidade do produto dependia dele.
2. **LLM**: `server/_core/llm.ts` passou a apontar para a API oficial da OpenAI por padrão (`OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`), mantendo a mesma interface (compatível com Chat Completions), então nenhuma lógica de geração de questão/feedback/avaliação precisou mudar.
3. **Armazenamento de objetos**: `server/storage.ts` foi reescrito para falar diretamente com AWS S3 (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, via `AWS_REGION`/`AWS_S3_BUCKET`/`AWS_S3_PUBLIC_BASE_URL`). A rota de download mudou de `/manus-storage/*` para `/storage/*`.
4. Dependências que só existiam para o SDK morto (`axios`, `jose`, `@types/google.maps`, `vite-plugin-manus-runtime`) foram removidas de `package.json`.
5. Variáveis de ambiente exclusivas do SDK morto (`JWT_SECRET`, `VITE_APP_ID`, `OAUTH_SERVER_URL`, `OWNER_OPEN_ID`) deixaram de ser necessárias.
6. Um roteador tRPC (`server/routers/adminAnalytics.ts`, com `activityRouter` e `adminAnalyticsRouter`) que havia se perdido durante essa transição foi reconstruído a partir da camada de dados (`adminAnalyticsDb.ts`) e dos testes de contrato existentes.
7. Foi adicionada infraestrutura como código que não existia na fase Manus (a hospedagem/build eram, até então, inteiramente geridas pela plataforma): `Dockerfile`, `.dockerignore`, `.github/workflows/ci.yml`, `.env.example`.

### Migração pendente de ativos binários

Os arquivos de marca já publicados durante a fase Manus (logotipos, favicons, selo de parceria PagBank) existiam apenas no bucket antigo hospedado pela Manus/Forge — eles precisam ser copiados manualmente para o novo bucket S3 antes de qualquer publicação pós-migração. O script `migrate-brand-assets-to-s3.mjs` (nesta mesma pasta) faz essa cópia uma única vez: requer `FORGE_API_URL`/`FORGE_API_KEY` (credenciais antigas, só para esta migração) e `AWS_REGION`/`AWS_S3_BUCKET` (destino). Execute-o a partir da raiz do projeto (`node docs/pre-release/migrate-brand-assets-to-s3.mjs`). Depois de executado com sucesso, ele deixa de ser necessário e pode ser arquivado.

## Verificação feita na migração

`tsc --noEmit`, a suíte Vitest completa (rodada contra um MySQL real) e `pnpm run build` (client + server) foram executados com sucesso após a remoção do SDK morto e a troca das duas integrações ativas — sem regressão de comportamento observada.
