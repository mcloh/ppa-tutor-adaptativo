# Console Gerencial do PPA Teórico

O Console Gerencial é uma área exclusiva para usuários com papel **admin**. Ele consolida métricas agregadas de produto, comercial, operação, LLM e custos sem transportar conteúdo de aluno, dados pessoais, prompts, respostas, contexto RAG, tokens, URLs de pagamento ou identificadores internos ao cliente.

| Área | Fonte primária | Situação de cobertura |
|---|---|---|
| Cadastros e login | `users`, `auth_login_attempts` | Histórico existente agregado |
| Estudo e aprendizagem | `study_sessions`, `study_questions`, `learning_events` | Histórico existente agregado |
| Comercial | `billing_orders`, `payment_attempts` | Histórico existente agregado; produção PagBank continua bloqueada até homologação |
| Cache | `shared_question_cache` | Histórico existente agregado |
| Atividade | `platform_access_sessions` | Inicia com o console; não retroage sessões anteriores |
| LLM | `llm_usage_events` | Inicia com esta instrumentação; sem conteúdo de chamada |
| Recursos | `runtime_metric_snapshots` | Leituras do processo Node observado, não da infraestrutura completa |
| Disponibilidade | `external_health_checks` | Nula até que uma sonda externa independente grave verificações |
| Custos | `llm_pricing_rules`, `operational_cost_entries` | Nulo quando não houver regra de preço ou lançamento administrativo |

> **Regra de precisão:** percentuais sem denominador, disponibilidade sem sonda externa, custo LLM sem regra de preço e totais que exigiriam conversão cambial são retornados como `null` e exibidos como indisponíveis. O console não estima nem preenche valores ausentes.

## Controle de acesso e privacidade

As consultas `adminAnalytics.*` usam `adminProcedure`. Contas `user` e `homologation` não recebem item de navegação e recebem `FORBIDDEN` se chamarem a API diretamente. A telemetria de atividade registra somente o usuário interno no servidor, uma chave de sessão efêmera, timestamps, tempo agregado e a área da aplicação. Ela não registra IP, user-agent, cliques, textos, questões, respostas ou navegação detalhada.

As chamadas pedagógicas de LLM registram, em melhor esforço, operação, provedor, modelo, tokens disponíveis, estado, latência e custo calculável. Mensagens, alternativas, explicações, contexto RAG e conteúdo de aluno não são persistidos pela telemetria.

## Health check

`GET /api/health` confirma somente que o processo e o banco local respondem. Ele devolve `{ "status": "ok" }` ou `{ "status": "degraded" }`; não expõe configuração, banco, usuário, modelo ou outros detalhes internos. Esse endpoint não é uma medição de disponibilidade externa.
