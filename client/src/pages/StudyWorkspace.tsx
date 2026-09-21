import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Streamdown } from "streamdown";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Compass, Gauge, GraduationCap, Loader2, PlaneTakeoff, Radar, RefreshCw, Route } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type Answer = "A" | "B" | "C" | "ME_ENSINE";

export default function StudyWorkspace() {
  const utils = trpc.useUtils();
  const question = trpc.study.current.useQuery(undefined, { retry: 1, refetchOnWindowFocus: false });
  const program = trpc.study.program.useQuery(undefined, { retry: 1, refetchOnWindowFocus: false });
  const [selected, setSelected] = useState<Answer | null>(null);
  const [result, setResult] = useState<{ classification: string; feedbackMarkdown: string; assessment: { type: string; contentMarkdown: string } | null; modeSelectionRequired: boolean } | null>(null);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [advanceError, setAdvanceError] = useState(false);
  const answer = trpc.study.answer.useMutation({
    onSuccess: data => setResult(data),
    onError: error => toast.error(error.message),
  });
  const selectMode = trpc.study.selectMode.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.study.program.invalidate(), utils.study.current.invalidate(), utils.dashboard.overview.invalidate()]);
      await utils.study.current.fetch();
      setSelected(null);
      setResult(null);
    },
    onError: error => toast.error(error.message),
  });

  const submit = () => {
    if (!selected || !question.data) return;
    answer.mutate({ questionId: question.data.id, answer: selected });
  };
  const continueStudy = async () => {
    if (isAdvancing || !question.data) return;
    const previousQuestionId = question.data.id;
    setIsAdvancing(true);
    setAdvanceError(false);
    try {
      await Promise.all([utils.study.current.invalidate(), utils.dashboard.overview.invalidate(), utils.notifications.list.invalidate()]);
      const nextQuestion = await utils.study.current.fetch();
      if (result?.modeSelectionRequired && !nextQuestion) {
        await utils.study.program.invalidate();
        setSelected(null);
        setResult(null);
        setIsAdvancing(false);
        return;
      }
      if (!nextQuestion || nextQuestion.id === previousQuestionId) throw new Error("A próxima questão ainda não foi preparada.");
      setSelected(null);
      setResult(null);
      setIsAdvancing(false);
    } catch {
      setAdvanceError(true);
      setIsAdvancing(false);
      toast.error("Não foi possível preparar a próxima questão. Tente novamente.");
    }
  };

  if (isAdvancing || advanceError) return <NextQuestionTransition error={advanceError} onRetry={continueStudy} />;
  if (question.isLoading || program.isLoading) return <StudySkeleton />;
  if (!question.data && program.data?.diagnosticStatus === "mode_selection") {
    return <ModeSelection onSelect={(mode: "simulado" | "tutor") => selectMode.mutate({ mode })} isPending={selectMode.isPending} />;
  }
  if (!question.data) return <StudySkeleton />;
  const isTeaching = selected === "ME_ENSINE";
  const diagnosticProgress = question.data.studyMode === "diagnostic" && program.data?.diagnosticStatus === "active"
    ? Math.min(100, ((program.data.diagnostic.completedQuestions + 1) / program.data.diagnostic.totalQuestions) * 100)
    : null;
  const modeLabel = question.data.studyMode === "diagnostic" ? "Avaliação inicial" : question.data.studyMode === "simulado" ? "Modo simulado" : "Modo tutor";

  return (
    <div className="relative mx-auto w-full max-w-4xl">
      <AnimatePresence mode="wait">
        {!result ? (
          <motion.section key="question" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} transition={{ duration: 0.2 }} className="cad-frame p-5 sm:p-8">
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/15 pb-6">
              <div><p className="eyebrow">{modeLabel}</p><h1 className="mt-2 font-display text-2xl font-bold text-white sm:text-3xl">Questão <span className="text-sky-300">{String(question.data.number).padStart(3, "0")}</span></h1>{diagnosticProgress !== null && <div className="mt-4 max-w-sm"><div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-blue-100/70"><span>Diagnóstico</span><span>{program.data?.diagnostic.completedQuestions ?? 0} de 100 concluídas</span></div><Progress value={diagnosticProgress} className="h-1 bg-white/15" /></div>}</div>
              <div className="flex items-center gap-2 border border-sky-200/30 bg-sky-200/5 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-sky-100"><Compass className="h-4 w-4" />Selecione uma resposta</div>
            </header>
            <div className="py-8"><p className="max-w-3xl text-lg font-medium leading-8 text-white sm:text-xl">{question.data.prompt}</p></div>
            <div role="radiogroup" aria-label="Alternativas da questão" className="grid gap-3">
              {question.data.alternatives.map(alternative => {
                const picked = selected === alternative.key;
                const teach = alternative.key === "ME_ENSINE";
                return <button key={alternative.key} type="button" role="radio" aria-checked={picked} onClick={() => setSelected(alternative.key)} className={`group flex items-center gap-4 border p-4 text-left transition ${picked ? teach ? "border-amber-200 bg-amber-100/10" : "border-sky-200 bg-sky-200/10" : "border-white/15 bg-white/[0.025] hover:border-white/45 hover:bg-white/[0.06]"}`}><span className={`flex h-8 w-8 shrink-0 items-center justify-center border font-mono text-xs font-bold ${picked ? teach ? "border-amber-200 bg-amber-200 text-[#4e2600]" : "border-sky-200 bg-sky-200 text-[#061747]" : "border-white/30 text-sky-100"}`}>{teach ? "?" : alternative.key}</span><span className={`text-sm leading-6 sm:text-base ${teach ? "italic text-amber-100" : "text-blue-50"}`}>{alternative.text}</span></button>;
              })}
            </div>
            <footer className="mt-7 flex flex-col gap-4 border-t border-white/15 pt-6 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-md text-xs leading-5 text-blue-100/60">O gabarito e as regras pedagógicas são avaliados no servidor após sua submissão.</p><Button disabled={!selected || answer.isPending} onClick={submit} className="h-11 rounded-none bg-sky-200 px-5 font-mono text-xs font-bold uppercase tracking-wider text-[#061747] hover:bg-white">{answer.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Validando</> : <><PlaneTakeoff className="h-4 w-4" />Enviar resposta</>}</Button></footer>
          </motion.section>
        ) : (
          <motion.section key="feedback" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} transition={{ duration: 0.2 }} className="cad-frame overflow-hidden">
            <header className="flex items-start gap-4 border-b border-white/15 bg-sky-200/[0.07] p-5 sm:p-8"><div className="flex h-11 w-11 shrink-0 items-center justify-center border border-sky-200/60 bg-sky-200 text-[#061747]"><Gauge className="h-6 w-6" /></div><div><p className="eyebrow">Resultado registrado</p><h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">{result.classification}</h1></div></header>
            <div className="prose prose-invert max-w-none p-5 text-blue-50 prose-headings:text-white prose-strong:text-sky-200 sm:p-8"><Streamdown>{result.feedbackMarkdown}</Streamdown></div>
            {result.assessment && <div className="mx-5 mb-5 border border-sky-200/35 bg-sky-200/[0.06] p-5 sm:mx-8 sm:mb-8"><div className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-sky-200"><Radar className="h-4 w-4" />{result.assessment.type === "diagnostic_100" ? "Diagnóstico de marco" : "Avaliação parcial"}</div><div className="prose prose-invert max-w-none text-sm text-blue-50"><Streamdown>{result.assessment.contentMarkdown}</Streamdown></div></div>}
            <footer className="flex flex-col gap-4 border-t border-white/15 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-8"><p className="text-xs text-blue-100/60">Seu evento foi registrado no mapa auditável de prontidão.</p><Button onClick={continueStudy} className="h-11 rounded-none bg-white px-5 font-mono text-xs font-bold uppercase tracking-wider text-[#061747] hover:bg-sky-200">{result.modeSelectionRequired ? "Escolher modalidade" : "Próxima questão"} <ArrowRight className="h-4 w-4" /></Button></footer>
          </motion.section>
        )}
      </AnimatePresence>
      {isTeaching && !result && <p className="mt-4 text-center font-mono text-xs text-amber-100/80">O pedido será registrado como “Me ensine”, sem ser contado como erro.</p>}
    </div>
  );
}

