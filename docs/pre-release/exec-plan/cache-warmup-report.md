# Relatório de Aquecimento do Cache Pedagógico

**Lote:** `ppa-ead-cache-2026-09-04-a`  
**Meta:** cobertura mínima de quatro questões aprovadas por conceito canônico.  
**Resultado da auditoria:** aprovado.

| Indicador | Resultado |
|---|---:|
| Conceitos canônicos | 872 |
| Questões aprovadas no cache | 3.504 |
| Cobertura mínima por conceito | 4 questões |
| Conceitos abaixo de quatro questões | 0 |
| Itens sem as três explicações | 0 |
| Assinaturas duplicadas | 0 |
| Referências proibidas à origem RAG | 0 |

As quatro ondas do lote geraram **872 itens cada**, todos vinculados a uma marca explícita de onda e lote no registro de validação. Há 16 itens aprovados adicionais que precedem o aquecimento, totalizando 3.504 questões reutilizáveis.

Cada questão aprovada tem explicações próprias para as classificações **correct**, **incorrect** e **Me ensine**. A auditoria avaliou enunciados, alternativas e explicações contra referências diretas e indiretas à origem RAG, incluindo menções a material EAD, módulos, aulas, apostilas, arquivos, fontes, proveniência, caminhos e identificadores técnicos.

> A geração adotou reintentos estruturados. O único conceito que não concluiu inicialmente a quarta onda foi regenerado de modo seletivo após reforço dos limites de tamanho das alternativas, concluindo com sucesso sem reduzir os controles de qualidade.

## Nota de validação de build

As verificações de tipos e a suíte de 29 testes foram aprovadas. A compilação do cliente via Vite foi tentada duas vezes e atingiu o limite de heap do ambiente durante a transformação de dependências, inclusive após liberar o verificador contínuo e elevar o heap para 768 MiB. Isso não alterou os resultados do aquecimento, que foi concluído e auditado diretamente no banco; a próxima execução de build deve ocorrer em um ambiente com heap superior ou com otimização de dependências segmentada.
