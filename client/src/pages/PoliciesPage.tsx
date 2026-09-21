import { OfficialBrandLogo } from "@/components/OfficialBrandLogo";
import { ArrowLeft, BadgeCheck, BookOpenCheck, CreditCard, FileCheck2, GraduationCap, Handshake, Landmark, LockKeyhole, Mail, Scale, ShieldCheck } from "lucide-react";
import { Link } from "wouter";

// Atualize esta data manualmente sempre que o conteúdo das seções abaixo mudar.
const POLICIES_LAST_UPDATED = "16 de setembro de 2026";

const sections = [
  { icon: BookOpenCheck, number: "01", title: "Finalidade da plataforma", body: "O PPA Teórico — Tutor Adaptativo possui finalidade exclusivamente educacional e de apoio aos estudos para a teoria de Piloto Privado de Avião. Questões simuladas, resultados, estatísticas e recursos de estudo auxiliam a revisão, o fortalecimento de conceitos e a identificação de temas que merecem maior atenção." },
  { icon: Landmark, number: "02", title: "Independência em relação às instituições", body: "Salvo informação expressa em contrário, a plataforma é independente e não possui vínculo, associação, afiliação, patrocínio, homologação, autorização ou endosso da ANAC ou de instituições responsáveis por exames. Nomes, certificações, programas e marcas eventualmente citados possuem finalidade descritiva e pertencem aos seus respectivos titulares." },
  { icon: FileCheck2, number: "03", title: "Autoria de questões e simulados", body: "As questões, explicações e simulados são desenvolvidos de forma independente e autoral. Salvo indicação expressa, não correspondem a questões oficiais, reproduções ou cópias de exames reais. A aderência aos temas normalmente estudados não significa identidade de estrutura, dificuldade, distribuição de conteúdo ou critérios com uma avaliação oficial." },
  { icon: GraduationCap, number: "04", title: "Sem garantia de aprovação", body: "O uso da plataforma e o desempenho em questões ou simulados não garantem aprovação, certificação, classificação, admissão ou qualquer resultado específico em exames oficiais. A preparação depende de fatores individuais, como conhecimento prévio, dedicação, metodologia de estudo, experiência e critérios definidos pela instituição responsável." },
  { icon: BadgeCheck, number: "05", title: "Conteúdo educacional", body: "A plataforma busca manter conteúdo relevante e tecnicamente consistente. Programas, regulamentos, requisitos e critérios de avaliação podem ser alterados pelas instituições responsáveis. O usuário deve consultar fontes oficiais para verificar requisitos, datas, valores, critérios e demais informações normativas; em caso de divergência, prevalecem as informações oficiais." },
  { icon: BookOpenCheck, number: "06", title: "Resultados e recomendações", body: "Resultados, índices de acerto, histórico de desempenho, prontidão e recomendações de revisão têm finalidade exclusivamente educacional e orientativa. Eles representam as atividades realizadas na plataforma e não constituem avaliação oficial de capacidade profissional, acadêmica ou técnica, nem previsão de desempenho em prova oficial." },
  { icon: ShieldCheck, number: "07", title: "Privacidade e LGPD", body: "A plataforma é segura, não pede nem usa dados pessoais e os dados não são compartilhados com ninguém, mantendo alinhamento com a política vigente." },
  { icon: CreditCard, number: "08", title: "Pagamentos", body: "Quando créditos pré-pagos estiverem disponíveis, a conclusão financeira ocorre no ambiente do parceiro PagBank, conforme os meios exibidos no checkout. A plataforma confirma a compra e libera os créditos somente após a confirmação segura do pagamento. Informações de cartões e demais instrumentos de pagamento são inseridas diretamente no ambiente do parceiro de pagamento." },
  { icon: LockKeyhole, number: "09", title: "Responsabilidades do usuário", body: "O usuário deve utilizar a plataforma de forma lícita e compatível com sua finalidade educacional. Não é permitido copiar, extrair, reproduzir, distribuir ou explorar indevidamente conteúdos, tentar obter acesso não autorizado a contas, sistemas, bases de dados ou funcionalidades restritas. As credenciais de acesso são pessoais e não devem ser compartilhadas." },
  { icon: Scale, number: "10", title: "Propriedade intelectual", body: "Salvo indicação expressa em contrário, questões, explicações, simulados, textos, organização de conteúdos e elementos gráficos autorais são protegidos pela legislação aplicável. O acesso concede somente uma licença limitada, pessoal, não exclusiva e intransferível para estudo e preparação individual, sem transferência de propriedade intelectual." },
  { icon: ShieldCheck, number: "11", title: "Disponibilidade do serviço", body: "A plataforma pode receber atualizações, manutenções, correções ou alterações de funcionalidades. São adotados esforços razoáveis para a disponibilidade do serviço, mas não há garantia de acesso contínuo, ininterrupto ou livre de falhas. Funcionalidades e conteúdos podem ser modificados, atualizados ou descontinuados quando necessário para evolução, segurança ou manutenção." },
  { icon: Landmark, number: "12", title: "Limitação da finalidade", body: "O PPA Teórico — Tutor Adaptativo não administra exames oficiais, não realiza certificações e não possui autoridade para admitir, aprovar, reprovar ou certificar candidatos. Questões sobre inscrição, elegibilidade, agendamento, realização, resultado, recurso ou certificação devem ser tratadas diretamente com a instituição responsável." },
  { icon: FileCheck2, number: "13", title: "Alterações desta política", body: "Esta política pode ser atualizada para refletir alterações na plataforma, nos serviços ou nos requisitos aplicáveis. A versão vigente ficará disponível neste website com sua data de atualização. Quando uma alteração relevante exigir comunicação ou novo consentimento nos termos aplicáveis, poderão ser adotados mecanismos adicionais de notificação." },
  { icon: Mail, number: "14", title: "Contato", body: "Dúvidas relacionadas a esta Política de Uso, à plataforma ou à jornada de estudos podem ser encaminhadas para o canal de contato informado abaixo." },
] as const;

