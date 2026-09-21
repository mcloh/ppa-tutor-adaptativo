import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowUpRight, KeyRound, Loader2, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export function PasswordChangePanel({ required, onComplete, onClose }: { required: boolean; onComplete: () => Promise<void> | void; onClose?: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const changePassword = trpc.auth.changePassword.useMutation();
  const mismatch = Boolean(passwordConfirmation) && newPassword !== passwordConfirmation;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mismatch) {
      toast.error("As novas senhas não coincidem.");
      return;
    }
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword, passwordConfirmation });
      toast.success(required ? "Conta ativada. Sua nova senha está protegida." : "Senha atualizada com segurança.");
      await onComplete();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a senha.");
    }
  }

  return <section className={`cad-frame w-full ${required ? "max-w-xl" : "max-w-2xl"} p-6 sm:p-8`} aria-labelledby="password-change-title">
    <div className="flex items-start justify-between gap-4 border-b border-white/15 pb-5">
      <div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-sky-200">SEGURANÇA / CREDENCIAL</p><h2 id="password-change-title" className="mt-2 font-display text-2xl font-bold text-white">{required ? "Defina sua senha segura" : "Trocar senha"}</h2></div>
      {required ? <KeyRound className="h-6 w-6 text-sky-200" aria-hidden="true" /> : <Button type="button" variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-blue-100 hover:bg-white/10 hover:text-white" aria-label="Fechar troca de senha"><X className="h-4 w-4" /></Button>}
    </div>
    <p className="mt-5 text-sm leading-6 text-blue-100/75">{required ? "Informe a senha temporária recebida por e-mail e escolha uma nova senha para liberar seu ambiente de estudo." : "Confirme sua senha atual e escolha uma nova combinação de pelo menos 12 caracteres, com letras e números."}</p>
    <form onSubmit={submit} className="mt-6 grid gap-5" noValidate>
      <PasswordField id="current-password" label={required ? "Senha temporária" : "Senha atual"} value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" minLength={1} placeholder={required ? "A senha recebida por e-mail" : "Sua senha atual"} />
      <PasswordField id="new-password" label="Nova senha" value={newPassword} onChange={setNewPassword} autoComplete="new-password" minLength={12} placeholder="12+ caracteres, letras e números" />
      <div><PasswordField id="new-password-confirmation" label="Confirme a nova senha" value={passwordConfirmation} onChange={setPasswordConfirmation} autoComplete="new-password" minLength={12} placeholder="Repita a nova senha" />{mismatch && <p className="mt-2 text-xs text-amber-200">As novas senhas ainda não coincidem.</p>}</div>
      <Button type="submit" disabled={changePassword.isPending} className="auth-primary-button">{changePassword.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Atualizando credencial</> : <>{required ? "Ativar conta" : "Salvar nova senha"}<ArrowUpRight className="h-4 w-4" /></>}</Button>
    </form>
  </section>;
}

function PasswordField({ id, label, value, onChange, autoComplete, minLength, placeholder }: { id: string; label: string; value: string; onChange: (value: string) => void; autoComplete: string; minLength: number; placeholder: string }) {
  return <div className="auth-field-set"><Label htmlFor={id} className="auth-field-label">{label}</Label><div className="auth-field-wrap"><span className="auth-field-icon" aria-hidden="true"><KeyRound /></span><Input id={id} type="password" autoComplete={autoComplete} value={value} onChange={event => onChange(event.target.value)} required minLength={minLength} className="blueprint-input auth-field-control" placeholder={placeholder} /></div></div>;
}
