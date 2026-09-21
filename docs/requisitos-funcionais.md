# Requisitos Funcionais — PPA Teórico / Tutor Adaptativo

> Documento de engenharia reversa. Descreve o comportamento **realmente implementado** no código-fonte (branch `master`, commit `a502345`), não um backlog de intenções. Onde uma funcionalidade está parcialmente implementada, bloqueada por feature flag, ou é código morto herdado do template inicial, isso é sinalizado explicitamente. Pendências e melhorias estão em `docs/backlog.md`.

## Sumário

1. Identidade e acesso
2. Perfil do aluno e histórico ANAC
3. Catálogo canônico e taxonomia PPA
4. Motor de estudo adaptativo (diagnóstico, simulado, tutor)
5. Cache pedagógico compartilhado (RAG + LLM)
6. Prontidão, avaliações de marco e planos de estudo
7. Notificações internas
8. Créditos e pagamentos (PagBank)
9. Console Gerencial (admin) e telemetria
10. Homologação de pagamentos (papel `homologation`)
11. Páginas públicas

---

## 1. Identidade e acesso

### RF-01 — Cadastro por e-mail
O usuário se cadastra informando apenas o e-mail (`auth.register`). O sistema cria uma conta inativa com senha temporária aleatória (18 caracteres, alfabeto sem ambiguidade visual, TTL de 30 minutos) e envia por e-mail as instruções de ativação. Se o envio SMTP falhar, a criação da conta é desfeita (rollback), exceto se a conta já havia recebido um envio bem-sucedido anteriormente.

### RF-02 — Login local
Login por e-mail + senha (`auth.login`), com rate-limiting de 5 tentativas falhas por 15 minutos por hash do e-mail. Login é bloqueado se a senha temporária estiver expirada, direcionando o usuário ao fluxo de recuperação.

### RF-03 — Troca de senha obrigatória
Toda conta criada com senha temporária (ativação ou recuperação) é marcada com `passwordChangeRequired=true`, o que bloqueia o acesso a qualquer funcionalidade protegida (inclusive estudo) até que o usuário troque a senha (`auth.changePassword`, mínimo 12 caracteres, com confirmação). A troca revoga todas as sessões anteriores e emite uma nova.

### RF-04 — Recuperação de senha ("Esqueci minha senha")
Fluxo público (`auth.requestPasswordReset`) sempre responde com sucesso genérico, independentemente de o e-mail existir ou de a conta ser vinculada exclusivamente ao Google — previne enumeração de contas. Emite nova senha temporária apenas para contas com senha local. Rate-limit de 3 emissões por 15 minutos por usuário.

### RF-05 — Login e vinculação de Conta Google (OAuth 2.0)
Login "Continuar com a Conta Google" complementar ao acesso local. Fluxo Authorization Code com `state` (anti-CSRF) e `nonce` (anti-replay) de 32 bytes, cookie httpOnly/secure/SameSite=Lax com TTL de 10 minutos. Validação de `id_token`: emissor, audiência (`GOOGLE_OAUTH_CLIENT_ID`), expiração e `email_verified=true`. Regras de vinculação:
- Google subject já conhecido → login direto.
- E-mail local existente, sem Google vinculado → vincula pelo e-mail normalizado, preserva senha local e papel (`role`) existente, promove `loginMethod` para `password_google`.
- E-mail novo → cria conta federada sem senha conhecida (`loginMethod=google`).
- Não permite vincular um novo Google subject a um e-mail já vinculado a outro Google subject.
- Redirect URI fixo em produção (`https://ppa.simulados.apia.app.br/api/auth/google/callback`), não aceita redirecionamento dinâmico.

### RF-06 — Sessão
Sessão própria por token opaco em cookie (não é JWT do fluxo legado "Manus"). Logout revoga a sessão corrente e limpa o cookie.

### RF-07 — Papéis de usuário
Três papéis mutuamente exclusivos, sem hierarquia: `user` (padrão, aluno), `admin` (console gerencial e curadoria de cache), `homologation` (conta técnica exclusiva para validação de pagamentos com o PagBank). Cada procedure do backend valida o papel exigido de forma independente.

---

## 2. Perfil do aluno e histórico ANAC

### RF-08 — Dados cadastrais
Cada aluno mantém um perfil isolado (`studentProfile.get`/`update`) com nome, data de nascimento, gênero (M/F/NB), cidade, UF e origem do curso teórico PPA. E-mail, `id` e `openId` são somente leitura — nunca editáveis nem exibidos como campos de formulário.

### RF-09 — Histórico de tentativas ANAC
O aluno pode registrar tentativas reais do exame ANAC (`studentProfile.attempts.create`/`list`): data da prova, notas de MET/REG/NAV/MEC/TVO (0–20) e resultado aprovado/reprovado. Histórico ordenado do mais recente ao mais antigo, isolado por usuário.

