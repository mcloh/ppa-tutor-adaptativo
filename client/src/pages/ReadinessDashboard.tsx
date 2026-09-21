import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Streamdown } from "streamdown";
import { AlertTriangle, ArrowUpRight, Check, CircleAlert, Compass, Gauge, PlaneTakeoff, Radar, RefreshCw, Route } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { trpc } from "@/lib/trpc";

const stateLabel: Record<string, string> = { not_presented: "Sem evidência", taught: "Ensinado", independent_correct: "Em prática", partial_consolidation: "Em consolidação", partial_adequate: "Adequado", partial_strong: "Forte", confirmed: "Confirmado", relearning: "Reaprendizagem" };

export default function ReadinessDashboard() {
  const dashboard = trpc.dashboard.overview.useQuery(undefined, { refetchOnWindowFocus: false });
  if (dashboard.isLoading) return <DashboardSkeleton />;
  if (dashboard.error || !dashboard.data) {
    return (
      <section className="cad-frame max-w-2xl p-7">
        <CircleAlert className="h-7 w-7 text-amber-200" />
        <h1 className="mt-4 text-xl font-semibold text-white">Não foi possível carregar a prontidão</h1>
        <p className="mt-2 text-sm leading-6 text-blue-100/65">
          O painel de prontidão não foi carregado. Verifique sua conexão e tente novamente.
        </p>
        <Button onClick={() => dashboard.refetch()} className="mt-5 rounded-none bg-sky-200 text-[#04133c] hover:bg-sky-100">
          <RefreshCw className="h-4 w-4" />
          Tentar novamente
        </Button>
      </section>
    );
  }
  const data = dashboard.data;
  const accuracy = data.counters.independent_answers ? Math.round((data.counters.correct / data.counters.independent_answers) * 100) : 0;
  return <div className="mx-auto max-w-6xl space-y-6">
    <header className="cad-frame flex flex-col justify-between gap-5 p-5 sm:flex-row sm:items-end sm:p-7"><div><p className="eyebrow flex items-center gap-2"><Compass className="h-3.5 w-3.5" />Painel de prontidão</p><h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">Evidências, cobertura e próxima ação.</h1></div><div className="text-right"><div className="font-mono text-xs text-blue-100/60">MAPA / V{String(data.mapVersion).padStart(4, "0")}</div><p className="mt-2 text-xs text-sky-100">{data.resumption.pendingQuestionNumber ? `Retome pela questão ${data.resumption.pendingQuestionNumber}.` : data.resumption.active ? "Sua sessão está pronta para continuar." : "Inicie uma nova rodada de estudo."}</p></div></header>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Metric icon={Gauge} label="Acerto independente" value={`${accuracy}%`} detail={`${data.counters.correct}/${data.counters.independent_answers || 0} respostas`} />
      <Metric icon={PlaneTakeoff} label="Questões apresentadas" value={String(data.counters.questions_presented)} detail={`${data.counters.teach_requests} pedidos “Me ensine”`} />
      <Metric icon={Radar} label="Revisões disponíveis" value={String(data.dueReviews)} detail={data.dueReviews ? "Priorize na próxima rodada" : "Nenhuma pendência agora"} accent={data.dueReviews > 0} />
      <Metric icon={Route} label="Lacunas prioritárias" value={String(data.gaps.length)} detail="Selecionadas por risco e evidência" />
    </div>
    <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
      <section className="cad-frame p-5 sm:p-7"><div className="mb-6 flex items-center justify-between"><div><p className="eyebrow">Cobertura por matéria</p><h2 className="mt-1 font-display text-xl font-bold text-white">Mapa curricular</h2></div><span className="font-mono text-xs text-sky-200">5 MATÉRIAS</span></div><div className="space-y-6">{data.subjects.map(subject => <div key={subject.id}><div className="mb-2 flex items-end justify-between gap-4"><div><p className="text-sm font-semibold text-white">{subject.name}</p><p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-blue-100/55">{subject.coverage}% coberto · {subject.accuracy === null ? "sem precisão independente" : `${subject.accuracy}% de acerto`}</p></div><span className="font-display text-xl font-bold text-sky-200">{subject.readiness}</span></div><Progress value={subject.readiness} className="h-2 bg-white/10 [&>div]:bg-sky-200" /></div>)}</div></section>
      <section className="cad-frame p-5 sm:p-7"><div className="mb-6 flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center border border-amber-200/50 text-amber-200"><AlertTriangle className="h-4 w-4" /></div><div><p className="eyebrow">Atenção dirigida</p><h2 className="font-display text-xl font-bold text-white">Lacunas ativas</h2></div></div><div className="space-y-3">{data.gaps.map((gap, index) => <div key={`${gap.matter}-${gap.name}`} className="border-l border-amber-200/50 bg-white/[0.025] p-3"><div className="flex justify-between gap-3"><p className="text-sm font-medium text-white">{String(index + 1).padStart(2, "0")} · {gap.name}</p><Badge className="rounded-none border-0 bg-amber-200/15 font-mono text-[10px] text-amber-100">{gap.priority}</Badge></div><p className="mt-1 text-xs text-blue-100/60">{gap.matter} · prontidão {gap.readiness} · {gap.evidence} evidência(s)</p></div>)}</div></section>
    </div>
    <section className="cad-frame overflow-hidden"><header className="border-b border-white/15 p-5 sm:p-7"><p className="eyebrow">Estrutura de domínio</p><h2 className="mt-1 font-display text-xl font-bold text-white">Matéria → capítulo → tópico → conceito</h2></header><div className="divide-y divide-white/10">{data.subjects.map(subject => <details key={subject.id} className="group"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-white hover:bg-white/[0.035] sm:px-7"><div><span className="font-semibold">{subject.name}</span><span className="ml-3 font-mono text-[10px] uppercase tracking-wider text-blue-100/55">{subject.coverage}% cobertura</span></div><ArrowUpRight className="h-4 w-4 text-sky-200 transition group-open:rotate-90" /></summary><div className="border-t border-white/10 bg-[#04133a]/55 p-5 sm:px-7"><div className="grid gap-5 lg:grid-cols-2">{subject.chapters.map(chapter => <div key={chapter.id}><p className="mb-3 font-mono text-xs uppercase tracking-wider text-sky-200">{chapter.name}</p><div className="space-y-4">{Object.entries(chapter.concepts.reduce<Record<string, typeof chapter.concepts>>((groups, concept) => { (groups[concept.topic] ??= []).push(concept); return groups; }, {})).map(([topic, concepts]) => <div key={topic}><p className="mb-1.5 text-xs font-semibold text-blue-100">{topic}</p><div className="space-y-1.5">{concepts.map(concept => <div key={concept.id} className="flex items-center justify-between gap-3 border border-white/10 px-3 py-2"><p className="text-xs text-blue-50">{concept.name}</p><span className="shrink-0 font-mono text-[10px] text-blue-100/60">{stateLabel[concept.state] ?? concept.state} · {concept.readiness}</span></div>)}</div></div>)}</div></div>)}</div></div></details>)}</div></section>
    {data.latestAssessment && <section className="cad-frame p-5 sm:p-7"><div className="mb-4 flex items-center gap-2 text-sky-200"><Check className="h-4 w-4" /><p className="eyebrow">Última avaliação disponível</p></div><div className="prose prose-invert max-w-none text-sm text-blue-50"><Streamdown>{data.latestAssessment.contentMarkdown}</Streamdown></div></section>}
  </div>;
}

function Metric({ icon: Icon, label, value, detail, accent }: { icon: LucideIcon; label: string; value: string; detail: string; accent?: boolean }) { return <section className="cad-frame p-4"><div className="flex items-start justify-between"><p className="font-mono text-[10px] uppercase tracking-[0.15em] text-blue-100/60">{label}</p><Icon className={`h-4 w-4 ${accent ? "text-amber-200" : "text-sky-200"}`} /></div><p className="mt-4 font-display text-3xl font-bold text-white">{value}</p><p className="mt-1 text-xs text-blue-100/55">{detail}</p></section>; }
function DashboardSkeleton() { return <div className="mx-auto max-w-6xl space-y-4"><Skeleton className="h-36 w-full bg-white/10" /><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[1,2,3,4].map(item => <Skeleton key={item} className="h-32 bg-white/10" />)}</div><Skeleton className="h-96 w-full bg-white/10" /></div>; }
