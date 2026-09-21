import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { BadgeCheck, CalendarDays, GraduationCap, KeyRound, LockKeyhole, Plus, Save, ShieldCheck, UserRound } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const;

type Props = {
  canChangePassword: boolean;
  onOpenPassword: () => void;
};

type ProfileForm = {
  name: string;
  dateOfBirth: string;
  gender: "M" | "F" | "NB" | "unset";
  city: string;
  stateUf: string;
  theoreticalCourseProvider: string;
};

type AttemptForm = {
  examDate: string;
  metScore: string;
  regScore: string;
  navScore: string;
  mecScore: string;
  tvoScore: string;
  approved: "yes" | "no";
};

const blankAttempt: AttemptForm = { examDate: "", metScore: "", regScore: "", navScore: "", mecScore: "", tvoScore: "", approved: "yes" };

function profileForm(profile: { name: string; dateOfBirth: string | null; gender: "M" | "F" | "NB" | null; city: string | null; stateUf: string | null; theoreticalCourseProvider: string | null }): ProfileForm {
  return {
    name: profile.name,
    dateOfBirth: profile.dateOfBirth ?? "",
    gender: profile.gender ?? "unset",
    city: profile.city ?? "",
    stateUf: profile.stateUf ?? "",
    theoreticalCourseProvider: profile.theoreticalCourseProvider ?? "",
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação. Tente novamente.";
}

export default function StudentProfilePage({ canChangePassword, onOpenPassword }: Props) {
  const utils = trpc.useUtils();
  const profileQuery = trpc.studentProfile.get.useQuery();
  const attemptsQuery = trpc.studentProfile.attempts.list.useQuery();
  const [form, setForm] = useState<ProfileForm>({ name: "", dateOfBirth: "", gender: "unset", city: "", stateUf: "", theoreticalCourseProvider: "" });
  const [attempt, setAttempt] = useState(blankAttempt);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [attemptNotice, setAttemptNotice] = useState<string | null>(null);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    if (profileQuery.data) setForm(profileForm(profileQuery.data));
  }, [profileQuery.data]);

  const saveProfile = trpc.studentProfile.update.useMutation({
    onSuccess: async data => {
      setForm(profileForm(data));
      setProfileNotice("Dados cadastrais atualizados.");
      await Promise.all([utils.studentProfile.get.invalidate(), utils.auth.me.invalidate()]);
    },
    onError: error => setProfileNotice(errorMessage(error)),
  });

  const createAttempt = trpc.studentProfile.attempts.create.useMutation({
    onSuccess: async data => {
      utils.studentProfile.attempts.list.setData(undefined, data);
      setAttempt(blankAttempt);
      setAttemptNotice("Tentativa registrada no seu histórico.");
      await utils.studentProfile.attempts.list.invalidate();
    },
    onError: error => setAttemptNotice(errorMessage(error)),
  });

  function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileNotice(null);
    saveProfile.mutate({
      name: form.name,
      dateOfBirth: form.dateOfBirth || null,
      gender: form.gender === "unset" ? null : form.gender,
      city: form.city,
      stateUf: form.stateUf,
      theoreticalCourseProvider: form.theoreticalCourseProvider,
    });
  }

  function submitAttempt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttemptNotice(null);
    createAttempt.mutate({
      examDate: attempt.examDate,
      metScore: Number(attempt.metScore),
      regScore: Number(attempt.regScore),
      navScore: Number(attempt.navScore),
      mecScore: Number(attempt.mecScore),
      tvoScore: Number(attempt.tvoScore),
      approved: attempt.approved === "yes",
    });
  }

  if (profileQuery.isLoading) return <ProfileSkeleton />;
  if (profileQuery.error || !profileQuery.data) return <Card className="border-rose-300/30 bg-rose-950/20 text-card-foreground"><CardHeader><CardTitle>Dados indisponíveis</CardTitle><CardDescription className="text-blue-100/75">{errorMessage(profileQuery.error)}</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => profileQuery.refetch()}>Tentar novamente</Button></CardContent></Card>;

  return <section className="mx-auto max-w-6xl space-y-6">
    <header className="cad-frame relative overflow-hidden px-5 py-6 sm:px-7 sm:py-8">
      <div className="absolute right-0 top-0 h-24 w-24 border-b border-l border-sky-200/20" />
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-sky-200">Área do aluno</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Dados cadastrais</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100/70">Mantenha seus dados e seu histórico de prova organizados para acompanhar sua preparação.</p></div><div className="flex items-center gap-2 border border-sky-200/20 bg-sky-200/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-sky-100"><ShieldCheck className="h-4 w-4 text-sky-200" />Dados protegidos</div></div>
    </header>

    <div className="grid gap-6 xl:grid-cols-[1.05fr_.95fr]">
      <Card className="border-white/15 bg-[#071d52]/75 text-card-foreground shadow-xl shadow-black/10">
        <CardHeader className="border-b border-white/10"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center border border-sky-200/25 bg-sky-200/10"><UserRound className="h-5 w-5 text-sky-100" /></div><div><CardTitle className="text-lg text-white">Cadastro do aluno</CardTitle><CardDescription className="mt-1 text-blue-100/65">O e-mail é o seu identificador de acesso e não pode ser alterado aqui.</CardDescription></div></div></CardHeader>
        <CardContent className="pt-6">
          <form className="grid gap-5" onSubmit={submitProfile}>
            <div className="grid gap-2"><Label htmlFor="student-email" className="text-blue-100/85">E-mail de acesso</Label><div className="relative"><Input id="student-email" value={profileQuery.data.email} readOnly aria-readonly="true" className="border-white/15 bg-slate-950/35 pr-10 text-blue-100/75" /><LockKeyhole className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-100/55" /></div></div>
            <div className="grid gap-2"><Label htmlFor="student-name" className="text-blue-100/85">Nome <span className="text-sky-200">*</span></Label><Input id="student-name" required minLength={2} maxLength={120} value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} className="border-white/15 bg-slate-950/25 text-white" /></div>
            <div className="grid gap-5 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="birth-date" className="text-blue-100/85">Data de nascimento</Label><Input id="birth-date" type="date" max={today} value={form.dateOfBirth} onChange={event => setForm(current => ({ ...current, dateOfBirth: event.target.value }))} className="border-white/15 bg-slate-950/25 text-white" /></div><div className="grid gap-2"><Label className="text-blue-100/85">Gênero</Label><Select value={form.gender} onValueChange={(value: ProfileForm["gender"]) => setForm(current => ({ ...current, gender: value }))}><SelectTrigger className="border-white/15 bg-slate-950/25 text-white"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="unset">Prefiro não informar</SelectItem><SelectItem value="M">M</SelectItem><SelectItem value="F">F</SelectItem><SelectItem value="NB">NB</SelectItem></SelectContent></Select></div></div>
            <div className="grid gap-5 sm:grid-cols-[1fr_10rem]"><div className="grid gap-2"><Label htmlFor="city" className="text-blue-100/85">Cidade</Label><Input id="city" maxLength={120} value={form.city} onChange={event => setForm(current => ({ ...current, city: event.target.value }))} className="border-white/15 bg-slate-950/25 text-white" /></div><div className="grid gap-2"><Label className="text-blue-100/85">UF</Label><Select value={form.stateUf || "unset"} onValueChange={value => setForm(current => ({ ...current, stateUf: value === "unset" ? "" : value }))}><SelectTrigger className="border-white/15 bg-slate-950/25 text-white"><SelectValue placeholder="UF" /></SelectTrigger><SelectContent><SelectItem value="unset">Não informar</SelectItem>{UFS.map(uf => <SelectItem value={uf} key={uf}>{uf}</SelectItem>)}</SelectContent></Select></div></div>
            <div className="grid gap-2"><Label htmlFor="course-provider" className="text-blue-100/85">Onde realizou o curso teórico PPA?</Label><Input id="course-provider" maxLength={255} value={form.theoreticalCourseProvider} onChange={event => setForm(current => ({ ...current, theoreticalCourseProvider: event.target.value }))} className="border-white/15 bg-slate-950/25 text-white" /></div>
            {profileNotice && <p role="status" className={`border px-3 py-2 text-sm ${saveProfile.isError ? "border-rose-300/30 bg-rose-950/30 text-rose-100" : "border-emerald-300/25 bg-emerald-950/30 text-emerald-100"}`}>{profileNotice}</p>}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5"><p className="max-w-sm text-xs leading-5 text-blue-100/55">Identificadores internos de conta permanecem protegidos e não são exibidos nesta área.</p><Button type="submit" disabled={saveProfile.isPending} className="bg-sky-200 text-[#051238] hover:bg-sky-100"><Save className="h-4 w-4" />{saveProfile.isPending ? "Salvando..." : "Salvar dados"}</Button></div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-6"><Card className="border-white/15 bg-[#071d52]/75 text-card-foreground"><CardHeader><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center border border-sky-200/25 bg-sky-200/10"><KeyRound className="h-5 w-5 text-sky-100" /></div><div><CardTitle className="text-lg text-white">Segurança de acesso</CardTitle><CardDescription className="mt-1 text-blue-100/65">{canChangePassword ? "Sua conta tem senha local configurada." : "Sua conta utiliza a autenticação da Conta Google."}</CardDescription></div></div></CardHeader><CardContent>{canChangePassword ? <Button variant="outline" onClick={onOpenPassword} className="border-sky-200/40 text-sky-100 hover:bg-sky-200/10 hover:text-white"><KeyRound className="h-4 w-4" />Trocar senha local</Button> : <p className="flex gap-2 border border-sky-200/15 bg-sky-200/5 p-3 text-sm leading-6 text-blue-100/75"><LockKeyhole className="mt-1 h-4 w-4 shrink-0 text-sky-200" />A senha é administrada pela Conta Google. Por isso, não há senha local para trocar neste aplicativo.</p>}</CardContent></Card>
        <Card className="border-white/15 bg-[#071d52]/75 text-card-foreground"><CardHeader><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center border border-amber-200/25 bg-amber-200/10"><GraduationCap className="h-5 w-5 text-amber-100" /></div><div><CardTitle className="text-lg text-white">Registrar tentativa ANAC</CardTitle><CardDescription className="mt-1 text-blue-100/65">Informe os resultados por matéria; cada nota deve estar entre 0 e 20.</CardDescription></div></div></CardHeader><CardContent><form className="grid gap-4" onSubmit={submitAttempt}><div className="grid gap-2"><Label htmlFor="attempt-date" className="text-blue-100/85">Data da prova</Label><Input id="attempt-date" type="date" required max={today} value={attempt.examDate} onChange={event => setAttempt(current => ({ ...current, examDate: event.target.value }))} className="border-white/15 bg-slate-950/25 text-white" /></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{(["MET", "REG", "NAV", "MEC", "TVO"] as const).map(subject => { const key = `${subject.toLowerCase()}Score` as keyof typeof attempt; return <div className="grid gap-2" key={subject}><Label htmlFor={key} className="text-blue-100/85">{subject}</Label><Input id={key} type="number" inputMode="numeric" min="0" max="20" required value={attempt[key] as string} onChange={event => setAttempt(current => ({ ...current, [key]: event.target.value }))} className="border-white/15 bg-slate-950/25 text-center text-white" /></div>; })}</div><div className="grid gap-2"><Label>Aprovado?</Label><Select value={attempt.approved} onValueChange={(value: "yes" | "no") => setAttempt(current => ({ ...current, approved: value }))}><SelectTrigger className="border-white/15 bg-slate-950/25 text-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="yes">Sim</SelectItem><SelectItem value="no">Não</SelectItem></SelectContent></Select></div>{attemptNotice && <p role="status" className={`border px-3 py-2 text-sm ${createAttempt.isError ? "border-rose-300/30 bg-rose-950/30 text-rose-100" : "border-emerald-300/25 bg-emerald-950/30 text-emerald-100"}`}>{attemptNotice}</p>}<Button type="submit" disabled={createAttempt.isPending} className="justify-self-start bg-amber-200 text-[#241300] hover:bg-amber-100"><Plus className="h-4 w-4" />{createAttempt.isPending ? "Registrando..." : "Registrar tentativa"}</Button></form></CardContent></Card></div>
    </div>

    <Card className="border-white/15 bg-[#071d52]/75 text-card-foreground"><CardHeader className="border-b border-white/10"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center border border-sky-200/25 bg-sky-200/10"><CalendarDays className="h-5 w-5 text-sky-100" /></div><div><CardTitle className="text-lg text-white">Histórico de tentativas</CardTitle><CardDescription className="mt-1 text-blue-100/65">Exibido em ordem da prova mais recente para a mais antiga.</CardDescription></div></div></CardHeader><CardContent className="pt-0">{attemptsQuery.isLoading ? <div className="space-y-3 py-6"><Skeleton className="h-10 w-full bg-white/10" /><Skeleton className="h-10 w-full bg-white/10" /></div> : attemptsQuery.error ? <p className="py-6 text-sm text-rose-100">{errorMessage(attemptsQuery.error)}</p> : attemptsQuery.data?.length === 0 ? <div className="py-10 text-center"><BadgeCheck className="mx-auto h-8 w-8 text-sky-200/70" /><p className="mt-3 text-sm text-blue-100/70">Nenhuma tentativa registrada ainda.</p></div> : <div className="overflow-x-auto"><Table><TableHeader><TableRow className="border-white/10 hover:bg-transparent"><TableHead className="text-blue-100/65">Data</TableHead><TableHead className="text-blue-100/65">MET</TableHead><TableHead className="text-blue-100/65">REG</TableHead><TableHead className="text-blue-100/65">NAV</TableHead><TableHead className="text-blue-100/65">MEC</TableHead><TableHead className="text-blue-100/65">TVO</TableHead><TableHead className="text-blue-100/65">Resultado</TableHead></TableRow></TableHeader><TableBody>{attemptsQuery.data?.map(row => <TableRow key={row.id} className="border-white/10 hover:bg-white/[0.03]"><TableCell className="font-medium text-white">{new Date(`${row.examDate}T12:00:00`).toLocaleDateString("pt-BR")}</TableCell><TableCell>{row.metScore}</TableCell><TableCell>{row.regScore}</TableCell><TableCell>{row.navScore}</TableCell><TableCell>{row.mecScore}</TableCell><TableCell>{row.tvoScore}</TableCell><TableCell><span className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-wide ${row.approved ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100" : "border-rose-300/30 bg-rose-300/10 text-rose-100"}`}>{row.approved ? "Aprovado" : "Não aprovado"}</span></TableCell></TableRow>)}</TableBody></Table></div>}</CardContent></Card>
  </section>;
}

function ProfileSkeleton() { return <div className="space-y-6"><Skeleton className="h-36 w-full bg-white/10" /><div className="grid gap-6 xl:grid-cols-2"><Skeleton className="h-[570px] w-full bg-white/10" /><Skeleton className="h-[570px] w-full bg-white/10" /></div></div>; }
