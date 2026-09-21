import { useAuth } from "@/_core/hooks/useAuth";
import { PasswordChangePanel } from "@/components/PasswordChangePanel";
import { OfficialBrandLogo, OfficialBrandMark } from "@/components/OfficialBrandLogo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { ChartNoAxesCombined, CreditCard, Gauge, KeyRound, LogOut, Menu, PlaneTakeoff, RadioTower, UserRound, X } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import AuthScreen from "./AuthScreen";
import { usePlatformActivity } from "@/hooks/usePlatformActivity";

const ReadinessDashboard = lazy(() => import("./ReadinessDashboard"));
const StudyWorkspace = lazy(() => import("./StudyWorkspace"));
const PlansPage = lazy(() => import("./PlansPage"));
const StudentProfilePage = lazy(() => import("./StudentProfilePage"));
const AdminAnalyticsDashboard = lazy(() => import("./AdminAnalyticsDashboard"));

type View = "study" | "dashboard" | "plans" | "profile" | "management";

export default function Home() {
  const { user, loading, logout } = useAuth();
  const utils = trpc.useUtils();
  const [view, setView] = useState<View>("study");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [passwordPanelOpen, setPasswordPanelOpen] = useState(false);
  usePlatformActivity(view, Boolean(user && !user.passwordChangeRequired));
  const notifications = trpc.notifications.list.useQuery(undefined, { enabled: Boolean(user && !user.passwordChangeRequired), refetchOnWindowFocus: true });
  const markRead = trpc.notifications.markRead.useMutation({ onSuccess: () => notifications.refetch() });
  const refreshUser = async () => { await utils.auth.me.invalidate(); };

  if (loading) return <LoadingScreen />;
  if (!user) return <AuthScreen />;
  if (user.passwordChangeRequired) {
    return <main className="blueprint-grid flex min-h-screen items-center justify-center px-4"><div className="w-full"><PasswordChangePanel required onComplete={refreshUser} /></div></main>;
  }

  const unread = notifications.data?.filter(notification => !notification.readAt) ?? [];
  const navigation = [
    { id: "study" as const, label: "Estudar", icon: PlaneTakeoff },
    { id: "dashboard" as const, label: "Prontidão", icon: Gauge },
    { id: "plans" as const, label: "Planos", icon: CreditCard },
    ...(user.role === "admin" ? [{ id: "management" as const, label: "Gestão", icon: ChartNoAxesCombined }] : []),
  ];
  const mobileTitle = view === "study" ? "Estudar" : view === "dashboard" ? "Prontidão" : view === "profile" ? "Cadastro" : view === "management" ? "Gestão" : "Planos";

  return <div className="blueprint-grid min-h-screen bg-background text-foreground">
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/15 bg-[#061847]/95 px-4 backdrop-blur sm:px-6 lg:hidden">
      <button onClick={() => setMobileOpen(value => !value)} className="flex h-9 w-9 items-center justify-center border border-white/20 text-sky-100" aria-label="Abrir navegação">{mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}</button>
      <div className="flex min-w-0 items-center gap-3"><OfficialBrandMark className="h-9 w-9" /><span className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-sky-100 sm:inline">{mobileTitle}</span></div>
      <button onClick={() => setView("dashboard")} className="relative flex h-9 w-9 items-center justify-center border border-white/20 text-sky-100" aria-label="Ver notificações"><RadioTower className="h-4 w-4" />{unread.length > 0 && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 bg-amber-200" />}</button>
    </header>
    {mobileOpen && <div className="fixed inset-x-0 top-16 z-20 border-b border-white/15 bg-[#061847] p-4 lg:hidden"><nav className="grid gap-2">{navigation.map(item => <NavigationButton key={item.id} item={item} active={view === item.id} onClick={() => { setView(item.id); setMobileOpen(false); }} />)}<button onClick={() => { setView("profile"); setMobileOpen(false); }} className="mt-2 flex items-center gap-3 border border-sky-200/25 bg-sky-200/[0.06] p-3 text-left transition-colors hover:bg-sky-200/10"><span className="grid h-9 w-9 shrink-0 place-items-center border border-sky-200/35 text-sky-100"><UserRound className="h-5 w-5" /></span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-white">{user.name}</span><span className="mt-0.5 block truncate text-xs text-blue-100/60">{user.email}</span></span></button>{user.canChangePassword && <button onClick={() => { setPasswordPanelOpen(true); setMobileOpen(false); }} className="mt-2 flex h-10 items-center gap-3 border border-white/15 px-3 font-mono text-xs uppercase tracking-wider text-blue-100"><KeyRound className="h-4 w-4" />Trocar senha</button>}<button onClick={logout} className="mt-2 flex h-10 items-center gap-3 border border-white/15 px-3 font-mono text-xs uppercase tracking-wider text-blue-100"><LogOut className="h-4 w-4" />Sair</button></nav></div>}
    <div className="mx-auto flex min-h-screen max-w-[1600px]">
      <aside className="hidden w-72 shrink-0 border-r border-white/15 bg-[#061847]/85 p-5 lg:flex lg:flex-col">
        <div className="border-b border-white/15 pb-6"><OfficialBrandLogo variant="dark" className="h-auto w-full max-w-[218px] object-contain" /></div>
        <nav className="mt-7 grid gap-2">{navigation.map(item => <NavigationButton key={item.id} item={item} active={view === item.id} onClick={() => setView(item.id)} />)}</nav>
        <section className="mt-8 border-y border-white/15 py-5"><div className="flex items-center justify-between"><p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-blue-100/65"><RadioTower className="h-3.5 w-3.5 text-sky-200" />Notificações</p><span className="font-mono text-xs text-sky-200">{unread.length}</span></div><div className="mt-4 space-y-3">{notifications.isLoading ? <Skeleton className="h-14 w-full bg-white/10" /> : unread.length === 0 ? <p className="text-xs leading-5 text-blue-100/55">Nenhuma ação pendente.</p> : unread.slice(0, 3).map(notification => <button key={notification.id} onClick={() => { markRead.mutate({ id: notification.id }); setView("study"); }} className="block w-full border-l border-amber-200/70 bg-white/[0.035] px-3 py-2 text-left"><p className="text-xs font-semibold text-white">{notification.title}</p><p className="mt-1 line-clamp-2 text-[11px] leading-4 text-blue-100/60">{notification.detail}</p></button>)}</div></section>
        <div className="mt-auto border-t border-white/15 pt-5"><button onClick={() => setView("profile")} className="group flex w-full items-center gap-3 border border-transparent p-2 text-left transition-colors hover:border-sky-200/30 hover:bg-sky-200/[0.06]"><span className="grid h-10 w-10 shrink-0 place-items-center border border-sky-200/30 text-sky-100 transition-colors group-hover:border-sky-200/60 group-hover:bg-sky-200/10"><UserRound className="h-5 w-5" /></span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-white">{user.name}</span><span className="mt-1 block truncate text-xs text-blue-100/60">{user.email}</span></span></button>{user.canChangePassword && <button onClick={() => setPasswordPanelOpen(true)} className="mt-5 flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-blue-100/75 hover:text-white"><KeyRound className="h-4 w-4" />Trocar senha</button>}<button onClick={logout} className={`${user.canChangePassword ? "mt-4" : "mt-5"} flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-blue-100/75 hover:text-white`}><LogOut className="h-4 w-4" />Encerrar sessão</button></div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-7 sm:px-6 lg:px-10 lg:py-10"><Suspense fallback={<LoadingScreen />}>{view === "study" ? <StudyWorkspace /> : view === "dashboard" ? <ReadinessDashboard /> : view === "profile" ? <StudentProfilePage canChangePassword={user.canChangePassword} onOpenPassword={() => setPasswordPanelOpen(true)} /> : view === "management" && user.role === "admin" ? <AdminAnalyticsDashboard /> : <PlansPage />}</Suspense></main>
    </div>
    {passwordPanelOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020816]/80 p-4 backdrop-blur-sm"><PasswordChangePanel required={false} onClose={() => setPasswordPanelOpen(false)} onComplete={async () => { setPasswordPanelOpen(false); await refreshUser(); }} /></div>}
  </div>;
}

function NavigationButton({ item, active, onClick }: { item: { id: View; label: string; icon: typeof PlaneTakeoff }; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return <Button variant="ghost" onClick={onClick} className={`h-11 justify-start rounded-none border px-3 font-mono text-xs uppercase tracking-wider ${active ? "border-sky-200/70 bg-sky-200/10 text-white hover:bg-sky-200/15 hover:text-white" : "border-transparent text-blue-100/60 hover:border-white/15 hover:bg-white/[0.035] hover:text-white"}`}><Icon className="h-4 w-4" />{item.label}</Button>;
}

function LoadingScreen() { return <main className="blueprint-grid flex min-h-screen items-center justify-center"><div className="cad-frame w-full max-w-sm p-7"><Skeleton className="h-4 w-24 bg-white/10" /><Skeleton className="mt-5 h-9 w-48 bg-white/10" /><Skeleton className="mt-10 h-11 w-full bg-white/10" /></div></main>; }
