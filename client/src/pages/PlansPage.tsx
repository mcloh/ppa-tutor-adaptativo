import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OfficialBrandLogo } from "@/components/OfficialBrandLogo";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, ArrowUpRight, CircleAlert, CircleCheck, Clock3, CreditCard, Download, ExternalLink, LockKeyhole, Plane, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Plan = {
  id: "experimental" | "100" | "500" | "1000" | "3000";
  eyebrow: string;
  title: string;
  questions: string;
  simulations: string;
  price: string;
  unitValue: string;
  description: string;
  highlight?: string;
  featured?: boolean;
};

type CreditSummaryData = {
  balance: {
    availableCredits: number;
    lifetimeConsumed: number;
    experimentalAccessActive: boolean;
    checkoutAvailable: boolean;
    productionCommercialCheckoutAvailable: boolean;
  };
  ledger: Array<{
    entryType: string;
  }>;
};

type CheckoutEnvironment = "sandbox" | "production";

type PaymentModuleState =
  | { state: "preparing"; plan: Plan; environment: CheckoutEnvironment }
  | { state: "ready"; plan: Plan; checkoutUrl: string; referenceId: string; environment: CheckoutEnvironment }
  | { state: "opened"; plan: Plan; referenceId: string; environment: CheckoutEnvironment }
  | { state: "returned"; environment: CheckoutEnvironment };

type CheckoutReturnStatus = {
  status: "draft" | "pending" | "paid" | "failed" | "cancelled" | "expired";
  creditQuantity: number;
  productKey: string;
  paidAt: Date | null;
} | null;

const plans: Plan[] = [
  {
    id: "experimental",
    eyebrow: "CRÉDITO INICIAL",
    title: "Diagnóstico inicial",
    questions: "100 questões",
    simulations: "1 simulado",
    price: "Gratuito",
    unitValue: "Incluído com a conta",
    description: "Comece pelo diagnóstico adaptativo, receba feedback e acompanhe sua prontidão inicial.",
    highlight: "100 CRÉDITOS DE BOAS-VINDAS",
  },
  {
    id: "100",
    eyebrow: "CRÉDITO DE VOO 01",
    title: "Essencial",
    questions: "100 questões",
    simulations: "1 simulado",
    price: "R$ 4,90",
    unitValue: "R$ 4,90 por simulado",
    description: "Um novo ciclo completo para consolidar conteúdos e praticar sob demanda.",
  },
  {
    id: "500",
    eyebrow: "CRÉDITO DE VOO 02",
    title: "Panorâmico",
    questions: "500 questões",
    simulations: "5 simulados",
    price: "R$ 14,90",
    unitValue: "R$ 2,98 por simulado",
    description: "Volume para estabelecer consistência e avançar na revisão por conceito.",
    highlight: "39% DE ECONOMIA",
  },
  {
    id: "1000",
    eyebrow: "CRÉDITO DE VOO 03",
    title: "Ponte Aérea",
    questions: "1.000 questões",
    simulations: "10 simulados",
    price: "R$ 24,90",
    unitValue: "R$ 2,49 por simulado",
    description: "O melhor equilíbrio para criar ritmo, medir evolução e fortalecer lacunas.",
    highlight: "MELHOR EQUILÍBRIO",
    featured: true,
  },
  {
    id: "3000",
    eyebrow: "CRÉDITO DE VOO 04",
    title: "Comando",
    questions: "3.000 questões",
    simulations: "30 simulados",
    price: "R$ 44,90",
    unitValue: "Aprox. R$ 1,50 por simulado",
    description: "Maior autonomia para percorrer ciclos de prática, revisão e avaliação contínua.",
    highlight: "MAIOR ECONOMIA",
  },
];