export default function PoliciesPage() {
  return (
    <main className="blueprint-grid min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 sm:py-10 lg:px-10">
      <div className="mx-auto w-full max-w-6xl pb-16">
        <header className="relative overflow-hidden border border-white/15 bg-[#061847]/80 p-6 sm:p-9">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full border border-sky-200/15" aria-hidden="true" />
          <div className="relative flex flex-col gap-7 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-3xl">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-sky-200">Governança e transparência</p>
              <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-white sm:text-5xl">Políticas de Uso, <span className="text-sky-200">Cyber-Segurança e LGPD</span></h1>
              <p className="mt-5 max-w-2xl text-sm leading-6 text-blue-100/75 sm:text-base">Condições de uso, compromissos de transparência e orientações da plataforma para a preparação teórica de Piloto Privado de Avião.</p>
            </div>
            <OfficialBrandLogo variant="dark" className="h-auto w-40 shrink-0 object-contain sm:w-48" />
          </div>
          <div className="relative mt-8 flex flex-wrap gap-3 border-t border-white/15 pt-5">
            <span className="inline-flex items-center gap-2 border border-sky-200/30 bg-sky-200/[0.06] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-sky-100"><LockKeyhole className="h-3.5 w-3.5" />Conexão HTTPS/TLS</span>
            <span className="inline-flex items-center gap-2 border border-sky-200/30 bg-sky-200/[0.06] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-sky-100"><Handshake className="h-3.5 w-3.5" />Checkout parceiro PagBank</span>
            <span className="inline-flex items-center gap-2 border border-sky-200/30 bg-sky-200/[0.06] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-sky-100"><BadgeCheck className="h-3.5 w-3.5" />Políticas públicas</span>
          </div>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-2" aria-label="Cláusulas da política de uso">
          {sections.map(({ icon: Icon, number, title, body }) => (
            <article key={number} className="border border-white/15 bg-[#061847]/70 p-5 sm:p-6">
              <div className="flex items-start gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center border border-sky-200/35 bg-sky-200/[0.06] text-sky-100"><Icon className="h-5 w-5" /></span>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-sky-200">Seção {number}</p>
                  <h2 className="mt-2 font-display text-xl font-bold text-white">{title}</h2>
                  {number === "14" ? <p className="mt-3 text-sm leading-6 text-blue-100/75">Dúvidas relacionadas a esta Política de Uso, à plataforma ou à jornada de estudos podem ser encaminhadas para <a className="text-sky-200 underline decoration-sky-200/40 underline-offset-4 hover:text-white" href="mailto:simulados@apia.app.br">simulados@apia.app.br</a>.</p> : <p className="mt-3 text-sm leading-6 text-blue-100/75">{body}</p>}
                </div>
              </div>
            </article>
          ))}
        </section>

        <section className="mt-6 border border-sky-200/30 bg-sky-200/[0.06] p-5 sm:p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-sky-100">Aviso importante</p>
          <p className="mt-2 text-sm leading-6 text-blue-50/85"><strong>O PPA Teórico — Tutor Adaptativo é uma ferramenta independente de apoio aos estudos.</strong> Não somos afiliados, patrocinados, homologados ou endossados pelas instituições responsáveis pelos exames ou certificações mencionados, salvo indicação expressa. Nossas questões e simulados são autorais e não constituem exames oficiais. O desempenho obtido na plataforma não garante aprovação, certificação, classificação ou admissão.</p>
        </section>

        <footer className="mt-8 flex flex-col gap-4 border-t border-white/15 pt-6 text-sm text-blue-100/65 sm:flex-row sm:items-center sm:justify-between">
          <p>Última atualização: {POLICIES_LAST_UPDATED}.</p>
          <Link href="/" className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.12em] text-sky-200 hover:text-white"><ArrowLeft className="h-4 w-4" />Voltar ao PPA Teórico</Link>
        </footer>
      </div>
    </main>
  );
}
