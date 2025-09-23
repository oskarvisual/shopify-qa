import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, useActionData, useSubmit, useNavigate } from "@remix-run/react";
import { useState, useCallback } from "react";
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
  Link as PolarisLink,
} from "@shopify/polaris";
import { DeleteIcon, EditIcon, ExternalIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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
            description(truncateAt: 120)
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
    const customerName = formData.get("customerName");
    const customerEmail = formData.get("customerEmail");
    const isPublished = formData.get("isPublished") === "true";

    if (!questionText) {
      return json({ error: "Question text is required" }, { status: 400 });
    }

    try {
      await prisma.question.update({
        where: { id: questionId, shop: shop },
        data: {
          question: questionText,
          customerName: customerName,
          customerEmail: customerEmail,
          isPublished: isPublished
        },
      });
      return json({ success: true, message: "Question updated successfully" });
    } catch (error) {
      console.error("Error updating question:", error);
      return json({ error: "Failed to update question" }, { status: 500 });
    }
  } else if (actionType === "deleteQuestion") {
    try {
      await prisma.answer.deleteMany({ where: { questionId: questionId } });
      await prisma.question.delete({ where: { id: questionId, shop: shop } });
      return redirect("/app");
    } catch (error) {
      console.error("Error deleting question:", error);
      return json({ error: "Failed to delete question" }, { status: 500 });
    }
  } else if (actionType === "addAnswer") {
    const answerText = formData.get("answerText");
    const authorName = formData.get("authorName");
    const authorEmail = formData.get("authorEmail");
    const notifyUser = formData.get("notifyUser") === "true";

    if (!answerText || !authorName) {
      return json({ error: "Answer text and author name are required" }, { status: 400 });
    }

    try {
      await prisma.answer.create({
        data: {
          questionId: questionId,
          answer: answerText,
          authorName: authorName,
          authorEmail: authorEmail,
          isPublished: true,
        },
      });
      return json({ success: true, message: "Answer added successfully" });
    } catch (error) {
      console.error("Error adding answer:", error);
      return json({ error: "Failed to add answer" }, { status: 500 });
    }
  } else if (actionType === "updateAnswer") {
    const answerId = formData.get("answerId");
    const answerText = formData.get("answerText");
    const authorName = formData.get("authorName");
    const authorEmail = formData.get("authorEmail");
    const isPublished = formData.get("isPublished") === "true";

    if (!answerText || !authorName) {
      return json({ error: "Answer text and author name are required" }, { status: 400 });
    }

    try {
      await prisma.answer.update({
        where: { id: answerId },
        data: {
          answer: answerText,
          authorName: authorName,
          authorEmail: authorEmail,
          isPublished: isPublished,
        },
      });
      return json({ success: true, message: "Answer updated successfully" });
    } catch (error) {
      console.error("Error updating answer:", error);
      return json({ error: "Failed to update answer" }, { status: 500 });
    }
  } else if (actionType === "deleteAnswer") {
    const answerId = formData.get("answerId");

    try {
      await prisma.answer.delete({ where: { id: answerId } });
      return json({ success: true, message: "Answer deleted successfully" });
    } catch (error) {
      console.error("Error deleting answer:", error);
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

  // Question state
  const [editedQuestion, setEditedQuestion] = useState(question.question);
  const [customerName, setCustomerName] = useState(question.customerName || "");
  const [customerEmail, setCustomerEmail] = useState(question.customerEmail || "");
  const [isPublished, setIsPublished] = useState(question.isPublished);

  // Modal states
  const [showAnswerModal, setShowAnswerModal] = useState(false);
  const [editingAnswer, setEditingAnswer] = useState(null);
  const [answerText, setAnswerText] = useState("");
  const [answerAuthor, setAnswerAuthor] = useState("Admin"); // Auto-filled
  const [answerEmail, setAnswerEmail] = useState("admin@store.com"); // Auto-filled
  const [answerPublished, setAnswerPublished] = useState(true);
  const [notifyUser, setNotifyUser] = useState(false);

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
    if (confirm("Are you sure you want to delete this question? All associated answers will be deleted.")) {
      const formData = new FormData();
      formData.append("actionType", "deleteQuestion");
      submit(formData, { method: "post" });
    }
  };

  const openNewAnswerModal = () => {
    setEditingAnswer(null);
    setAnswerText("");
    setAnswerAuthor("Admin");
    setAnswerEmail("admin@store.com");
    setAnswerPublished(true);
    setNotifyUser(false);
    setShowAnswerModal(true);
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

  const publishedOptions = [
    { label: "Published", value: "true" },
    { label: "Pending", value: "false" },
  ];

  const answerResourceName = {
    singular: "answer",
    plural: "answers",
  };

  const answersRowMarkup = question.answers.map(
    (answer, index) => {
      const isPending = !answer.isPublished;
      const rowStyle = isPending ? { opacity: 0.6 } : {};

      return (
        <IndexTable.Row id={answer.id} key={answer.id} position={index} style={rowStyle}>
          <IndexTable.Cell>
            <div style={{ maxWidth: '300px', wordWrap: 'break-word', whiteSpace: 'normal' }}>
              {answer.answer}
            </div>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <div>
              <div style={{ fontWeight: '500' }}>{answer.authorName}</div>
              {answer.authorEmail && (
                <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>
                  {answer.authorEmail}
                </div>
              )}
            </div>
          </IndexTable.Cell>
          <IndexTable.Cell>{new Date(answer.createdAt).toLocaleDateString()}</IndexTable.Cell>
          <IndexTable.Cell>
            <span style={{
              opacity: isPending ? 0.7 : 1,
              color: isPending ? '#9CA3AF' : (answer.isPublished ? '#10B981' : '#6B7280')
            }}>
              {answer.isPublished ? "Published" : "Pending"}
            </span>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <ButtonGroup>
              <Button icon={EditIcon} onClick={() => openEditAnswerModal(answer)} size="slim">
                Edit
              </Button>
              <Button
                icon={DeleteIcon}
                onClick={() => handleDeleteAnswer(answer.id)}
                size="slim"
                tone="critical"
              >
                Delete
              </Button>
            </ButtonGroup>
          </IndexTable.Cell>
        </IndexTable.Row>
      );
    },
  );

  return (
    <Page
      title={`View Question: ${question.question.substring(0, 30)}...`}
      backAction={{content: "Back", onAction: () => navigate("/app")}}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="600">
            {actionData?.message && (
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" tone={actionData.success ? "success" : "critical"}>
                  {actionData.message}
                </Text>
              </BlockStack>
            )}
            {actionData?.error && (
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" tone="critical">
                  {actionData.error}
                </Text>
              </BlockStack>
            )}

            {/* Product Preview */}
            {productDetails && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Product Details</Text>
                  <InlineStack gap="400" blockAlign="center">
                    <Thumbnail
                      source={productDetails.featuredImage?.url || ""}
                      alt={productDetails.featuredImage?.altText || productDetails.title}
                      size="large"
                    />
                    <BlockStack gap="200">
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="p" variant="headingSm">{productDetails.title}</Text>
                        <Badge tone={productDetails.status === 'ACTIVE' ? 'success' : 'attention'}>
                          {productDetails.status}
                        </Badge>
                      </InlineStack>
                      {productDetails.description && (
                        <Text as="p" variant="bodyMd" tone="subdued">
                          {productDetails.description}
                        </Text>
                      )}
                      <InlineStack gap="200">
                        <Button
                          onClick={() => window.open(`https://${shop}/admin/products/${productDetails.id.replace('gid://shopify/Product/', '')}`, '_parent')}
                          size="slim"
                        >
                          Edit Product
                        </Button>
                        <Button
                          onClick={() => window.open(`https://${shop}/products/${productDetails.handle}`, '_blank')}
                          size="slim"
                          variant="plain"
                        >
                          View Product
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </InlineStack>
                </BlockStack>
              </Card>
            )}

            {/* Question Form */}
            <Card>
            <BlockStack gap="500">
              <Text as="h2" variant="headingMd">
                Question Details
              </Text>
              <TextField
                label="Question"
                value={editedQuestion}
                onChange={setEditedQuestion}
                multiline={3}
                autoComplete="off"
              />
              <TextField
                label="Customer Name"
                value={customerName}
                onChange={setCustomerName}
                autoComplete="off"
              />
              <TextField
                label="Customer Email"
                value={customerEmail}
                onChange={setCustomerEmail}
                type="email"
                autoComplete="off"
              />
              <Select
                label="Status"
                options={publishedOptions}
                onChange={(value) => setIsPublished(value === "true")}
                value={isPublished ? "true" : "false"}
              />
              <InlineStack align="space-between">
                <Button tone="critical" onClick={handleDeleteQuestion}>
                  Delete Question
                </Button>
                <Button variant="primary" onClick={handleQuestionUpdate}>
                  Update Question
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section>
          {/* New Answer Button */}
          <InlineStack align="center">
            <Button variant="primary" onClick={openNewAnswerModal}>
              New Answer
            </Button>
          </InlineStack>
        </Layout.Section>

        <Layout.Section>
          {/* Answers Table */}
          <Card>
            <BlockStack gap="500">
              <Text as="h2" variant="headingMd">
                Answers ({question.answers.length})
              </Text>
              {question.answers.length === 0 ? (
                <Text as="p">No answers yet.</Text>
              ) : (
                <IndexTable
                  resourceName={answerResourceName}
                  itemCount={question.answers.length}
                  headings={[
                    { title: "Answer" },
                    { title: "Author" },
                    { title: "Date" },
                    { title: "Status" },
                    { title: "Actions" },
                  ]}
                  selectable={false}
                >
                  {answersRowMarkup}
                </IndexTable>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      {/* Answer Modal */}
      <Modal
        open={showAnswerModal}
        onClose={() => setShowAnswerModal(false)}
        title={editingAnswer ? "Edit Answer" : "New Answer"}
        primaryAction={{
          content: editingAnswer ? "Update" : "Create",
          onAction: handleAnswerSubmit,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setShowAnswerModal(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="Answer"
              value={answerText}
              onChange={setAnswerText}
              multiline={4}
              autoComplete="off"
            />
            <TextField
              label="Author Name"
              value={answerAuthor}
              onChange={setAnswerAuthor}
              autoComplete="off"
            />
            <TextField
              label="Author Email"
              value={answerEmail}
              onChange={setAnswerEmail}
              type="email"
              autoComplete="off"
            />
            <Select
              label="Status"
              options={publishedOptions}
              onChange={(value) => setAnswerPublished(value === "true")}
              value={answerPublished ? "true" : "false"}
            />
            <Checkbox
              label="Notify user by email"
              checked={notifyUser}
              onChange={setNotifyUser}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}