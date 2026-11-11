import { afterEach, describe, expect, it, vi } from "vitest";

const createTransport = vi.fn();
const sendMail = vi.fn();

vi.doMock("nodemailer", () => ({
  default: { createTransport },
}));

function stubBaseEnv() {
  vi.stubEnv("DATABASE_URL", "postgresql://notipo:notipo@localhost:5432/notipo");
  vi.stubEnv("ENCRYPTION_KEY", "a".repeat(64));
  vi.stubEnv("API_KEY", "test-admin-key");
  vi.stubEnv("NODE_ENV", "test");
}

async function loadEmail() {
  vi.resetModules();
  stubBaseEnv();
  return import("../../src/lib/email.js");
}

afterEach(() => {
  createTransport.mockReset();
  sendMail.mockReset();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sendEmail", () => {
  it("uses SMTP when EMAIL_PROVIDER=smtp, without requiring Resend config", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "smtp");
    vi.stubEnv("SMTP_HOST", "host.containers.internal");
    vi.stubEnv("SMTP_PORT", "25");
    vi.stubEnv("SMTP_SECURE", "false");
    vi.stubEnv("SMTP_IGNORE_TLS", "true");
    vi.stubEnv("EMAIL_FROM", "marshall@zenmediasocial.com");
    vi.stubEnv("BRAND_NAME", "Notipo");
    sendMail.mockResolvedValue({ messageId: "smtp-1" });
    createTransport.mockReturnValue({ sendMail });
    const { sendEmail } = await loadEmail();

    const result = await sendEmail("user@example.com", "Test subject", "<p>Hello</p>", "Hello");

    expect(result).toBe(true);
    expect(createTransport).toHaveBeenCalledWith({
      host: "host.containers.internal",
      port: 25,
      secure: false,
      ignoreTLS: true,
      auth: undefined,
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: "Notipo <marshall@zenmediasocial.com>",
      to: "user@example.com",
      subject: "Test subject",
      html: "<p>Hello</p>",
      text: "Hello",
    });
  });
});
