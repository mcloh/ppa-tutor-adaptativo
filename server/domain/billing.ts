export function shouldEnableSandboxCheckout(environment: NodeJS.ProcessEnv = process.env) {
  return Boolean(environment.PAGBANK_SANDBOX_TOKEN) && (
    environment.NODE_ENV === "development" || environment.PAGBANK_HOMOLOGATION_MODE === "sandbox"
  );
}

/**
 * A produção nunca é habilitada para alunos ou vendas gerais por configuração.
 * Esta chave libera somente a jornada de homologação, ainda protegida pelo role
 * homologation e por confirmação explícita antes de criar um checkout real.
 */
export function shouldEnableProductionHomologationCheckout(environment: NodeJS.ProcessEnv = process.env) {
  return Boolean(environment.PAGBANK_PRODUCTION_TOKEN)
    && environment.PAGBANK_PRODUCTION_HOMOLOGATION_MODE === "enabled";
}

/**
 * A venda ao público só pode ser liberada conscientemente no runtime de
 * produção. A homologação técnica continua em flag distinta, para que um novo
 * teste não exponha o checkout a alunos por engano.
 */
export function shouldEnableProductionCommercialCheckout(environment: NodeJS.ProcessEnv = process.env) {
  return environment.NODE_ENV === "production"
    && Boolean(environment.PAGBANK_PRODUCTION_TOKEN)
    && environment.PAGBANK_PRODUCTION_COMMERCIAL_MODE === "enabled";
}

export const BILLING_MODE = {
  /** Os 100 créditos iniciais são gratuitos; após a ativação comercial, novas questões consomem saldo. */
  enforceStudyCredits: shouldEnableProductionCommercialCheckout(),
  /** Checkout só pode ser exercitado localmente ou com uma chave explícita de homologação Sandbox. */
  checkoutEnabled: shouldEnableSandboxCheckout(),
  /** Checkout real limitado à conta de homologação, desativado até habilitação explícita. */
  productionHomologationCheckoutEnabled: shouldEnableProductionHomologationCheckout(),
  /** Checkout real para alunos autenticados, desativado por padrão. */
  productionCommercialCheckoutEnabled: shouldEnableProductionCommercialCheckout(),
  trialCredits: 100,
} as const;

export const prepaidProducts = [
  {
    key: "essential",
    name: "Essencial",
    credits: 100,
    amountCents: 490,
    featured: false,
  },
  {
    key: "panoramic",
    name: "Panorâmico",
    credits: 500,
    amountCents: 1490,
    featured: false,
  },
  {
    key: "air_bridge",
    name: "Ponte Aérea",
    credits: 1000,
    amountCents: 2490,
    featured: true,
  },
  {
    key: "command",
    name: "Comando",
    credits: 3000,
    amountCents: 4490,
    featured: false,
  },
] as const;

export type PrepaidProductKey = (typeof prepaidProducts)[number]["key"];
export type PrepaidProduct = (typeof prepaidProducts)[number];

export function getPrepaidProduct(key: string): PrepaidProduct | undefined {
  return prepaidProducts.find(product => product.key === key);
}

export function asPrepaidProductKey(value: string): PrepaidProductKey | null {
  return getPrepaidProduct(value)?.key ?? null;
}

export function creditSummary(balance: { availableCredits: number; lifetimeGranted: number; lifetimeConsumed: number }) {
  return {
    availableCredits: balance.availableCredits,
    lifetimeGranted: balance.lifetimeGranted,
    lifetimeConsumed: balance.lifetimeConsumed,
    experimentalAccessActive: !BILLING_MODE.enforceStudyCredits,
    checkoutAvailable: BILLING_MODE.checkoutEnabled,
    productionCommercialCheckoutAvailable: BILLING_MODE.productionCommercialCheckoutEnabled,
  };
}

export function nextBalance(current: number, delta: number) {
  const result = current + delta;
  if (result < 0) throw new Error("Saldo de créditos insuficiente.");
  return result;
}
