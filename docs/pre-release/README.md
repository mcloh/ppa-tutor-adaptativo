# Documentação Pré-Release (fase Manus)

Esta pasta reúne o histórico da fase inicial do projeto, quando a aplicação foi construída e hospedada sobre a plataforma **Manus** (template `web-db-user`, com um SDK server-side próprio para OAuth, storage e proxy de LLM, entre outros serviços). Essa fase terminou com a migração do projeto para uma base de código independente de qualquer plataforma proprietária — a fase **release**, documentada em `/docs/`.

Nada aqui é normativo para o estado atual do produto. É mantido como registro histórico: decisões tomadas, problemas enfrentados e trabalho já concluído durante a fase Manus, incluindo a própria migração que encerrou essa fase.

## Conteúdo

- **`exec-plan/`** — registros originais de planejamento e execução de funcionalidades durante a fase Manus (pagamentos PagBank, entregabilidade de e-mail, branding, diagnóstico e modos de estudo, etc.), em português, no formato em que foram produzidos na época.
- **`manus-platform-legacy.md`** — descrição técnica do que era a plataforma Manus neste projeto, o que foi removido e o que foi substituído por provedores diretos (OpenAI, AWS S3) na transição para a fase release.

Para o estado atual do sistema, use exclusivamente os documentos em `/docs/` (fora desta pasta) e o `README.md` na raiz do repositório.
