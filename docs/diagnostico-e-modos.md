# Diagnóstico inicial e modos de estudo

## Decisão de produto

Cada aluno que ainda não concluiu diagnóstico deverá realizar uma **rodada diagnóstica obrigatória de 100 questões**. A matriz utiliza cinco matérias, com 20 itens por matéria. A prova teórica da ANAC trata o PPA como um exame com provas por matéria; a página oficial direciona o detalhamento de quantidade de questões e duração ao Apêndice C da IS 00-003H.[1] A composição de cinco matérias e 20 questões por matéria foi adotada como regra operacional do produto.[2]

| Matéria | Capítulos | Questões diagnósticas | Cobertura mínima | Itens suplementares |
|---|---:|---:|---:|---:|
| Conhecimentos Técnicos de Aeronaves | 13 | 20 | 13 capítulos | 7 |
| Meteorologia Aeronáutica | 16 | 20 | 16 capítulos | 4 |
| Navegação Aérea VFR | 12 | 20 | 12 capítulos | 8 |
| Teoria de Voo de Baixa Velocidade | 10 | 20 | 10 capítulos | 10 |
| Regulamentos de Tráfego Aéreo | 21 | 20 | 21 capítulos por 1 item transversal | 0 |
| **Total** | **72** | **100** | **72 capítulos** | **29** |

## Regra transversal escolhida

Para resolver os 21 capítulos de Regulamentos dentro de 20 questões, a opção **C** foi aprovada. Uma questão deverá avaliar conjuntamente um conceito de `REG-C07` (**Regras do ar**) e outro de `REG-C08` (**Regras de voo visual**). A seleção inicial utiliza os conceitos `REG-C07-T01-K02` (cumprimento de regras gerais, VFR e IFR) e `REG-C08-T01-K02` (VMC), porque ambos podem ser avaliados em um único cenário de decisão operacional VFR.

O item transversal mantém `conceptIds` com os dois conceitos, conserva os dois `chapterIds` no plano diagnóstico e gera somente um contador global de questão/respondida. Cada conceito recebe sua própria transição de prontidão, para que um acerto ou erro não reduza a rastreabilidade individual.

## Regras de seleção

O plano diagnóstico é criado uma vez por aluno e permanece imutável. Primeiro, reserva-se um item por capítulo; em seguida, os 29 espaços restantes são preenchidos sem repetir conceito, em rodízio de capítulos e com prioridade para maior prioridade pedagógica, maior lacuna e menor índice canônico. Antes do diagnóstico terminar, não há revisão imediata, revisão espaçada ou seleção adaptativa por desempenho.

Após concluir a centésima questão diagnóstica, o aluno deve escolher explicitamente um modo. No **Simulado**, cada rodada é uma matriz de 100 questões com 20 por matéria, a mesma regra transversal de Regulamentos e conceitos inéditos sempre que houver disponibilidade. No **Tutor**, a seleção retoma o motor determinístico de reforço de lacunas e revisões do aluno. Os modos preservam o fluxo de questão, retorno pedagógico e próxima questão já existente; não são apresentados como prova oficial.

## Segurança e continuidade

O estado do diagnóstico, o plano de slots e a escolha de modo são isolados por `userId`. A criação do plano é idempotente; a posição do diagnóstico só avança junto à persistência da nova questão. O gabarito, os conceitos e o plano detalhado continuam exclusivamente no servidor. A escolha de modo será bloqueada até a conclusão integral do diagnóstico.

## Referências

[1]: https://www.gov.br/anac/pt-br/assuntos/regulados/profissionais-da-aviacao-civil/processo-de-licencas-e-habilitacoes/exame-teorico "ANAC — Exame de conhecimentos teóricos"
[2]: https://simuladosanac.com/blog/banca-da-anac-2026-piloto-privado/ "Banca da ANAC 2026 — Piloto Privado"
