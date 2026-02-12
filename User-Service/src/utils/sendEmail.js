const https = require("https");

const BREVO_API_HOST = "api.brevo.com";
const BREVO_API_PATH = "/v3/smtp/email";

const createError = (message, status = 400) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const parseBrevoError = (rawBody) => {
  try {
    const payload = JSON.parse(rawBody);
    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message.trim();
    }
    if (payload.code && payload.message) {
      return `${payload.code}: ${payload.message}`;
    }
  } catch (_err) {
    return null;
  }
  return null;
};

const sendEmail = async ({ to, subject, text, html }) => {
  const brevoApiKey = process.env.BREVO_API_KEY || process.env.EMAIL_PASS;
  const fromEmail = process.env.EMAIL_FROM;
  const fromName = process.env.EMAIL_FROM_NAME || "MicroSocial";

  if (!brevoApiKey) {
    throw createError("BREVO_API_KEY is required for Brevo");
  }

  if (!fromEmail) {
    throw createError("EMAIL_FROM is required and must be a verified sender in Brevo");
  }

  if (!to || !subject || (!text && !html)) {
    throw createError("Email payload is incomplete");
  }

  const body = JSON.stringify({
    sender: { email: fromEmail, name: fromName },
    to: [{ email: to }],
    subject,
    textContent: text || undefined,
    htmlContent: html || undefined,
  });

  await new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: BREVO_API_HOST,
        path: BREVO_API_PATH,
        method: "POST",
        headers: {
          "api-key": brevoApiKey,
          Accept: "application/json",
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let responseBody = "";

        res.on("data", (chunk) => {
          responseBody += chunk.toString();
        });

        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
            return;
          }

          const brevoMessage =
            parseBrevoError(responseBody) || "Failed to send email via Brevo";

          if (/credit/i.test(brevoMessage)) {
            reject(createError(brevoMessage, 429));
            return;
          }

          const status = res.statusCode >= 500 ? 502 : 400;
          reject(createError(brevoMessage, status));
        });
      },
    );

    req.on("error", (err) => {
      reject(createError(err.message || "Failed to send email", 502));
    });

    req.write(body);
    req.end();
  });
};

module.exports = {
  sendEmail,
};
