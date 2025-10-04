import prisma from "../db.server";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, useFetcher, Form } from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Banner,
  ChoiceList,
  Select,
  Button,
  TextField,
  Checkbox,
  Icon,
  Tooltip,
  Collapsible,
} from "@shopify/polaris";
import { QuestionCircleIcon, ChevronDownIcon, ChevronUpIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;

  const [webhookSettings, emailSettings, helpConfigs, translationConfig] = await Promise.all([
    prisma.webhookSetting.findUnique({ where: { shop } }),
    prisma.emailSetting.findUnique({ where: { shop } }),
    prisma.config.findMany({
      where: {
        key: {
          in: [
            'help.email_notifications',
            'help.webhooks',
            'help.questions',
            'help.translations',
            'help.email_templates'
          ]
        }
      }
    }),
    prisma.config.findUnique({ where: { key: `translations.${shop}` } }),
  ]);

  const helpLinks = helpConfigs.reduce((acc, config) => {
    acc[config.key] = config.value;
    return acc;
  }, {});

  let translationSettings = {};
  if (translationConfig?.value) {
    try {
      translationSettings = JSON.parse(translationConfig.value);
    } catch (error) {
      console.warn(`Failed to parse translation settings for ${shop}:`, error);
    }
  }

  return json({
    webhookSettings: webhookSettings || {},
    emailSettings: emailSettings || {},
    helpLinks,
    translationSettings,
  });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;
  const formData = await request.formData();
  const intent = formData.get("intent");

  // Action for testing SMTP connection
  if (intent === "test-smtp") {
    // ... logic to test connection will be added later
    return json({ testResult: "Not implemented yet." });
  }

  // Default action: Save all settings
  try {
    const webhookData = {
      url: formData.get("url"),
      newQuestion: formData.get("newQuestion") === "true",
      editQuestion: formData.get("editQuestion") === "true",
      deleteQuestion: formData.get("deleteQuestion") === "true",
      newAnswer: formData.get("newAnswer") === "true",
      editAnswer: formData.get("editAnswer") === "true",
      deleteAnswer: formData.get("deleteAnswer") === "true",
      approveQuestion: formData.get("approveQuestion") === "true",
      newVote: formData.get("newVote") === "true",
    };

    const emailData = {
      notificationsEnabled: formData.get("notificationsEnabled") === "true",
      notifyOnNewQuestion: formData.get("notifyOnNewQuestion") === "true",
      autoApproveQuestions: formData.get("autoApproveQuestions") === "true",
      notificationEmails: formData.get("notificationEmails") || null,
      smtpProvider: formData.get("smtpProvider") || "APP",
      smtpHost: formData.get("smtpHost") || null,
      smtpPort: Number(formData.get("smtpPort") || 0),
      smtpUser: formData.get("smtpUser") || null,
      smtpPass: formData.get("smtpPass") || null,
      smtpSecure: formData.get("smtpSecure") === "true",
      // Email templates
      answerEmailSubject: formData.get("answerEmailSubject") || null,
      answerEmailBody: formData.get("answerEmailBody") || null,
      questionPublishedSubject: formData.get("questionPublishedSubject") || null,
      questionPublishedEmailBody: formData.get("questionPublishedEmailBody") || null,
      newQuestionAdminSubject: formData.get("newQuestionAdminSubject") || null,
      newQuestionAdminEmailBody: formData.get("newQuestionAdminEmailBody") || null,
    };

    const translationDataRaw = {
      formSubmittingText: formData.get("translationSubmittingText"),
      formSuccessMessage: formData.get("translationSuccessMessage"),
      formErrorMessage: formData.get("translationErrorMessage"),
      formCharLimitMessage: formData.get("translationCharLimitMessage"),
      displayLoadingText: formData.get("translationLoadingQuestions"),
      displayLoadingMoreText: formData.get("translationLoadingMore"),
      displayErrorText: formData.get("translationLoadError"),
      displayHelpfulText: formData.get("translationHelpfulText"),
      displayVotingText: formData.get("translationVotingText"),
      displayVotedText: formData.get("translationVotedText"),
      displaySearchPlaceholder: formData.get("translationSearchPlaceholder"),
      displayAskedByText: formData.get("translationAskedByText"),
      displayAnsweredByText: formData.get("translationAnsweredByText"),
      displayOnText: formData.get("translationOnDateText"),
      displayDateLocale: formData.get("translationDateLocale"),
      displayDateStyle: formData.get("translationDateStyle"),
    };

    const translationData = Object.fromEntries(
      Object.entries(translationDataRaw)
        .map(([key, value]) => [key, typeof value === "string" ? value.trim() : ""])
        .filter(([, value]) => value !== "")
    );

    await Promise.all([
      prisma.webhookSetting.upsert({
        where: { shop },
        update: webhookData,
        create: { ...webhookData, shop },
      }),
      prisma.emailSetting.upsert({
        where: { shop },
        update: emailData,
        create: { ...emailData, shop },
      }),
      prisma.config.upsert({
        where: { key: `translations.${shop}` },
        update: { value: JSON.stringify(translationData) },
        create: { key: `translations.${shop}`, value: JSON.stringify(translationData) },
      }),
    ]);

    return json({ success: "Settings saved successfully." });
  } catch (error) {
    console.error("Failed to save settings:", error);
    return json({ error: "Failed to save settings. Please try again." }, { status: 500 });
  }
};

