import prisma from "../db.server";
import {
  SubscriptionPlan,
  getPlanFeatures,
  normalizePlan,
  createSubscriptionPlanConfigKey,
  createAiDailyLimitConfigKey,
  BRANDING_NAME_CONFIG_KEY,
  BRANDING_URL_CONFIG_KEY,
} from "./plans";

export async function getSubscriptionPlanContext({ shop, sessionPlan }) {
  const normalizedSessionPlan = sessionPlan
    ? normalizePlan(sessionPlan)
    : undefined;

  const configKeys = [
    createSubscriptionPlanConfigKey(shop),
    createAiDailyLimitConfigKey(shop),
    BRANDING_NAME_CONFIG_KEY,
    BRANDING_URL_CONFIG_KEY,
  ];

  const configRows = await prisma.config.findMany({
    where: { key: { in: configKeys } },
  });

  const config = configRows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});

  const planFromConfig = config[createSubscriptionPlanConfigKey(shop)];
  const plan = normalizedSessionPlan || normalizePlan(planFromConfig);
  const features = getPlanFeatures(plan);

  const aiDailyLimitValue = Number.parseInt(
    config[createAiDailyLimitConfigKey(shop)] || "",
    10
  );
  const aiDailyLimit = Number.isFinite(aiDailyLimitValue) && aiDailyLimitValue > 0
    ? aiDailyLimitValue
    : 200;

  const branding = {
    name: (config[BRANDING_NAME_CONFIG_KEY] || "").trim(),
    url: (config[BRANDING_URL_CONFIG_KEY] || "").trim(),
  };

  return {
    plan,
    features,
    aiDailyLimit,
    branding,
  };
}

export function ensurePlan(planContext, allowedPlans) {
  if (!allowedPlans || allowedPlans.length === 0) {
    return true;
  }

  return allowedPlans
    .map(normalizePlan)
    .includes(planContext?.plan || SubscriptionPlan.FREE);
}