### RF-10 — Gestão de senha no perfil
Contas locais veem a opção de trocar senha no perfil; contas exclusivamente Google são informadas de que a senha é gerida pelo provedor de identidade (sem opção de troca local).

---

## 3. Catálogo canônico e taxonomia PPA

### RF-11 — Taxonomia versionada
O currículo é modelado em uma hierarquia curso → matéria → capítulo → tópico → conceito, com **872 conceitos canônicos** distribuídos em **72 capítulos** e **5 matérias** (MET, REG, NAV, MEC/TVO conforme agrupamento do exame ANAC), versionado (`course_catalog_versions`) e associado a um checksum da fonte de conteúdo.

### RF-12 — Mapa de conceitos público
Página pública (`/mapa-de-conceitos`) exibe a taxonomia completa em árvore expansível com busca, contagens por nível e explicação de cobertura por plano de créditos — **sem IDs internos, sem dados de RAG, sem prioridades e sem dados individuais de alunos** (barreira de exposição testada explicitamente).

---

## 4. Motor de estudo adaptativo

### RF-13 — Diagnóstico inicial obrigatório (100 questões)
Toda conta nova deve completar uma rodada diagnóstica de 100 questões antes de escolher uma modalidade de estudo: 20 questões por matéria (MET, REG, NAV, MEC, TVO), cobrindo ao menos um item por capítulo. Regra especial para REG (21 capítulos, 20 slots): uma questão avalia conjuntamente os capítulos `REG-C07` (Regras do Ar) e `REG-C08` (Regras de Voo Visual) em um único cenário operacional, usando dois `conceptIds`, com transições de prontidão independentes por conceito. A matriz é gerada uma única vez por aluno e é imutável; retomada é determinística pela primeira posição não respondida.

### RF-14 — Escolha de modalidade pós-diagnóstico
Ao concluir a questão 100, o aluno é obrigado a escolher entre **Modo Simulado** (nova rodada de 100 questões na mesma matriz balanceada, sem adaptação, sem revisão espaçada) e **Modo Tutor** (seleção adaptativa contínua, priorizando lacunas, reforço imediato e revisão espaçada). A escolha é **imutável** após confirmada; tentar trocar de modalidade depois é rejeitado.

### RF-15 — Motor determinístico de classificação de resposta
Toda resposta é classificada de forma 100% determinística no servidor (sem uso de LLM para essa decisão): `correct`, `incorrect` ou `me_ensine` (alternativa especial "Me ensine", que nunca conta como erro nem como tentativa independente).

### RF-16 — Máquina de estados de prontidão por conceito
Cada par aluno×conceito evolui por estados (`not_presented`, `presented`, `taught`, `independent_correct`, `partial_consolidation`, `partial_adequate`, `partial_strong`, `partial_confirmed`, `confirmed`, `relearning`). Regras centrais:
- "Me ensine" → `taught`, elegível a revisão já na questão seguinte.
- Erro → `relearning`, elegível a revisão já na questão seguinte.
- Acerto em revisão imediata → `partial_consolidation` (+5 questões até nova revisão).
- **Acerto em revisão espaçada é o único caminho para o estado `confirmed`** (+100 questões, +7 dias) — um acerto novo/imediato nunca confirma sozinho um conceito.
- Acerto "novo": evolui `independent_correct` → `partial_adequate` (2 acertos) → `partial_strong` (3+), com elegibilidade de revisão em +5 ou +20 questões e `reviewDueAt` em +4h ou +24h.

### RF-17 — Seleção adaptativa de conceitos (Modo Tutor)
Pesos combinados de prioridade pedagógica (P1–P4), lacuna (`gapScore`), incidência recente no exame real, cobertura já praticada (penaliza excesso), confiança (prioriza reforço em baixa confiança), erros recentes, escassez de material de referência e recência da última resposta. Fila de seleção com prioridade: revisão imediata vencida → revisão espaçada vencida → conceitos nunca apresentados → fallback geral. Regra de balanceamento: nunca mais de 3 questões seguidas da mesma matéria.

### RF-18 — Fluxo de resposta e transição
Após responder, o aluno recebe classificação, feedback em Markdown e, quando aplicável, uma avaliação de marco. A UI exibe uma tela de transição ("calculando próximo conceito") antes de revelar a próxima questão, nunca reapresentando a questão anterior; falhas de rede permitem nova tentativa sem duplicar o registro da resposta (idempotência: reenviar resposta a uma questão já respondida retorna o resultado gravado, sem reprocessar).

### RF-19 — Isolamento de progresso por aluno
Todo o estado de estudo (sessões, questões, eventos de aprendizagem, mapa de prontidão, avaliações, planos) é estritamente isolado por `userId` em toda consulta, mutação e notificação — verificado por testes de acesso não autorizado entre contas.

