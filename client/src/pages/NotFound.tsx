import { Button } from "@/components/ui/button";
import { Compass, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  const handleGoHome = () => {
    setLocation("/");
  };

  return (
    <div className="blueprint-grid flex min-h-screen w-full items-center justify-center px-4 py-10">
      <section className="cad-frame w-full max-w-lg p-8 text-center sm:p-10">
        <div className="flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 animate-pulse rounded-full bg-sky-200/15" />
            <Compass className="relative h-14 w-14 text-sky-200" />
          </div>
        </div>

        <p className="eyebrow mt-6">Erro 404</p>
        <h1 className="mt-3 text-4xl font-semibold text-white">Rota não encontrada</h1>

        <p className="mt-4 leading-relaxed text-blue-100/65">
          A página que você está procurando não existe, foi movida ou removida.
        </p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button
            onClick={handleGoHome}
            className="rounded-none bg-sky-200 px-6 py-2.5 text-[#04133c] hover:bg-sky-100"
          >
            <Home className="mr-2 h-4 w-4" />
            Voltar ao início
          </Button>
        </div>
      </section>
    </div>
  );
}
