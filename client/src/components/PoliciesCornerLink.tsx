import { FileText, ListTree } from "lucide-react";
import { Link } from "wouter";

export function PoliciesCornerLink() {
  return (
    <footer className="mt-auto border-t border-white/15 bg-[#04133a]/95 px-4 py-4 sm:px-6 lg:px-10" aria-label="Rodapé institucional">
      <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-start gap-x-6 gap-y-3">
        <Link
          href="/politicas"
          className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-sky-100 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
          aria-label="Abrir Políticas de Uso, Cyber-Segurança e LGPD"
        >
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Políticas e segurança</span>
        </Link>
        <Link
          href="/mapa-de-conceitos"
          className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-sky-100 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
          aria-label="Abrir mapa público de conceitos canônicos"
        >
          <ListTree className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Mapa de conceitos</span>
        </Link>
      </div>
    </footer>
  );
}