function ModeSelection({ onSelect, isPending }: { onSelect: (mode: "simulado" | "tutor") => void; isPending: boolean }) {
  return <section className="cad-frame mx-auto max-w-4xl overflow-hidden" aria-labelledby="mode-selection-title">
    <header className="border-b border-white/15 bg-sky-200/[0.07] p-6 sm:p-8">
      <div className="flex h-11 w-11 items-center justify-center border border-sky-200/60 bg-sky-200 text-[#061747]"><GraduationCap className="h-6 w-6" /></div>
      <p className="eyebrow mt-5">Diagnóstico concluído</p>
      <h1 id="mode-selection-title" className="mt-2 font-display text-2xl font-bold text-white sm:text-3xl">Defina seu próximo percurso</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-50/85">As evidências iniciais já foram registradas no seu mapa de prontidão. Escolha como deseja continuar; a opção ficará vinculada a este percurso.</p>
    </header>
    <div className="grid gap-4 p-6 sm:grid-cols-2 sm:p-8">
      <button type="button" disabled={isPending} onClick={() => onSelect("simulado")} className="group border border-sky-200/35 bg-sky-200/[0.06] p-5 text-left transition hover:border-sky-200 hover:bg-sky-200/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-100 disabled:cursor-wait disabled:opacity-60">
        <Route className="h-7 w-7 text-sky-200" /><h2 className="mt-6 font-display text-xl font-bold text-white">Modo Simulado</h2>
        <p className="mt-3 text-sm leading-6 text-blue-50/85">Pratique rodadas completas de 100 questões, com 20 itens por matéria e a mesma matriz equilibrada do exame.</p>
        <span className="mt-6 inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-wider text-sky-200">Selecionar simulado <ArrowRight className="h-4 w-4" /></span>
      </button>
      <button type="button" disabled={isPending} onClick={() => onSelect("tutor")} className="group border border-amber-200/35 bg-amber-100/[0.06] p-5 text-left transition hover:border-amber-200 hover:bg-amber-100/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100 disabled:cursor-wait disabled:opacity-60">
        <Compass className="h-7 w-7 text-amber-100" /><h2 className="mt-6 font-display text-xl font-bold text-white">Modo Tutor</h2>
        <p className="mt-3 text-sm leading-6 text-blue-50/85">Priorize lacunas, pedidos “Me ensine” e revisões para reforçar conceitos que ainda precisam de evidência.</p>
        <span className="mt-6 inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-wider text-amber-100">Selecionar tutor <ArrowRight className="h-4 w-4" /></span>
      </button>
    </div>
  </section>;
}

