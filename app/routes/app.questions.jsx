import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { PrismaClient } from "@prisma/client";
import { authenticate } from "../shopify.server";
import {
  Page,
  Card,
  DataTable,
  Button,
  Badge,
  Modal,
  TextContainer,
  TextField,
  Select,
} from "@shopify/polaris";
import { useState } from "react";

const prisma = new PrismaClient();

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  const questions = await prisma.question.findMany({
    where: { shop: session.shop },
    include: {
      answers: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return json({ questions });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "toggleQuestion") {
    const id = formData.get("id");
    const isPublished = formData.get("isPublished") === "true";

    await prisma.question.update({
      where: { id },
      data: { isPublished: !isPublished },
    });
  }

  if (action === "toggleAnswer") {
    const id = formData.get("id");
    const isPublished = formData.get("isPublished") === "true";

    await prisma.answer.update({
      where: { id },
      data: { isPublished: !isPublished },
    });
  }

  if (action === "addAnswer") {
    const questionId = formData.get("questionId");
    const authorName = formData.get("authorName");
    const answer = formData.get("answer");

    await prisma.answer.create({
      data: {
        questionId,
        authorName,
        answer,
        isPublished: true,
      },
    });
  }

  return json({ success: true });
};

export default function QuestionsPage() {
  const { questions } = useLoaderData();
  const fetcher = useFetcher();
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [showAnswerModal, setShowAnswerModal] = useState(false);
  const [answerText, setAnswerText] = useState("");
  const [authorName, setAuthorName] = useState("");

  const toggleQuestionStatus = (question) => {
    fetcher.submit(
      {
        action: "toggleQuestion",
        id: question.id,
        isPublished: question.isPublished,
      },
      { method: "post" }
    );
  };

  const toggleAnswerStatus = (answer) => {
    fetcher.submit(
      {
        action: "toggleAnswer",
        id: answer.id,
        isPublished: answer.isPublished,
      },
      { method: "post" }
    );
  };

  const addAnswer = () => {
    fetcher.submit(
      {
        action: "addAnswer",
        questionId: selectedQuestion.id,
        authorName,
        answer: answerText,
      },
      { method: "post" }
    );
    setShowAnswerModal(false);
    setAnswerText("");
    setAuthorName("");
  };

  const questionRows = questions.map((question) => [
    question.question,
    question.customerName || "Anonymous",
    question.productId,
    question.answers.length,
    <Badge status={question.isPublished ? "success" : "warning"}>
      {question.isPublished ? "Published" : "Draft"}
    </Badge>,
    <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
      <Button
        size="slim"
        onClick={() => toggleQuestionStatus(question)}
      >
        {question.isPublished ? "Unpublish" : "Publish"}
      </Button>
      <Button
        size="slim"
        primary
        onClick={() => {
          setSelectedQuestion(question);
          setShowAnswerModal(true);
        }}
      >
        Add Answer
      </Button>
    </div>,
  ]);

  return (
    <Page title="Product Questions & Answers">
      <Card>
        <DataTable
          columnContentTypes={["text", "text", "text", "numeric", "text", "text"]}
          headings={["Question", "Customer", "Product ID", "Answers", "Status", "Actions"]}
          rows={questionRows}
        />
      </Card>

      <Modal
        open={showAnswerModal}
        onClose={() => setShowAnswerModal(false)}
        title="Add Answer"
        primaryAction={{
          content: "Add Answer",
          onAction: addAnswer,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setShowAnswerModal(false),
          },
        ]}
      >
        <Modal.Section>
          <TextContainer>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <TextField
                label="Author Name"
                value={authorName}
                onChange={setAuthorName}
                placeholder="Enter your name"
              />
              <TextField
                label="Answer"
                value={answerText}
                onChange={setAnswerText}
                multiline={4}
                placeholder="Enter your answer to the question"
              />
              {selectedQuestion && (
                <p><strong>Question:</strong> {selectedQuestion.question}</p>
              )}
            </div>
          </TextContainer>
        </Modal.Section>
      </Modal>
    </Page>
  );
}