export default function SettingsPage() {
  const { webhookSettings, emailSettings, helpLinks, translationSettings } = useLoaderData();
  const actionData = useActionData();
  const fetcher = useFetcher();

  // Combined state for both forms
  const [formState, setFormState] = useState({
    ...webhookSettings,
    ...emailSettings,
    autoApproveQuestions: emailSettings?.autoApproveQuestions || false,
    translationSubmittingText: translationSettings?.formSubmittingText || "",
    translationSuccessMessage: translationSettings?.formSuccessMessage || "",
    translationErrorMessage: translationSettings?.formErrorMessage || "",
    translationCharLimitMessage: translationSettings?.formCharLimitMessage || "",
    translationLoadingQuestions: translationSettings?.displayLoadingText || "",
    translationLoadingMore: translationSettings?.displayLoadingMoreText || "",
    translationLoadError: translationSettings?.displayErrorText || "",
    translationHelpfulText: translationSettings?.displayHelpfulText || "",
    translationVotingText: translationSettings?.displayVotingText || "",
    translationVotedText: translationSettings?.displayVotedText || "",
    translationSearchPlaceholder: translationSettings?.displaySearchPlaceholder || "",
    translationAskedByText: translationSettings?.displayAskedByText || "",
    translationAnsweredByText: translationSettings?.displayAnsweredByText || "",
    translationOnDateText: translationSettings?.displayOnText || "",
    translationDateLocale: translationSettings?.displayDateLocale || "",
    translationDateStyle: translationSettings?.displayDateStyle || "",
  });

  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [showErrorBanner, setShowErrorBanner] = useState(false);
  const [showTestBanner, setShowTestBanner] = useState(false);

  // Email template collapsible states
  const [answerTemplateOpen, setAnswerTemplateOpen] = useState(false);
  const [publishedTemplateOpen, setPublishedTemplateOpen] = useState(false);
  const [adminTemplateOpen, setAdminTemplateOpen] = useState(false);

  const dateStyleOptions = [
    { label: "Browser default", value: "" },
    { label: "Short (Jan 1, 25)", value: "short" },
    { label: "Medium (Jan 1, 2025)", value: "medium" },
    { label: "Long (January 1, 2025)", value: "long" },
    { label: "Full (Saturday, January 1, 2025)", value: "full" },
  ];

  useEffect(() => {
    if (actionData?.success) {
      setShowSuccessBanner(true);
    }
    if (actionData?.error) {
      setShowErrorBanner(true);
    }
  }, [actionData]);

  useEffect(() => {
    if (fetcher.data) {
      setShowTestBanner(true);
    }
  }, [fetcher.data]);

  const handleFormChange = useCallback((key) => (value) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleChoiceListChange = useCallback((key) => (value) => {
    setFormState((prev) => ({ ...prev, [key]: value[0] }));
  }, []);

  const handleTestConnection = useCallback(() => {
    const formData = new FormData();
    formData.append("smtpHost", formState.smtpHost || "");
    formData.append("smtpPort", formState.smtpPort || "");
    formData.append("smtpUser", formState.smtpUser || "");
    formData.append("smtpPass", formState.smtpPass || "");
    formData.append("smtpSecure", formState.smtpSecure ? "true" : "false");
    fetcher.submit(formData, { method: "post", action: "/api/email-test" });
  }, [formState, fetcher]);


  const successBanner = showSuccessBanner && actionData?.success && (
    <Banner title="Success" tone="success" onDismiss={() => setShowSuccessBanner(false)}>
      <p>{actionData.success}</p>
    </Banner>
  );

  const errorBanner = showErrorBanner && actionData?.error && (
    <Banner title="Error" tone="critical" onDismiss={() => setShowErrorBanner(false)}>
      <p>{actionData.error}</p>
    </Banner>
  );

  const testBanner = showTestBanner && fetcher.data && (
    <Banner
      title={fetcher.data.success ? "Success" : "Error"}
      tone={fetcher.data.success ? "success" : "critical"}
      onDismiss={() => setShowTestBanner(false)}
    >
      <p>{fetcher.data.success || fetcher.data.error}</p>
    </Banner>
  );

  return (
    <Page title="Settings">
      <Form method="post">
        <Layout>
          <Layout.Section>
            <BlockStack gap="500">
              {successBanner}
              {errorBanner}
              {testBanner}
            </BlockStack>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd">Questions</Text>
                  <Tooltip content="Help">
                    <Button
                      variant="plain"
                      onClick={helpLinks['help.questions'] ? () => window.open(helpLinks['help.questions'], '_blank') : undefined}
                      disabled={!helpLinks['help.questions']}
                    >
                      <Icon source={QuestionCircleIcon} />
                    </Button>
                  </Tooltip>
                </InlineStack>
                <input type="hidden" name="autoApproveQuestions" value={formState.autoApproveQuestions ? "true" : "false"} />
                <Checkbox
                  label="Auto-approve new questions"
                  checked={formState.autoApproveQuestions}
                  onChange={handleFormChange("autoApproveQuestions")}
                  helpText="If checked, new questions will be published automatically."
                />
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd">Email Notifications</Text>
                  <Tooltip content="Help">
                    <Button
                      variant="plain"
                      onClick={helpLinks['help.email_notifications'] ? () => window.open(helpLinks['help.email_notifications'], '_blank') : undefined}
                      disabled={!helpLinks['help.email_notifications']}
                    >
                      <Icon source={QuestionCircleIcon} />
                    </Button>
                  </Tooltip>
                </InlineStack>
                
                <input type="hidden" name="notificationsEnabled" value={formState.notificationsEnabled ? "true" : "false"} />
                <Checkbox
                  label="Enable Email Notifications"
                  checked={formState.notificationsEnabled}
                  onChange={handleFormChange("notificationsEnabled")}
                  helpText="If checked, emails will be sent for enabled events below. This is the master switch for all email notifications."
                />

                {formState.notificationsEnabled && (
                  <BlockStack gap="500">
                    <input type="hidden" name="notifyOnNewQuestion" value={formState.notifyOnNewQuestion ? "true" : "false"} />
                    <Checkbox
                      label="Notify on New Questions"
                      checked={formState.notifyOnNewQuestion}
                      onChange={handleFormChange("notifyOnNewQuestion")}
                      helpText="Send a notification to administrators when a new question is submitted."
                    />
                    {formState.notifyOnNewQuestion && (
                      <TextField
                        label="Administrator Emails"
                        name="notificationEmails"
                        value={formState.notificationEmails || ""}
                        onChange={handleFormChange("notificationEmails")}
                        helpText="Comma-separated list of emails that will receive notifications."
                        autoComplete="off"
                      />
                    )}

                    <ChoiceList
                      title="Email Provider"
                      choices={[
                        { label: "Use App's Email Provider", value: "APP" },
                        { label: "Use Custom SMTP Server", value: "CUSTOM" },
                      ]}
                      selected={[formState.smtpProvider || "APP"]}
                      onChange={handleChoiceListChange("smtpProvider")}
                    />
                    <input type="hidden" name="smtpProvider" value={formState.smtpProvider || "APP"} />

                    {formState.smtpProvider === 'CUSTOM' && (
                      <BlockStack gap="300">
                        <Text variant="headingSm">Custom SMTP Settings</Text>
                        <TextField label="SMTP Host" name="smtpHost" value={formState.smtpHost || ''} onChange={handleFormChange('smtpHost')} autoComplete="off" />
                        <TextField label="SMTP Port" name="smtpPort" value={formState.smtpPort || ''} onChange={handleFormChange('smtpPort')} autoComplete="off" type="number" />
                        <TextField label="SMTP Username" name="smtpUser" value={formState.smtpUser || ''} onChange={handleFormChange('smtpUser')} autoComplete="off" />
                        <TextField label="SMTP Password" name="smtpPass" value={formState.smtpPass || ''} onChange={handleFormChange('smtpPass')} autoComplete="password" type="password" />
                        <input type="hidden" name="smtpSecure" value={formState.smtpSecure ? "true" : "false"} />
                        <Checkbox label="Use SSL/TLS" checked={formState.smtpSecure} onChange={handleFormChange('smtpSecure')} />
                        <Button onClick={handleTestConnection} disabled={fetcher.state === 'submitting'}>
                          {fetcher.state === 'submitting' ? 'Testing...' : 'Test Connection'}
                        </Button>
                      </BlockStack>
                    )}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd">Webhooks</Text>
                  <Tooltip content="Help">
                    <Button
                      variant="plain"
                      onClick={helpLinks['help.webhooks'] ? () => window.open(helpLinks['help.webhooks'], '_blank') : undefined}
                      disabled={!helpLinks['help.webhooks']}
                    >
                      <Icon source={QuestionCircleIcon} />
                    </Button>
                  </Tooltip>
                </InlineStack>
                <TextField
                  label="Webhook Endpoint URL"
                  name="url"
                  value={formState.url || ""}
                  onChange={handleFormChange("url")}
                  autoComplete="off"
                />
                <BlockStack gap="200">
                  <input type="hidden" name="newQuestion" value={formState.newQuestion ? "true" : "false"} />
                  <Checkbox
                    label="New Question"
                    checked={formState.newQuestion}
                    onChange={handleFormChange("newQuestion")}
                  />
                  <input type="hidden" name="editQuestion" value={formState.editQuestion ? "true" : "false"} />
                  <Checkbox
                    label="Edit Question"
                    checked={formState.editQuestion}
                    onChange={handleFormChange("editQuestion")}
                  />
                  <input type="hidden" name="deleteQuestion" value={formState.deleteQuestion ? "true" : "false"} />
                  <Checkbox
                    label="Delete Question"
                    checked={formState.deleteQuestion}
                    onChange={handleFormChange("deleteQuestion")}
                  />
                  <input type="hidden" name="newAnswer" value={formState.newAnswer ? "true" : "false"} />
                  <Checkbox
                    label="New Answer"
                    checked={formState.newAnswer}
                    onChange={handleFormChange("newAnswer")}
                  />
                  <input type="hidden" name="editAnswer" value={formState.editAnswer ? "true" : "false"} />
                  <Checkbox
                    label="Edit Answer"
                    checked={formState.editAnswer}
                    onChange={handleFormChange("editAnswer")}
                  />
                  <input type="hidden" name="deleteAnswer" value={formState.deleteAnswer ? "true" : "false"} />
                  <Checkbox
                    label="Delete Answer"
                    checked={formState.deleteAnswer}
                    onChange={handleFormChange("deleteAnswer")}
                  />
                  <input type="hidden" name="approveQuestion" value={formState.approveQuestion ? "true" : "false"} />
                  <Checkbox
                    label="Approve Question"
                    checked={formState.approveQuestion}
                    onChange={handleFormChange("approveQuestion")}
                  />
                  <input type="hidden" name="newVote" value={formState.newVote ? "true" : "false"} />
                  <Checkbox
                    label="New Vote"
                    checked={formState.newVote}
                    onChange={handleFormChange("newVote")}
                  />
                </BlockStack>
              </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="500">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd">Translations</Text>
                <Tooltip content="Help">
                  <Button
                    variant="plain"
                    onClick={helpLinks['help.translations'] ? () => window.open(helpLinks['help.translations'], '_blank') : undefined}
                    disabled={!helpLinks['help.translations']}
                  >
                    <Icon source={QuestionCircleIcon} />
                  </Button>
                </Tooltip>
              </InlineStack>
              <Text variant="bodyMd" tone="subdued">
                Customize the customer-facing messages shown in the storefront widget. Leave a field blank to use the default copy.
              </Text>

              <TextField
                label="Submitting Button Text"
                name="translationSubmittingText"
                value={formState.translationSubmittingText || ""}
                onChange={handleFormChange("translationSubmittingText")}
                autoComplete="off"
                placeholder="Submitting..."
              />

              <TextField
                label="Success Message"
                name="translationSuccessMessage"
                value={formState.translationSuccessMessage || ""}
                onChange={handleFormChange("translationSuccessMessage")}
                autoComplete="off"
                placeholder="Thank you! Your question has been submitted successfully."
                multiline
              />

              <TextField
                label="Error Message"
                name="translationErrorMessage"
                value={formState.translationErrorMessage || ""}
                onChange={handleFormChange("translationErrorMessage")}
                autoComplete="off"
                placeholder="Sorry, there was an error submitting your question."
                multiline
              />

              <TextField
                label="Character Limit Message"
                name="translationCharLimitMessage"
                value={formState.translationCharLimitMessage || ""}
                onChange={handleFormChange("translationCharLimitMessage")}
                autoComplete="off"
                placeholder="Your question cannot exceed {{limit}} characters."
                multiline
                helpText="Use {{limit}} to reference the maximum character count."
              />

              <TextField
                label="Loading Questions Message"
                name="translationLoadingQuestions"
                value={formState.translationLoadingQuestions || ""}
                onChange={handleFormChange("translationLoadingQuestions")}
                autoComplete="off"
                placeholder="Loading questions..."
                multiline
              />

              <TextField
                label="Loading More Message"
                name="translationLoadingMore"
                value={formState.translationLoadingMore || ""}
                onChange={handleFormChange("translationLoadingMore")}
                autoComplete="off"
                placeholder="Loading..."
              />

              <TextField
                label="Search Placeholder"
                name="translationSearchPlaceholder"
                value={formState.translationSearchPlaceholder || ""}
                onChange={handleFormChange("translationSearchPlaceholder")}
                autoComplete="off"
                placeholder="Search questions..."
              />

              <TextField
                label="Load Error Message"
                name="translationLoadError"
                value={formState.translationLoadError || ""}
                onChange={handleFormChange("translationLoadError")}
                autoComplete="off"
                placeholder="Failed to load questions. Please try again later."
                multiline
              />

              <TextField
                label="Asked By Prefix"
                name="translationAskedByText"
                value={formState.translationAskedByText || ""}
                onChange={handleFormChange("translationAskedByText")}
                autoComplete="off"
                placeholder="Asked by"
              />

              <TextField
                label="Answered By Prefix"
                name="translationAnsweredByText"
                value={formState.translationAnsweredByText || ""}
                onChange={handleFormChange("translationAnsweredByText")}
                autoComplete="off"
                placeholder="Answered by"
              />

              <TextField
                label="Date Prefix"
                name="translationOnDateText"
                value={formState.translationOnDateText || ""}
                onChange={handleFormChange("translationOnDateText")}
                autoComplete="off"
                placeholder="on"
              />

              <TextField
                label="Date Locale"
                name="translationDateLocale"
                value={formState.translationDateLocale || ""}
                onChange={handleFormChange("translationDateLocale")}
                autoComplete="off"
                placeholder="en-US"
                helpText="Optional locale for dates (e.g. en-US, es-ES). Leave blank to use the shopper's browser locale."
              />

              <Select
                label="Date Style"
                name="translationDateStyle"
                options={dateStyleOptions}
                value={formState.translationDateStyle || ""}
                onChange={handleFormChange("translationDateStyle")}
                helpText="Controls the overall length of the formatted date when translations are applied."
              />

              <TextField
                label="Helpful Button Label"
                name="translationHelpfulText"
                value={formState.translationHelpfulText || ""}
                onChange={handleFormChange("translationHelpfulText")}
                autoComplete="off"
                placeholder="Helpful"
              />

              <TextField
                label="Voting State Label"
                name="translationVotingText"
                value={formState.translationVotingText || ""}
                onChange={handleFormChange("translationVotingText")}
                autoComplete="off"
                placeholder="Voting..."
              />

              <TextField
                label="Voted State Label"
                name="translationVotedText"
                value={formState.translationVotedText || ""}
                onChange={handleFormChange("translationVotedText")}
                autoComplete="off"
                placeholder="Voted!"
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="500">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd">Email Templates</Text>
                <Tooltip content="Help">
                  <Button
                    variant="plain"
                    onClick={helpLinks['help.email_templates'] ? () => window.open(helpLinks['help.email_templates'], '_blank') : undefined}
                    disabled={!helpLinks['help.email_templates']}
                  >
                    <Icon source={QuestionCircleIcon} />
                  </Button>
                </Tooltip>
              </InlineStack>
              <Text variant="bodyMd" tone="subdued">
                Customize the email notifications sent to customers and admins.
              </Text>

                {/* Answer Notification Template */}
                <BlockStack gap="300">
                  <Button
                    onClick={() => setAnswerTemplateOpen(!answerTemplateOpen)}
                    ariaExpanded={answerTemplateOpen}
                    ariaControls="answer-template"
                    icon={answerTemplateOpen ? ChevronUpIcon : ChevronDownIcon}
                    fullWidth
                    textAlign="left"
                  >
                    Answer Notification (to customer)
                  </Button>
                  <Collapsible
                    open={answerTemplateOpen}
                    id="answer-template"
                    transition={{duration: '200ms', timingFunction: 'ease-in-out'}}
                  >
                    <BlockStack gap="300">
                      <Text variant="bodyMd" tone="subdued">
                        Available variables: {'{{customerName}}, {{question}}, {{answer}}, {{productName}}, {{productUrl}}, {{storeName}}'}
                      </Text>
                      <TextField
                        label="Subject"
                        name="answerEmailSubject"
                        value={formState.answerEmailSubject || ''}
                        onChange={handleFormChange('answerEmailSubject')}
                        placeholder="Your question has been answered!"
                      />
                      <TextField
                        label="Body (HTML)"
                        name="answerEmailBody"
                        value={formState.answerEmailBody || ''}
                        onChange={handleFormChange('answerEmailBody')}
                        multiline={8}
                        placeholder="<p>Hi {{customerName}},</p><p>Your question has been answered...</p>"
                      />
                      <Button
                        onClick={() => {
                          setFormState(prev => ({
                            ...prev,
                            answerEmailSubject: null,
                            answerEmailBody: null
                          }));
                        }}
                      >
                        Reset to Default
                      </Button>
                    </BlockStack>
                  </Collapsible>
                </BlockStack>

                {/* Question Published Template */}
                <BlockStack gap="300">
                  <Button
                    onClick={() => setPublishedTemplateOpen(!publishedTemplateOpen)}
                    ariaExpanded={publishedTemplateOpen}
                    ariaControls="published-template"
                    icon={publishedTemplateOpen ? ChevronUpIcon : ChevronDownIcon}
                    fullWidth
                    textAlign="left"
                  >
                    Question Published (to customer)
                  </Button>
                  <Collapsible
                    open={publishedTemplateOpen}
                    id="published-template"
                    transition={{duration: '200ms', timingFunction: 'ease-in-out'}}
                  >
                    <BlockStack gap="300">
                      <Text variant="bodyMd" tone="subdued">
                        Available variables: {'{{customerName}}, {{question}}, {{productName}}, {{productUrl}}, {{storeName}}'}
                      </Text>
                      <TextField
                        label="Subject"
                        name="questionPublishedSubject"
                        value={formState.questionPublishedSubject || ''}
                        onChange={handleFormChange('questionPublishedSubject')}
                        placeholder="Your question has been published!"
                      />
                      <TextField
                        label="Body (HTML)"
                        name="questionPublishedEmailBody"
                        value={formState.questionPublishedEmailBody || ''}
                        onChange={handleFormChange('questionPublishedEmailBody')}
                        multiline={8}
                        placeholder="<p>Hi {{customerName}},</p><p>Your question has been published...</p>"
                      />
                      <Button
                        onClick={() => {
                          setFormState(prev => ({
                            ...prev,
                            questionPublishedSubject: null,
                            questionPublishedEmailBody: null
                          }));
                        }}
                      >
                        Reset to Default
                      </Button>
                    </BlockStack>
                  </Collapsible>
                </BlockStack>

                {/* New Question Admin Template */}
                <BlockStack gap="300">
                  <Button
                    onClick={() => setAdminTemplateOpen(!adminTemplateOpen)}
                    ariaExpanded={adminTemplateOpen}
                    ariaControls="admin-template"
                    icon={adminTemplateOpen ? ChevronUpIcon : ChevronDownIcon}
                    fullWidth
                    textAlign="left"
                  >
                    New Question Notification (to admin)
                  </Button>
                  <Collapsible
                    open={adminTemplateOpen}
                    id="admin-template"
                    transition={{duration: '200ms', timingFunction: 'ease-in-out'}}
                  >
                    <BlockStack gap="300">
                      <Text variant="bodyMd" tone="subdued">
                        Available variables: {'{{customerName}}, {{question}}, {{storeName}}, {{dashboardUrl}}'}
                      </Text>
                      <TextField
                        label="Subject"
                        name="newQuestionAdminSubject"
                        value={formState.newQuestionAdminSubject || ''}
                        onChange={handleFormChange('newQuestionAdminSubject')}
                        placeholder="New Question Submitted on Your Store"
                      />
                      <TextField
                        label="Body (HTML)"
                        name="newQuestionAdminEmailBody"
                        value={formState.newQuestionAdminEmailBody || ''}
                        onChange={handleFormChange('newQuestionAdminEmailBody')}
                        multiline={8}
                        placeholder="<p>A new question has been submitted...</p>"
                      />
                      <Button
                        onClick={() => {
                          setFormState(prev => ({
                            ...prev,
                            newQuestionAdminSubject: null,
                            newQuestionAdminEmailBody: null
                          }));
                        }}
                      >
                        Reset to Default
                      </Button>
                    </BlockStack>
                  </Collapsible>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Button submit fullWidth size="large">Save Settings</Button>
          </Layout.Section>
        </Layout>
      </Form>
    </Page>
  );
}
