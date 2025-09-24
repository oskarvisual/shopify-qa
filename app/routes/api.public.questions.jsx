import { json } from "@remix-run/node";
import { PrismaClient } from "@prisma/client";
import { cors } from "remix-utils/cors";

const prisma = new PrismaClient();

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const productId = url.searchParams.get("productId");
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const limit = parseInt(url.searchParams.get("limit") || "10", 10);
  const skip = (page - 1) * limit;

  if (!productId || !shop) {
    return json({ error: "Missing required parameters" }, { status: 400 });
  }

  try {
    const questions = await prisma.question.findMany({
      where: {
        shop,
        productId,
        isPublished: true,
      },
      skip,
      take: limit,
      include: {
        answers: {
          where: { isPublished: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const response = json({ questions });
    return cors(request, response);
  } catch (error) {
    console.error("Error fetching questions:", error);
    const errorResponse = json({ error: "Failed to fetch questions" }, { status: 500 });
    return cors(request, errorResponse);
  }
};

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    const response = json({ error: "Method not allowed" }, { status: 405 });
    return cors(request, response);
  }

  const formData = await request.formData();
  const productId = formData.get("productId");
  const shop = formData.get("shop");
  const customerName = formData.get("customerName");
  const customerEmail = formData.get("customerEmail");
  const question = formData.get("question");

  if (!productId || !shop || !question) {
    const response = json({ error: "Missing required fields" }, { status: 400 });
    return cors(request, response);
  }

  try {
    const newQuestion = await prisma.question.create({
      data: {
        shop,
        productId,
        customerName,
        customerEmail,
        question,
      },
    });

    const response = json({ question: newQuestion });
    return cors(request, response);
  } catch (error) {
    console.error("Error creating question:", error);
    const errorResponse = json({ error: "Failed to create question" }, { status: 500 });
    return cors(request, errorResponse);
  }
};
