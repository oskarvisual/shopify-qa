const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

export function isValidEmailAddress(value) {
  const normalized = normalizeEmail(value);
  return normalized.length > 0 && EMAIL_REGEX.test(normalized);
}

export function extractEmailDomain(value) {
  const normalized = normalizeEmail(value);
  const parts = normalized.split("@");
  return parts.length === 2 ? parts[1].toLowerCase() : null;
}

export function validateCustomFromAddress({ smtpUser, smtpFromEmail }) {
  const normalizedUser = normalizeEmail(smtpUser);
  const normalizedFrom = normalizeEmail(smtpFromEmail);

  if (!isValidEmailAddress(normalizedUser)) {
    return { ok: false, error: "SMTP username must be a valid email address." };
  }

  if (normalizedFrom) {
    if (!isValidEmailAddress(normalizedFrom)) {
      return { ok: false, error: "The From email must be a valid email address." };
    }

    const userDomain = extractEmailDomain(normalizedUser);
    const fromDomain = extractEmailDomain(normalizedFrom);

    if (!userDomain || !fromDomain || userDomain !== fromDomain) {
      return {
        ok: false,
        error: "The From email must use the same domain as the SMTP username.",
      };
    }
  }

  return {
    ok: true,
    smtpUser: normalizedUser,
    smtpFromEmail: normalizedFrom || null,
  };
}
