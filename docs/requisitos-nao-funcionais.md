# Requisitos Não Funcionais — PPA Teórico / Tutor Adaptativo

> Documento de engenharia reversa das propriedades de qualidade **efetivamente implementadas** no código, com referência aos mecanismos concretos que as garantem. Onde a implementação é parcial ou apenas parcialmente validada em produção, isso é sinalizado.

## 1. Segurança

### RNF-01 — Hash de senha
Senhas locais são armazenadas com **scrypt** (N=32768, r=8, p=1, saída de 64 bytes, salt aleatório de 16 bytes), formato `scrypt$cost$salt$hash`. Comparação com `timingSafeEqual`. Nunca há senha em texto plano persistida, logada ou incluída em e-mail (`server/domain/password.ts`).

### RNF-02 — Proteção anti-força-bruta
Login: rate-limit de 5 falhas / 15 minutos por hash de e-mail. Emissão de senha temporária (ativação/recuperação): rate-limit de 3 emissões / 15 minutos por usuário.

### RNF-03 — Sessão segura
Sessão por token opaco em cookie httpOnly; troca de senha revoga todas as sessões anteriores atomicamente. Cookies de fluxo OAuth (`state`/`nonce`) são httpOnly, secure, SameSite=Lax, com TTL de 10 minutos.

### RNF-04 — Validação OAuth completa
Login Google valida emissor, audiência, expiração do ID token, `email_verified=true`, `state` (comparação em tempo constante) e `nonce` — nunca confia em dados de identidade fornecidos pelo cliente sem validação criptográfica junto ao provedor.

### RNF-05 — Verificação de webhook de pagamento
Assinatura HMAC SHA-256 do webhook PagBank comparada em **tempo constante** (`timingSafeEqual`), formato hexadecimal validado antes da comparação. Corpo bruto (raw body) processado sem transformação prévia para preservar a integridade da assinatura.

### RNF-06 — Dupla verificação financeira ("defesa em profundidade")
Doutrina explícita: webhook é um sinal, nunca fonte de verdade isolada. Quando a assinatura falha, o sistema só prossegue mediante reconciliação por consulta autenticada direta ao PagBank (server-to-server, token em segredo de servidor), validando produto e valor batendo com o pedido interno antes de conceder qualquer crédito.

### RNF-07 — Proteção contra header/log injection
Valores de cabeçalho de e-mail (SMTP) são validados contra CRLF injection; códigos de erro operacionais são sanitizados (remoção de quebras de linha e caracteres de controle) antes de persistidos.

### RNF-08 — Minimização de dados em auditoria de pagamento
Evidências de homologação PagBank removem totalmente credenciais/segredos/dados de cartão e mascaram parcialmente identidades — nunca persistem token de autorização, CVV, senha ou payload de pagamento completo.

### RNF-09 — TLS
SMTP exige porta 465 com TLS implícito (`SMTP_SECURE=true`), TLS mínimo 1.2, `rejectUnauthorized: true`. Certificado TLS do domínio de produção verificado (emissor Google Trust Services). Decisão documentada de **não exibir selo WebTrust/CA Browser Forum** por não ser uso autorizado para terceiros (ver `docs/exec-plan/tls-webtrust-research.md`).

### RNF-10 — Isolamento de segredos por ambiente
Tokens de Sandbox e Produção PagBank são segregados em variáveis de ambiente distintas; nenhuma credencial de Sandbox é reaproveitada em produção (política formalizada explicitamente no histórico do projeto).

---

## 2. Privacidade e proteção de dados (LGPD)

### RNF-11 — Isolamento estrito por usuário
Todo dado de progresso pedagógico, perfil, crédito e histórico de pagamento é isolado por `userId` em toda consulta e mutação, com FKs `ON DELETE CASCADE` para dados pessoais (exclusão de conta remove o histórico pessoal associado). Verificado por testes de acesso cruzado entre contas (`access-control.test.ts`, `student-profile.integration.test.ts`).

