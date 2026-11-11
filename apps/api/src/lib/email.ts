import nodemailer from "nodemailer";
import { Resend } from "resend";
import { config } from "../config.js";
import { logger } from "./logger.js";

const log = logger.child({ lib: "email" });

/**
 * `text` is optional but worth passing. An HTML-only message with no plain-text
 * alternative is a spam signal: the operator signup notice landed in Gmail's
 * spam folder on 2026-09-05 while the older, plainer notices did not.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text?: string,
): Promise<boolean> {
  const fromEmail = config.EMAIL_FROM || config.RESEND_FROM_EMAIL;
  const provider = (
    config.EMAIL_PROVIDER ||
    (config.SMTP_HOST ? "smtp" : config.RESEND_API_KEY ? "resend" : "")
  ).toLowerCase();

  if (!fromEmail) {
    log.warn("EMAIL_FROM or RESEND_FROM_EMAIL not configured — skipping email");
    return false;
  }

  const from = `${config.BRAND_NAME || "Notipo"} <${fromEmail}>`;

  if (provider === "smtp") {
    if (!config.SMTP_HOST) {
      log.warn("EMAIL_PROVIDER=smtp but SMTP_HOST is not configured — skipping email");
      return false;
    }

    try {
      const transporter = nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT ?? 587,
        secure: config.SMTP_SECURE,
        ignoreTLS: config.SMTP_IGNORE_TLS,
        auth: config.SMTP_USER
          ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD }
          : undefined,
      });
      await transporter.sendMail({
        from,
        to,
        subject,
        html,
        ...(text ? { text } : {}),
      });
      log.info({ to, subject, provider: "smtp" }, "Email sent");
      return true;
    } catch (err) {
      log.error({ err, to, subject, provider: "smtp" }, "Failed to send email");
      return false;
    }
  }

  if (provider === "resend") {
    if (!config.RESEND_API_KEY) {
      log.warn("EMAIL_PROVIDER=resend but RESEND_API_KEY is not configured — skipping email");
      return false;
    }

    try {
      const resend = new Resend(config.RESEND_API_KEY);
      await resend.emails.send({
        from,
        to,
        subject,
        html,
        ...(text ? { text } : {}),
      });
      log.info({ to, subject, provider: "resend" }, "Email sent");
      return true;
    } catch (err) {
      log.error({ err, to, subject, provider: "resend" }, "Failed to send email");
      return false;
    }
  }

  log.warn("No email provider configured — set EMAIL_PROVIDER=smtp or configure Resend; skipping email");
  return false;
}