---

## 5. Cache pedagógico compartilhado (RAG + LLM)

### RF-20 — Geração de questões com evidência RAG
Questões, feedbacks e avaliações são gerados por LLM (modelo `gpt-5-mini` via proxy compatível com OpenAI Chat Completions) sempre fundamentados em trechos recuperados de uma base de conhecimento indexada (`knowledge_chunks`), por um recuperador léxico (tokenização + índice invertido ponderado por termo — não é busca vetorial/embeddings).

### RF-21 — Cache pedagógico compartilhado entre alunos
Questões aprovadas (com as três explicações — correto, incorreto, "Me ensine" — já preenchidas) são reutilizadas entre todos os alunos, chaveadas por hash determinístico de conteúdo (deduplicação automática). Uma questão do cache **nunca é reentregue ao mesmo aluno** que já a recebeu (ineditismo garantido por junção excludente na consulta de elegibilidade), mesmo sendo compartilhada globalmente.

### RF-22 — Barreira anti-vazamento de fonte
Toda saída de LLM — e toda entrega vinda do cache — passa por validação que bloqueia: (a) marcadores de metadado interno (nomes de arquivo, checksum, caminhos, IDs de chunk); (b) expressões diretas ou indiretas de proveniência ("segundo o material", "neste módulo", "apostila", "base de conhecimento" etc.); (c) reprodução literal de qualquer trecho ≥100 caracteres da evidência de origem. Uma questão do cache que falhe essa checagem no momento de servir é **automaticamente retirada** do cache (não apagada fisicamente — apenas marcada `retired`).

### RF-23 — Governança e curadoria do cache (papel admin)
Administradores podem consultar métricas agregadas do cache (`cacheAdmin.metrics`) e retirar itens aprovados (`cacheAdmin.retire`), exigindo justificativa com no mínimo 10 caracteres. Itens retirados nunca voltam a ser elegíveis para entrega, mas permanecem no histórico para auditoria.

### RF-24 — Aquecimento de cache (offline, via script operacional)
Processo de aquecimento (`scripts/warm-cache.mjs`) gera proativamente até 4 questões aprovadas por conceito canônico, em lotes/ondas controladas, evitando duplicação e sempre respeitando a barreira anti-vazamento.

---

## 6. Prontidão, avaliações de marco e planos de estudo

### RF-25 — Dashboard de prontidão
Painel por aluno com: percentual de acerto independente, questões apresentadas, pedidos "Me ensine", revisões devidas, lacunas prioritárias, cobertura e acurácia por matéria, e árvore expansível de prontidão por matéria → capítulo → tópico → conceito com rótulos de estado traduzidos.

### RF-26 — Avaliações de marco
A cada 20 questões respondidas (avaliação parcial, `partial_20`) e na centésima (`diagnostic_100`), o sistema gera e persiste uma avaliação de progresso em Markdown, com rodapé auditável citando intervalo de questões e versão do mapa de prontidão vigente. Avaliações nunca declaram "fracasso" pela ausência de evidência — apenas incerteza. O **Modo Simulado nunca gera avaliação de marco** (exclusivo de diagnóstico e Modo Tutor). Há um fallback determinístico (sem LLM) caso a geração via LLM falhe, garantindo que o marco nunca trave a experiência do aluno.

### RF-27 — Plano de estudo versionado
Ao concluir o diagnóstico (marco 100), um plano de estudo em Markdown é gerado e versionado por aluno, referenciando a versão do mapa de prontidão que o originou.

### RF-28 — Versionamento auditável do mapa de prontidão
Cada resposta válida gera uma nova versão do mapa de prontidão do aluno (delta + checksum), com snapshot completo a cada 20 versões, permitindo reconstrução auditável do histórico.

---

## 7. Notificações internas

### RF-29 — Notificações de revisão vencida e avaliação disponível
O sistema gera notificações internas deduplicadas (`review_due`, `assessment_ready`, `integrity_attention`), exibidas em um painel com contagem de não lidas; o aluno pode marcar como lida. Preparado para extensão futura de e-mail transacional (ainda não conectado a esse tipo de notificação).

---

## 8. Créditos e pagamentos (PagBank)

### RF-30 — Créditos de boas-vindas (trial)
Toda nova conta recebe 100 créditos gratuitos de diagnóstico, concedidos de forma idempotente (mesmo em contas anteriores à existência do sistema de créditos).

### RF-31 — Catálogo comercial de créditos
Cinco níveis de pacote: Diagnóstico (gratuito, aplicado uma única vez), Essencial (100 créditos, R$4,90), Panorâmico (500 créditos, R$14,90), Ponte Aérea (1.000 créditos, R$24,90, destaque), Comando (3.000 créditos, R$44,90).

