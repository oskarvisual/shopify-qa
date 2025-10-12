const DEFAULT_NO_ANSWER_MESSAGE =
  "I couldn't find enough information to answer this question based on the provided context.";
const DEFAULT_ERROR_MESSAGE =
  "Sorry, there was an error generating an answer. Please try again later.";

function buildWebhookPayload(context = {}) {
  const {
    customerQuestion,
    product,
    aiSettings = {},
    shop,
    productId,
    questionId,
    store,
    planContext,
  } = context;

  const appId =
    process.env.AUTOMATIONS_APP_ID ||
    process.env.SHOPIFY_APP_HANDLE ||
    process.env.SHOPIFY_API_KEY ||
    null;

  const normalizedProduct = {
    title: product?.title || null,
    description: product?.description || null,
    options: product?.options || [],
    variants: product?.variants || [],
  };

  const hasStoreData = Boolean(
    store &&
      Object.values(store).some((value) => {
        if (Array.isArray(value)) {
          return value.length > 0;
        }
        if (value && typeof value === "object") {
          return Object.values(value).some((nested) => {
            if (Array.isArray(nested)) {
              return nested.length > 0;
            }
            return Boolean(nested);
          });
        }
        return Boolean(value);
      }),
  );

  return {
    appId,
    shop: shop || null,
    productId: productId || null,
    questionId: questionId || null,
    responseLanguage: aiSettings?.aiLanguage || "auto",
    customInstructions: aiSettings?.aiInstructions || "",
    customerQuestion: customerQuestion || "",
    product: normalizedProduct,
    plan: planContext?.plan || null,
    planFeatures: planContext?.features || null,
    ...(hasStoreData ? { store } : {}),
  };
}

function buildRequestHeaders() {
  const headers = { "Content-Type": "application/json" };

  const token = process.env.AUTOMATIONS_TOKEN?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function normaliseAnswerPayload({ payload, response, error }) {
  return JSON.stringify(
    {
      payload,
      ...(response ? { response } : {}),
      ...(error ? { error } : {}),
    },
    null,
    2,
  );
}

/**
 * Generates an answer for a given question by delegating to the n8n webhook.
 * @param {object} context - The context for generating the answer.
 * @returns {Promise<{message: string, hasAnswer: boolean, fullContext: string, noAnswer: boolean}>}
 */
export async function generateAnswer(context) {
  const webhookUrl = process.env.AUTOMATIONS_AI_WEBHOOK_URL;

  if (!webhookUrl) {
    console.error("AI automation webhook URL is not set in environment variables.");
    return {
      message: "Error: AI functionality is not configured.",
      hasAnswer: false,
      fullContext: "Error: AI webhook URL not configured",
      noAnswer: true,
    };
  }

  const payload = buildWebhookPayload(context);
  const headers = buildRequestHeaders();

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Webhook responded with status ${response.status}`);
    }

    const data = await response.json().catch(() => ({}));

    const { message: rawMessage } = data;
    const hasAnswerFlag = typeof data.answer === "boolean";
    const rawAnswerString = typeof data.answer === "string" ? data.answer.trim() : "";

    let message = typeof rawMessage === "string" ? rawMessage.trim() : "";
    let hasAnswer = false;

    if (hasAnswerFlag) {
      hasAnswer = data.answer === true;
      if (!message && hasAnswer) {
        message = DEFAULT_ERROR_MESSAGE;
      }
    } else if (rawAnswerString) {
      const isNoAnswerToken = rawAnswerString.toUpperCase() === "NO_RESPONSE_AVAILABLE";
      hasAnswer = !isNoAnswerToken;
      message = hasAnswer ? rawAnswerString : DEFAULT_NO_ANSWER_MESSAGE;
    }

    if (!hasAnswer && !message) {
      message = DEFAULT_NO_ANSWER_MESSAGE;
    }

    const noAnswer = typeof data.noAnswer === "boolean" ? data.noAnswer : !hasAnswer;

    return {
      message,
      hasAnswer,
      fullContext: normaliseAnswerPayload({ payload, response: data }),
      noAnswer,
    };
  } catch (error) {
    console.error("Error generating AI answer via webhook:", error);
    return {
      message: DEFAULT_ERROR_MESSAGE,
      hasAnswer: false,
      fullContext: normaliseAnswerPayload({ payload, error: error.message }),
      noAnswer: true,
    };
  }
}
