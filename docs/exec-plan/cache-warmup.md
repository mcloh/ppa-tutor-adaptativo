# Aquecimento auditado do cache pedagógico

O aquecimento estabelece uma cobertura mínima de **quatro questões aprovadas por conceito canônico**. Para os 872 conceitos do catálogo atual, a meta é de **3.488 questões**, cada uma com explicações reutilizáveis para `correct`, `incorrect` e `Me ensine`.

O processo é executado em quatro rodadas. Em cada rodada, o trabalhador consulta o índice RAG somente no servidor, gera uma questão e as três explicações em saída JSON estruturada, bloqueia referências diretas ou indiretas à fonte e grava o item pelo identificador de assinatura. Cada novo item recebe `warmup.batchId` e `warmup.wave` no JSON de validação, permitindo auditoria item→onda. O progresso é persistido em `/home/ubuntu/ppa-cache-warmup/progress.json`; a reexecução volta a consultar a cobertura real do banco e não duplica itens já aprovados.

| Rodada | Cobertura mínima após a rodada | Itens planejados |
|---:|---:|---:|
| 1 | 1 questão por conceito | 872 |
| 2 | 2 questões por conceito | 872 |
| 3 | 3 questões por conceito | 872 |
| 4 | 4 questões por conceito | 872 |

Exemplos operacionais:

```bash
pnpm tsx scripts/warm-cache.mjs --round=1 --workers=6
pnpm tsx scripts/warm-cache.mjs --round=2 --workers=6
pnpm tsx scripts/warm-cache.mjs --round=3 --workers=6
pnpm tsx scripts/warm-cache.mjs --round=4 --workers=6
```

Antes de iniciar uma rodada completa, o modo seco permite conferir o plano sem chamar o modelo:

```bash
pnpm tsx scripts/warm-cache.mjs --round=1 --dry-run
```
