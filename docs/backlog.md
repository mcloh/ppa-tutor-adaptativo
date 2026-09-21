# Backlog — Faltas, Problemas e Melhorias

> Consolidado a partir da engenharia reversa do código-fonte e do histórico de execução em `docs/exec-plan/` e `todo.md`. Organizado por prioridade e categoria. Itens marcados **[verificado nesta auditoria]** foram confirmados diretamente no repositório; os demais vêm do histórico de planejamento do projeto e devem ser reconfirmados operacionalmente antes de ação.

## P0 — Bloqueadores críticos

### B-01 — Roteador de analytics ausente do repositório **[verificado nesta auditoria]**
`server/routers.ts:68` importa `{ activityRouter, adminAnalyticsRouter }` de `./routers/adminAnalytics`, mas esse arquivo não existe no working tree nem em nenhum commit git. Isso provavelmente quebra `pnpm run build`, `pnpm run dev` e `pnpm run check`, e deixa inoperantes o Console Gerencial (`AdminAnalyticsDashboard.tsx`) e a telemetria de atividade.
**Ação recomendada**: reconstruir o arquivo a partir de `server/adminAnalyticsDb.ts`, `server/domain/adminAnalytics.ts` e dos testes de contrato existentes (`server/admin-analytics-contract.test.ts`, `server/admin-analytics-read.integration.test.ts`), que documentam com precisão o comportamento esperado (`adminAnalytics.overview/operations/costs`, `activity.touch`, ambos restritos por papel). Verificar também se há um backup/checkpoint anterior de onde recuperar o conteúdo original.

### B-02 — Divergência entre git e disco em `docs/` **[verificado nesta auditoria]**
`git status` mostra 18 arquivos `docs/*.md`/`.json` como deletados (ainda rastreados), enquanto os mesmos arquivos existem, não rastreados, em `docs/exec-plan/`. A reorganização de pastas nunca foi commitada.
**Ação recomendada**: `git add`/`git rm` para refletir a reorganização real (ou desfazer, se não intencional) antes de qualquer novo commit — hoje um `git commit` acidental poderia apagar permanentemente o histórico de planejamento do ponto de vista do git.

## P1 — Pendências ativas de negócio (confirmar estado atual antes de agir)

### B-03 — Entregabilidade de e-mail transacional (SMTP → Gmail)
Segundo o histórico do projeto, mesmo após corrigir SPF, alinhamento de envelope e HELO/EHLO (para evitar o roteador anti-spam `fightspamHG` do provedor de hospedagem), **não há confirmação definitiva de entrega ao Gmail** via SMTP remoto autenticado da aplicação. Este é, segundo o próprio histórico, "o bloqueador tecnicamente mais crítico e genuinamente ainda em aberto do projeto".
Passos já mapeados e não concluídos:
- Obter no cPanel **Track Delivery** a trilha do último envio (recurso não habilitado na conta — requer solicitação ao provedor).
- Comparar a submissão SMTP remota do PPA com a entrega bem-sucedida via injeção local (Roundcube/Cube) para isolar a divergência de rota/cabeçalho.
- Abrir chamado especializado ao provedor de hospedagem (HostGator) pedindo rastreio Exim de uma tentativa específica.
- Só então autorizar um novo envio técnico controlado a um destinatário já aprovado.
Também vale confirmar com o responsável se `EMAIL_AUTOMATIONS_ENABLED = false` (`server/domain/email.ts:10`) é intencional **[verificado nesta auditoria: a constante existe e está `false`]**.

### B-04 — Confirmar estado real da homologação/produção PagBank
O histórico indica que a homologação de produção foi concluída e `PAGBANK_PRODUCTION_COMMERCIAL_MODE=enabled` foi habilitada, abrindo compra ao público (cartão, PIX, boleto). Isso **não pôde ser reverificado nesta auditoria** (sem acesso ao ambiente publicado/variáveis reais). Vários itens `[ ]` (não concluídos) do `todo.md` relativos a "antes de ativar cobrança comercial" parecem tecnicamente superados por entradas `[x]` posteriores — recomenda-se auditoria operacional rápida (consultar a flag em produção, rotas ativas, logs de homologação) para confirmar e então oficialmente encerrar esses itens de checklist. Especificamente, confirmar:
- Segregação real de endpoint/webhook/assinatura/reconciliação entre Sandbox e Produção.
- Se a validação de produção foi feita sem criar cobrança real antes da autorização explícita.
- Estado do cadastro da aplicação PagBank de produção (nome, identificador, descrição, URL) e da URL de notificação com autenticação técnica dedicada (item ainda listado como pendente no histórico).

### B-05 — Doutrina de dupla verificação em produção
Confirmar que a política de dupla verificação (assinatura de webhook + reconciliação TLS autenticada) está de fato implementada e testada especificamente nas credenciais/endpoint de **produção** (não apenas Sandbox), incluindo o cabeçalho `x-authenticity-token` — o histórico registra isso como item pendente em algum ponto, possivelmente já endereçado pela introdução da coluna `environment` na migração 0019.

## P2 — Débito técnico e limpeza (não bloqueante, mas reduz risco de manutenção)

