# Notas de validação

## Prévia responsiva — 28 de agosto de 2026

As capturas da rota pública foram revisadas nas larguras de **1280 × 720** e **390 × 844**. A tela mantém o fundo azul-real com grade técnica, hierarquia tipográfica branca, quadro de acesso e campos de cadastro dentro da largura disponível. Na largura móvel, os indicadores permanecem em três colunas, o formulário usa campos de largura integral e os ícones ficam centralizados dentro dos respectivos controles.

## Fluxo protegido

Os smoke tests controlados validaram cadastro local, cookie de sessão, isolamento entre contas, entrega de questão sem gabarito ou metadados pedagógicos, retorno **Me ensine**, recuperação RAG e reuso de questão/explicação entre contas distintas. As contas técnicas são removidas após as verificações.

## RAG e cache

O acervo `aviação ppa ead.zip` foi extraído por OCR para 369 trechos versionados e indexados no banco. A geração de questão, feedback e avaliação recebe material recuperado exclusivamente no servidor. Validações de saída impedem caminhos, identificadores, checksums, marcadores de fonte e reprodução literal dos trechos.
