interface VerificationEmailInput {
  to: string;
  code: string;
}

function resendConfigured(): boolean {
  return !!process.env.RESEND_API_KEY?.trim();
}

export function emailVerificationEnabled(): boolean {
  return resendConfigured() || process.env.NODE_ENV !== "production";
}

async function sendEmail(to: string, subject: string, text: string, devLogLabel: string): Promise<void> {
  const from = process.env.EMAIL_FROM?.trim() || "2v2 Basketball <onboarding@resend.dev>";

  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${resendKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Email failed (${res.status})${body ? `: ${body}` : ""}`);
    }
    return;
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(`\n  ${devLogLabel} for ${to}: ${text}\n`);
    return;
  }

  throw new Error("Email is not configured.");
}

export async function sendAdminVerificationEmail({ to, code }: VerificationEmailInput): Promise<void> {
  const appName = process.env.APP_NAME?.trim() || "2v2 Basketball Championship";
  const subject = `${appName} verification code`;
  const text = `Your ${appName} organiser verification code is ${code}. It expires in 15 minutes.`;
  await sendEmail(to, subject, text, "Admin verification code");
}

export async function sendAdminPasswordResetEmail({ to, code }: VerificationEmailInput): Promise<void> {
  const appName = process.env.APP_NAME?.trim() || "2v2 Basketball Championship";
  const subject = `${appName} password reset code`;
  const text = `Your ${appName} organiser password reset code is ${code}. It expires in 15 minutes. If you did not request this, you can ignore this email.`;
  await sendEmail(to, subject, text, "Admin password reset code");
}
