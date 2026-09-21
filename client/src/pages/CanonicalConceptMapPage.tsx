import { OfficialBrandLogo } from "@/components/OfficialBrandLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, BookOpenCheck, CheckCircle2, ChevronRight, CircleDot, Compass, Layers3, ListTree, PlaneTakeoff, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "wouter";

type PublicTopic = {
  name: string;
  conceptCount: number;
  concepts: Array<{ name: string }>;
};

type PublicChapter = {
  name: string;
  conceptCount: number;
  topics: PublicTopic[];
};

type PublicMatter = {
  name: string;
  conceptCount: number;
  chapters: PublicChapter[];
};

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function contains(value: string, term: string) {
  return normalize(value).includes(term);
}

function filterMatters(matters: PublicMatter[], query: string) {
  const term = normalize(query);
  if (!term) return matters;

  return matters.flatMap(matter => {
    if (contains(matter.name, term)) return [matter];

    const chapters = matter.chapters.flatMap(chapter => {
      if (contains(chapter.name, term)) return [chapter];

      const topics = chapter.topics.flatMap(topic => {
        if (contains(topic.name, term)) return [topic];
        const concepts = topic.concepts.filter(concept => contains(concept.name, term));
        return concepts.length ? [{ ...topic, concepts }] : [];
      });

      return topics.length ? [{ ...chapter, topics }] : [];
    });

    return chapters.length ? [{ ...matter, chapters }] : [];
  });
}

function visibleConceptCount(matters: PublicMatter[]) {
  return matters.reduce(
    (matterTotal, matter) => matterTotal + matter.chapters.reduce(
      (chapterTotal, chapter) => chapterTotal + chapter.topics.reduce(
        (topicTotal, topic) => topicTotal + topic.concepts.length,
        0,
      ),
      0,
    ),
    0,
  );
}

function visibleNodeKeys(matters: PublicMatter[]) {
  return matters.flatMap((matter, matterIndex) => [
    `matter-${matterIndex}`,
    ...matter.chapters.flatMap((chapter, chapterIndex) => [
      `matter-${matterIndex}-chapter-${chapterIndex}`,
      ...chapter.topics.map((_, topicIndex) => `matter-${matterIndex}-chapter-${chapterIndex}-topic-${topicIndex}`),
    ]),
  ]);
}

