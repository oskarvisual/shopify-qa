import { useCallback } from "react";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigate, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Banner,
  List,
  Divider,
  Box,
} from "@shopify/polaris";
import {
  ExternalIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const isFirstTime = url.searchParams.get("first_time") === "true";

  // Get or create settings to check if they've seen setup
  let settings = await prisma.settings.findUnique({
    where: { shop: session.shop },
  });

  if (!settings) {
    settings = await prisma.settings.create({
      data: {
        shop: session.shop,
        data: "{}",
        hasSeenSetup: false,
      },
    });
  }

  return json({
    shop: session.shop,
    appHandle: "product-questions-and-answers-2",
    clientId: "3064ddc918220795fa21739de76542f5",
    extensionName: "product-qa-v2",
    isFirstTime,
    hasSeenSetup: settings.hasSeenSetup,
  });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "mark_setup_complete") {
    await prisma.settings.upsert({
      where: { shop: session.shop },
      update: { hasSeenSetup: true },
      create: {
        shop: session.shop,
        data: "{}",
        hasSeenSetup: true,
      },
    });

    return redirect("/app");
  }

  return json({ success: true });
};

export default function SetupPage() {
  const { shop, appHandle, clientId, extensionName, isFirstTime, hasSeenSetup } = useLoaderData();
  const navigate = useNavigate();
  const submit = useSubmit();

  const handleGoToDashboard = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "mark_setup_complete");
    submit(formData, { method: "post" });
  }, [submit]);

  // Deep link to product template editor
  const deepLinkBase = `https://${shop}/admin/themes/current/editor`;
  const productTemplateLink = `${deepLinkBase}?template=product&addAppBlockId=${clientId}/qa_questions_display`;

  return (
    <Page
      title="Setup Instructions"
      subtitle="Follow these steps to install and configure your Q&A app"
      backAction={!isFirstTime ? { content: "Dashboard", onAction: () => navigate("/app") } : undefined}
      primaryAction={
        isFirstTime
          ? {
              content: "Go to Dashboard",
              onAction: handleGoToDashboard,
            }
          : undefined
      }
    >
      <Layout>
        {/* First Time Banner */}
        {isFirstTime && (
          <Layout.Section>
            <Banner
              title="Welcome! Let's get you set up"
              tone="success"
            >
              <p>
                Thank you for installing AI Product Questions & Answers! Follow
                the steps below to add Q&A functionality to your product pages.
                Once you're done, click "Go to Dashboard" to start managing your
                questions.
              </p>
            </Banner>
          </Layout.Section>
        )}

        {/* Introduction Banner */}
        <Layout.Section>
          <Banner
            title={isFirstTime ? "Quick Setup Guide" : "Welcome to AI Product Questions & Answers!"}
            tone="info"
          >
            <p>
              This guide will help you install and configure the Q&A sections on
              your product pages. The installation takes about 3-5 minutes.
            </p>
          </Banner>
        </Layout.Section>


        {/* Video Tutorial */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                📹 Video Tutorial
              </Text>
              <Divider />
              <Text as="p">
                Watch our step-by-step video guide for visual instructions on
                installing and configuring the Q&A app.
              </Text>

              <Box>
                <Button
                  url="https://www.loom.com/share/3a39bf24b7b74e2caadfad2bf855f884"
                  target="_blank"
                  icon={ExternalIcon}
                  variant="primary"
                >
                  Watch Video Tutorial
                </Button>
              </Box>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Step 1: Access Product Template Editor */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h3">
                Step 1: Open the Product Page Template Editor
              </Text>

              <Divider />

              <BlockStack gap="300">
                <Text as="p">
                  First, you need to open your theme editor specifically for the <strong>Product page template</strong>, since the Q&A sections should only appear on product pages.
                </Text>

                <Box paddingBlockStart="200">
                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h4">
                      Instructions:
                    </Text>
                    <List type="number">
                      <List.Item>
                        Click the button below to open your product template in the theme editor
                      </List.Item>
                      <List.Item>
                        In the left sidebar, you'll see the product page layout
                      </List.Item>
                      <List.Item>
                        You're now ready to add Q&A sections to your product page
                      </List.Item>
                    </List>
                  </BlockStack>
                </Box>

                <InlineStack gap="300">
                  <Button
                    url={productTemplateLink}
                    target="_blank"
                    icon={ExternalIcon}
                    variant="primary"
                  >
                    Open Product Template Editor
                  </Button>
                </InlineStack>

                <Banner tone="warning">
                  <p>
                    <strong>Important:</strong> Make sure you're editing the <strong>Product</strong> template, not the Home page or other templates. The Q&A sections are designed specifically for product pages.
                  </p>
                </Banner>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Step 2: Add Questions Display Section */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h3">
                Step 2: Add the Questions Display Section
              </Text>

              <Divider />

              <BlockStack gap="300">
                <Text as="p">
                  This section displays all existing questions and answers for the
                  current product. Customers can search, vote, and view detailed
                  answers.
                </Text>

                <Box paddingBlockStart="200">
                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h4">
                      Instructions:
                    </Text>
                    <List type="number">
                      <List.Item>
                        In the theme editor (left sidebar), scroll down and click <strong>"Add section"</strong>
                      </List.Item>
                      <List.Item>
                        Click on the <strong>"Apps"</strong> tab at the top
                      </List.Item>
                      <List.Item>
                        Find and select <strong>"Q&A Questions Display"</strong>
                      </List.Item>
                      <List.Item>
                        Position it where you want (typically below the product description)
                      </List.Item>
                      <List.Item>
                        Customize the settings in the right sidebar (title, search, styling, etc.)
                      </List.Item>
                      <List.Item>
                        Click <strong>"Save"</strong> in the top-right corner
                      </List.Item>
                    </List>
                  </BlockStack>
                </Box>

                <Banner tone="info">
                  <p>
                    <strong>Tip:</strong> You can customize the section title,
                    enable/disable search, show/hide the "Ask Question" button,
                    and adjust the visual style (block or separator layout).
                  </p>
                </Banner>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Step 3: Add Ask Question Form Section */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h3">
                Step 3: Add the Ask Question Form Section (Optional)
              </Text>

              <Divider />

              <BlockStack gap="300">
                <Text as="p">
                  This section allows customers to submit new questions. It supports
                  AI-powered answers (if enabled on Ultra plan) and can be displayed inline or
                  as a modal.
                </Text>

                <Box paddingBlockStart="200">
                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h4">
                      Instructions:
                    </Text>
                    <List type="number">
                      <List.Item>
                        In the theme editor, click <strong>"Add section"</strong> again
                      </List.Item>
                      <List.Item>
                        Go to the <strong>"Apps"</strong> tab
                      </List.Item>
                      <List.Item>
                        Select <strong>"Q&A Ask Question Form"</strong>
                      </List.Item>
                      <List.Item>
                        Position it where you want customers to ask questions
                        (typically above or below the questions display)
                      </List.Item>
                      <List.Item>
                        Configure settings: inline/modal, AI features, button
                        text, etc.
                      </List.Item>
                      <List.Item>
                        Click <strong>"Save"</strong>
                      </List.Item>
                    </List>
                  </BlockStack>
                </Box>

                <Banner>
                  <p>
                    <strong>Note:</strong> This section is optional. If you don't
                    add it, the Questions Display section includes a built-in "Ask
                    Question" button that opens a modal with the same
                    functionality.
                  </p>
                </Banner>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Additional Resources */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Additional Resources
              </Text>
              <Divider />

              <BlockStack gap="300">
                <Text variant="headingSm" as="h3">
                  Section Customization Options
                </Text>

                <Box paddingBlockStart="200">
                  <BlockStack gap="300">
                    <div>
                      <Text as="p" fontWeight="semibold">
                        Questions Display Section:
                      </Text>
                      <List type="bullet">
                        <List.Item>
                          <strong>Title:</strong> Customize the heading text
                        </List.Item>
                        <List.Item>
                          <strong>Search:</strong> Enable/disable search
                          functionality
                        </List.Item>
                        <List.Item>
                          <strong>Ask Button:</strong> Show/hide the "Ask
                          Question" button
                        </List.Item>
                        <List.Item>
                          <strong>Visual Style:</strong> Choose between block or
                          separator layout
                        </List.Item>
                        <List.Item>
                          <strong>Colors:</strong> Customize text, background,
                          borders, and buttons
                        </List.Item>
                      </List>
                    </div>

                    <div>
                      <Text as="p" fontWeight="semibold">
                        Ask Question Form Section:
                      </Text>
                      <List type="bullet">
                        <List.Item>
                          <strong>Display Mode:</strong> Inline form or modal
                          popup
                        </List.Item>
                        <List.Item>
                          <strong>AI Features:</strong> Enable AI-powered instant
                          answers (Ultra plan)
                        </List.Item>
                        <List.Item>
                          <strong>Character Limit:</strong> Set max question
                          length
                        </List.Item>
                        <List.Item>
                          <strong>Button Text:</strong> Customize all button
                          labels
                        </List.Item>
                        <List.Item>
                          <strong>Styling:</strong> Match your theme colors and
                          fonts
                        </List.Item>
                      </List>
                    </div>
                  </BlockStack>
                </Box>
              </BlockStack>

              <Divider />

              <BlockStack gap="300">
                <Text variant="headingSm" as="h3">
                  Troubleshooting
                </Text>

                <List type="bullet">
                  <List.Item>
                    <strong>Sections not showing?</strong> Make sure you added them to the <strong>Product</strong> template, not other pages
                  </List.Item>
                  <List.Item>
                    <strong>Styling issues?</strong> Check your theme's CSS for
                    conflicts. You can customize section colors in the theme
                    editor.
                  </List.Item>
                  <List.Item>
                    <strong>AI not working?</strong> Verify AI is enabled in the
                    Settings page and that you're on the Ultra plan
                  </List.Item>
                  <List.Item>
                    <strong>Questions not appearing?</strong> Check if questions
                    are published in the admin panel
                  </List.Item>
                </List>
              </BlockStack>

              <Divider />

              <BlockStack gap="200">
                <Text variant="headingSm" as="h3">
                  Next Steps
                </Text>
                <List type="bullet">
                  <List.Item>
                    Configure email notifications in Settings
                  </List.Item>
                  <List.Item>
                    Enable AI features for automated answers (Ultra plan)
                  </List.Item>
                  <List.Item>
                    Customize translations for multi-language stores
                  </List.Item>
                  <List.Item>Set up webhooks for external integrations</List.Item>
                  <List.Item>
                    Import existing FAQs using the Import/Export feature
                  </List.Item>
                </List>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Help Section */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Need Help?
              </Text>
              <Divider />
              <Text as="p">
                If you encounter any issues during setup or have questions about
                the app features, we're here to help!
              </Text>

              <InlineStack gap="300">
                <Button
                  url="https://orivisdev.shop/contact/"
                  target="_blank"
                  icon={ExternalIcon}
                >
                  Contact Support
                </Button>
                <Button
                  url="https://orivisdev.shop/app/ai-product-questions-answers/"
                  target="_blank"
                  icon={ExternalIcon}
                >
                  View Documentation
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
