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

  const previousQAsText = previousQAs.length > 0
    ? previousQAs.map(qa => `Pregunta: ${qa.question}\nRespuesta: ${qa.answer}`).join('\n\n')
    : 'No hay preguntas anteriores para este producto.';

  return `
Eres un asistente de soporte para una tienda online. Tu trabajo es responder preguntas de clientes de forma clara, precisa, y amigable, basándote únicamente en la información proporcionada a continuación.

---

🔹 Información del producto:

${productTitle}
${productDescription}

---

🔹 Opciones Disponibles:

${optionsText}

---

🔹 Historial de preguntas y respuestas de este producto:

${previousQAsText}

---

🔹 Instrucciones del administrador para este producto o categoría:

${aiInstructions || 'No hay instrucciones adicionales.'}

---

🔹 Pregunta del cliente:

“${customerQuestion}”

---

📌 Reglas importantes:

- No inventes información que no esté en los datos proporcionados.
- Si la pregunta no puede responderse con certeza, responde solo:
  **"NO_RESPONSE_AVAILABLE"**
- Usa un tono profesional y empático.
- Responde en el mismo idioma en el que el cliente preguntó.
- Mantén la respuesta breve (2–4 oraciones) pero completa.

---

✍️ Responde a continuación:
  `.trim();
}

/**
 * Generates an answer for a given question using OpenAI with rich context.
 * @param {object} context - The context for generating the answer.
 * @returns {Promise<string>} The AI-generated answer.
 */
export async function generateAnswer(context) {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OpenAI API key is not set in .env file.");
    return "Error: AI functionality is not configured.";
  }

  const prompt = buildPrompt(context);
  const { aiLanguage } = context.aiSettings || {};

  const languageInstruction = aiLanguage === 'auto'
    ? 'Responde en el mismo idioma en el que el cliente preguntó.'
    : `Responde siempre en ${aiLanguage}.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Eres un asistente de soporte experto. Sigue las reglas y el formato proporcionado. ${languageInstruction}`
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.5, // Lower temperature for more factual answers
      max_tokens: 250,
    });

    const answer = completion.choices[0].message.content.trim();

    if (answer.includes("NO_RESPONSE_AVAILABLE")) {
        return "I couldn't find enough information to answer this question based on the provided context.";
    }

    return answer;
  } catch (error) {
    console.error("Error generating AI answer:", error);
    return "Sorry, there was an error generating an answer. Please try again later.";
  }
}