export default function CanonicalConceptMapPage() {
  const catalog = trpc.canonicalCatalog.publicMap.useQuery(undefined, { staleTime: 10 * 60_000, refetchOnWindowFocus: false });
  const [query, setQuery] = useState("");
  const [openByNode, setOpenByNode] = useState<Record<string, boolean>>({});
  const hasSearch = Boolean(normalize(query));
  const matters = useMemo(() => filterMatters(catalog.data?.matters ?? [], query), [catalog.data?.matters, query]);
  const matchingConcepts = useMemo(() => visibleConceptCount(matters), [matters]);
  const nodeKeys = useMemo(() => visibleNodeKeys(matters), [matters]);

  const isOpen = (nodeKey: string, level: "matter" | "chapter" | "topic") => hasSearch || (openByNode[nodeKey] ?? level === "matter");
  const setNodeOpen = (nodeKey: string, nextOpen: boolean) => setOpenByNode(current => ({ ...current, [nodeKey]: nextOpen }));
  const openAll = () => setOpenByNode(current => ({ ...current, ...Object.fromEntries(nodeKeys.map(nodeKey => [nodeKey, true])) }));
  const closeAll = () => setOpenByNode(current => ({ ...current, ...Object.fromEntries(nodeKeys.map(nodeKey => [nodeKey, false])) }));

  if (catalog.isLoading) return <CatalogLoading />;
  if (catalog.error || !catalog.data) return <CatalogUnavailable />;

  const { counts } = catalog.data;
  const creditScenarios = [
    { plan: "Essencial", credits: 100, potential: `até ${Math.round((100 / counts.concepts) * 100)}%`, detail: "Uma primeira volta pela teoria, guiada passo a passo." },
    { plan: "Panorâmico", credits: 500, potential: `até ${Math.round((500 / counts.concepts) * 100)}%`, detail: "Um trecho amplo do mapa para ganhar visão de conjunto." },
    { plan: "Ponte Aérea", credits: 1000, potential: "100% + margem", detail: `Espaço para conhecer os ${counts.concepts.toLocaleString("pt-BR")} conceitos e voltar ao que pedir mais atenção.` },
    { plan: "Comando", credits: 3000, potential: `${Math.floor(3000 / counts.concepts)} ciclos +`, detail: "Mais espaço para explorar, reforçar e revisar ao longo da preparação." },
  ];
  const metrics = [
    { value: counts.matters, label: "Matérias" },
    { value: counts.chapters, label: "Capítulos" },
    { value: counts.topics, label: "Tópicos" },
    { value: counts.concepts, label: "Conceitos", emphasis: true },
  ];

  return (
    <main className="blueprint-grid flex-1 bg-background px-4 py-8 text-foreground sm:px-6 sm:py-10 lg:px-10">
      <div className="mx-auto w-full max-w-[1440px] pb-12">
        <header className="relative overflow-hidden border border-white/15 bg-[#061847]/80 p-6 shadow-[0_22px_60px_rgba(0,0,0,0.22)] sm:p-9">
          <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full border border-sky-200/15 shadow-[0_0_0_42px_rgba(150,222,255,0.025)]" aria-hidden="true" />
          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-4xl">
              <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-sky-200"><ListTree className="h-3.5 w-3.5" />Mapa curricular público</p>
              <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-white sm:text-5xl">A rota completa pelos <span className="text-sky-200">conceitos canônicos.</span></h1>
              <p className="mt-5 max-w-3xl text-sm leading-6 text-blue-100/80 sm:text-base">Explore a estrutura que organiza a teoria de Piloto Privado de Avião em curso, matéria, capítulo, tópico e conceito. Cada conceito representa uma unidade observável de prática no PPA Teórico — Tutor Adaptativo.</p>
            </div>
            <div className="flex items-start justify-between gap-5 border-t border-white/15 pt-5 sm:max-w-sm lg:block lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
              <OfficialBrandLogo variant="dark" className="h-auto w-44 object-contain sm:w-52" />
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-sky-100/70 lg:mt-5 lg:block">Estrutura de estudo PPA</span>
            </div>
          </div>

          <div className="relative mt-8 grid grid-cols-2 border-y border-white/15 sm:grid-cols-4">
            {metrics.map((metric, index) => <Metric key={metric.label} {...metric} bordered={index > 0} />)}
          </div>
        </header>

        <section className="mt-6 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <article className="cad-frame p-5 sm:p-7">
            <p className="eyebrow flex items-center gap-2"><Compass className="h-3.5 w-3.5" />Como ler o mapa</p>
            <h2 className="mt-2 font-display text-2xl font-bold text-white">Do curso ao que será praticado.</h2>
            <p className="mt-4 text-sm leading-6 text-blue-100/75">Pense nesta árvore como uma carta de navegação da teoria: a partir do curso, cada matéria se desdobra em capítulos, tópicos e conceitos. Explore os caminhos e descubra como os grandes temas da formação se transformam em pequenas etapas de estudo.</p>
            <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-sky-100">
              {["Curso", "Matéria", "Capítulo", "Tópico", "Conceito"].map((label, index) => <span key={label} className="contents"><span className="border border-sky-200/30 bg-sky-200/[0.06] px-2.5 py-2">{label}</span>{index < 4 && <ChevronRight className="h-3.5 w-3.5 text-sky-200/70" />}</span>)}
            </div>
          </article>

          <article className="cad-frame overflow-hidden p-5 sm:p-7">
            <p className="eyebrow flex items-center gap-2"><BookOpenCheck className="h-3.5 w-3.5" />O que significa 100% de cobertura</p>
            <h2 className="mt-2 font-display text-2xl font-bold text-white">{counts.concepts.toLocaleString("pt-BR")} primeiras evidências de prática.</h2>
            <p className="mt-4 text-sm leading-6 text-blue-100/75">Cada conceito é uma peça da formação. Quando você pratica uma questão direcionada a um conceito ainda não visitado, ele passa a fazer parte da sua cobertura. Assim, chegar a <strong className="text-white">100% de cobertura conceitual</strong> significa ter exercitado ao menos uma questão para cada um dos {counts.concepts.toLocaleString("pt-BR")} conceitos.</p>
            <p className="mt-3 text-sm leading-6 text-blue-100/75">Depois da primeira passagem, a jornada continua: o tutor pode propor reforços, revisões e novas tentativas conforme suas respostas. A cobertura ajuda você a enxergar o quanto já percorreu — e qual pode ser o próximo trecho da rota.</p>
          </article>
        </section>

        <section className="mt-6 border border-white/15 bg-[#061847]/75 p-5 sm:p-7" aria-labelledby="coverage-route-title">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <p className="eyebrow flex items-center gap-2"><PlaneTakeoff className="h-3.5 w-3.5" />Rota de cobertura</p>
              <h2 id="coverage-route-title" className="mt-2 font-display text-2xl font-bold text-white">Créditos transformados em prática direcionada.</h2>
              <p className="mt-3 text-sm leading-6 text-blue-100/75">A primeira volta pelo mapa começa com 100 créditos de boas-vindas, distribuídos entre as cinco matérias, com 20 questões em cada uma e passagem pelos capítulos. Depois, o Tutor Adaptativo ajuda a escolher o próximo trecho, alternando descoberta, reforço e revisão conforme o seu percurso.</p>
            </div>
            <Link href="/planos" className="inline-flex shrink-0 items-center justify-center gap-2 border border-sky-200/50 bg-sky-200 px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#061847] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"><span>Conheça os planos</span><ChevronRight className="h-4 w-4" /></Link>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {creditScenarios.map(({ plan, credits, potential, detail }) => (
              <article key={plan} className="border border-white/15 bg-[#03133b]/60 p-4">
                <div className="flex items-start justify-between gap-3"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-sky-200">{plan}</p><span className="border border-sky-200/25 bg-sky-200/[0.06] px-2 py-1 font-mono text-[10px] text-sky-100">{credits.toLocaleString("pt-BR")}</span></div>
                <p className="mt-4 font-display text-2xl font-bold text-white">{potential}</p>
                <p className="mt-2 text-xs leading-5 text-blue-100/65">{detail}</p>
              </article>
            ))}
          </div>
          <p className="mt-5 flex gap-2 border-l-2 border-amber-200/70 bg-amber-200/[0.06] px-3 py-2.5 text-xs leading-5 text-amber-50/85"><CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />Com 1.000 créditos, o plano Ponte Aérea já oferece volume acima dos {counts.concepts.toLocaleString("pt-BR")} conceitos do mapa — uma boa margem para conhecer o percurso e voltar aos pontos que pedirem mais atenção.</p>
        </section>

        <section className="cad-frame mt-6 overflow-hidden" aria-labelledby="canonical-tree-title">
          <header className="border-b border-white/15 bg-[#061847]/80 p-5 sm:p-7">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="eyebrow flex items-center gap-2"><Layers3 className="h-3.5 w-3.5" />Visualização interativa</p>
                <h2 id="canonical-tree-title" className="mt-2 font-display text-2xl font-bold text-white">{catalog.data.courseName}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100/70">Siga as ramificações para navegar pelos {counts.concepts.toLocaleString("pt-BR")} conceitos. Use a pesquisa para encontrar rapidamente uma matéria, capítulo, tópico ou conceito que queira conhecer melhor.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={openAll} className="rounded-none border-white/20 text-xs text-sky-100 hover:bg-white/10 hover:text-white">Abrir tudo</Button>
                <Button type="button" variant="outline" onClick={closeAll} className="rounded-none border-white/20 text-xs text-sky-100 hover:bg-white/10 hover:text-white">Recolher</Button>
              </div>
            </div>

            <div className="relative mt-6 max-w-2xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-200" aria-hidden="true" />
              <Input value={query} onChange={event => setQuery(event.target.value)} className="h-11 rounded-none border-white/20 bg-[#03133b]/70 pl-10 pr-10 text-white placeholder:text-blue-100/45 focus-visible:border-sky-200" placeholder="Buscar por matéria, capítulo, tópico ou conceito" aria-label="Buscar no mapa de conceitos canônicos" />
              {query && <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center text-blue-100/65 transition-colors hover:text-white" aria-label="Limpar pesquisa"><X className="h-4 w-4" /></button>}
            </div>
            {hasSearch && <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-sky-100/75">{matchingConcepts.toLocaleString("pt-BR")} conceito(s) encontrado(s)</p>}
          </header>

          <div className="bg-[#04133a]/60 p-3 sm:p-5">
            {matters.length ? (
              <div className="space-y-3" role="tree" aria-label="Árvore de conceitos canônicos">
                {matters.map((matter, matterIndex) => {
                  const matterKey = `matter-${matterIndex}`;
                  const matterOpen = isOpen(matterKey, "matter");
                  return (
                    <details key={matterKey} open={matterOpen} onToggle={event => setNodeOpen(matterKey, event.currentTarget.open)} className="group border border-sky-200/20 bg-[#061847]/70" role="treeitem" aria-level={2}>
                      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 transition-colors hover:bg-sky-200/[0.06] sm:p-5">
                        <ChevronRight className={`h-4 w-4 shrink-0 text-sky-200 transition-transform ${matterOpen ? "rotate-90" : ""}`} aria-hidden="true" />
                        <span className="grid h-8 w-8 shrink-0 place-items-center border border-sky-200/35 bg-sky-200/[0.06] font-mono text-[10px] text-sky-100">M</span>
                        <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-white sm:text-base">{matter.name}</span><span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-blue-100/60">{matter.chapters.length} capítulo(s) · {matter.conceptCount} conceitos</span></span>
                        <span className="hidden border border-sky-200/25 px-2 py-1 font-mono text-[10px] text-sky-100 sm:block">{matter.conceptCount}</span>
                      </summary>

                      <div className="border-t border-white/10 bg-[#03133b]/45 p-3 sm:p-4" role="group">
                        <div className="space-y-2 border-l border-sky-200/20 pl-3 sm:pl-4">
                          {matter.chapters.map((chapter, chapterIndex) => {
                            const chapterKey = `${matterKey}-chapter-${chapterIndex}`;
                            const chapterOpen = isOpen(chapterKey, "chapter");
                            return (
                              <details key={chapterKey} open={chapterOpen} onToggle={event => setNodeOpen(chapterKey, event.currentTarget.open)} className="border border-white/10 bg-[#061847]/45" role="treeitem" aria-level={3}>
                                <summary className="flex cursor-pointer list-none items-center gap-3 p-3 transition-colors hover:bg-white/[0.035] sm:px-4">
                                  <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-sky-200 transition-transform ${chapterOpen ? "rotate-90" : ""}`} aria-hidden="true" />
                                  <span className="grid h-7 w-7 shrink-0 place-items-center border border-white/20 font-mono text-[10px] text-blue-100">C</span>
                                  <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-blue-50">{chapter.name}</span><span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-blue-100/55">{chapter.topics.length} tópico(s) · {chapter.conceptCount} conceitos</span></span>
                                </summary>

                                <div className="border-t border-white/10 p-3 sm:p-4" role="group">
                                  <div className="space-y-2 border-l border-white/15 pl-3 sm:pl-4">
                                    {chapter.topics.map((topic, topicIndex) => {
                                      const topicKey = `${chapterKey}-topic-${topicIndex}`;
                                      const topicOpen = isOpen(topicKey, "topic");
                                      return (
                                        <details key={topicKey} open={topicOpen} onToggle={event => setNodeOpen(topicKey, event.currentTarget.open)} className="border border-white/10 bg-[#03133b]/35" role="treeitem" aria-level={4}>
                                          <summary className="flex cursor-pointer list-none items-center gap-3 p-3 transition-colors hover:bg-white/[0.035]">
                                            <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-sky-200 transition-transform ${topicOpen ? "rotate-90" : ""}`} aria-hidden="true" />
                                            <span className="grid h-6 w-6 shrink-0 place-items-center border border-white/15 font-mono text-[9px] text-blue-100/80">T</span>
                                            <span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-blue-50 sm:text-sm">{topic.name}</span><span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-blue-100/50">{topic.conceptCount} conceitos</span></span>
                                          </summary>
                                          <ul className="grid gap-1.5 border-t border-white/10 p-3 sm:grid-cols-2 sm:p-4" role="group">
                                            {topic.concepts.map((concept, conceptIndex) => <li key={`${topicKey}-concept-${conceptIndex}`} className="flex min-w-0 items-start gap-2 border border-white/10 bg-white/[0.025] px-3 py-2 text-xs leading-5 text-blue-50" role="treeitem" aria-level={5}><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-200" aria-hidden="true" /><span>{concept.name}</span></li>)}
                                          </ul>
                                        </details>
                                      );
                                    })}
                                  </div>
                                </div>
                              </details>
                            );
                          })}
                        </div>
                      </div>
                    </details>
                  );
                })}
              </div>
            ) : (
              <div className="border border-dashed border-white/20 px-5 py-12 text-center"><Search className="mx-auto h-6 w-6 text-sky-200" aria-hidden="true" /><h3 className="mt-4 font-display text-lg font-bold text-white">Nenhum conceito encontrado</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-blue-100/65">Tente um termo mais amplo ou limpe a pesquisa para consultar toda a estrutura curricular.</p><Button type="button" variant="outline" onClick={() => setQuery("")} className="mt-5 rounded-none border-sky-200/40 text-sky-100 hover:bg-sky-200/10 hover:text-white">Limpar pesquisa</Button></div>
            )}
          </div>
        </section>

        <footer className="mt-8 flex flex-col gap-4 border-t border-white/15 pt-6 text-sm text-blue-100/65 sm:flex-row sm:items-center sm:justify-between">
          <p>Mapa curricular público do PPA Teórico — Tutor Adaptativo.</p>
          <Link href="/" className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.12em] text-sky-200 transition-colors hover:text-white"><ArrowLeft className="h-4 w-4" />Voltar ao PPA Teórico</Link>
        </footer>
      </div>
    </main>
  );
}

