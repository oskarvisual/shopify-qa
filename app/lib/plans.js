export const SubscriptionPlan = {
  FREE: "free",
  PRO: "pro",
  ULTRA: "ultra",
};

export const PlanFeature = {
  WIDGET_BRANDING: "widgetBranding",
  EXPORT_DATA: "exportData",
  WEBHOOKS: "webhooks",
  AI_CUSTOMER_SUPPORT: "aiCustomerSupport",
  AI_LOGS: "aiLogs",
  SETTINGS_AI: "settingsAi",
  SETTINGS_EMAIL_SMTP: "settingsEmailSmtp",
  SETTINGS_WEBHOOKS: "settingsWebhooks",
  SETTINGS_BRANDING: "settingsBranding",
  SETTINGS_TRANSLATIONS: "settingsTranslations",
  PAGE_IMPORT_EXPORT: "pageImportExport",
  PAGE_AI_LOGS: "pageAiLogs",
  DASHBOARD_ENHANCED: "dashboardEnhanced",
  DASHBOARD_AI_METRICS: "dashboardAiMetrics",
  FRONTEND_AI: "frontendAi",
  ADMIN_AI: "adminAi",
};

const PLAN_FEATURE_MAP = {
  [SubscriptionPlan.FREE]: {
    [PlanFeature.WIDGET_BRANDING]: true,
    [PlanFeature.EXPORT_DATA]: false,
    [PlanFeature.WEBHOOKS]: false,
    [PlanFeature.AI_CUSTOMER_SUPPORT]: false,
    [PlanFeature.AI_LOGS]: false,
    [PlanFeature.SETTINGS_AI]: false,
    [PlanFeature.SETTINGS_EMAIL_SMTP]: false,
    [PlanFeature.SETTINGS_WEBHOOKS]: false,
    [PlanFeature.SETTINGS_BRANDING]: true,
    [PlanFeature.SETTINGS_TRANSLATIONS]: false,
    [PlanFeature.PAGE_IMPORT_EXPORT]: false,
    [PlanFeature.PAGE_AI_LOGS]: false,
    [PlanFeature.DASHBOARD_ENHANCED]: false,
    [PlanFeature.DASHBOARD_AI_METRICS]: false,
    [PlanFeature.FRONTEND_AI]: false,
    [PlanFeature.ADMIN_AI]: false,
  },
  [SubscriptionPlan.PRO]: {
    [PlanFeature.WIDGET_BRANDING]: false,
    [PlanFeature.EXPORT_DATA]: true,
    [PlanFeature.WEBHOOKS]: true,
    [PlanFeature.AI_CUSTOMER_SUPPORT]: false,
    [PlanFeature.AI_LOGS]: false,
    [PlanFeature.SETTINGS_AI]: false,
    [PlanFeature.SETTINGS_EMAIL_SMTP]: true,
    [PlanFeature.SETTINGS_WEBHOOKS]: true,
    [PlanFeature.SETTINGS_BRANDING]: false,
    [PlanFeature.SETTINGS_TRANSLATIONS]: true,
    [PlanFeature.PAGE_IMPORT_EXPORT]: true,
    [PlanFeature.PAGE_AI_LOGS]: false,
    [PlanFeature.DASHBOARD_ENHANCED]: true,
    [PlanFeature.DASHBOARD_AI_METRICS]: false,
    [PlanFeature.FRONTEND_AI]: false,
    [PlanFeature.ADMIN_AI]: false,
  },
  [SubscriptionPlan.ULTRA]: {
    [PlanFeature.WIDGET_BRANDING]: false,
    [PlanFeature.EXPORT_DATA]: true,
    [PlanFeature.WEBHOOKS]: true,
    [PlanFeature.AI_CUSTOMER_SUPPORT]: true,
    [PlanFeature.AI_LOGS]: true,
    [PlanFeature.SETTINGS_AI]: true,
    [PlanFeature.SETTINGS_EMAIL_SMTP]: true,
    [PlanFeature.SETTINGS_WEBHOOKS]: true,
    [PlanFeature.SETTINGS_BRANDING]: false,
    [PlanFeature.SETTINGS_TRANSLATIONS]: true,
    [PlanFeature.PAGE_IMPORT_EXPORT]: true,
    [PlanFeature.PAGE_AI_LOGS]: true,
    [PlanFeature.DASHBOARD_ENHANCED]: true,
    [PlanFeature.DASHBOARD_AI_METRICS]: true,
    [PlanFeature.FRONTEND_AI]: true,
    [PlanFeature.ADMIN_AI]: true,
  },
};

const PLAN_ORDER = [
  SubscriptionPlan.FREE,
  SubscriptionPlan.PRO,
  SubscriptionPlan.ULTRA,
];

export function normalizePlan(plan) {
  if (!plan) return SubscriptionPlan.FREE;
  const normalized = String(plan).trim().toLowerCase();
  return PLAN_ORDER.includes(normalized) ? normalized : SubscriptionPlan.FREE;
}

export function getPlanFeatures(plan) {
  const normalizedPlan = normalizePlan(plan);
  return {
    plan: normalizedPlan,
    ...PLAN_FEATURE_MAP[SubscriptionPlan.FREE],
    ...PLAN_FEATURE_MAP[normalizedPlan],
  };
}

export function planHasFeature(planOrFeatures, feature) {
  if (!feature) {
    return false;
  }

  if (typeof planOrFeatures === "string") {
    return Boolean(PLAN_FEATURE_MAP[normalizePlan(planOrFeatures)]?.[feature]);
  }

  return Boolean(planOrFeatures?.[feature]);
}

export function comparePlans(current, target) {
  const normalizedCurrent = normalizePlan(current);
  const normalizedTarget = normalizePlan(target);
  return PLAN_ORDER.indexOf(normalizedCurrent) - PLAN_ORDER.indexOf(normalizedTarget);
}

export function isAtLeastPlan(current, target) {
  return comparePlans(current, target) >= 0;
}

export function createAiDailyLimitConfigKey(shop) {
  return `ai.daily_limit.${shop}`;
}

export const BRANDING_NAME_CONFIG_KEY = "branding.app_name";
export const BRANDING_URL_CONFIG_KEY = "branding.app_url";
export function createSubscriptionPlanConfigKey(shop) {
  return `subscription.plan.${shop}`;
}

const resolvedCurrencyCode = (typeof process !== "undefined" && process.env?.BILLING_CURRENCY) || "USD";

export const BILLING_PLANS = {
  [SubscriptionPlan.PRO]: {
    name: "Pro Plan",
    shortName: "Pro",
    price: 15,
    currencyCode: resolvedCurrencyCode,
    interval: "EVERY_30_DAYS",
  },
  [SubscriptionPlan.ULTRA]: {
    name: "Ultra Plan",
    shortName: "Ultra",
    price: 40,
    currencyCode: resolvedCurrencyCode,
    interval: "EVERY_30_DAYS",
  },
};

export function getBillingPlan(plan) {
  const normalizedPlan = normalizePlan(plan);
  return BILLING_PLANS[normalizedPlan];
}

export function getBillingButtonLabel(plan) {
  const billingPlan = getBillingPlan(plan);
  if (!billingPlan) return null;
  const amount = billingPlan.price?.toFixed(2).replace(/\.00$/, "");
  return `Upgrade to ${billingPlan.shortName} ($${amount}/${billingPlan.interval === "EVERY_30_DAYS" ? "mo" : "period"})`;
}
