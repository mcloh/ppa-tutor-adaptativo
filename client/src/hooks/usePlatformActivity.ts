import { trpc } from "@/lib/trpc";
import { useEffect, useRef } from "react";

type PlatformView = "study" | "dashboard" | "plans" | "profile" | "management";

function createSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "00000000-0000-4000-8000-000000000000";
}

/** Registra presença agregada por sessão sem IP, user-agent, conteúdo ou eventos de interação. */
export function usePlatformActivity(view: PlatformView, enabled: boolean) {
  const sessionId = useRef(createSessionId());
  const { mutate } = trpc.activity.touch.useMutation();

  useEffect(() => {
    if (!enabled) return;
    const touch = () => mutate({ sessionId: sessionId.current, view });
    touch();
    const interval = window.setInterval(touch, 60_000);
    const onVisibilityChange = () => { if (document.visibilityState === "visible") touch(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, mutate, view]);
}
