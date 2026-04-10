/**
 * Gmail Verification Code Poller — auto-detects Greenhouse verification emails.
 *
 * Polls Gmail via the API for verification code emails from Greenhouse,
 * extracts the security code, and returns it for automated entry.
 *
 * Requires OAuth2 credentials:
 *   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
 *
 * Use scripts/get-gmail-token.ts to generate the refresh token once.
 */

import { google } from "googleapis";

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|tr|li|h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#\d+;/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface PollOptions {
  /** Max time to wait for the code. Default 60s. */
  timeoutMs?: number;
  /** Time between poll attempts. Default 3s. */
  pollIntervalMs?: number;
  /** Only look at emails newer than this. Default 120s (2 min). */
  searchWindowMs?: number;
}

function buildGmailClient() {
  const clientId = process.env["GMAIL_CLIENT_ID"];
  const clientSecret = process.env["GMAIL_CLIENT_SECRET"];
  const refreshToken = process.env["GMAIL_REFRESH_TOKEN"];

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth: oauth2 });
}

function extractCodeFromText(text: string): string | null {
  // Pattern 1: bold or standalone code on its own line (Greenhouse format: "kj39KJk9")
  const standaloneRe = /^\s*([A-Za-z0-9]{6,10})\s*$/m;
  const standaloneMatch = text.match(standaloneRe);
  if (standaloneMatch) return standaloneMatch[1]!;

  // Pattern 2: "code: XXXXXX" or "code is XXXXXX"
  const labeledRe = /code[:\s]+([A-Za-z0-9]{6,10})/i;
  const labeledMatch = text.match(labeledRe);
  if (labeledMatch) return labeledMatch[1]!;

  // Pattern 3: alphanumeric sequence that looks like a Greenhouse code
  // Greenhouse codes are 8 chars, mixed case + digits (e.g. "kj39KJk9")
  const codeBlockRe = /\b([A-Za-z0-9]{6,10})\b/g;
  let match;
  while ((match = codeBlockRe.exec(text)) !== null) {
    const candidate = match[1]!;
    // Must have at least one letter and one digit to be a code
    if (/[A-Za-z]/.test(candidate) && /[0-9]/.test(candidate)) {
      return candidate;
    }
  }

  return null;
}

function decodeBase64Url(data: string): string {
  const padded = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf-8");
}

function extractBodyFromParts(parts: Array<{ mimeType?: string; body?: { data?: string }; parts?: unknown[] }>): string {
  let htmlFallback = "";

  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return decodeBase64Url(part.body.data);
    }
    if (part.mimeType === "text/html" && part.body?.data && !htmlFallback) {
      htmlFallback = stripHtml(decodeBase64Url(part.body.data));
    }
    if (part.parts) {
      const nested = extractBodyFromParts(part.parts as typeof parts);
      if (nested) return nested;
    }
  }
  return htmlFallback;
}

/**
 * Poll Gmail for a Greenhouse verification code email.
 *
 * Returns the extracted code string, or null if no code found within the timeout.
 * Never throws — returns null on any error.
 */
export async function pollForVerificationCode(
  options: PollOptions = {},
): Promise<string | null> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const pollIntervalMs = options.pollIntervalMs ?? 3_000;
  const searchWindowMs = options.searchWindowMs ?? 120_000;

  const gmail = buildGmailClient();
  if (!gmail) {
    console.log("[GMAIL] Credentials not configured — skipping poll");
    return null;
  }

  console.log("[GMAIL] Polling for verification code...");

  const deadline = Date.now() + timeoutMs;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt++;
    if (attempt % 5 === 1) {
      console.log(`[GMAIL] Poll attempt ${attempt}...`);
    }

    try {
      const afterEpoch = Math.floor((Date.now() - searchWindowMs) / 1000);
      const query = `from:greenhouse-mail.io subject:"Security code" after:${afterEpoch}`;

      const listRes = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: 3,
      });

      const messages = listRes.data.messages ?? [];

      for (const msg of messages) {
        const fullMsg = await gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
          format: "full",
        });

        let body = "";
        const payload = fullMsg.data.payload;
        if (payload?.body?.data) {
          const raw = decodeBase64Url(payload.body.data);
          body = payload.mimeType === "text/html" ? stripHtml(raw) : raw;
        } else if (payload?.parts) {
          body = extractBodyFromParts(payload.parts as Parameters<typeof extractBodyFromParts>[0]);
        }

        if (!body) continue;

        const code = extractCodeFromText(body);
        if (code) {
          console.log(`[GMAIL] Code found: ${code}`);
          return code;
        }
      }
    } catch (err) {
      if (attempt <= 2) {
        console.log(`[GMAIL] Poll error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  console.log("[GMAIL] Timeout — no code received");
  return null;
}