### RNF-12 — Minimização de dados na telemetria
Tabelas de telemetria (`platform_access_sessions`, `operation_metric_events`, `llm_usage_events`, `runtime_metric_snapshots`, `external_health_checks`) são projetadas, por comentário explícito no próprio schema, para **nunca** armazenar IP, user-agent, conteúdo de tela, prompts, respostas de LLM ou contexto RAG.

### RNF-13 — Não exposição de gabaritos e lógica pedagógica ao cliente
Gabaritos, conceitos-alvo, ações pedagógicas (`pedagogicalAction`) e instruções internas do tutor nunca trafegam para o cliente — validado por teste de contrato de questão (`question-contract.test.ts`) e por scripts de smoke que auditam a resposta HTTP crua.

### RNF-14 — Barreira anti-vazamento de fonte (RAG)
Ver RF-22. É tratada como requisito de privacidade/propriedade intelectual, não apenas de qualidade pedagógica: nenhuma menção a arquivos, módulos, caminhos, checksums ou proveniência do material de origem pode chegar ao aluno, direta ou indiretamente.

### RNF-15 — Página pública de políticas (LGPD)
Página dedicada de privacidade/LGPD com finalidade de tratamento declarada, canal de contato e escopo de uso dos dados restrito à preparação teórica do PPA.

---

## 3. Confiabilidade e integridade transacional

### RNF-16 — Idempotência onipresente
Toda operação financeira ou de estado crítico carrega chave de idempotência: pedidos (`billing_orders`, por usuário), tentativas de pagamento (global), lançamentos de ledger (por evento de negócio e por rede), webhooks (por provedor+dedupeKey), notificações internas (por usuário+dedupeKey), cache pedagógico (hash determinístico de conteúdo). Reenviar a mesma operação nunca duplica efeito.

### RNF-17 — Atomicidade sob concorrência
Saldo de crédito é protegido por `SELECT ... FOR UPDATE` antes de qualquer débito/crédito. Registro de resposta a questão usa transação com lock pessimista no mapa de prontidão do aluno. Reemissão de senha temporária é protegida contra corrida com uma segunda emissão concorrente.

### RNF-18 — Auditabilidade e imutabilidade de trilhas
`learning_events` (eventos de aprendizagem) e `credit_ledger` (lançamentos financeiros) são **append-only por design** — nunca há UPDATE/DELETE sobre essas tabelas, verificado inclusive por teste estático que varre o código-fonte em busca dessas operações proibidas.

### RNF-19 — Versionamento com checkpoints de integridade
Mapa de prontidão versionado por delta a cada evento, com snapshot completo a cada 20 versões e checksum (SHA-256) para detecção de corrupção, com estado explícito de degradação (`valid`/`recoverable`/`blocked`) em vez de falha silenciosa.

### RNF-20 — Retomabilidade determinística
Interrupção de sessão de diagnóstico/simulado é retomada exatamente na primeira posição da matriz ainda não respondida, sem duplicar nem pular questões.

### RNF-21 — Degradação controlada sem LLM
Avaliações de marco possuem fallback determinístico caso a geração via LLM falhe — a experiência pedagógica nunca trava por indisponibilidade do provedor de LLM. Telemetria de uso de LLM nunca bloqueia o fluxo pedagógico principal, mesmo em caso de falha de registro.

---

## 4. Desempenho e custo

### RNF-22 — Cache pedagógico como estratégia primária de custo
Questões e feedbacks aprovados são reutilizados entre alunos antes de qualquer nova chamada ao LLM, reduzindo custo e latência de geração — o LLM só é acionado quando não há item elegível em cache para aquele conceito/fonte/versão de catálogo.

### RNF-23 — Recuperação de evidência leve (sem vetor)
RAG usa índice invertido léxico ponderado por termo (tokenização + normalização pt-BR), não embeddings — menor custo computacional e de infraestrutura, ao custo de precisão semântica mais limitada que busca vetorial.

