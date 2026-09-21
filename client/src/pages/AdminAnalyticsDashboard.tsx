import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Activity, BadgeDollarSign, BrainCircuit, ChartNoAxesCombined, CircleAlert, Cpu, Database, Gauge, RefreshCw, ShieldCheck, Timer, UsersRound } from "lucide-react";
import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Period = "7d" | "30d" | "90d";

const periods: Array<{ value: Period; label: string }> = [
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
];

function number(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : new Intl.NumberFormat("pt-BR").format(value);
}

function percent(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function money(value: number | null | undefined, currency = "BRL") {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value / 100);
}

function ChartShell({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) {
  return <section className="cad-frame min-h-[310px] p-5"><div className="mb-5"><h3 className="text-base font-semibold text-white">{title}</h3><p className="mt-1 text-xs leading-5 text-blue-100/55">{detail}</p></div>{children}</section>;
}

function MetricCard({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof UsersRound }) {
  return <section className="cad-frame relative overflow-hidden p-5"><Icon className="absolute right-4 top-4 h-5 w-5 text-sky-200/70" /><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-blue-100/60">{label}</p><p className="mt-4 text-3xl font-semibold tracking-tight text-white">{value}</p><p className="mt-2 text-xs leading-5 text-blue-100/55">{detail}</p></section>;
}

function EmptyTelemetry({ text }: { text: string }) {
  return <div className="flex h-[205px] items-center justify-center border border-dashed border-white/15 bg-white/[0.02] px-6 text-center text-sm leading-6 text-blue-100/60">{text}</div>;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return <div className="border border-sky-200/25 bg-[#061847] px-3 py-2 text-xs text-white shadow-xl"><p className="mb-1 text-blue-100/60">{label}</p>{payload.map(item => <p key={item.name} style={{ color: item.color }}>{item.name}: {number(item.value)}</p>)}</div>;
}

export default function AdminAnalyticsDashboard() {
  const [period, setPeriod] = useState<Period>("30d");
  const overview = trpc.adminAnalytics.overview.useQuery({ period }, { staleTime: 45_000 });
  const operations = trpc.adminAnalytics.operations.useQuery({ period }, { staleTime: 45_000 });
  const costs = trpc.adminAnalytics.costs.summary.useQuery({ period }, { staleTime: 45_000 });
  const refresh = () => { void Promise.all([overview.refetch(), operations.refetch(), costs.refetch()]); };

  if (overview.isLoading || operations.isLoading || costs.isLoading) return <div className="space-y-5"><Skeleton className="h-24 w-full bg-white/10" /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-40 bg-white/10" />)}</div><Skeleton className="h-[360px] w-full bg-white/10" /></div>;
  if (overview.error || operations.error || costs.error) return <section className="cad-frame max-w-2xl p-7"><CircleAlert className="h-7 w-7 text-amber-200" /><h1 className="mt-4 text-xl font-semibold text-white">Não foi possível carregar o console</h1><p className="mt-2 text-sm leading-6 text-blue-100/65">As métricas administrativas não foram carregadas. Verifique a sessão de administrador e tente novamente.</p><Button onClick={refresh} className="mt-5 rounded-none bg-sky-200 text-[#04133c] hover:bg-sky-100"><RefreshCw className="h-4 w-4" />Tentar novamente</Button></section>;

  const commercial = overview.data!;
  const operation = operations.data!;
  const cost = costs.data!;
  const registrationChart = commercial.registrations.daily.map(row => ({ day: row.day.slice(5), cadastros: row.value }));
  const revenueChart = commercial.commerce.daily.map(row => ({ day: row.day.slice(5), receita: row.value / 100, pedidos: row.secondary ?? 0 }));
  const modeChart = commercial.learning.byMode.map(row => ({ modo: row.mode === "diagnostic" ? "Diagnóstico" : row.mode === "simulado" ? "Simulado" : "Tutor", questões: row.value }));

  return <div className="mx-auto max-w-[1500px] space-y-6 pb-10">
    <header className="cad-frame overflow-hidden p-6 sm:p-7"><div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-sky-200">Gestão operacional</p><h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Console Gerencial</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100/60">Métricas agregadas do PPA Teórico. Conteúdo de alunos, dados pessoais, prompts, respostas e segredos não são exibidos.</p></div><div className="flex flex-wrap items-center gap-2"><div className="flex border border-white/15 bg-black/10 p-1">{periods.map(item => <button key={item.value} onClick={() => setPeriod(item.value)} className={`px-3 py-2 font-mono text-[11px] uppercase tracking-wider transition-colors ${period === item.value ? "bg-sky-200 text-[#04133c]" : "text-blue-100/60 hover:bg-white/10 hover:text-white"}`}>{item.label}</button>)}</div><Button variant="outline" onClick={refresh} className="h-9 rounded-none border-sky-200/35 text-sky-100 hover:bg-sky-200/10 hover:text-white"><RefreshCw className="h-3.5 w-3.5" />Atualizar</Button></div></div></header>

    <Tabs defaultValue="commercial" className="space-y-5"><TabsList className="h-auto w-full justify-start overflow-x-auto rounded-none border border-white/15 bg-[#061847]/70 p-1"><TabsTrigger value="commercial" className="rounded-none px-4 py-2 text-xs font-mono uppercase tracking-wider data-[state=active]:bg-sky-200 data-[state=active]:text-[#04133c]">Comercial e produto</TabsTrigger><TabsTrigger value="operations" className="rounded-none px-4 py-2 text-xs font-mono uppercase tracking-wider data-[state=active]:bg-sky-200 data-[state=active]:text-[#04133c]">Operação e confiabilidade</TabsTrigger></TabsList>
      <TabsContent value="commercial" className="space-y-5"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Alunos" value={number(commercial.cards.totalStudents)} detail={`${number(commercial.cards.activeStudents)} ativos no período`} icon={UsersRound} /><MetricCard label="Questões respondidas" value={number(commercial.cards.answeredQuestions)} detail={`Precisão: ${percent(commercial.learning.accuracyPercent)}`} icon={ChartNoAxesCombined} /><MetricCard label="Receita liquidada" value={money(commercial.cards.settledRevenueCents)} detail={`${number(commercial.commerce.paidOrders)} pedidos pagos`} icon={BadgeDollarSign} /><MetricCard label="Cache pedagógico" value={number(commercial.cache.questions)} detail={`${number(commercial.cache.deliveries)} reutilizações acumuladas`} icon={Database} /></div>
        <div className="grid gap-5 xl:grid-cols-2"><ChartShell title="Novos cadastros" detail="Contagem diária de novas contas no período.">{commercial.registrations.total > 0 ? <ResponsiveContainer width="100%" height={220}><AreaChart data={registrationChart}><CartesianGrid stroke="#b9ddff20" vertical={false} /><XAxis dataKey="day" stroke="#b9ddff99" fontSize={11} tickLine={false} axisLine={false} /><YAxis stroke="#b9ddff99" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} /><Tooltip content={<ChartTooltip />} /><Area type="monotone" dataKey="cadastros" name="Cadastros" stroke="#7dd3fc" fill="#38bdf833" strokeWidth={2} /></AreaChart></ResponsiveContainer> : <EmptyTelemetry text="Sem novos cadastros no período selecionado." />}</ChartShell><ChartShell title="Receita e pedidos pagos" detail="Somente liquidações registradas no livro de pedidos.">{commercial.commerce.paidOrders > 0 ? <ResponsiveContainer width="100%" height={220}><AreaChart data={revenueChart}><CartesianGrid stroke="#b9ddff20" vertical={false} /><XAxis dataKey="day" stroke="#b9ddff99" fontSize={11} tickLine={false} axisLine={false} /><YAxis stroke="#b9ddff99" fontSize={11} tickLine={false} axisLine={false} /><Tooltip content={<ChartTooltip />} /><Area type="monotone" dataKey="receita" name="Receita (R$)" stroke="#fbbf24" fill="#fbbf2428" strokeWidth={2} /></AreaChart></ResponsiveContainer> : <EmptyTelemetry text="Não há receita liquidada no período. O checkout de produção permanece condicionado à homologação PagBank." />}</ChartShell></div>
        <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]"><ChartShell title="Uso por modalidade" detail="Questões apresentadas por modo de estudo.">{modeChart.length ? <ResponsiveContainer width="100%" height={220}><BarChart data={modeChart}><CartesianGrid stroke="#b9ddff20" vertical={false} /><XAxis dataKey="modo" stroke="#b9ddff99" fontSize={11} tickLine={false} axisLine={false} /><YAxis stroke="#b9ddff99" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="questões" name="Questões" fill="#7dd3fc" /></BarChart></ResponsiveContainer> : <EmptyTelemetry text="Ainda não há questões apresentadas no período." />}</ChartShell><section className="cad-frame p-5"><h3 className="text-base font-semibold text-white">Engajamento e aprendizagem</h3><dl className="mt-5 divide-y divide-white/10">{[["Sessões de estudo", commercial.access.studySessions], ["Pedidos “Me ensine”", commercial.learning.teachRequests], ["Revisões imediatas", commercial.learning.immediateReviews], ["Revisões espaçadas", commercial.learning.spacedReviews], ["Questões/aluno ativo/dia", commercial.learning.questionsPerActiveStudentDay]].map(([label, value]) => <div key={String(label)} className="flex items-center justify-between py-3 text-sm"><dt className="text-blue-100/60">{label}</dt><dd className="font-semibold text-white">{number(value as number | null)}</dd></div>)}</dl><p className="mt-4 text-xs leading-5 text-blue-100/45">{commercial.coverage.historicalNotice}</p></section></div>
      </TabsContent>
      <TabsContent value="operations" className="space-y-5"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Falhas transacionais" value={percent(operation.cards.transactionalFailurePercent)} detail="Auth, pagamento, e-mail e telemetria disponível" icon={ShieldCheck} /><MetricCard label="Disponibilidade externa" value={percent(operation.cards.availabilityPercent)} detail={operation.availability.checks ? `${number(operation.availability.checks)} sondas independentes` : "Não mensurável sem sonda externa"} icon={Activity} /><MetricCard label="Custo LLM estimado" value={money(operation.cards.estimatedLlmCostCents, "USD")} detail="Só aparece com regra de preço aplicável" icon={BrainCircuit} /><MetricCard label="Sessões recentes" value={number(operation.cards.activeSessionsRecent)} detail="Últimos cinco minutos; telemetria parcial" icon={Timer} /></div>
        <div className="grid gap-5 xl:grid-cols-2"><section className="cad-frame p-5"><h3 className="text-base font-semibold text-white">Confiabilidade transacional</h3><dl className="mt-5 divide-y divide-white/10">{[["Autenticação", operation.transactionalFailures.authentication], ["Pagamento", operation.transactionalFailures.payment], ["E-mail", operation.transactionalFailures.email]].map(([label, item]) => <div key={String(label)} className="flex items-center justify-between gap-4 py-4"><div><dt className="text-sm text-white">{String(label)}</dt><dd className="mt-1 text-xs text-blue-100/55">{number((item as { total: number }).total)} eventos observados</dd></div><span className="font-mono text-sm text-sky-100">{percent((item as { percent: number | null }).percent)}</span></div>)}</dl><p className="mt-4 text-xs leading-5 text-blue-100/45">Métricas históricas existentes são agregadas; instrumentação nova indica cobertura parcial até acumular observações.</p></section><section className="cad-frame p-5"><h3 className="text-base font-semibold text-white">Integridade e conteúdo</h3><dl className="mt-5 divide-y divide-white/10">{[["Mapas bloqueados", operation.integrity.blockedReadinessMaps], ["Fontes de conhecimento com falha", operation.integrity.failedKnowledgeSources], ["Questões de cache aposentadas", operation.integrity.retiredQuestions]].map(([label, value]) => <div key={String(label)} className="flex items-center justify-between py-4"><dt className="text-sm text-blue-100/70">{String(label)}</dt><dd className="font-semibold text-white">{number(value as number)}</dd></div>)}</dl></section></div>
        <div className="grid gap-5 xl:grid-cols-2"><ChartShell title="Uso de LLM" detail="Tokens, modelo, latência e preço; sem prompts, respostas ou contexto RAG.">{operation.llm.events ? <div className="space-y-4"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><SmallValue label="Eventos" value={number(operation.llm.events)} /><SmallValue label="Tokens" value={number(operation.llm.totalTokens)} /><SmallValue label="Latência média" value={operation.llm.latencyMs.average === null ? "—" : `${Math.round(operation.llm.latencyMs.average)} ms`} /><SmallValue label="Custo" value={money(operation.llm.estimatedCostCents, "USD")} /></div><div className="max-h-32 overflow-auto border border-white/10">{operation.llm.byOperation.map(item => <div key={`${item.operation}-${item.model}`} className="flex justify-between border-b border-white/10 px-3 py-2 text-xs last:border-0"><span className="text-blue-100/65">{item.operation} · {item.model}</span><strong className="text-white">{number(item.count)}</strong></div>)}</div></div> : <EmptyTelemetry text="Sem telemetria LLM no período. A coleta começou com esta versão e não retroage mensagens ou respostas." />}</ChartShell><section className="cad-frame p-5"><h3 className="flex items-center gap-2 text-base font-semibold text-white"><Cpu className="h-4 w-4 text-sky-200" />Recursos observados</h3><div className="mt-5 space-y-3">{operation.runtime.length ? operation.runtime.map(item => <div key={item.metricName} className="border border-white/10 bg-white/[0.025] p-3"><div className="flex justify-between"><span className="text-sm text-blue-100/70">{item.metricName}</span><strong className="text-white">{item.values.average === null ? "—" : `${Math.round(item.values.average)} ${item.unit}`}</strong></div><p className="mt-2 text-[11px] leading-4 text-blue-100/45">{item.note}</p></div>) : <EmptyTelemetry text="Nenhuma leitura de processo disponível." />}</div></section></div>
        <section className="cad-frame p-5"><h3 className="text-base font-semibold text-white">Custos registrados</h3><p className="mt-1 text-xs leading-5 text-blue-100/55">Despesas operacionais reais dependem de lançamentos explícitos; o total não é estimado quando faltam dados ou moedas comparáveis.</p><div className="mt-5 grid gap-3 sm:grid-cols-3"><SmallValue label="LLM estimado" value={money(cost.llm.estimatedCostCents, cost.llm.currency)} /><SmallValue label="Despesas observadas" value={cost.operational.length ? cost.operational.map(item => money(item.amountCents, item.currency)).join(" · ") : "—"} /><SmallValue label="Total BRL comparável" value={money(cost.totalObservedBrlCents)} /></div>{cost.totalNotice && <p className="mt-4 text-xs text-amber-100/80">{cost.totalNotice}</p>}</section>
      </TabsContent>
    </Tabs>
  </div>;
}

function SmallValue({ label, value }: { label: string; value: string }) {
  return <div className="border border-white/10 bg-white/[0.025] p-3"><p className="font-mono text-[10px] uppercase tracking-wider text-blue-100/55">{label}</p><p className="mt-2 text-lg font-semibold text-white">{value}</p></div>;
}
