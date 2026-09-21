# PPA Teórico — Tutor Adaptativo

Plataforma de tutoria adaptativa para a preparação teórica do exame de Piloto Privado de Avião (PPA). Combina um motor determinístico de aprendizagem (classificação de resposta, prontidão por conceito, revisão espaçada) com geração de questões e feedback via LLM fundamentada em uma base de conhecimento própria (RAG léxico), cache pedagógico compartilhado entre alunos, e um módulo comercial de créditos pré-pagos integrado ao PagBank.

## Principais funcionalidades

- Diagnóstico inicial obrigatório de 100 questões (20 por matéria, cobertura de todos os capítulos do currículo canônico), seguido de escolha entre **Modo Simulado** (matriz fixa) e **Modo Tutor** (seleção adaptativa contínua com reforço de lacunas e revisão espaçada).
- Motor determinístico de classificação de resposta e de transição de estado de prontidão por conceito — nunca depende do LLM para essas decisões.
- Geração de questões, feedback e avaliações de marco via LLM, sempre fundamentada em evidência recuperada de uma base de conhecimento indexada, com barreira de validação que impede vazamento de metadados ou trechos da fonte para o aluno.
- Cache pedagógico compartilhado entre alunos (nunca repete uma questão para o mesmo aluno) para reduzir custo e latência de geração.
- Dashboard de prontidão por matéria/capítulo/tópico/conceito, avaliações de marco (a cada 20 e 100 questões) e planos de estudo versionados.
- Cadastro por e-mail com ativação/recuperação por senha temporária, e login opcional com Conta Google.
- Créditos pré-pagos com ledger imutável e checkout PagBank (cartão, Pix, boleto), com webhook verificado por assinatura e reconciliação server-to-server como defesa em profundidade.
- Console gerencial (papel `admin`) com métricas agregadas de produto, operação e custo — nunca expõe conteúdo de aluno, dados pessoais ou segredos.
- Páginas públicas de planos, políticas de uso/privacidade e mapa de conceitos canônico.

## Stack

- **Cliente**: React 19, Vite 7, `wouter`, TanStack Query + tRPC, Tailwind CSS 4, Radix UI / shadcn.
- **Servidor**: Express 4, tRPC 11, Drizzle ORM sobre MySQL.
- **LLM**: API compatível com OpenAI Chat Completions.
- **Armazenamento de objetos**: AWS S3.
- **E-mail**: SMTP via Nodemailer.
- **Pagamentos**: PagBank (checkout hospedado + webhook).
- **Testes**: Vitest.

Detalhes completos em [`docs/arquitetura.md`](docs/arquitetura.md).

## Como rodar

```bash
pnpm install
cp .env.example .env   # preencha DATABASE_URL e as demais variáveis necessárias
pnpm run db:push       # aplica as migrações no MySQL configurado
pnpm run dev           # sobe o servidor de desenvolvimento em http://localhost:3000
```

Outros comandos úteis:

```bash
pnpm run check   # type-check (tsc --noEmit)
pnpm test        # suíte Vitest
pnpm run build   # build de produção (client + server)
pnpm run start   # roda o build de produção
```

Também é possível rodar via Docker:

```bash
docker build -t ppa-tutor-adaptativo .
docker run --env-file .env -p 3000:3000 ppa-tutor-adaptativo
```

Guia operacional completo (scripts, migrações, troubleshooting) em [`docs/how-to.md`](docs/how-to.md).

## Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/requisitos-funcionais.md`](docs/requisitos-funcionais.md) | O que o sistema faz, por domínio |
| [`docs/requisitos-nao-funcionais.md`](docs/requisitos-nao-funcionais.md) | Segurança, privacidade, confiabilidade, desempenho |
| [`docs/arquitetura.md`](docs/arquitetura.md) | Stack, integrações, variáveis de ambiente, diagramas de fluxo |
| [`docs/as-built.md`](docs/as-built.md) | Estado real do código: telas, endpoints, rotas |
| [`docs/modelo-er.md`](docs/modelo-er.md) | Modelo de dados e diagrama entidade-relacionamento |
| [`docs/how-to.md`](docs/how-to.md) | Setup, build, scripts, deploy, troubleshooting |
| [`docs/backlog.md`](docs/backlog.md) | Pendências conhecidas |

O histórico de planejamento anterior a esta versão do projeto está preservado em `docs/pre-release/`, como registro — não é normativo para o estado atual.

## Licença

MIT.