export default function PlansPage() {
  const { isAuthenticated, user } = useAuth();
  const utils = trpc.useUtils();
  const [checkoutKeys, setCheckoutKeys] = useState<Record<string, string>>({});
  const [paymentModule, setPaymentModule] = useState<PaymentModuleState | null>(() => {
    const checkout = new URLSearchParams(window.location.search).get("checkout");
    return checkout === "sandbox" || checkout === "production" ? { state: "returned", environment: checkout } : null;
  });
  const returnReference = new URLSearchParams(window.location.search).get("ref");
  const creditSummary = trpc.credits.summary.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const studyProgram = trpc.study.program.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchOnWindowFocus: false,
  });
  const catalog = trpc.credits.catalog.useQuery(undefined, { staleTime: 60_000 });
  const sandboxCheckout = trpc.credits.createSandboxCheckout.useMutation();
  const productionHomologationCheckout = trpc.credits.createProductionHomologationCheckout.useMutation();
  const productionCommercialCheckout = trpc.credits.createProductionCheckout.useMutation();
  const recordSandboxCheckoutLifecycle = trpc.credits.recordSandboxCheckoutLifecycle.useMutation();
  const recordProductionCheckoutLifecycle = trpc.credits.recordProductionCheckoutLifecycle.useMutation();
  const productionHomologationCheckoutAvailable = Boolean(isAuthenticated && user?.role === "homologation" && catalog.data?.experimental.productionHomologationCheckoutAvailable);
  const productionCommercialCheckoutAvailable = Boolean(isAuthenticated && catalog.data?.experimental.productionCommercialCheckoutAvailable);
  const visitorCanStartPurchase = Boolean(!isAuthenticated && catalog.data?.experimental.productionCommercialCheckoutAvailable);
  const checkoutEnvironment: CheckoutEnvironment = productionCommercialCheckoutAvailable || productionHomologationCheckoutAvailable ? "production" : "sandbox";
  const homologationAudit = trpc.homologationAudit.list.useQuery({ environment: checkoutEnvironment }, { enabled: user?.role === "homologation", refetchOnWindowFocus: false });
  const exportHomologationAudit = trpc.homologationAudit.export.useMutation();
  const checkoutReturnStatus = trpc.credits.checkoutReturnStatus.useQuery(
    { referenceId: returnReference ?? "ppa-0-0000000000000000" },
    {
      enabled: Boolean(isAuthenticated && paymentModule?.state === "returned" && returnReference),
      refetchInterval: paymentModule?.state === "returned" && returnReference ? 2_500 : false,
      retry: 1,
    },
  );
  const sandboxCheckoutAvailable = Boolean(isAuthenticated && user?.role === "homologation" && catalog.data?.experimental.checkoutAvailable);
  const checkoutAvailable = productionCommercialCheckoutAvailable || productionHomologationCheckoutAvailable || sandboxCheckoutAvailable;
  const recordedReturnReference = useRef<string | null>(null);
  const isDiagnosticPhase = !isAuthenticated || !studyProgram.data || studyProgram.data.diagnosticStatus === "active";
  const phaseCopy = isDiagnosticPhase
    ? {
        eyebrow: "Fase de Diagnóstico",
        title: "Comece com 100 créditos de boas-vindas",
        description: "A sua conta recebe uma única vez 100 créditos para realizar o diagnóstico da teoria do PPA. Ao concluir esse ciclo, a jornada passa para o Treino Adaptativo. Quando quiser continuar praticando, escolha um pacote e pague com segurança pelo PagBank.",
      }
    : {
        eyebrow: "Treino Adaptativo",
        title: "Continue fortalecendo sua preparação",
        description: "Seu diagnóstico foi concluído. Use os créditos disponíveis para praticar, revisar lacunas e acompanhar a prontidão para o Exame da ANAC. Escolha um novo pacote quando quiser continuar sua preparação e pague com segurança pelo PagBank.",
      };

  const downloadHomologationEvidence = () => {
    const eventIds = homologationAudit.data?.map(event => event.id) ?? [];
    if (eventIds.length === 0) return;
    exportHomologationAudit.mutate({ environment: checkoutEnvironment, eventIds }, {
      onSuccess: data => {
        const url = URL.createObjectURL(new Blob([data.content], { type: "application/json" }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = data.fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        void homologationAudit.refetch();
      },
    });
  };

  useEffect(() => {
    if (checkoutReturnStatus.data?.status === "paid") void utils.credits.summary.invalidate();
  }, [checkoutReturnStatus.data?.status, utils.credits.summary]);

  useEffect(() => {
    if (user?.role !== "homologation" || paymentModule?.state !== "returned" || !returnReference || recordedReturnReference.current === returnReference) return;
    recordedReturnReference.current = returnReference;
    const lifecycle = paymentModule.environment === "production" ? recordProductionCheckoutLifecycle : recordSandboxCheckoutLifecycle;
    lifecycle.mutate({ referenceId: returnReference, operation: "checkout_return" }, {
      onSuccess: () => void homologationAudit.refetch(),
      onError: () => { recordedReturnReference.current = null; },
    });
  }, [homologationAudit, paymentModule, recordProductionCheckoutLifecycle, recordSandboxCheckoutLifecycle, returnReference, user?.role]);

  const beginCheckout = (plan: Plan) => {
    const productKeyByPlan: Record<Exclude<Plan["id"], "experimental">, "essential" | "panoramic" | "air_bridge" | "command"> = {
      "100": "essential", "500": "panoramic", "1000": "air_bridge", "3000": "command",
    };
    if (plan.id === "experimental") return;
    const idempotencyKey = checkoutKeys[plan.id] ?? crypto.randomUUID();
    setCheckoutKeys(current => ({ ...current, [plan.id]: idempotencyKey }));
    setPaymentModule({ state: "preparing", plan, environment: checkoutEnvironment });
    const createCheckout = productionCommercialCheckoutAvailable
      ? productionCommercialCheckout
      : checkoutEnvironment === "production"
        ? productionHomologationCheckout
        : sandboxCheckout;
    createCheckout.mutate({ productKey: productKeyByPlan[plan.id], idempotencyKey }, {
      onSuccess: data => setPaymentModule({ state: "ready", plan, checkoutUrl: data.checkoutUrl, referenceId: data.referenceId, environment: checkoutEnvironment }),
      onError: () => setPaymentModule(null),
    });
  };

  const closePaymentModule = () => {
    setPaymentModule(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("checkout");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const openHostedCheckout = () => {
    if (!paymentModule || paymentModule.state !== "ready") return;
    const lifecycle = paymentModule.environment === "production" ? recordProductionCheckoutLifecycle : recordSandboxCheckoutLifecycle;
    lifecycle.mutate({ referenceId: paymentModule.referenceId, operation: "checkout_opened" }, { onSuccess: () => void homologationAudit.refetch() });
    window.open(paymentModule.checkoutUrl, "_blank", "noopener,noreferrer");
    setPaymentModule({ state: "opened", plan: paymentModule.plan, referenceId: paymentModule.referenceId, environment: paymentModule.environment });
  };

  return (
    <section className="mx-auto w-full max-w-[1440px] pb-10">
      <div className="relative overflow-hidden border-b border-white/15 pb-8 sm:pb-10">
        <aside className="absolute right-0 top-0 hidden h-32 w-32 items-center justify-center border border-sky-200/25 bg-[#061847]/35 p-2 sm:flex" aria-label="Compra segura com o parceiro PagBank">
          <img src="/storage/pagbank-secure-partner-badge_edb836ea.png" alt="Compra segura com PagBank, parceiro de pagamentos" className="h-full w-full object-contain" />
        </aside>
        <div className="relative max-w-3xl">
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-sky-200"><CreditCard className="h-3.5 w-3.5" />Plano de créditos</p>
          <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">Escolha a sua próxima <span className="text-sky-200">etapa de voo.</span></h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-blue-100/75 sm:text-base">Cada 100 questões equivale a um simulado completo. Os créditos ampliam sua jornada de prática, revisão espaçada e diagnóstico de prontidão.</p>
        </div>
      </div>

      <section className="cad-frame relative mt-7 overflow-hidden bg-[#071b50]/90 px-5 py-5 shadow-[0_20px_60px_rgba(0,0,0,0.24)] sm:mt-9 sm:px-7 sm:py-6" aria-labelledby="phase-notice-title">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full border border-sky-200/15" />
        <div className="relative flex gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-amber-200/60 bg-amber-200/10 text-amber-100"><Clock3 className="h-5 w-5" /></div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-100">{phaseCopy.eyebrow}</p>
            <h2 id="phase-notice-title" className="mt-1 text-base font-semibold text-white sm:text-lg">{phaseCopy.title}</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-blue-100/75">{phaseCopy.description}</p>
          </div>
        </div>
      </section>

      {isAuthenticated && <CreditStatusPanel isLoading={creditSummary.isLoading} hasError={Boolean(creditSummary.error)} data={creditSummary.data} commercialCheckoutAvailable={productionCommercialCheckoutAvailable} productionHomologationAvailable={productionHomologationCheckoutAvailable} isDiagnosticPhase={isDiagnosticPhase} />}
      {user?.role === "homologation" && <HomologationEvidencePanel environment={checkoutEnvironment} count={homologationAudit.data?.length ?? 0} isLoading={homologationAudit.isLoading} isExporting={exportHomologationAudit.isPending} hasError={Boolean(homologationAudit.error || exportHomologationAudit.error)} onExport={downloadHomologationEvidence} />}

      <div className="mt-8 flex items-center justify-between gap-4 sm:mt-10">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-sky-200">Tabela de créditos</p>
          <h2 className="mt-2 font-display text-2xl font-bold text-white">Planos de créditos</h2>
        </div>
          {(productionCommercialCheckoutAvailable || productionHomologationCheckoutAvailable || sandboxCheckoutAvailable) && <p className="hidden max-w-xs text-right text-xs leading-5 text-blue-100/55 sm:block">{productionCommercialCheckoutAvailable ? "Pague como preferir: cartão, Pix ou boleto. Seus créditos entram após a confirmação do pagamento." : productionHomologationCheckoutAvailable ? "Homologação de produção disponível somente para a conta técnica." : "Homologação Sandbox disponível para validação técnica."}</p>}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {plans.map(plan => <PlanCard key={plan.id} plan={plan} checkoutAvailable={checkoutAvailable} visitorCanStartPurchase={visitorCanStartPurchase} environment={checkoutEnvironment} onCheckout={beginCheckout} onRequireAuthentication={() => window.location.assign("/")} isSubmitting={sandboxCheckout.isPending || productionHomologationCheckout.isPending || productionCommercialCheckout.isPending} checkoutError={sandboxCheckout.error?.message ?? productionHomologationCheckout.error?.message ?? productionCommercialCheckout.error?.message} />)}
      </div>
      <p className="mt-6 flex items-center gap-2 text-xs leading-5 text-blue-100/55"><Plane className="h-4 w-4 shrink-0 text-sky-200" />Os créditos são pré-pagos e não possuem vencimento anunciado. O saldo é atualizado somente depois da confirmação autenticada do pagamento pelo PagBank.</p>
      <PaymentModule state={paymentModule} returnStatus={checkoutReturnStatus.data} isReturnStatusLoading={checkoutReturnStatus.isLoading} hasReturnStatusError={Boolean(checkoutReturnStatus.error)} onClose={closePaymentModule} onOpenCheckout={openHostedCheckout} />
    </section>
  );
}

function HomologationEvidencePanel({ environment, count, isLoading, isExporting, hasError, onExport }: { environment: CheckoutEnvironment; count: number; isLoading: boolean; isExporting: boolean; hasError: boolean; onExport: () => void }) {
  return <section className="cad-frame mt-6 border border-sky-200/25 bg-[#061847]/70 p-5 sm:p-6" aria-labelledby="homologation-evidence-title">
    <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-sky-200">HOMOLOGAÇÃO / EVIDÊNCIA</p><h2 id="homologation-evidence-title" className="mt-2 font-display text-xl font-bold text-white">Registros técnicos — {environment === "production" ? "Produção" : "Sandbox"}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100/70">A exportação preserva o ciclo técnico deste ambiente, incluindo criação, abertura, retorno, webhook, reconciliação e liquidação. O arquivo baixado contém o PAY literal para auditoria; a interface nunca o mostra. Identidades e cartão são mascarados parcialmente, enquanto credenciais e códigos de autorização são removidos.</p></div><Button type="button" onClick={onExport} disabled={isLoading || isExporting || count === 0} className="shrink-0 rounded-none bg-sky-200 text-[#061847] hover:bg-white"><Download className="h-4 w-4" />{isExporting ? "Preparando JSON" : `Exportar JSON${count ? ` (${count})` : ""}`}</Button></div>
    {hasError && <p className="mt-4 border-l-2 border-amber-200 pl-3 text-xs leading-5 text-amber-100">Não foi possível consultar ou exportar as evidências neste momento. Nenhum registro adicional foi exposto.</p>}
  </section>;
}

function PaymentModule({ state, returnStatus, isReturnStatusLoading, hasReturnStatusError, onClose, onOpenCheckout }: { state: PaymentModuleState | null; returnStatus: CheckoutReturnStatus | undefined; isReturnStatusLoading: boolean; hasReturnStatusError: boolean; onClose: () => void; onOpenCheckout: () => void }) {
  const open = Boolean(state);
  const isPreparing = state?.state === "preparing";
  const isReady = state?.state === "ready";
  const isOpened = state?.state === "opened";
  const isReturned = state?.state === "returned";
  const isPaid = isReturned && returnStatus?.status === "paid";
  const returnedTitle = isReturnStatusLoading ? "Verificando confirmação" : isPaid ? "Pagamento confirmado" : hasReturnStatusError ? "Retorno registrado" : "Pagamento em processamento";
  const returnedDescription = isReturnStatusLoading
    ? "Seu retorno foi registrado. Estamos confirmando o pedido diretamente no PagBank antes de atualizar seus créditos."
    : isPaid
      ? `Pagamento confirmado pelo servidor. ${returnStatus.creditQuantity.toLocaleString("pt-BR")} créditos foram registrados na sua conta e o saldo já foi atualizado.`
      : hasReturnStatusError
        ? "Seu retorno foi registrado. A confirmação do pedido continua em processamento seguro; atualize esta página em alguns instantes para consultar o saldo."
        : "O PagBank devolveu você ao PPA. A confirmação segura está em processamento; seus créditos aparecerão automaticamente assim que o pedido for validado pelo servidor.";
  return (
    <Dialog open={open} onOpenChange={nextOpen => !nextOpen && onClose()}>
      <DialogContent className="cad-frame max-w-lg border-sky-200/35 bg-[#061847] p-0 text-white shadow-[0_28px_90px_rgba(0,0,0,0.65)]" showCloseButton={false}>
        <div className="border-b border-white/10 bg-sky-200/[0.08] px-6 py-5 sm:px-7">
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-sky-200"><CreditCard className="h-4 w-4" />Módulo de pagamento</p>
          <DialogHeader className="mt-3 text-left">
            <DialogTitle className="font-display text-2xl font-bold text-white">{isReturned ? returnedTitle : isOpened ? "Checkout aberto em nova aba" : isReady ? "Checkout pronto para abrir" : "Preparando ambiente seguro"}</DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-6 text-blue-100/70">
              {isReturned ? returnedDescription : isOpened ? "Conclua ou cancele o pagamento na aba do PagBank. Você pode voltar a esta tela quando quiser; os créditos entram após a confirmação do pagamento." : isReady ? `Você será direcionado ao PagBank para concluir com segurança a compra do pacote ${state.plan.title}.` : "Estamos preparando seu pagamento seguro. Seus dados são informados diretamente ao PagBank."}
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="px-6 py-5 sm:px-7">
          <div className="flex gap-3 border border-sky-200/20 bg-sky-200/[0.06] p-4 text-sm text-blue-100/80"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-200" /><p>O checkout é hospedado pelo PagBank. A nova aba protege seus dados de pagamento e preserva esta área do PPA para o retorno e acompanhamento.</p></div>
        </div>
        <DialogFooter className="border-t border-white/10 px-6 py-5 sm:px-7">
          <Button variant="outline" onClick={onClose} className="rounded-none border-white/20 text-blue-100 hover:bg-white/10 hover:text-white">Fechar</Button>
          {isReady && <Button onClick={onOpenCheckout} className="rounded-none bg-sky-200 text-[#061847] hover:bg-white"><ExternalLink className="h-4 w-4" />Abrir checkout seguro</Button>}
          {isPreparing && <Button disabled className="rounded-none bg-sky-200 text-[#061847]"><Clock3 className="h-4 w-4 animate-spin" />Preparando</Button>}
          {isOpened && <Button onClick={onClose} className="rounded-none bg-sky-200 text-[#061847] hover:bg-white">Voltar aos planos</Button>}
          {isReturned && <Button onClick={onClose} className="rounded-none bg-sky-200 text-[#061847] hover:bg-white">Entendi</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreditStatusPanel({ isLoading, hasError, data, commercialCheckoutAvailable, productionHomologationAvailable, isDiagnosticPhase }: { isLoading: boolean; hasError: boolean; data: CreditSummaryData | undefined; commercialCheckoutAvailable: boolean; productionHomologationAvailable: boolean; isDiagnosticPhase: boolean }) {
  if (isLoading) {
    return (
      <section className="cad-frame mt-5 grid gap-4 border border-sky-200/20 bg-[#061847]/80 p-5 sm:grid-cols-[1fr_1.2fr] sm:p-6" aria-label="Carregando situação de créditos">
        <div className="space-y-3"><div className="h-3 w-28 bg-sky-100/10" /><div className="h-9 w-32 bg-sky-100/10" /></div>
        <div className="space-y-3 sm:border-l sm:border-white/10 sm:pl-6"><div className="h-3 w-36 bg-sky-100/10" /><div className="h-5 w-full max-w-md bg-sky-100/10" /></div>
      </section>
    );
  }

  if (hasError || !data) {
    return (
      <section className="cad-frame mt-5 flex gap-3 border border-amber-200/30 bg-amber-100/[0.07] p-5 text-amber-50 sm:p-6" role="status">
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
        <div><p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em]">Saldo temporariamente indisponível</p><p className="mt-1 text-sm leading-6 text-amber-50/80">A área de estudo continua disponível. Atualize a página em alguns instantes para consultar seus créditos.</p></div>
      </section>
    );
  }

  const { balance, ledger } = data;
  const initialGrant = ledger.find(entry => entry.entryType === "trial_grant");
  return (
    <section className="cad-frame relative mt-5 overflow-hidden border border-sky-200/30 bg-sky-200/[0.07] p-5 shadow-[0_16px_42px_rgba(2,132,199,0.10)] sm:p-6" aria-labelledby="credit-status-title">
      <div className="absolute -right-5 -top-5 h-24 w-24 rounded-full border border-sky-200/20" />
      <div className="relative grid gap-5 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.3fr)] sm:items-center">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-sky-200">Situação de créditos</p>
          <h2 id="credit-status-title" className="mt-2 font-display text-3xl font-bold text-white">{balance.availableCredits.toLocaleString("pt-BR")} <span className="text-base font-medium text-sky-100">créditos registrados</span></h2>
          <p className="mt-2 text-xs leading-5 text-blue-100/65">{initialGrant ? "Os créditos de boas-vindas foram aplicados automaticamente uma única vez a esta conta." : "Seu saldo será atualizado assim que a conta for inicializada."}</p>
        </div>
        <div className="border-t border-white/10 pt-5 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-white"><CircleCheck className="h-4 w-4 text-sky-200" />{isDiagnosticPhase ? "Fase de Diagnóstico" : "Treino Adaptativo"}</p>
          {(commercialCheckoutAvailable || productionHomologationAvailable) && <p className="mt-2 text-sm leading-6 text-blue-100/70">{commercialCheckoutAvailable ? "Escolha um pacote e pague como preferir: cartão, Pix ou boleto. Seus créditos entram automaticamente após a confirmação do pagamento." : "A abertura de Checkout de produção é exclusiva da homologação técnica e ocorre no ambiente hospedado do PagBank; o acesso de alunos continua gratuito nesta fase."}</p>}
        </div>
      </div>
    </section>
  );
}

export function PublicPlansPage() {
  return (
    <main className="blueprint-grid min-h-screen bg-background px-4 py-5 text-foreground sm:px-6 sm:py-7 lg:px-10">
      <div className="mx-auto w-full max-w-[1440px]">
        <header className="flex items-center justify-between gap-4 border-b border-white/15 pb-4 sm:pb-5">
          <a href="/" className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-sky-100 transition-colors hover:text-white"><ArrowLeft className="h-3.5 w-3.5" />Voltar ao acesso</a>
          <OfficialBrandLogo variant="dark" className="hidden h-9 w-auto max-w-[150px] object-contain sm:block" />
        </header>
        <PlansPage />
        <section className="cad-frame mt-3 flex flex-col gap-4 bg-[#071b50]/85 px-5 py-5 sm:mt-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div><p className="font-mono text-[10px] uppercase tracking-[0.17em] text-sky-200">Jornada individual</p><p className="mt-1 text-sm text-blue-100/75">Crie sua conta e comece com 100 créditos gratuitos.</p></div>
          <a href="/" className="inline-flex h-10 items-center justify-center gap-2 border border-sky-200 bg-sky-200 px-4 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#061847] transition-colors hover:bg-white"><span>Criar conta</span><ArrowUpRight className="h-3.5 w-3.5" /></a>
        </section>
      </div>
    </main>
  );
}

function PlanCard({ plan, checkoutAvailable, visitorCanStartPurchase, environment, onCheckout, onRequireAuthentication, isSubmitting, checkoutError }: { plan: Plan; checkoutAvailable: boolean; visitorCanStartPurchase: boolean; environment: CheckoutEnvironment; onCheckout: (plan: Plan) => void; onRequireAuthentication: () => void; isSubmitting: boolean; checkoutError?: string }) {
  const controlId = `plan-${plan.id}-notice`;
  const isInitialGrant = plan.id === "experimental";
  const available = checkoutAvailable && !isInitialGrant;
  const requiresAuthentication = visitorCanStartPurchase && !isInitialGrant;
  return (
    <article className={`relative flex min-h-[370px] flex-col overflow-hidden border p-5 transition-colors sm:p-6 ${plan.featured ? "border-sky-200 bg-sky-200/[0.09] shadow-[0_18px_48px_rgba(2,132,199,0.12)]" : "border-white/15 bg-[#071b50]/72"}`}>
      {plan.highlight && <p className={`-mx-5 -mt-5 mb-5 px-5 py-2 text-center font-mono text-[9px] font-bold uppercase tracking-[0.14em] sm:-mx-6 sm:-mt-6 sm:px-6 ${plan.featured ? "bg-sky-200 text-[#061847]" : "border-b border-white/10 bg-white/[0.04] text-amber-100"}`}>{plan.highlight}</p>}
      <p className="font-mono text-[9px] uppercase tracking-[0.17em] text-sky-200">{plan.eyebrow}</p>
      <h3 className="mt-3 font-display text-2xl font-bold text-white">{plan.title}</h3>
      <div className="mt-5 border-y border-white/15 py-4">
        <p className="font-display text-3xl font-bold text-white">{plan.price}</p>
        <p className="mt-1 text-sm font-medium text-sky-100">{plan.questions} <span className="text-blue-100/45">·</span> {plan.simulations}</p>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-amber-100">{plan.unitValue}</p>
      </div>
      <p className="mt-5 text-sm leading-6 text-blue-100/65">{plan.description}</p>
      <div className="mt-auto pt-6">
        <div className="mb-4 flex items-center gap-2 text-xs text-blue-100/75"><CircleCheck className="h-3.5 w-3.5 text-sky-200" />Sem vencimento anunciado</div>
        {isInitialGrant ? <p id={controlId} className="flex min-h-11 items-center justify-center gap-2 border border-sky-200/25 bg-sky-200/[0.06] px-3 text-center font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-sky-100"><CircleCheck className="h-4 w-4 shrink-0 text-sky-200" />Aplicado uma única vez em novas contas</p> : <><Button disabled={(!available && !requiresAuthentication) || isSubmitting} onClick={() => available ? onCheckout(plan) : requiresAuthentication ? onRequireAuthentication() : undefined} aria-describedby={controlId} className={available || requiresAuthentication ? "h-11 w-full rounded-none border border-sky-200 bg-sky-200 font-mono text-[11px] uppercase tracking-[0.14em] text-[#061847] hover:bg-white" : "h-11 w-full rounded-none border border-white/15 bg-white/[0.06] font-mono text-[11px] uppercase tracking-[0.14em] text-blue-100/55 opacity-100"}>{available ? <><CreditCard className="h-4 w-4" />{isSubmitting ? "Preparando..." : "Comprar pacote"}</> : requiresAuthentication ? <><ArrowUpRight className="h-4 w-4" />Entrar para comprar</> : <><LockKeyhole className="h-4 w-4" />Indisponível</>}</Button>{(available || requiresAuthentication || checkoutError) && <p id={controlId} className={`mt-3 text-center text-[10px] leading-4 ${checkoutError && available ? "text-amber-100" : "text-blue-100/45"}`}>{available ? checkoutError ?? (environment === "production" ? "Pague com cartão, Pix ou boleto em uma página segura do PagBank." : "Ambiente Sandbox: nenhum pagamento real será processado.") : "Entre ou crie sua conta para comprar créditos."}</p>}</>}
      </div>
    </article>
  );
}
