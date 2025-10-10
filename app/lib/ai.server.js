import { OpenAI } from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Builds the prompt for the AI based on provided context.
 * @param {object} context - The context for generating the answer.
 * @param {string} context.customerQuestion - The customer's question.
 * @param {object} context.product - The product details.
 * @param {Array} context.previousQAs - Previous questions and answers for the product.
 * @param {object} context.aiSettings - The AI settings from the admin.
 * @returns {string} The fully constructed prompt.
 */
function buildPrompt({ customerQuestion, product, previousQAs = [], aiSettings = {} }) {
  const productTitle = product?.title || 'N/A';
  const productDescription = product?.description || 'No description available.';
  const { aiInstructions } = aiSettings;

  const optionsText = product.options?.map(opt => `- ${opt.name}: ${opt.values.join(', ')}`).join('\n') || 'No options listed.';

  // Build variants text with availability
  const variantsText = product.variants && product.variants.length > 0
    ? product.variants.map(v => `- ${v.title}: ${v.availableForSale ? 'Available' : 'Out of stock'}`).join('\n')
    : 'No variant information available.';

  const previousQAsText = previousQAs.length > 0
    ? previousQAs.map(qa => `Question: ${qa.question}\nAnswer: ${qa.answer}`).join('\n\n')
    : 'No previous questions for this product.';

  return `
You are a support assistant for an online store. Your job is to answer customer questions clearly, accurately, and in a friendly manner, based solely on the information provided below.

---

🔹 Product Information:

${productTitle}
${productDescription}

---

🔹 Available Options:

${optionsText}

---

🔹 Product Variants & Availability:

${variantsText}

---

🔹 Previous Q&A history for this product:

${previousQAsText}

---

🔹 Administrator instructions for this product or category:

${aiInstructions || 'No additional instructions.'}

---

🔹 Customer Question:

"${customerQuestion}"

---

📌 Important Rules:

- Do not invent information that is not in the provided data.
- If the question cannot be answered with certainty, respond only with:
  **"NO_RESPONSE_AVAILABLE"**
- Use a professional and empathetic tone.
- Respond in the same language the customer asked in.
- Keep the response brief (2–4 sentences) but complete.

---

✍️ Your answer:
  `.trim();
}

/**
 * Generates an answer for a given question using OpenAI with rich context.
 * @param {object} context - The context for generating the answer.
 * @returns {Promise<{answer: string, fullContext: string}>} The AI-generated answer and the full context sent to the AI.
 */
export async function generateAnswer(context) {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OpenAI API key is not set in .env file.");
    return {
      answer: "Error: AI functionality is not configured.",
      fullContext: "Error: OpenAI API key not configured"
    };
  }

  const prompt = buildPrompt(context);
  const { aiLanguage } = context.aiSettings || {};

  const languageInstruction = aiLanguage === 'auto'
    ? 'Always respond in the same language the customer asked in.'
    : `Always respond in ${aiLanguage}.`;

  const systemMessage = `You are an expert support assistant. Follow the rules and format provided. ${languageInstruction}`;

  // Build full context for logging (includes system message and user prompt)
  const fullContext = JSON.stringify({
    model: "gpt-4o",
    temperature: 0.5,
    max_tokens: 2000,
    messages: [
      {
        role: "system",
        content: systemMessage
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  }, null, 2);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: systemMessage
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.5, // Lower temperature for more factual answers
      max_tokens: 2000,
    });

    const answer = completion.choices[0].message.content.trim();

    if (answer.includes("NO_RESPONSE_AVAILABLE")) {
        return {
          answer: "I couldn't find enough information to answer this question based on the provided context.",
          fullContext
        };
    }

    return {
      answer,
      fullContext
    };
  } catch (error) {
    console.error("Error generating AI answer:", error);
    return {
      answer: "Sorry, there was an error generating an answer. Please try again later.",
      fullContext: fullContext + `\n\nError: ${error.message}`
    };
  }
}
