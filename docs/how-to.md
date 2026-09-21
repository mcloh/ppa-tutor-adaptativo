# How-To — PPA Teórico / Tutor Adaptativo

> Guia operacional derivado dos scripts em `package.json` e `scripts/*.mjs`.

## 1. Pré-requisitos

- Node.js 22+ (usado no `Dockerfile` e no workflow de CI; `@types/node ^24` como indicativo do alvo de tipos).
- pnpm 10 (`packageManager` pinado em `package.json`).
- Um servidor MySQL acessível.
- Copie `.env.example` para `.env` e preencha os valores reais. No mínimo, para subir o servidor: `DATABASE_URL`. Para funcionalidades específicas: SMTP (`SMTP_*`, `EMAIL_FROM`), Google OAuth (`GOOGLE_OAUTH_CLIENT_ID/SECRET`), PagBank (`PAGBANK_*`), LLM (`OPENAI_API_KEY`), armazenamento de objetos (`AWS_REGION`, `AWS_S3_BUCKET`).

## 2. Instalação e desenvolvimento local

```bash
pnpm install
pnpm run dev
```
`dev` executa `NODE_ENV=development tsx watch server/_core/index.ts`, subindo Express com Vite em modo middleware (HMR) na mesma porta (padrão 3000, com fallback automático se ocupada).

## 3. Verificação de tipos, testes e formatação

```bash
pnpm run check    # tsc --noEmit
pnpm test         # vitest run (server/**/*.{test,spec}.ts)
pnpm run format   # prettier --write .
```
Testes que dependem de rede real ficam desligados por padrão; habilite explicitamente quando necessário:
```bash
RUN_SMTP_LIVE=1 RUN_SMTP_LIVE_DELIVERY_TEST=1 pnpm test           # SMTP ao vivo
RUN_PAGBANK_PIX_KEY_VALIDATION=1 pnpm test                        # validação de chave Pix
PAGBANK_ENABLE_PRODUCTION_AUTH_PROBE=1 pnpm test                  # sonda de produção PagBank (somente leitura)
```

## 4. Build e execução em produção

```bash
pnpm run build   # vite build (client -> dist/public) + esbuild (server -> dist/index.js)
pnpm run start   # NODE_ENV=production node dist/index.js
```

## 5. Banco de dados (Drizzle + MySQL)

```bash
pnpm run db:push   # drizzle-kit generate && drizzle-kit migrate
```
- Schema único em `drizzle/schema.ts`; migrações versionadas em `drizzle/0000`–`0019` (`.sql`) com metadados em `drizzle/meta/`.
- Requer `DATABASE_URL` válida. Não há script de rollback dedicado — reverter depende de gerenciar manualmente o histórico em `drizzle/meta`.

## 6. Scripts operacionais (`node scripts/<arquivo>.mjs`)

Nenhum destes é chamado automaticamente por `pnpm run *` — são ferramentas manuais de operação/QA.

### Ingestão de conteúdo e catálogo
- **`seed-catalog.mjs`** — popula `course_catalog_versions`/`canonical_concepts` a partir de um mapa canônico JSON e um plano de estudo Markdown (caminho de arquivo fonte hardcoded no script — ajustar antes de rodar em outro ambiente). Cria uma nova versão de catálogo com checksum.
- **`extract-evidence-ocr.mjs`** — varre um diretório de imagens e roda OCR, gravando um índice JSON de texto extraído. Concorrência configurável via `OCR_CONCURRENCY` (default 8). Primeira etapa do pipeline de ingestão de material didático.
- **`import-evidence-rag.mjs`** — consome o índice OCR + arquivo de evidência e importa para `knowledge_sources`/`knowledge_chunks`/`knowledge_chunk_terms`, tokenizando em português para o índice invertido de recuperação léxica.

### Cache pedagógico
- **`warm-cache.mjs`** — pré-aquece o cache compartilhado de questões, gerando via LLM+RAG até 4 itens aprovados por conceito canônico, em ondas controladas, respeitando a barreira anti-vazamento.
- **`audit-assessment-matrix.mjs`** — calcula estatísticas de cobertura da matriz de 100 questões (capítulos/conceitos por matéria) offline, sem chamar a aplicação em execução — útil para validar a viabilidade de uma nova regra de matriz antes de implementá-la.