function Metric({ value, label, emphasis = false, bordered = false }: { value: number; label: string; emphasis?: boolean; bordered?: boolean }) {
  return <div className={`border-white/15 px-4 py-4 sm:px-5 sm:py-5 ${bordered ? "sm:border-l" : ""}`}><p className={`font-display text-3xl font-bold ${emphasis ? "text-sky-200" : "text-white"}`}>{value.toLocaleString("pt-BR")}</p><p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-blue-100/60">{label}</p></div>;
}

function CatalogLoading() {
  return <main className="blueprint-grid flex min-h-[70vh] flex-1 items-center justify-center px-4"><div className="cad-frame w-full max-w-xl p-7"><div className="h-3 w-32 bg-sky-100/10" /><div className="mt-5 h-10 w-4/5 bg-sky-100/10" /><div className="mt-8 grid grid-cols-4 gap-2"><div className="h-20 bg-sky-100/10" /><div className="h-20 bg-sky-100/10" /><div className="h-20 bg-sky-100/10" /><div className="h-20 bg-sky-100/10" /></div></div></main>;
}

function CatalogUnavailable() {
  return <main className="blueprint-grid flex min-h-[70vh] flex-1 items-center justify-center px-4"><section className="cad-frame w-full max-w-xl p-7 text-center"><ListTree className="mx-auto h-7 w-7 text-sky-200" aria-hidden="true" /><p className="eyebrow mt-5">Mapa curricular</p><h1 className="mt-2 font-display text-2xl font-bold text-white">A estrutura está temporariamente indisponível.</h1><p className="mt-3 text-sm leading-6 text-blue-100/70">Tente novamente em alguns instantes. A indisponibilidade do mapa não altera os seus dados de estudo.</p><Link href="/" className="mt-6 inline-flex items-center gap-2 border border-sky-200/45 px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-sky-100 transition-colors hover:bg-sky-200/10 hover:text-white"><ArrowLeft className="h-4 w-4" />Voltar ao PPA Teórico</Link></section></main>;
}
