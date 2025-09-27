import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, useActionData, useSubmit, useNavigate } from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  TextField,
  Button,
  InlineStack,
  Select,
  IndexTable,
  Modal,
  Checkbox,
  ButtonGroup,
  Thumbnail,
  Badge,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { triggerWebhook } from "../lib/webhook.server.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CHARACTER_LIMIT = 500;

// Loader to fetch a specific question and its answers
export const loader = async ({ request, params }) => {
  const { session, admin } = await authenticate.admin(request);
  const { shop } = session;
  const { questionId } = params;

  if (!questionId) {
    return redirect("/app");
  }

  const question = await prisma.question.findUnique({
    where: { id: questionId, shop: shop },
    include: { answers: { orderBy: { createdAt: "asc" } } },
  });

  if (!question) {
    throw new Response("Question not found", { status: 404 });
  }

  // Fetch product details from Shopify
  let productDetails = null;
  if (question.productId) {
    try {
      const productResponse = await admin.graphql(`
        query getProduct($id: ID!) {
          product(id: $id) {
            id
            title
            handle
            status
            featuredImage {
              url
              altText
            }
          }
        }
      `, {
        variables: { id: `gid://shopify/Product/${question.productId}` }
      });

      const { data } = await productResponse.json();
      productDetails = data.product;
    } catch (error) {
      console.error("Error fetching product:", error);
    }
  }

  return json({ question, productDetails, shop });
};

// Action to handle updating the question or managing answers
export const action = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;
  const { questionId } = params;

  if (!questionId) {
    return redirect("/app");
  }

  const formData = await request.formData();
  const actionType = formData.get("actionType");

  if (actionType === "updateQuestion") {
    const questionText = formData.get("questionText");
    if (questionText.length > CHARACTER_LIMIT) {
      return json({ error: `Question cannot exceed ${CHARACTER_LIMIT} characters.` }, { status: 400 });
    }
    const customerName = formData.get("customerName");
    const customerEmail = formData.get("customerEmail");
    const isPublished = formData.get("isPublished") === "true";

    try {
      const updatedQuestion = await prisma.question.update({
        where: { id: questionId, shop: shop },
        data: { question: questionText, customerName, customerEmail, isPublished },
        include: { answers: true },
      });

      await triggerWebhook({
        shop,
        type: "question.updated",
        payload: updatedQuestion,
      });

      return json({ success: true, message: "Question updated successfully" });
    } catch (error) {
      return json({ error: "Failed to update question" }, { status: 500 });
    }
  } else if (actionType === "deleteQuestion") {
    try {
      const deletedQuestion = await prisma.question.delete({ 
        where: { id: questionId, shop: shop },
        include: { answers: true },
      });

      await triggerWebhook({
        shop,
        type: "question.deleted",
        payload: deletedQuestion,
      });

      return redirect("/app/questions-list");
    } catch (error) {
      return json({ error: "Failed to delete question" }, { status: 500 });
    }
  } else if (actionType === "addAnswer") {
    const answerText = formData.get("answerText");
    if (answerText.length > CHARACTER_LIMIT) {
      return json({ error: `Answer cannot exceed ${CHARACTER_LIMIT} characters.` }, { status: 400 });
    }
    const authorName = formData.get("authorName");
    const authorEmail = formData.get("authorEmail");

    try {
      const newAnswer = await prisma.answer.create({
        data: { questionId, answer: answerText, authorName, authorEmail, isPublished: true },
        include: { question: true },
      });

      await triggerWebhook({
        shop,
        type: "answer.created",
        payload: newAnswer,
      });

      return json({ success: true, message: "Answer added successfully" });
    } catch (error) {
      return json({ error: "Failed to add answer" }, { status: 500 });
    }
  } else if (actionType === "updateAnswer") {
    const answerText = formData.get("answerText");
    if (answerText.length > CHARACTER_LIMIT) {
      return json({ error: `Answer cannot exceed ${CHARACTER_LIMIT} characters.` }, { status: 400 });
    }
    const answerId = formData.get("answerId");
    const authorName = formData.get("authorName");
    const authorEmail = formData.get("authorEmail");
    const isPublished = formData.get("isPublished") === "true";

    try {
      const updatedAnswer = await prisma.answer.update({
        where: { id: answerId },
        data: { answer: answerText, authorName, authorEmail, isPublished },
        include: { question: true },
      });

      await triggerWebhook({
        shop,
        type: "answer.updated",
        payload: updatedAnswer,
      });

      return json({ success: true, message: "Answer updated successfully" });
    } catch (error) {
      return json({ error: "Failed to update answer" }, { status: 500 });
    }
  } else if (actionType === "deleteAnswer") {
    const answerId = formData.get("answerId");
    try {
      const deletedAnswer = await prisma.answer.delete({ 
        where: { id: answerId },
        include: { question: true },
      });

      await triggerWebhook({
        shop,
        type: "answer.deleted",
        payload: deletedAnswer,
      });

      return json({ success: true, message: "Answer deleted successfully" });
    } catch (error) {
      return json({ error: "Failed to delete answer" }, { status: 500 });
    }
  }

  return json({ error: "Invalid action type" }, { status: 400 });
};

