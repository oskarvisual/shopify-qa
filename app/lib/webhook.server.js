
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const actionTypeToSettingMap = {
  "question.created": "newQuestion",
  "question.updated": "editQuestion",
  "question.deleted": "deleteQuestion",
  "question.approved": "approveQuestion",
  "answer.created": "newAnswer",
  "answer.updated": "editAnswer",
  "answer.deleted": "deleteAnswer",
};

export const triggerWebhook = async ({ shop, type, payload }) => {
  const webhookSettings = await prisma.webhookSetting.findUnique({
    where: { shop },
  });

  if (!webhookSettings?.url) {
    return;
  }

  const settingName = actionTypeToSettingMap[type];
  if (!settingName || !webhookSettings[settingName]) {
    return;
  }

  try {
    await fetch(webhookSettings.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, payload }),
    });
  } catch (error) {
    console.error(`Failed to send '${type}' webhook:`, error);
  }
};
