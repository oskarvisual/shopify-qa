import prisma from "../db.server";
import { dispatchWebhookAutomation } from "./automation.server";
import { getSubscriptionPlanContext } from "./plans.server";

/**
 * @typedef {'newQuestion' | 'editQuestion' | 'deleteQuestion' | 'newAnswer' | 'editAnswer' | 'deleteAnswer' | 'approveQuestion' | 'newVote'} WebhookTopic
 */

/**
 * Triggers a webhook if it's configured for the given shop and topic.
 * @param {string} shop - The shop's domain (e.g., 'your-shop.myshopify.com').
 * @param {WebhookTopic} topic - The webhook topic to trigger.
 * @param {object} payload - The data to send in the webhook POST request.
 */
export async function triggerWebhook(shop, topic, payload) {
  try {
    const settings = await prisma.webhookSetting.findUnique({
      where: { shop },
    });

    if (!(settings && settings.url && settings[topic])) {
      return;
    }

    const planContext = await getSubscriptionPlanContext({ shop });

    await dispatchWebhookAutomation({
      shop,
      topic,
      target: settings.url,
      payload,
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Shop-Domain": shop,
        "X-Webhook-Topic": topic,
      },
      meta: {
        webhookSettingId: settings.id,
        plan: planContext.plan,
        features: planContext.features,
      },
    });
  } catch (error) {
    console.error(`Error preparing webhook for shop ${shop}:`, error);
  }
}
