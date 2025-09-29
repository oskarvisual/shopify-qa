import prisma from '../db.server';

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

    // Check if there's a URL and the specific topic is enabled
    if (settings && settings.url && settings[topic]) {
      console.log(`Triggering '${topic}' webhook for ${shop} to ${settings.url}`);

      const response = await fetch(settings.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Shop-Domain': shop,
          'X-Webhook-Topic': topic,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error(
          `Webhook for ${shop} failed with status ${response.status}: ${await response.text()}`
        );
      }
    }
  } catch (error) {
    console.error(`Error triggering webhook for shop ${shop}:`, error);
  }
}