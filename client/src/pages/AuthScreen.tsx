import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OfficialBrandLogo } from "@/components/OfficialBrandLogo";
import { ArrowUpRight, BadgeCheck, CheckCircle2, CircleDotDashed, Loader2, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const metrics = [
  { value: "01", label: "questão por vez" },
  { value: "872", label: "conceitos canônicos" },
  { value: "100%", label: "dados isolados" },
];

type AccessMode = "login" | "register" | "reset" | "activation_sent";

export default function AuthScreen() {
  const [mode, setMode] = useState<AccessMode>("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetConfirmed, setResetConfirmed] = useState(false);
  const [showEmailFlow, setShowEmailFlow] = useState(false);
  const utils = trpc.useUtils();
  const register = trpc.auth.register.useMutation();
  const login = trpc.auth.login.useMutation();
  const reset = trpc.auth.requestPasswordReset.useMutation();
  const submitting = register.isPending || login.isPending || reset.isPending;

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("auth");
    if (!result) return;
    window.history.replaceState({}, "", window.location.pathname);
    if (result === "google-success") toast.success("Sessão iniciada com sua Conta Google.");
    if (result === "google-password-pending") toast.error("Ative primeiro sua conta com a senha temporária para concluir a vinculação Google.");
    if (result === "google-error" || result === "google-unavailable") toast.error("Não foi possível concluir o acesso pela Conta Google.");
  }, []);

  function startGoogleLogin() {
    window.location.assign("/api/auth/google/start");
  }

  function changeMode(nextMode: AccessMode) {
    setMode(nextMode);
    setPassword("");
    setResetConfirmed(false);
    setShowEmailFlow(nextMode === "reset");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      if (mode === "register") {
        await register.mutateAsync({ email });
        setMode("activation_sent");
        return;
      }
      if (mode === "reset") {
        if (!resetConfirmed) {
          toast.error("Confirme a solicitação para receber uma senha temporária.");
          return;
        }
        await reset.mutateAsync({ email, confirmed: true });
        setMode("activation_sent");
        return;
      }
      const responseUser = await login.mutateAsync({ email, password });
      const confirmedUser = await utils.auth.me.fetch();
      if (!confirmedUser) {
        toast.error("Não foi possível confirmar a sessão. Tente novamente.");
        return;
      }
      utils.auth.me.setData(undefined, confirmedUser ?? responseUser);
      setPassword("");
      toast.success(confirmedUser.passwordChangeRequired ? "Use a senha temporária para definir sua nova senha." : "Sessão iniciada com segurança.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir o acesso.");
    }
  }

  const isSent = mode === "activation_sent";
  const choosingMethod = !isSent && !showEmailFlow;
  const title = mode === "register" ? "Comece seu plano." : mode === "login" ? "Retome seu estudo." : mode === "reset" ? "Restabeleça seu acesso." : "Verifique sua caixa de entrada.";

  return <main className="blueprint-grid auth-viewport">
    <div className="auth-shell">
      <section className="auth-hero" aria-labelledby="auth-title">
        <header className="auth-brand"><OfficialBrandLogo variant="dark" className="auth-official-logo" /></header>
        <div className="auth-hero-copy"><p className="auth-kicker"><span /> MATRIZ DE PRONTIDÃO 2.0</p><h1 id="auth-title">Estude com <em>evidência.</em><br />Evolua com direção.</h1><p className="auth-intro">O tutor organiza cada revisão a partir do que você já demonstrou, preservando rastreabilidade e foco no próximo conceito.</p></div>
        <div className="auth-metric-grid" aria-label="Indicadores da plataforma">{metrics.map(metric => <div key={metric.label}><strong>{metric.value}</strong><span>{metric.label}</span></div>)}</div>
        <div className="auth-evidence-card"><div className="auth-evidence-icon"><BadgeCheck /></div><div><p>JORNADA INDIVIDUAL</p><strong>Progresso associado a evidências, não a palpites.</strong></div><ArrowUpRight aria-hidden="true" /></div>
        <div className="auth-ruler" aria-hidden="true"><span /><i /><i /><i /><i /><i /><i /><i /></div>
      </section>
      <section className="auth-panel" aria-label="Acesso à plataforma"><div className="auth-card">
        <div className="auth-card-header"><div><p className="auth-kicker"><span /> ACESSO INDIVIDUAL</p><h2>{title}</h2></div><ShieldCheck aria-hidden="true" /></div>
        {!isSent && <div className="auth-mode-switch" role="tablist" aria-label="Modo de acesso"><button role="tab" aria-selected={mode === "register"} type="button" onClick={() => changeMode("register")} className={`auth-mode-tab ${mode === "register" ? "auth-mode-tab-active" : ""}`}>Criar conta</button><button role="tab" aria-selected={mode === "login"} type="button" onClick={() => changeMode("login")} className={`auth-mode-tab ${mode === "login" ? "auth-mode-tab-active" : ""}`}>Entrar</button></div>}
        {!isSent && <a href="/planos" className="auth-public-plans-link"><span>Conheça os planos e a política experimental</span><ArrowUpRight className="h-4 w-4 shrink-0" /></a>}
        {isSent ? <ActivationSent onLogin={() => changeMode("login")} /> : choosingMethod ? <AccessMethodChoice mode={mode} onGoogle={startGoogleLogin} onEmail={() => setShowEmailFlow(true)} /> : <form onSubmit={submit} className="auth-form" noValidate>
          {mode === "register" && <p className="text-sm leading-6 text-blue-100/75">Informe somente seu e-mail. Enviaremos uma senha temporária e as instruções para ativar sua conta.</p>}
          {mode === "reset" && <p className="text-sm leading-6 text-blue-100/75">Informe seu e-mail e confirme a solicitação. Uma senha temporária substituirá a atual e deverá ser trocada após o login.</p>}
          <Field label="E-mail" htmlFor="email" icon={<Mail />}><Input id="email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required className="blueprint-input auth-field-control" placeholder="voce@exemplo.com" /></Field>
          {mode === "login" && <Field label="Senha" htmlFor="password" icon={<LockKeyhole />}><Input id="password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required minLength={1} className="blueprint-input auth-field-control" placeholder="Sua senha ou senha temporária" /></Field>}
          {mode === "reset" && <label className="flex cursor-pointer items-start gap-3 border border-white/15 bg-white/[0.035] p-3 text-sm leading-5 text-blue-100/80"><Checkbox checked={resetConfirmed} onCheckedChange={checked => setResetConfirmed(checked === true)} className="mt-0.5 border-sky-100/60" />Confirmo que quero invalidar minha senha atual e receber uma senha temporária neste e-mail.</label>}
          <Button type="submit" disabled={submitting || (mode === "reset" && !resetConfirmed)} className="auth-primary-button">{submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Processando</> : <>{mode === "register" ? "Enviar senha de ativação" : mode === "reset" ? "Enviar senha temporária" : "Entrar na plataforma"}<ArrowUpRight className="h-4 w-4" /></>}</Button>
          {mode === "login" && <button type="button" onClick={() => changeMode("reset")} className="-mt-1 text-left font-mono text-xs uppercase tracking-wide text-sky-200 hover:text-white">Esqueci minha senha</button>}
          {mode === "reset" && <button type="button" onClick={() => changeMode("login")} className="-mt-1 text-left font-mono text-xs uppercase tracking-wide text-sky-200 hover:text-white">Voltar para entrar</button>}
          {mode !== "reset" && <button type="button" onClick={() => setShowEmailFlow(false)} className="-mt-1 text-left font-mono text-xs uppercase tracking-wide text-sky-200 hover:text-white">Outras formas de acesso</button>}
        </form>}
        <p className="auth-footnote">Suas respostas, eventos e indicadores de prontidão pertencem exclusivamente à sua conta.</p>
      </div></section>
    </div>
  </main>;
}

