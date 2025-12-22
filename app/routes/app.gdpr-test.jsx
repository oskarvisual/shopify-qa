import { json } from "@remix-run/node";
import { useActionData, useNavigation, Form } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  TextField,
  Banner,
  BlockStack,
  InlineStack,
  Text,
  Divider,
  List,
} from "@shopify/polaris";
import { useState } from "react";

export const loader = async ({ request }) => {
  const { authenticate } = await import("../shopify.server");
  await authenticate.admin(request);

  // SECURITY: Only allow access in development mode
  if (process.env.NODE_ENV === "production") {
    throw new Response("Not Found", {
      status: 404,
      statusText: "GDPR testing interface is only available in development mode",
    });
  }

  return json({});
};

export const action = async ({ request }) => {
  // Import server-only modules dynamically
  const { authenticate } = await import("../shopify.server");
  const {
    gatherCustomerData,
    logGdprRequest,
    updateGdprRequestStatus,
    sendCustomerDataByEmail,
  } = await import("../lib/gdpr.server");
  const prisma = (await import("../db.server")).default;

  const { session } = await authenticate.admin(request);

  // SECURITY: Only allow in development mode
  if (process.env.NODE_ENV === "production") {
    return json({
      success: false,
      message: "GDPR testing is only available in development mode",
    }, { status: 403 });
  }

  const formData = await request.formData();
  const action = formData.get("action");
  const customerEmail = formData.get("customerEmail");
  const shop = session.shop;

  try {
    if (action === "data_request") {
      // Test customers/data_request webhook
      const gdprRequest = await logGdprRequest({
        shop,
        requestType: "data_request",
        customerEmail,
        customerId: "test-customer-" + Date.now(),
        payload: { test: true, customerEmail },
      });

      await updateGdprRequestStatus(gdprRequest.id, "processing");

      const customerData = await gatherCustomerData(shop, customerEmail, null);

      await sendCustomerDataByEmail(customerEmail, customerData, shop);

      await updateGdprRequestStatus(gdprRequest.id, "completed");

      return json({
        success: true,
        message: `Data request processed for ${customerEmail}`,
        data: {
          requestId: gdprRequest.id,
          questions: customerData.questions.length,
          answers: customerData.answers.length,
          votes: customerData.votes.length,
          aiInteractions: customerData.aiInteractions.length,
        },
      });
    } else if (action === "customer_redact") {
      // Test customers/redact webhook
      const gdprRequest = await logGdprRequest({
        shop,
        requestType: "customer_redact",
        customerEmail,
        customerId: "test-customer-" + Date.now(),
        payload: { test: true, customerEmail },
      });

      // Anonymize questions
      const questionsUpdated = await prisma.question.updateMany({
        where: {
          shop,
          customerEmail,
        },
        data: {
          customerEmail: "redacted@privacy.invalid",
          customerName: "Redacted User",
        },
      });

      // Anonymize answers
      const answersUpdated = await prisma.answer.updateMany({
        where: {
          shop,
          authorEmail: customerEmail,
        },
        data: {
          authorEmail: "redacted@privacy.invalid",
          authorName: "Redacted User",
        },
      });

      await updateGdprRequestStatus(gdprRequest.id, "completed");

      return json({
        success: true,
        message: `Customer data redacted for ${customerEmail}`,
        data: {
          requestId: gdprRequest.id,
          questionsRedacted: questionsUpdated.count,
          answersRedacted: answersUpdated.count,
        },
      });
    } else if (action === "shop_redact") {
      // Test shop/redact webhook - BE CAREFUL WITH THIS!
      const gdprRequest = await logGdprRequest({
        shop,
        requestType: "shop_redact",
        customerEmail: null,
        customerId: null,
        payload: { test: true, shop },
      });

      // Count data before deletion
      const counts = {
        questions: await prisma.question.count({ where: { shop } }),
        aiLogs: await prisma.aILog.count({ where: { shop } }),
        automationLogs: await prisma.automationLog.count({ where: { shop } }),
        webhookSettings: await prisma.webhookSetting.count({ where: { shop } }),
        settings: await prisma.settings.count({ where: { shop } }),
      };

      // This is dangerous - only enable in development
      if (process.env.NODE_ENV === "development") {
        await prisma.question.deleteMany({ where: { shop } });
        await prisma.automationLog.deleteMany({ where: { shop } });
        await prisma.aILog.deleteMany({ where: { shop } });
        await prisma.webhookSetting.deleteMany({ where: { shop } });
        await prisma.settings.deleteMany({ where: { shop } });

        await updateGdprRequestStatus(gdprRequest.id, "completed");

        return json({
          success: true,
          message: `All shop data deleted for ${shop}`,
          data: {
            requestId: gdprRequest.id,
            deleted: counts,
          },
        });
      } else {
        return json({
          success: false,
          message: "Shop redact test is only available in development mode",
        });
      }
    }

    return json({ success: false, message: "Unknown action" });
  } catch (error) {
    console.error("GDPR test error:", error);
    return json({
      success: false,
      message: error.message,
    });
  }
};