// The Question View/Edit Page Component
export default function ViewQuestionPage() {
  const { question, productDetails, shop } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigate = useNavigate();

  // State
  const [editedQuestion, setEditedQuestion] = useState(question.question);
  const [customerName, setCustomerName] = useState(question.customerName || "");
  const [customerEmail, setCustomerEmail] = useState(question.customerEmail || "");
  const [isPublished, setIsPublished] = useState(question.isPublished);
  const [showAnswerModal, setShowAnswerModal] = useState(false);
  const [editingAnswer, setEditingAnswer] = useState(null);
  const [answerText, setAnswerText] = useState("");
  const [answerAuthor, setAnswerAuthor] = useState("Admin");
  const [answerEmail, setAnswerEmail] = useState("admin@store.com");
  const [answerPublished, setAnswerPublished] = useState(true);
  const [notifyUser, setNotifyUser] = useState(false);

  const openNewAnswerModal = useCallback(() => {
    setEditingAnswer(null);
    setAnswerText("");
    setAnswerAuthor("Admin");
    setAnswerEmail("admin@store.com");
    setAnswerPublished(true);
    setNotifyUser(false);
    setShowAnswerModal(true);
  }, []);

  useEffect(() => {
    if (window.location.hash === '#answer-form') {
      openNewAnswerModal();
    }
  }, [openNewAnswerModal]);

  const handleQuestionUpdate = () => {
    const formData = new FormData();
    formData.append("actionType", "updateQuestion");
    formData.append("questionText", editedQuestion);
    formData.append("customerName", customerName);
    formData.append("customerEmail", customerEmail);
    formData.append("isPublished", isPublished);
    submit(formData, { method: "post" });
  };

  const handleDeleteQuestion = () => {
    if (confirm("Are you sure you want to delete this question and all its answers?")) {
      const formData = new FormData();
      formData.append("actionType", "deleteQuestion");
      submit(formData, { method: "post" });
    }
  };

  const openEditAnswerModal = (answer) => {
    setEditingAnswer(answer);
    setAnswerText(answer.answer);
    setAnswerAuthor(answer.authorName);
    setAnswerEmail(answer.authorEmail || "");
    setAnswerPublished(answer.isPublished);
    setNotifyUser(false);
    setShowAnswerModal(true);
  };

  const handleAnswerSubmit = () => {
    const formData = new FormData();
    if (editingAnswer) {
      formData.append("actionType", "updateAnswer");
      formData.append("answerId", editingAnswer.id);
    } else {
      formData.append("actionType", "addAnswer");
    }
    formData.append("answerText", answerText);
    formData.append("authorName", answerAuthor);
    formData.append("authorEmail", answerEmail);
    formData.append("isPublished", answerPublished);
    formData.append("notifyUser", notifyUser);
    submit(formData, { method: "post" });
    setShowAnswerModal(false);
  };

  const handleDeleteAnswer = (answerId) => {
    if (confirm("Are you sure you want to delete this answer?")) {
      const formData = new FormData();
      formData.append("actionType", "deleteAnswer");
      formData.append("answerId", answerId);
      submit(formData, { method: "post" });
    }
  };

  const publishedOptions = [{ label: "Published", value: "true" }, { label: "Pending", value: "false" }];
  const answerResourceName = { singular: "answer", plural: "answers" };

  const answersRowMarkup = question.answers.map((answer, index) => (
    <IndexTable.Row id={answer.id} key={answer.id} position={index}>
      <IndexTable.Cell>
        <div style={{ maxWidth: "400px", whiteSpace: "normal", wordWrap: "break-word" }}>
          <BlockStack gap="300">
            <Text as="p" variant="bodyMd">{answer.answer}</Text>
            <InlineStack gap="200">
              <Button size="slim" onClick={() => openEditAnswerModal(answer)}>Edit</Button>
              <Button size="slim" tone="critical" onClick={() => handleDeleteAnswer(answer.id)}>Delete</Button>
            </InlineStack>
          </BlockStack>
        </div>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text tone={answer.isPublished ? "success" : "subdued"}>{answer.isPublished ? "Published" : "Pending"}</Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <BlockStack gap="100">
          <Text variant="bodyMd" fontWeight="semibold">{answer.authorName}</Text>
          {answer.authorEmail && <Text variant="bodySm" tone="subdued">{answer.authorEmail}</Text>}
        </BlockStack>
      </IndexTable.Cell>
      <IndexTable.Cell>{new Date(answer.createdAt).toLocaleDateString()}</IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page title={`Edit Question`} backAction={{ content: "Questions", onAction: () => navigate("/app/questions-list") }}>
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {productDetails && (
              <Card>
                <BlockStack gap="300">
                  <InlineStack gap="400" blockAlign="center" wrap={false}>
                    <Thumbnail source={productDetails.featuredImage?.url || ""} alt={productDetails.featuredImage?.altText || productDetails.title} size="large" />
                    <BlockStack gap="200">
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="p" variant="headingSm">{productDetails.title}</Text>
                        <Badge tone={productDetails.status === 'ACTIVE' ? 'success' : 'attention'}>{productDetails.status}</Badge>
                      </InlineStack>
                      <InlineStack gap="200">
                        <Button variant="primary" size="slim" onClick={() => window.open(`https://${shop}/admin/products/${productDetails.id.replace('gid://shopify/Product/', '')}`, '_parent')}>
                          Edit Product
                        </Button>
                        <Button size="slim" onClick={() => window.open(`https://${shop}/products/${productDetails.handle}`, '_blank')}>
                          View on Storefront
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </InlineStack>
                </BlockStack>
              </Card>
            )}

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Question Details</Text>
                <TextField
                  label="Question"
                  value={editedQuestion}
                  onChange={setEditedQuestion}
                  multiline={3}
                  autoComplete="off"
                  maxLength={CHARACTER_LIMIT}
                  showCharacterCount
                />
                <TextField label="Customer Name" value={customerName} onChange={setCustomerName} autoComplete="off" />
                <TextField label="Customer Email" value={customerEmail} onChange={setCustomerEmail} type="email" autoComplete="off" />
                <Select label="Status" options={publishedOptions} onChange={(value) => setIsPublished(value === "true")} value={isPublished ? "true" : "false"} />
                <InlineStack align="end" gap="200">
                  <Button tone="critical" onClick={handleDeleteQuestion}>Delete Question</Button>
                  <Button variant="primary" onClick={handleQuestionUpdate}>Update Question</Button>
                </InlineStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Answers ({question.answers.length})</Text>
                  <Button variant="primary" onClick={openNewAnswerModal}>New Answer</Button>
                </InlineStack>
                {question.answers.length === 0 ? (
                  <Text as="p" tone="subdued">No answers yet.</Text>
                ) : (
                  <IndexTable
                    resourceName={answerResourceName}
                    itemCount={question.answers.length}
                    headings={[{ title: "Answer" }, { title: "Status" }, { title: "Author" }, { title: "Date" }]}
                    selectable={false}
                    stickyFirstColumn={true}
                  >
                    {answersRowMarkup}
                  </IndexTable>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>

      <Modal id="answer-form" open={showAnswerModal} onClose={() => setShowAnswerModal(false)} title={editingAnswer ? "Edit Answer" : "New Answer"} primaryAction={{ content: editingAnswer ? "Update" : "Create", onAction: handleAnswerSubmit }} secondaryActions={[{ content: "Cancel", onAction: () => setShowAnswerModal(false) }]}>
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="Answer"
              value={answerText}
              onChange={setAnswerText}
              multiline={4}
              autoComplete="off"
              maxLength={CHARACTER_LIMIT}
              showCharacterCount
            />
            <TextField label="Author Name" value={answerAuthor} onChange={setAnswerAuthor} autoComplete="off" />
            <TextField label="Author Email" value={answerEmail} onChange={setAnswerEmail} type="email" autoComplete="off" />
            <Select label="Status" options={publishedOptions} onChange={(value) => setAnswerPublished(value === "true")} value={answerPublished ? "true" : "false"} />
            <Checkbox label="Notify user by email" checked={notifyUser} onChange={setNotifyUser} />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}