function AccessMethodChoice({ mode, onGoogle, onEmail }: { mode: AccessMode; onGoogle: () => void; onEmail: () => void }) {
  const action = mode === "login" ? "entrar" : "criar sua conta";
  return <div className="auth-method-choice"><p className="auth-method-intro">Escolha como deseja {action}.</p><Button type="button" onClick={onGoogle} className="auth-google-button"><GoogleLogo /><span>Continuar com a Conta Google</span><ArrowUpRight className="h-4 w-4" /></Button><div className="auth-method-divider"><span />ou<span /></div><Button type="button" variant="outline" onClick={onEmail} className="auth-email-choice"><Mail className="h-4 w-4" />Continuar com e-mail<ArrowUpRight className="h-4 w-4" /></Button></div>;
}

function GoogleLogo() {
  return <svg aria-hidden="true" focusable="false" className="auth-google-mark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/><path d="M1 1h22v22H1z" fill="none"/></svg>;
}

function ActivationSent({ onLogin }: { onLogin: () => void }) {
  return <div className="mt-8 border border-sky-200/35 bg-sky-200/[0.06] p-5"><div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-sky-200" /><div><h3 className="font-display text-lg font-bold text-white">Mensagem enviada</h3><p className="mt-2 text-sm leading-6 text-blue-100/75">Use a senha temporária recebida para entrar. A plataforma solicitará imediatamente uma nova senha segura antes de liberar o estudo.</p></div></div><Button type="button" onClick={onLogin} className="mt-5 w-full auth-primary-button">Ir para entrar<ArrowUpRight className="h-4 w-4" /></Button></div>;
}

function Field({ label, htmlFor, icon, children }: { label: string; htmlFor: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="auth-field-set"><Label htmlFor={htmlFor} className="auth-field-label">{label}</Label><div className="auth-field-wrap"><span className="auth-field-icon" aria-hidden="true">{icon}</span>{children}</div></div>;
}