### RF-32 — Débito de crédito por questão
Cada questão apresentada debita 1 crédito, **apenas quando a venda comercial está habilitada** (`enforceStudyCredits`, controlada por variável de ambiente); antes disso, o estudo é integralmente gratuito.

### RF-33 — Checkout hospedado PagBank
Três variantes de checkout, cada uma restrita por papel e por flag de ambiente: Sandbox (exclusivo `homologation`), Homologação em Produção (exclusivo `homologation`), Comercial em Produção (qualquer aluno autenticado, quando habilitado). Catálogo, preço e referência de pedido nunca trafegam do cliente — são resolvidos inteiramente no servidor. O link de pagamento (`PAY`) é validado como HTTPS antes de ser exibido; abre em nova aba (não em iframe, pois o PagBank bloqueia incorporação via `X-Frame-Options`).

### RF-34 — Webhook e reconciliação de dupla verificação
Webhook do PagBank valida assinatura SHA-256 em tempo constante. Quando a assinatura está ausente/inválida mas o cabeçalho identifica um pedido (`ORDE_...`), o servidor faz consulta autenticada server-to-server ao PagBank antes de creditar — **o corpo do webhook nunca é usado isoladamente como fonte financeira de verdade**. Crédito é concedido de forma transacional e idempotente apenas quando o status confirmado é `PAID`.

### RF-35 — Ledger de créditos imutável
Toda movimentação de crédito (concessão, débito, ajuste, estorno) gera uma linha de apêndice em um livro-razão que nunca é atualizado nem apagado, com snapshot do saldo resultante e chave de idempotência dupla (por evento de negócio e por tentativa de rede).

### RF-36 — Retorno de checkout informativo
Após redirecionamento do PagBank, o aluno vê um estado informativo de conciliação (pendente/confirmado/erro) — o saldo só é atualizado após confirmação autenticada do servidor, nunca pela própria URL de retorno.

---

## 9. Console Gerencial (papel admin) e telemetria

### RF-37 — Métricas agregadas (comercial, produto, operação, custos)
Painel exclusivo de administradores com abas "Comercial e produto" (cadastros, receita, uso por modalidade, engajamento) e "Operação e confiabilidade" (falhas transacionais, disponibilidade externa, custo estimado de LLM, sessões recentes, integridade de conteúdo, uso de LLM por operação/modelo, recursos de runtime, custos operacionais registrados).

### RF-38 — Regra de precisão de métricas
Toda métrica sem denominador válido, sem sonda externa de disponibilidade, ou sem regra de preço aplicável, é exibida explicitamente como indisponível (`null`) — o console **nunca estima ou preenche valores ausentes**.

### RF-39 — Telemetria de atividade minimalista
Registro de presença por sessão (view atual, tempo ativo, timestamps) sem IP, user-agent, cliques ou conteúdo navegado — coleta começa a partir da instalação da instrumentação e não retroage.

### RF-40 — Health check
Endpoint `GET /api/health` verifica apenas processo e conectividade local com o banco (não é uma medição de disponibilidade externa).

> **Gap conhecido**: o roteador que implementa `activity.*`/`adminAnalytics.*` (`server/routers/adminAnalytics.ts`) está ausente do repositório atual, apesar de referenciado e coberto por testes de contrato. Ver `docs/backlog.md`.

---

## 10. Homologação de pagamentos (papel `homologation`)

### RF-41 — Trilha de auditoria sanitizada
Operações do ciclo PagBank (criação de checkout, abertura, retorno, webhook, reconciliação, liquidação) são registradas com evidência de requisição/resposta sanitizada (credenciais e dados de cartão removidos; identidades parcialmente mascaradas; URLs de checkout preservadas literalmente por serem necessárias à reprodução do fluxo perante o parceiro de pagamento).

### RF-42 — Exportação de evidência
Conta de homologação pode exportar evidência em JSON versionado para envio ao PagBank, restrita a seus próprios eventos; a exportação marca os eventos como exportados.

---

## 11. Páginas públicas

### RF-43 — Vitrine de planos sem login
`/planos` exibe os cinco níveis de crédito, comunicado sobre a fase de diagnóstico gratuito, e CTAs de compra que ficam desabilitados ("Indisponível") enquanto a venda comercial não estiver habilitada por flag de ambiente.

### RF-44 — Página de políticas
`/politicas` apresenta Política de Uso, Cyber-segurança e Privacidade/LGPD, com finalidade educacional explícita, ausência de vínculo com a ANAC, tratamento de dados, uso de pagamentos via PagBank e canal de contato (`simulados@apia.app.br`).

### RF-45 — Mapa de conceitos público
Ver RF-12. Acessível sem autenticação, com link persistente no rodapé estrutural ao lado do link de políticas.
