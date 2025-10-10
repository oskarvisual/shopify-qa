import { createContext, useContext, useMemo } from "react";
import { getPlanFeatures, normalizePlan, planHasFeature } from "./plans";

const defaultValue = {
  plan: normalizePlan(),
  features: getPlanFeatures(),
  aiDailyLimit: 200,
  branding: { name: "", url: "" },
};

const PlanContext = createContext(defaultValue);

export function PlanProvider({ value, children }) {
  const memoizedValue = useMemo(() => {
    if (!value) return defaultValue;
    const normalizedPlan = normalizePlan(value.plan);
    return {
      plan: normalizedPlan,
      features: value.features || getPlanFeatures(normalizedPlan),
      aiDailyLimit: value.aiDailyLimit ?? 200,
      branding: value.branding || { name: "", url: "" },
    };
  }, [value]);

  return <PlanContext.Provider value={memoizedValue}>{children}</PlanContext.Provider>;
}

export function usePlanContext() {
  return useContext(PlanContext);
}

export function usePlanFeatures() {
  const { features } = usePlanContext();
  return features;
}

export function usePlan() {
  const { plan } = usePlanContext();
  return plan;
}

export function usePlanBranding() {
  const { branding } = usePlanContext();
  return branding;
}

export function useAiDailyLimit() {
  const { aiDailyLimit } = usePlanContext();
  return aiDailyLimit;
}

export function usePlanFeature(feature) {
  const { plan, features } = usePlanContext();
  return planHasFeature(features || plan, feature);
}
