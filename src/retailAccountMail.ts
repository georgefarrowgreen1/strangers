import type { Env } from "./http";
import { cleanEmail } from "./email/address";

type MailKind = "verify" | "reset";

export async function sendRetailAccountMail(
  env: Env, origin: string, kind: MailKind, email: string, token: string,
): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;
  const verification = kind === "verify";
  const link = new URL("/account/", origin);
  link.searchParams.set("mode", verification ? "setup" : "reset");
  // A fragment keeps the one-time token out of the storefront's server request and access logs.
  link.hash = "token=" + token;
  const action = verification ? "Create your Strangers account" : "Reset your Strangers password";
  const request = verification ? "You asked to create a Strangers Coffee account." : "You asked to reset your Strangers Coffee password.";
  const configuredSender = env.EMAIL_FROM || "";
  const verifiedAddress = cleanEmail(/<([^<>]+)>/.exec(configuredSender)?.[1] || configuredSender);
  const senderDomain = verifiedAddress ? verifiedAddress.split("@")[1] : "staffstrangerscoffee.com";
  const htmlLink = link.href.replace(/&/g, "&amp;");
  const text = `${request}\n\n${action}: ${link.href}\n\nThis link can be used once. If you didn’t request it, you can ignore this email.`;
  const html = `<p>${request}</p><p><a href="${htmlLink}">${action}</a></p>
    <p>This link can be used once. If you didn’t request it, you can ignore this email.</p>`;

  try {
    const id = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const idempotencyKey = "retail-account-" + Array.from(new Uint8Array(id), byte => byte.toString(16).padStart(2, "0")).join("");
    const response = await fetch(env.RESEND_API_URL || "https://api.resend.com/emails", {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({
        from: `Strangers Coffee <accounts@${senderDomain}>`,
        to: [email], subject: action, text, html,
      }),
    });
    await response.body?.cancel();
    if (!response.ok) console.warn("Retail account email was refused.", response.status);
    return response.ok;
  } catch {
    console.warn("Retail account email delivery could not be confirmed.");
    return false;
  }
}