function StudySkeleton() {
  return <div className="cad-frame mx-auto max-w-4xl p-6 sm:p-8"><Skeleton className="h-4 w-28 bg-white/10" /><Skeleton className="mt-5 h-10 w-64 bg-white/10" /><Skeleton className="mt-12 h-24 w-full bg-white/10" /><div className="mt-8 space-y-3"><Skeleton className="h-16 w-full bg-white/10" /><Skeleton className="h-16 w-full bg-white/10" /><Skeleton className="h-16 w-full bg-white/10" /></div><Progress value={48} className="mt-8 h-1 bg-white/10" /></div>;
}

function NextQuestionTransition({ error, onRetry }: { error: boolean; onRetry: () => void }) {
  return <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="cad-frame mx-auto max-w-4xl bg-[#071b50]/95 p-6 text-center shadow-[0_20px_60px_rgba(0,0,0,0.24)] sm:p-10" aria-live="polite">
    <div className={`mx-auto flex h-12 w-12 items-center justify-center border ${error ? "border-amber-200/70 bg-amber-200/10 text-amber-100" : "border-sky-200/60 bg-sky-200/10 text-sky-200"}`}>
      {error ? <Radar className="h-6 w-6" /> : <Loader2 className="h-6 w-6 animate-spin" />}
    </div>
    <p className="eyebrow mt-5">{error ? "Conexão de estudo" : "Preparando próxima etapa"}</p>
    <h1 className="mt-2 font-display text-2xl font-bold text-white sm:text-3xl">{error ? "Não foi possível carregar a próxima questão." : "Calculando seu próximo conceito."}</h1>
    <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-blue-50/90">{error ? "Seu resultado já foi registrado. Tente carregar novamente sem reenviar a resposta." : "Atualizando o mapa de prontidão e preparando um item alinhado ao seu percurso."}</p>
    {error && <Button onClick={onRetry} className="mt-7 h-11 rounded-none bg-sky-200 px-5 font-mono text-xs font-bold uppercase tracking-wider text-[#061747] hover:bg-white"><RefreshCw className="h-4 w-4" />Tentar novamente</Button>}
  </motion.section>;
}
