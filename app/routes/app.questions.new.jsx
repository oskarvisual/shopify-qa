import { json, redirect } from "@remix-run/node";
import { useActionData, useSubmit, useNavigate, useOutletContext } from "@remix-run/react";
import { useState } from "react";
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
  Thumbnail,
  Badge,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { triggerWebhook } from "../lib/webhook.server.js";
import { sendNewQuestionNotification, sendQuestionPublishedNotification } from "../lib/email.server.js";
import prisma from "../db.server";
const CHARACTER_LIMIT = 500;

const GET_PRODUCT_DETAILS_QUERY = `
  query getProductDetails($id: ID!) {
    product(id: $id) {
      handle
      title
      productType
      tags
    }
    shop {
      name
    }
  }
`;

// Action to handle creating a new question
export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const { shop } = session;

  const formData = await request.formData();
  const questionText = formData.get("questionText");
  const productId = formData.get("productId");
  const customerName = formData.get("customerName");
  const customerEmail = formData.get("customerEmail");
  let isPublished = formData.get("isPublished") === "true";

  const emailSettings = await prisma.emailSetting.findUnique({ where: { shop } });
  if (emailSettings?.autoApproveQuestions) {
    isPublished = true;
  }

  if (!questionText || !productId || productId === "") {
    return json({ error: "Question text and product are required" }, { status: 400 });
  }

  if (questionText.length > CHARACTER_LIMIT) {
    return json({ error: `Question cannot exceed ${CHARACTER_LIMIT} characters.` }, { status: 400 });
  }

  try {
    let productType = null;
    let productCategory = null;
    let productTags = null;
    let storeName = null;
    let productHandle = null;
    let productName = null;

    // Fetch product details from Shopify
    try {
      const response = await admin.graphql(GET_PRODUCT_DETAILS_QUERY, {
        variables: { id: `gid://shopify/Product/${productId}` },
      });

      const productDetails = await response.json();
      const product = productDetails.data?.product;
      storeName = productDetails.data?.shop?.name || null;

      if (product) {
        productType = product.productType;
        productTags = product.tags?.join(', ');
        productCategory = productType ? productType.charAt(0).toUpperCase() + productType.slice(1) : null;
        productHandle = product.handle || null;
        productName = product.title || null;
      }
    } catch (productError) {
      console.warn("Failed to fetch product details from Shopify:", productError.message);
    }

    const newQuestion = await prisma.question.create({
      data: {
        shop: shop,
        productId: productId,
        question: questionText,
        customerName: customerName,
        customerEmail: customerEmail,
        isPublished: isPublished,
        productType,
        productCategory,
        productTags,
      },
      include: { answers: true }, // Include answers for the webhook payload
    });

    // Trigger webhook
    await triggerWebhook(shop, "newQuestion", {
      action: "create",
      entity: "question",
      shop,
      data: newQuestion
    });

    // Send notification email to admins
    await sendNewQuestionNotification(shop, newQuestion, {
      questionPath: `/app/questions/${newQuestion.id}`,
      storeName,
    });

    // Notify the customer if the question was published immediately (auto-approve or manual choice)
    if (newQuestion.isPublished) {
      await sendQuestionPublishedNotification(shop, newQuestion, {
        productHandle,
        storeName,
        productName,
      });
    }

    return redirect(`/app/questions/${newQuestion.id}`);
  } catch (error) {
    console.error("Error creating question:", error);
    return json({ error: "Failed to create question" }, { status: 500 });
  }
};

// The New Question Page Component
export default function NewQuestionPage() {
  const actionData = useActionData();
  const submit = useSubmit();
  const navigate = useNavigate();
  const { products, shop } = useOutletContext();

  // Form state
  const [questionText, setQuestionText] = useState("");
  const [productId, setProductId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [isPublished, setIsPublished] = useState(false);

  const handleSubmit = () => {
    const formData = new FormData();
    formData.append("questionText", questionText);
    formData.append("productId", productId);
    formData.append("customerName", customerName);
    formData.append("customerEmail", customerEmail);
    formData.append("isPublished", isPublished);
    submit(formData, { method: "post" });
  };

  const publishedOptions = [
    { label: "Published", value: "true" },
    { label: "Pending", value: "false" },
  ];

  const productOptions = [
    { label: "Select a product...", value: "", disabled: true },
    ...products.map(product => ({
      label: product.title,
      value: product.id.replace('gid://shopify/Product/', '')
    }))
  ];

  const selectedProduct = products.find(p =>
    p.id.replace('gid://shopify/Product/', '') === productId
  );

  return (
    <Page title="New Question" backAction={{ content: "Questions", onAction: () => navigate("/app/questions-list") }}>
      <Layout>
        <Layout.Section>
          {actionData?.error && (
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" tone="critical">{actionData.error}</Text>
              </BlockStack>
            </Card>
          )}

          <div style={{ marginBottom: '1rem' }} />

          <Card>
            <BlockStack gap="400">
              <Select
                label="Product"
                options={productOptions}
                onChange={setProductId}
                value={productId}
                helpText="Select the product this question is about"
              />

              {selectedProduct && (
                <Card background="bg-surface-secondary">
                  <BlockStack gap="300">
                    <InlineStack gap="400" blockAlign="center" wrap={false}>
                      <Thumbnail source={selectedProduct.featuredImage?.url || ""} alt={selectedProduct.title} size="medium" />
                      <BlockStack gap="200">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="p" variant="headingSm">{selectedProduct.title}</Text>
                          <Badge tone={selectedProduct.status === 'ACTIVE' ? 'success' : 'attention'}>{selectedProduct.status}</Badge>
                        </InlineStack>
                        <InlineStack gap="200">
                          <Button variant="primary" size="slim" onClick={() => window.open(`https://${shop}/admin/products/${selectedProduct.id.replace('gid://shopify/Product/', '')}`, '_parent')}>
                            Edit Product
                          </Button>
                          <Button size="slim" onClick={() => window.open(`https://${shop}/products/${selectedProduct.handle}`, '_blank')}>
                            View on Storefront
                          </Button>
                        </InlineStack>
                      </BlockStack>
                    </InlineStack>
                  </BlockStack>
                </Card>
              )}

              <TextField
                label="Question"
                value={questionText}
                onChange={setQuestionText}
                multiline={3}
                autoComplete="off"
                helpText="Enter the customer's question"
                maxLength={CHARACTER_LIMIT}
                showCharacterCount
              />
              <TextField
                label="Customer Name"
                value={customerName}
                onChange={setCustomerName}
                autoComplete="off"
                helpText="The name of the customer asking the question"
              />
              <TextField
                label="Customer Email"
                value={customerEmail}
                onChange={setCustomerEmail}
                type="email"
                autoComplete="off"
                helpText="Customer's email address (optional)"
              />
              <Select
                label="Status"
                options={publishedOptions}
                onChange={(value) => setIsPublished(value === "true")}
                value={isPublished ? "true" : "false"}
                helpText="Choose whether to publish immediately or keep as pending"
              />
              <InlineStack align="end" gap="200">
                <Button onClick={() => navigate("/app/questions-list")}>Cancel</Button>
                <Button variant="primary" onClick={handleSubmit} disabled={!productId || !questionText}>Create Question</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
