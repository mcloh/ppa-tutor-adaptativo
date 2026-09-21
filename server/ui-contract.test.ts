import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const source = (relativePath: string) => readFile(new URL(`../client/src/${relativePath}`, import.meta.url), "utf8");

describe("contratos da interface responsiva", () => {
  it("mantém os controles de ativação, recuperação e regras explícitas de largura", async () => {
    const [screen, passwordPanel, styles, index] = await Promise.all([source("pages/AuthScreen.tsx"), source("components/PasswordChangePanel.tsx"), source("index.css"), readFile(new URL("../client/index.html", import.meta.url), "utf8")]);
    expect(screen).toContain("auth-mode-switch");
    expect(screen).toContain("auth-metric-grid");
    expect(screen).toContain("auth-hero");
    expect(screen).toContain("auth-evidence-card");
    expect(screen).toContain("Enviar senha de ativação");
    expect(screen).toContain("Esqueci minha senha");
    expect(screen).toContain("Confirmo que quero invalidar minha senha atual");
    expect(screen).toContain("Continuar com a Conta Google");
    expect(screen).toContain("function GoogleLogo()");
    expect(screen).toContain('fill="#4285F4"');
    expect(screen).toContain("OfficialBrandLogo");
    expect(screen).toContain('variant="dark"');
    expect(index).toContain("ppa-teorico-favicon-32");
    expect(index).toContain("apple-touch-icon");
    expect(styles).toContain(".auth-official-logo { width: min(100%, 50vw); height: auto; }");
    expect(screen).toContain('window.location.assign("/api/auth/google/start")');
    expect(screen).not.toContain("Disponível para endereços");
    expect(passwordPanel).toContain("current-password");
    expect(passwordPanel).toContain("new-password-confirmation");
    expect(passwordPanel).toContain("passwordConfirmation");
    expect(screen).toContain("auth-field-control");
    expect(screen).toContain("auth-primary-button");
    expect(screen).toContain("auth-public-plans-link");
    expect(styles).toContain(".auth-mode-switch { display: grid;");
    expect(styles).toContain(".auth-field-control { display: block !important; box-sizing: border-box !important; width: 100% !important; height: 3.2rem !important;");
    expect(styles).toContain(".auth-public-plans-link { display: flex;");
    expect(styles).toContain("margin: 0 0 2.25rem");
    expect(styles).toContain("background: rgba(255,255,255,.5)");
    expect(styles).toContain("font-weight: 700");
    expect(styles).toContain("@media (max-width: 900px)");
  });

  it("mantém a interface de estudo em duas seções alternadas com avanço e dados públicos", async () => {
    const study = await source("pages/StudyWorkspace.tsx");
    expect(study).toContain('key="question"');
    expect(study).toContain('key="feedback"');
    expect(study).toContain('role="radiogroup"');
    expect(study).toContain('"ME_ENSINE"');
    expect(study).toContain("pedido será registrado como “Me ensine”");
    expect(study).toContain("answer.mutate({ questionId: question.data.id, answer: selected })");
    expect(study).toContain("Próxima questão");
    expect(study).toContain("isAdvancing");
    expect(study).toContain("NextQuestionTransition");
    expect(study).toContain("utils.study.current.fetch()");
    expect(study).toContain("nextQuestion.id === previousQuestionId");
    expect(study).toContain("Calculando seu próximo conceito.");
    expect(study).toContain("Tentar novamente");
    expect(study).toContain("PlaneTakeoff");
    expect(study).toContain("Compass");
    expect(study).toContain("Radar");
    expect(study).toContain("Avaliação inicial");
    expect(study).toContain("Diagnóstico");
    expect(study).toContain("modeSelectionRequired");
    expect(study).toContain('{result.modeSelectionRequired ? "Escolher modalidade" : "Próxima questão"}');
    expect(study).toContain("ModeSelection");
    expect(study).toContain("Modo Simulado");
    expect(study).toContain("Modo Tutor");
    expect(study).toContain("selectMode.mutate");
    expect(study).not.toContain("correctOption");
    expect(study).not.toContain("conceptIdsJson");
  });

  it("mantém dashboard com retomada, prontidão, lacunas e árvore curricular", async () => {
    const dashboard = await source("pages/ReadinessDashboard.tsx");
    expect(dashboard).toContain("Painel de prontidão");
    expect(dashboard).toContain("Sua sessão está pronta para continuar.");
    expect(dashboard).toContain("Revisões disponíveis");
    expect(dashboard).toContain("Lacunas ativas");
    expect(dashboard).toContain("Matéria → capítulo → tópico → conceito");
    expect(dashboard).toContain("PlaneTakeoff");
    expect(dashboard).toContain("Gauge");
    expect(dashboard).toContain("Route");
  });

  it("utiliza instrumentos aeronáuticos na navegação e nas notificações internas", async () => {
    const home = await source("pages/Home.tsx");
    expect(home).toContain("PlaneTakeoff");
    expect(home).toContain("Gauge");
    expect(home).toContain("RadioTower");
    expect(home).toContain("OfficialBrandLogo");
    expect(home).toContain("OfficialBrandMark");
    expect(home).toContain('setView("profile")');
    expect(home).toContain("UserRound");
    expect(home).not.toContain('id: "profile"');
    expect(home).toContain("StudentProfilePage");
    expect(home).toContain("user.canChangePassword");
    expect(home).not.toContain("Bell,");
  });

  it("mantém o console gerencial exclusivo de admin e sem conteúdo sensível", async () => {
    const [home, admin] = await Promise.all([source("pages/Home.tsx"), source("pages/AdminAnalyticsDashboard.tsx")]);
    expect(home).toContain('user.role === "admin"');
    expect(home).toContain("AdminAnalyticsDashboard");
    expect(admin).toContain("Console Gerencial");
    expect(admin).toContain("Comercial e produto");
    expect(admin).toContain("Operação e confiabilidade");
    expect(admin).toContain("Não mensurável sem sonda externa");
    expect(admin).not.toContain("promptTokens:");
    expect(admin).not.toContain("sourceContext");
  });

  it("mantém o cadastro privado, e-mail imutável e histórico ANAC restrito à área autenticada", async () => {
    const profile = await source("pages/StudentProfilePage.tsx");
    expect(profile).toContain("E-mail de acesso");
    expect(profile).toContain('readOnly aria-readonly="true"');
    expect(profile).toContain("Identificadores internos de conta permanecem protegidos");
    expect(profile).toContain("Onde realizou o curso teórico PPA?");
    expect(profile).toContain("Registrar tentativa ANAC");
    expect(profile).toContain("Histórico de tentativas");
    expect(profile).toContain("trpc.studentProfile.get.useQuery()");
    expect(profile).toContain("trpc.studentProfile.attempts.create.useMutation({");
    expect(profile).toContain("canChangePassword");
    expect(profile).not.toContain("openId");
  });

  it("apresenta os planos comerciais com créditos iniciais e controles de compra protegidos", async () => {
    const [plans, home] = await Promise.all([source("pages/PlansPage.tsx"), source("pages/Home.tsx")]);
    expect(plans).toContain("Fase de Diagnóstico");
    expect(plans).toContain("Treino Adaptativo");
    expect(plans).toContain("trpc.study.program.useQuery");
    expect(plans).toContain("Aplicado uma única vez em novas contas");
    expect(plans).not.toContain("Comunicado operacional");
    expect(plans).toContain("R$ 4,90");
    expect(plans).toContain("R$ 14,90");
    expect(plans).toContain("R$ 24,90");
    expect(plans).toContain("R$ 44,90");
    expect(plans).toContain('title: "Panorâmico"');
    expect(plans).toContain('title: "Ponte Aérea"');
    expect(plans).not.toContain('title: "Rota"');
    expect(plans).not.toContain('title: "Navegação"');
    expect(plans).toContain("30 simulados");
    expect(plans).toContain("productionCommercialCheckoutAvailable");
    expect(plans).toContain("createProductionCheckout");
    expect(plans).toContain("Comprar pacote");
    expect(plans).toContain("Entrar para comprar");
    expect(plans).toContain("cartão, Pix ou boleto");
    expect(plans).toContain("Pague com cartão, Pix ou boleto em uma página segura do PagBank.");
    expect(plans).toContain("Seus créditos entram automaticamente após a confirmação do pagamento.");
    expect(plans).not.toContain("Checkout de produção: cartão, Pix ou boleto");
    expect(plans).not.toContain("A compra de créditos estará disponível em breve.");
    expect(plans).toContain('src="/manus-storage/pagbank-secure-partner-badge_edb836ea.png"');
    expect(plans).toContain('alt="Compra segura com PagBank, parceiro de pagamentos"');
    expect(plans).toContain("disabled={(!available && !requiresAuthentication) || isSubmitting}");
    expect(plans).toContain("Situação de créditos");
    expect(plans).toContain("créditos são pré-pagos");
    expect(plans).toContain("enabled: isAuthenticated");
    expect(plans).toContain("Módulo de pagamento");
    expect(plans).toContain('user?.role === "homologation"');
    expect(plans).toContain("HomologationEvidencePanel");
    expect(plans).toContain("Exportar JSON");
    expect(plans).toContain("criação, abertura, retorno, webhook, reconciliação e liquidação");
    expect(plans).toContain("arquivo baixado contém o PAY literal para auditoria");
    expect(plans).toContain("interface nunca o mostra");
    expect(plans).toContain("Abrir checkout seguro");
    expect(plans).toContain('window.open(paymentModule.checkoutUrl, "_blank", "noopener,noreferrer")');
    expect(plans).toContain('checkout === "sandbox" || checkout === "production"');
    expect(plans).toContain("Pagamento em processamento");
    expect(plans).toContain("Pagamento confirmado pelo servidor.");
    expect(plans).toContain("créditos foram registrados na sua conta");
    expect(plans).toContain("Você será direcionado ao PagBank para concluir com segurança a compra do pacote");
    expect(plans).toContain("checkoutReturnStatus");
    expect(plans).toContain("recordSandboxCheckoutLifecycle");
    expect(plans).toContain('operation: "checkout_opened"');
    expect(plans).toContain('operation: "checkout_return"');
    expect(plans).toContain('user?.role !== "homologation"');
    expect(plans).not.toContain("<iframe");
    expect(plans).not.toContain("window.location.assign(data.checkoutUrl)");
    expect(home).toContain('id: "plans"');
    expect(home).toContain("<PlansPage />");
  });

  it("permite consultar planos antes do cadastro e retornar ao acesso", async () => {
    const [app, auth, plans] = await Promise.all([source("App.tsx"), source("pages/AuthScreen.tsx"), source("pages/PlansPage.tsx")]);
    expect(app).toContain('<Route path={"/planos"} component={PublicPlansPage} />');
    expect(auth).toContain('href="/planos"');
    expect(auth).toContain("Conheça os planos e a política experimental");
    expect(plans).toContain("export function PublicPlansPage");
    expect(plans).toContain("Voltar ao acesso");
    expect(plans).toContain("Crie sua conta e comece com 100 créditos gratuitos.");
  });

  it("mantém página pública de políticas e acesso persistente sem alegação indevida de selo", async () => {
    const [app, policies, policiesLink] = await Promise.all([source("App.tsx"), source("pages/PoliciesPage.tsx"), source("components/PoliciesCornerLink.tsx")]);
    expect(app).toContain('<Route path={"/politicas"} component={PoliciesPage} />');
    expect(app).toContain("<PoliciesCornerLink />");
    expect(policies).toContain("Políticas de Uso,");
    expect(policies).toContain("Cyber-Segurança e LGPD");
    expect(policies).toContain("A plataforma é segura, não pede nem usa dados pessoais e os dados não são compartilhados com ninguém, mantendo alinhamento com a política vigente.");
    expect(policies).toContain("Conexão HTTPS/TLS");
    expect(policies).not.toContain("WebTrust");
    expect(policies).toContain("Finalidade da plataforma");
    expect(policies).toContain("Independência em relação às instituições");
    expect(policies).toContain("Autoria de questões e simulados");
    expect(policies).toContain("Sem garantia de aprovação");
    expect(policies).toContain("Responsabilidades do usuário");
    expect(policies).toContain("Propriedade intelectual");
    expect(policies).toContain("simulados@apia.app.br");
    expect(policies).not.toContain("Aviso de revisão");
    expect(policiesLink).toContain('href="/politicas"');
    expect(policiesLink).toContain("Rodapé institucional");
    expect(policiesLink).toContain("mt-auto border-t");
    expect(policiesLink).not.toContain("absolute bottom-3 left-3");
    expect(policiesLink).not.toContain("fixed bottom-3 left-3");
  });

  it("disponibiliza o mapa curricular público sem expor dados internos ou pedagógicos protegidos", async () => {
    const [app, footer, map, router, repository] = await Promise.all([
      source("App.tsx"),
      source("components/PoliciesCornerLink.tsx"),
      source("pages/CanonicalConceptMapPage.tsx"),
      readFile(new URL("./routers.ts", import.meta.url), "utf8"),
      readFile(new URL("./db.ts", import.meta.url), "utf8"),
    ]);

    expect(app).toContain('<Route path={"/mapa-de-conceitos"} component={CanonicalConceptMapPage} />');
    expect(footer).toContain('href="/mapa-de-conceitos"');
    expect(footer).toContain("Mapa de conceitos");
    expect(map).toContain("counts.concepts.toLocaleString");
    expect(map).toContain("primeiras evidências de prática.");
    expect(map).toContain("100% de cobertura conceitual");
    expect(map).toContain("Ponte Aérea");
    expect(map).toContain("Buscar por matéria, capítulo, tópico ou conceito");
    expect(map).toContain("trpc.canonicalCatalog.publicMap.useQuery");
    expect(map).toContain("Pense nesta árvore como uma carta de navegação da teoria");
    expect(map).toContain("A cobertura ajuda você a enxergar o quanto já percorreu");
    expect(map).not.toContain("não é uma avaliação oficial");
    expect(map).not.toContain("canonicalIndex");
    expect(map).not.toContain("correctOption");
    expect(map).not.toContain("sourceContext");
    expect(router).toContain("canonicalCatalog: router({");
    expect(router).toContain("publicMap: publicProcedure.query(() => getPublicCanonicalCatalog())");
    expect(repository).toContain("getPublicCanonicalCatalog");
    expect(repository).toContain("sem IDs, RAG, prioridades ou dados individuais");
  });
});