### RNF-24 — Telemetria de custo de LLM
Uso de LLM é instrumentado com tokens de entrada/saída, latência e custo estimado (quando há regra de preço vigente cadastrada), permitindo acompanhamento de custo operacional pelo console gerencial.

---

## 5. Disponibilidade e observabilidade

### RNF-25 — Health check mínimo
`GET /api/health` valida processo e conectividade de banco local; **não** substitui uma sonda de disponibilidade externa — a disponibilidade só é reportada no console gerencial quando uma sonda externa registra o resultado (nunca inferida).

### RNF-26 — Métricas administrativas sem estimativa enganosa
Percentuais sem denominador, custo sem regra de preço e disponibilidade sem sonda retornam explicitamente `null`/indisponível — nunca são exibidos como zero ou aproximados (ver RF-38).

### RNF-27 — Observabilidade própria, sem infraestrutura de terceiros
Não há heartbeat/cron, notificação externa ou roteador de sistema de terceiros — o SDK herdado do template inicial que oferecia isso nunca esteve conectado à aplicação e foi removido. A observabilidade real é inteiramente própria: a telemetria descrita em RF-37–RF-40.

---

## 6. Manutenibilidade e qualidade

### RNF-28 — Cobertura de testes automatizados
Suíte Vitest ampla cobrindo: regras de domínio (aprendizagem, matriz de avaliação, billing, cache, e-mail, senha, RAG, LLM), controle de acesso e isolamento entre contas, contratos de API (não vazamento de dados sensíveis), fluxos de integração completos (cadastro→ativação→login, diagnóstico de 100 questões, ciclo PagBank Sandbox/Produção, OAuth Google). Testes que dependem de rede real (SMTP ao vivo, sondas PagBank de produção) são isolados atrás de flags de ambiente (`RUN_SMTP_LIVE`, etc.) para não comprometer a confiabilidade da suíte padrão.

### RNF-29 — Processo de release com revisão manual obrigatória
Publicação automática está desativada como política permanente do projeto: toda entrega passa por checkpoint salvo, verificação de tipos/testes/build e confirmação explícita do responsável antes de qualquer publicação (ver `docs/exec-plan/release-process.md`).

### RNF-30 — Tipagem de ponta a ponta
TypeScript estrito no cliente e servidor, com contrato de API tipado por tRPC (`AppRouter`) compartilhado — mudanças de schema de entrada/saída são verificadas em tempo de compilação, não apenas em runtime.

---

## 7. Acessibilidade e usabilidade

### RNF-31 — Padrões ARIA
Uso de `role="radiogroup"`/`role="radio"` nas alternativas de questão, `role="tree"`/`role="treeitem"`/`aria-level` no mapa de conceitos e no dashboard de prontidão, `aria-live="polite"` na transição entre questões, `focus-visible` em controles interativos.

### RNF-32 — Responsividade
Layouts validados em desktop (≥1024px), tablet e mobile (a partir de ~360–430px), com padrões de layout dedicados (sidebar fixa vs. header + drawer) e evidência visual revisável registrada no histórico do projeto (`docs/exec-plan/visual-review.md`).

---

## 8. Restrições técnicas e de negócio

### RNF-33 — Ambientes de pagamento segregados
Sandbox e Produção PagBank nunca compartilham tokens, rotas efetivas de crédito ou dados de reconciliação — reforçado por coluna `environment` dedicada em todas as tabelas de billing/homologação.

### RNF-34 — Feature flags como controle de fase comercial
Habilitação de checkout comercial, checkout de homologação em produção e checkout sandbox são controladas por três flags de ambiente independentes, nunca por lógica implícita — nenhuma delas é ativada por padrão, exigindo configuração explícita.

### RNF-35 — Idioma e localização
Interface e conteúdo pedagógico em português do Brasil; validações de perfil usam localização pt-BR (ex.: UF brasileira, formatos de data). Exceção conhecida: página 404 (`NotFound.tsx`) permanece em inglês/estilo genérico do template, quebrando a consistência de idioma e marca (ver backlog).