### Smoke tests (requerem servidor rodando, via `PPA_BASE_URL`, default `http://localhost:3000`)
- **`smoke-milestones.mjs`**, **`smoke-milestones-api-only.mjs`**, **`smoke-milestones-api-cache.mjs`** — simulam um aluno completo respondendo até os marcos de 20/100 questões, validando persistência de avaliações e plano de estudo.
- **`smoke-auth-recovery.mjs`** — valida ponta a ponta cadastro/ativação/recuperação de senha.
- **`smoke-cache-governance.mjs`**, **`smoke-rag-cache.mjs`** — validam com dois usuários que o cache compartilhado nunca repete uma questão para o mesmo aluno e respeita a barreira RAG.
- **`smoke-next-transition-mobile.mjs`** — valida a transição "próxima questão" em viewport mobile via Chrome DevTools Protocol.
- **`assert-smoke-response.mjs`** — pós-processa respostas gravadas em `/tmp/ppa-smoke-*`, garantindo que nenhum campo sensível (`correctOption`, `conceptIds`, `pedagogicalAction`, `validationJson`) vaza no contrato público e que o cookie de sessão foi definido.

### Captura e verificação visual (via Chrome DevTools Protocol, `127.0.0.1:9222` — requer Chrome com debugging remoto habilitado)
- **`capture-authenticated-ui.mjs`**, **`capture-plans-page.mjs`**, **`capture-public-auth-link-mobile.mjs`** — capturam screenshots de telas-chave.
- **`verify-public-plans-mobile.mjs`**, **`verify-ui-breakpoints.mjs`** — validam responsividade em breakpoints definidos.

Nenhum desses scripts de captura/smoke faz parte de um pipeline de CI — são executados manualmente durante desenvolvimento/QA, alinhados à política de revisão manual antes de publicação (seção 7).

## 7. Processo de release (política do projeto)

Publicação automática está desativada como regra permanente:
1. Rodar verificação de tipos, testes e build.
2. Salvar checkpoint com descrição objetiva das mudanças.
3. Informar as versões e fluxos validados **sem declarar como publicado**.
4. Aguardar confirmação explícita do responsável do projeto.
5. A publicação em si é acionada pelo responsável — nunca automaticamente.

Atenção redobrada é exigida para mudanças em pagamento, autenticação, conteúdo pedagógico ou cache reutilizável.

## 8. Docker e CI

```bash
docker build -t ppa-tutor-adaptativo .
docker run --env-file .env -p 3000:3000 ppa-tutor-adaptativo
```
O `Dockerfile` é multi-stage: instala dependências, builda client+server, e a imagem final só carrega dependências de produção + `dist/`. `.github/workflows/ci.yml` roda em cada push/PR para `master`: type-check, migração contra um MySQL de serviço, testes e build.

## 9. Troubleshooting conhecido

### Geração de questões falhando com "OPENAI_API_KEY is not configured"
O LLM agora aponta para a API oficial da OpenAI por padrão — configure `OPENAI_API_KEY` (e, se usar outro provedor compatível, `OPENAI_BASE_URL`/`OPENAI_MODEL`) no `.env`.

### Upload/leitura de arquivos falhando com "Storage config missing"
Configure `AWS_REGION` e `AWS_S3_BUCKET` no `.env`. As credenciais de acesso (`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`) são resolvidas pela cadeia padrão do SDK da AWS.

### E-mail transacional não chega ao Gmail
Pendência ativa, não é um problema de código isolado — depende de rastreio Exim do provedor de hospedagem. Ver `docs/backlog.md` para o estado detalhado e os próximos passos já mapeados (Track Delivery no cPanel, comparação com rota de controle via Roundcube/Cube).

### Login Google não funciona em ambiente local
O redirect URI é uma constante fixa (`https://ppa.simulados.apia.app.br/api/auth/google/callback`, `server/googleAuth.ts`) — para testar localmente é necessário um client OAuth próprio configurado com o redirect de desenvolvimento, ou ajustar temporariamente a constante (nunca commitar essa alteração).

### Variáveis de placeholder `%VITE_ANALYTICS_*%` não substituídas
O mecanismo de substituição desses placeholders no `client/index.html` não está configurado neste repositório — depende da camada de hospedagem/deploy escolhida pelo time.