export default function GdprTest() {
  const actionData = useActionData();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";
  const [customerEmail, setCustomerEmail] = useState("");

  return (
    <Page
      title="GDPR Webhooks Testing"
      subtitle="Test GDPR compliance webhooks in development"
      backAction={{ content: "Dashboard", url: "/app" }}
    >
      <Layout>
        <Layout.Section>
          <Banner tone="warning">
            <p>
              <strong>⚠️ DEVELOPMENT MODE ONLY:</strong> This testing interface
              is only available when NODE_ENV is not set to "production". In
              production, these webhooks are triggered by Shopify when customers
              request their data or request deletion.
            </p>
          </Banner>
        </Layout.Section>

        <Layout.Section>
          <Banner tone="info">
            <p>
              <strong>Current Environment:</strong>{" "}
              {process.env.NODE_ENV || "development"}
            </p>
          </Banner>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Customer Email for Testing
              </Text>
              <TextField
                label="Customer Email"
                value={customerEmail}
                onChange={setCustomerEmail}
                placeholder="customer@example.com"
                autoComplete="email"
                helpText="Enter the email of a customer who has submitted questions or answers"
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                1. Test Data Request (customers/data_request)
              </Text>
              <Text as="p" tone="subdued">
                Simulates a customer requesting all their personal data. This
                will:
              </Text>
              <List type="bullet">
                <List.Item>
                  Gather all questions, answers, votes, and AI interactions for
                  the customer
                </List.Item>
                <List.Item>
                  Send an email with the complete data in JSON format
                </List.Item>
                <List.Item>Log the request in the GdprRequest table</List.Item>
              </List>

              <Form method="post">
                <input type="hidden" name="action" value="data_request" />
                <input type="hidden" name="customerEmail" value={customerEmail} />
                <Button
                  submit
                  loading={isLoading}
                  disabled={!customerEmail || isLoading}
                >
                  Test Data Request
                </Button>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                2. Test Customer Redact (customers/redact)
              </Text>
              <Text as="p" tone="subdued">
                Simulates a customer requesting deletion of their data. This
                will:
              </Text>
              <List type="bullet">
                <List.Item>
                  Anonymize all questions with the customer's email
                </List.Item>
                <List.Item>
                  Anonymize all answers authored by the customer
                </List.Item>
                <List.Item>
                  Replace email with "redacted@privacy.invalid"
                </List.Item>
                <List.Item>Replace name with "Redacted User"</List.Item>
              </List>

              <Form method="post">
                <input type="hidden" name="action" value="customer_redact" />
                <input type="hidden" name="customerEmail" value={customerEmail} />
                <Button
                  submit
                  loading={isLoading}
                  disabled={!customerEmail || isLoading}
                  tone="critical"
                >
                  Test Customer Redact
                </Button>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                3. Test Shop Redact (shop/redact)
              </Text>
              <Text as="p" tone="critical">
                ⚠️ DANGER: This will delete ALL data for your shop!
              </Text>
              <Text as="p" tone="subdued">
                Simulates a store owner uninstalling the app. This will delete:
              </Text>
              <List type="bullet">
                <List.Item>All questions and answers</List.Item>
                <List.Item>All AI logs and automation logs</List.Item>
                <List.Item>All webhook settings</List.Item>
                <List.Item>All app settings</List.Item>
              </List>

              <Banner tone="critical">
                <p>
                  This action is IRREVERSIBLE and only works in development
                  mode. Use with extreme caution!
                </p>
              </Banner>

              <Form method="post">
                <input type="hidden" name="action" value="shop_redact" />
                <input type="hidden" name="customerEmail" value="" />
                <Button
                  submit
                  loading={isLoading}
                  disabled={isLoading}
                  tone="critical"
                >
                  Test Shop Redact (Delete Everything)
                </Button>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>

        {actionData && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Banner
                  tone={actionData.success ? "success" : "critical"}
                  title={actionData.success ? "Success" : "Error"}
                >
                  <p>{actionData.message}</p>
                </Banner>

                {actionData.data && (
                  <div>
                    <Text variant="headingMd" as="h3">
                      Result Data:
                    </Text>
                    <pre
                      style={{
                        backgroundColor: "#f5f5f5",
                        padding: "12px",
                        borderRadius: "4px",
                        overflow: "auto",
                      }}
                    >
                      {JSON.stringify(actionData.data, null, 2)}
                    </pre>
                  </div>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                How to Test in Production
              </Text>
              <Text as="p">
                Once your app is deployed, you can test GDPR webhooks through:
              </Text>
              <List type="number">
                <List.Item>
                  <strong>Shopify Admin:</strong> Settings → Customer Privacy →
                  Request customer data
                </List.Item>
                <List.Item>
                  <strong>Shopify API:</strong> Use the GDPR endpoints in the
                  Admin API
                </List.Item>
                <List.Item>
                  <strong>Partner Dashboard:</strong> Some test stores allow
                  simulating GDPR requests
                </List.Item>
              </List>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
