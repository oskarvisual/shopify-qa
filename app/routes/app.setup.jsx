import { useState, useCallback, useEffect } from "react";
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
  Badge,
  Box,
  Icon,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  QuestionCircleIcon,
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
  const [completedSteps, setCompletedSteps] = useState({
    step1: false,
    step2: false,
    step3: false,
    step4: false,
  });

  const toggleStep = useCallback((step) => {
    setCompletedSteps((prev) => ({
      ...prev,
      [step]: !prev[step],
    }));
  }, []);

  const handleGoToDashboard = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "mark_setup_complete");
    submit(formData, { method: "post" });
  }, [submit]);

  // Deep links for theme editor
  const deepLinkBase = `https://${shop}/admin/themes/current/editor`;
  const displayBlockDeepLink = `${deepLinkBase}?context=apps&template=product&activateAppId=${clientId}/qa_questions_display`;
  const askFormDeepLink = `${deepLinkBase}?context=apps&template=product&activateAppId=${clientId}/qa_ask_form`;
  const themeEditorApps = `${deepLinkBase}?context=apps`;

  const allStepsCompleted = Object.values(completedSteps).every((step) => step);

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
              This guide will help you install and configure the Q&A blocks on
              your product pages. The installation takes about 5 minutes.
            </p>
          </Banner>
        </Layout.Section>

        {/* Progress Overview */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd" as="h2">
                  Setup Progress
                </Text>
                <Badge tone={allStepsCompleted ? "success" : "info"}>
                  {Object.values(completedSteps).filter(Boolean).length} of 4
                  completed
                </Badge>
              </InlineStack>

              {allStepsCompleted && (
                <Banner tone="success">
                  <p>
                    <strong>Great job!</strong> Your Q&A app is now installed
                    and ready to use. Visit a product page in your store to see
                    it in action.
                  </p>
                </Banner>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Step 1: Enable App Embed */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="200" blockAlign="center">
                  <Icon
                    source={completedSteps.step1 ? CheckCircleIcon : QuestionCircleIcon}
                    tone={completedSteps.step1 ? "success" : "base"}
                  />
                  <Text variant="headingMd" as="h3">
                    Step 1: Enable the App Embed
                  </Text>
                </InlineStack>
                <Button
                  onClick={() => toggleStep("step1")}
                  variant={completedSteps.step1 ? "primary" : "secondary"}
                >
                  {completedSteps.step1 ? "Completed" : "Mark as done"}
                </Button>
              </InlineStack>

              <Divider />

              <BlockStack gap="300">
                <Text as="p">
                  First, you need to enable the app embed to load the necessary
                  scripts and styles for the Q&A functionality.
                </Text>

                <Box paddingBlockStart="200">
                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h4">
                      Instructions:
                    </Text>
                    <List type="number">
                      <List.Item>
                        Click the button below to open your theme editor
                      </List.Item>
                      <List.Item>
                        In the left sidebar, click on <strong>"App embeds"</strong>
                      </List.Item>
                      <List.Item>
                        Find <strong>"AI Product Questions & Answers"</strong> and
                        toggle it <strong>ON</strong>
                      </List.Item>
                      <List.Item>
                        Click <strong>"Save"</strong> in the top-right corner
                      </List.Item>
                    </List>
                  </BlockStack>
                </Box>

                <InlineStack gap="300">
                  <Button
                    url={themeEditorApps}
                    target="_blank"
                    icon={ExternalIcon}
                  >
                    Open Theme Editor
                  </Button>
                </InlineStack>

                <Banner tone="info">
                  <p>
                    <strong>Note:</strong> The app embed must be enabled for the
                    Q&A blocks to work properly. This loads the JavaScript and CSS
                    needed for the functionality.
                  </p>
                </Banner>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Step 2: Add Questions Display Block */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="200" blockAlign="center">
                  <Icon
                    source={completedSteps.step2 ? CheckCircleIcon : QuestionCircleIcon}
                    tone={completedSteps.step2 ? "success" : "base"}
                  />
                  <Text variant="headingMd" as="h3">
                    Step 2: Add the Questions Display Block
                  </Text>
                </InlineStack>
                <Button
                  onClick={() => toggleStep("step2")}
                  variant={completedSteps.step2 ? "primary" : "secondary"}
                >
                  {completedSteps.step2 ? "Completed" : "Mark as done"}
                </Button>
              </InlineStack>

              <Divider />

              <BlockStack gap="300">
                <Text as="p">
                  This block displays all existing questions and answers for the
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
                        Click the button below to open the product template in
                        your theme editor
                      </List.Item>
                      <List.Item>
                        The <strong>"Q&A Questions Display"</strong> block will be
                        automatically selected
                      </List.Item>
                      <List.Item>
                        Drag and drop it to your desired location (typically below
                        the product description)
                      </List.Item>
                      <List.Item>
                        Customize the settings in the right sidebar (title,
                        search, styling, etc.)
                      </List.Item>
                      <List.Item>
                        Click <strong>"Save"</strong>
                      </List.Item>
                    </List>
                  </BlockStack>
                </Box>

                <InlineStack gap="300">
                  <Button
                    url={displayBlockDeepLink}
                    target="_blank"
                    icon={ExternalIcon}
                    variant="primary"
                  >
                    Add Questions Display Block
                  </Button>
                </InlineStack>

                <Banner tone="info">
                  <p>
                    <strong>Tip:</strong> You can customize the block title,
                    enable/disable search, show/hide the "Ask Question" button,
                    and adjust the visual style (block or separator layout).
                  </p>
                </Banner>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Step 3: Add Ask Question Form Block */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="200" blockAlign="center">
                  <Icon
                    source={completedSteps.step3 ? CheckCircleIcon : QuestionCircleIcon}
                    tone={completedSteps.step3 ? "success" : "base"}
                  />
                  <Text variant="headingMd" as="h3">
                    Step 3: Add the Ask Question Form Block (Optional)
                  </Text>
                </InlineStack>
                <Button
                  onClick={() => toggleStep("step3")}
                  variant={completedSteps.step3 ? "primary" : "secondary"}
                >
                  {completedSteps.step3 ? "Completed" : "Mark as done"}
                </Button>
              </InlineStack>

              <Divider />

              <BlockStack gap="300">
                <Text as="p">
                  This block allows customers to submit new questions. It supports
                  AI-powered answers (if enabled) and can be displayed inline or
                  as a modal.
                </Text>

                <Box paddingBlockStart="200">
                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h4">
                      Instructions:
                    </Text>
                    <List type="number">
                      <List.Item>
                        Click the button below to add the form block
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

                <InlineStack gap="300">
                  <Button
                    url={askFormDeepLink}
                    target="_blank"
                    icon={ExternalIcon}
                    variant="primary"
                  >
                    Add Ask Question Form
                  </Button>
                </InlineStack>

                <Banner>
                  <p>
                    <strong>Note:</strong> This block is optional. If you don't
                    add it, the Questions Display block includes a built-in "Ask
                    Question" button that opens a modal with the same
                    functionality.
                  </p>
                </Banner>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Step 4: Preview and Test */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="200" blockAlign="center">
                  <Icon
                    source={completedSteps.step4 ? CheckCircleIcon : QuestionCircleIcon}
                    tone={completedSteps.step4 ? "success" : "base"}
                  />
                  <Text variant="headingMd" as="h3">
                    Step 4: Preview and Test
                  </Text>
                </InlineStack>
                <Button
                  onClick={() => toggleStep("step4")}
                  variant={completedSteps.step4 ? "primary" : "secondary"}
                >
                  {completedSteps.step4 ? "Completed" : "Mark as done"}
                </Button>
              </InlineStack>

              <Divider />

              <BlockStack gap="300">
                <Text as="p">
                  Test your installation to make sure everything works correctly.
                </Text>

                <Box paddingBlockStart="200">
                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h4">
                      What to test:
                    </Text>
                    <List type="bullet">
                      <List.Item>
                        Visit a product page and check if the Q&A blocks are
                        visible
                      </List.Item>
                      <List.Item>
                        Try submitting a test question (use a real email to
                        receive notifications)
                      </List.Item>
                      <List.Item>
                        Test the search functionality (if enabled)
                      </List.Item>
                      <List.Item>Test voting on questions</List.Item>
                      <List.Item>
                        If using AI features, test the AI answer flow
                      </List.Item>
                      <List.Item>
                        Check the admin panel to see the question appear
                      </List.Item>
                    </List>
                  </BlockStack>
                </Box>

                <Banner tone="success">
                  <p>
                    <strong>Success!</strong> Once you've verified everything
                    works, your Q&A app is fully installed and ready for
                    customers to use.
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
                  Block Customization Options
                </Text>

                <Box paddingBlockStart="200">
                  <BlockStack gap="300">
                    <div>
                      <Text as="p" fontWeight="semibold">
                        Questions Display Block:
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
                        Ask Question Form Block:
                      </Text>
                      <List type="bullet">
                        <List.Item>
                          <strong>Display Mode:</strong> Inline form or modal
                          popup
                        </List.Item>
                        <List.Item>
                          <strong>AI Features:</strong> Enable AI-powered instant
                          answers
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
                    <strong>Blocks not showing?</strong> Make sure the app embed
                    is enabled (Step 1)
                  </List.Item>
                  <List.Item>
                    <strong>Styling issues?</strong> Check your theme's CSS for
                    conflicts. You can customize block colors in the theme
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
                  <List.Item>
                    <strong>Need help?</strong> Contact support with your shop
                    domain and a description of the issue
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

        {/* Video Tutorial (Optional) */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Video Tutorial
              </Text>
              <Divider />
              <Text as="p">
                Watch our step-by-step video guide for visual instructions on
                installing and configuring the Q&A app.
              </Text>

              {/* Placeholder for video - replace with actual video URL */}
              <Box
                background="bg-surface-secondary"
                padding="800"
                borderRadius="200"
              >
                <InlineStack align="center" blockAlign="center">
                  <Text as="p" tone="subdued">
                    [Video tutorial coming soon - Add your YouTube/Vimeo embed
                    here]
                  </Text>
                </InlineStack>
              </Box>
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
                <Button url="mailto:support@yourdomain.com">
                  Contact Support
                </Button>
                <Button url="https://yourdomain.com/docs" target="_blank">
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