### B-06 — Código residual do template "Manus" desconectado **[verificado nesta auditoria]**
Grande parte do SDK em `server/_core/` não está conectada à aplicação: `sdk.ts` (OAuth "Manus", nunca registrado), `heartbeat.ts` (cron, nenhum job criado), `notification.ts`, `dataApi.ts`, `map.ts`, `voiceTranscription.ts`, `imageGeneration.ts`, `systemRouter.ts` (não montado em `appRouter`). No cliente: `ComponentShowcase.tsx` (não roteado), `AIChatBox.tsx`, `DashboardLayout.tsx`/`DashboardLayoutSkeleton.tsx`, `ManusDialog.tsx`, `Map.tsx` — nenhum referenciado por página real.
**Ação recomendada**: decidir explicitamente entre remover (reduz superfície de manutenção e confusão para novos mantenedores) ou documentar como "reservado para uso futuro" — hoje geram ambiguidade sobre o que é produto vs. scaffold.

### B-07 — Dependências instaladas e nunca usadas
`@aws-sdk/client-s3` e `@aws-sdk/s3-request-presigner` estão em `package.json` mas não são importados em nenhum arquivo (o armazenamento de objetos real usa um proxy HTTP simples via Forge/Manus). Remover ou justificar a permanência.

### B-08 — Página 404 fora do design system **[verificado nesta auditoria]**
`client/src/pages/NotFound.tsx` mantém estilo/gradiente genérico do template e texto em inglês, quebrando a consistência visual "blueprint aeronáutico" e o idioma pt-BR do restante do produto.

### B-09 — `ReadinessDashboard` sem tratamento de erro dedicado **[verificado nesta auditoria]**
Diferente de `AdminAnalyticsDashboard`, `StudentProfilePage` e `PlansPage`, o dashboard de prontidão não trata o estado `error` de `dashboard.overview` — se a query falhar, a tela fica presa indefinidamente no skeleton de carregamento, sem opção de retry visível ao usuário.

### B-10 — Data hardcoded na página de políticas **[verificado nesta auditoria]**
`client/src/pages/PoliciesPage.tsx:64` tem a data de "última atualização" escrita diretamente no componente — precisa ser lembrada e editada manualmente a cada revisão de conteúdo; não há versionamento dinâmico.

### B-11 — Ausência de infraestrutura como código / CI **[verificado nesta auditoria]**
Não há `Dockerfile`, workflows de CI (GitHub Actions ou equivalente), nem `.env.example`. O processo de build/deploy parece depender inteiramente da plataforma Manus, sem paridade declarativa neste repositório. Recomenda-se ao menos versionar um `.env.example` documentando as variáveis necessárias (ver `docs/arquitetura.md` seção 7) e considerar formalizar o pipeline de deploy, mesmo que a execução continue delegada à plataforma.

### B-12 — Ausência de `relations()` do Drizzle
`drizzle/relations.ts` está vazio; todas as associações são FKs cruas e várias relações centrais (ex.: `study_sessions.programId`, `readiness_map_versions.eventId`) são apenas lógicas, sem constraint. Isso é funcional, mas dificulta o uso de `db.query.*` relacional do Drizzle e a validação automática de integridade em ferramentas que dependem de `relations()`.

## P3 — Melhorias sugeridas (não identificadas como pendência explícita no histórico, mas decorrentes da análise)

### B-13 — Alinhar rota de exportação de auditoria a um formato de retenção
`homologation_audit_events` não tem política de retenção/expurgo aparente no schema — como acumula evidência sanitizada indefinidamente, vale avaliar se há necessidade de arquivamento após determinado prazo, sobretudo se o volume crescer com uso comercial pleno.

### B-14 — Cobertura de testes de UI/E2E fora do servidor
A suíte automatizada (Vitest) cobre integralmente o backend; a validação de frontend depende de scripts manuais de captura via Chrome DevTools Protocol (não integrados a CI). Formalizar isso como suíte de regressão visual executável sob demanda reduziria dependência de revisão manual pura para mudanças de UI.

### B-15 — Consolidar variáveis de ambiente legadas
`JWT_SECRET`, `VITE_APP_ID`, `OAUTH_SERVER_URL`, `OWNER_OPEN_ID` só são usadas pelo SDK "Manus" desconectado (ver B-06). Se a decisão for remover esse código, essas variáveis também deixam de ser necessárias — simplificando a configuração de ambiente exigida para rodar o projeto.

### B-16 — Documentar explicitamente a política de retenção/exclusão de conta
Todas as FKs de dados pessoais usam `ON DELETE CASCADE` (exclusão de usuário remove todo o histórico), sem anonimização ou período de retenção observado no schema — vale confirmar se isso está alinhado à política de privacidade divulgada publicamente (`/politicas`) e à LGPD, especialmente quanto a obrigações de retenção de registros financeiros (ledger de créditos, pedidos PagBank) mesmo após exclusão de conta.

---

## Itens do histórico já concluídos (referência, sem ação necessária)

Não estão listados individualmente aqui por já constarem como `[x]` em `todo.md` e confirmados pelo histórico em `docs/exec-plan/`: modelagem completa da taxonomia PPA (872 conceitos), motor determinístico de aprendizagem, seleção adaptativa, cache pedagógico com barreira anti-vazamento RAG (872 conceitos × 4 rodadas auditadas), diagnóstico de 100 questões com regra transversal REG aprovada, branding oficial (logotipo, favicon, variante dark), Console Gerencial (sujeito ao gap B-01), homologação Sandbox PagBank completa, páginas públicas de planos/políticas/mapa de conceitos, fluxo de senha temporária/ativação/recuperação (implementação; entrega SMTP ainda pendente conforme B-03), login Google OAuth completo.
