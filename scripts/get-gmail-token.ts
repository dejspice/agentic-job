/**
 * One-time script to generate a Gmail OAuth2 refresh token.
 *
 * Usage:
 *   GMAIL_CLIENT_ID=xxx GMAIL_CLIENT_SECRET=yyy npx tsx scripts/get-gmail-token.ts
 *
 * Steps:
 *   1. Opens an auth URL in the console
 *   2. You visit the URL, authorize, and paste the code back
 *   3. Script exchanges the code for tokens
 *   4. Prints the refresh token to store in .env
 *
 * Only needs to be run once. The refresh token does not expire
 * unless revoked.
 */

import { createInterface } from "node:readline";
import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

async function main(): Promise<void> {
  const clientId = process.env["GMAIL_CLIENT_ID"];
  const clientSecret = process.env["GMAIL_CLIENT_SECRET"];

  if (!clientId || !clientSecret) {
    console.error("Missing required env vars: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET");
    console.error("Get these from Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID");
    process.exit(1);
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, "urn:ietf:wg:oauth:2.0:oob");

  const authUrl = oauth2.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Gmail OAuth2 Token Generator");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("1. Open this URL in your browser:\n");
  console.log(`   ${authUrl}\n`);
  console.log("2. Authorize the application");
  console.log("3. Copy the authorization code and paste it below\n");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise<string>((resolve) => {
    rl.question("Authorization code: ", (input) => {
      rl.close();
      resolve(input.trim());
    });
  });

  if (!code) {
    console.error("No code provided. Exiting.");
    process.exit(1);
  }

  const { tokens } = await oauth2.getToken(code);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Tokens received successfully");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  if (tokens.refresh_token) {
    console.log("Add this to your .env:\n");
    console.log(`  GMAIL_REFRESH_TOKEN=${tokens.refresh_token}\n`);
  } else {
    console.log("WARNING: No refresh token returned.");
    console.log("This happens if you previously authorized this app.");
    console.log("Revoke access at https://myaccount.google.com/permissions and retry.\n");
  }

  if (tokens.access_token) {
    console.log(`Access token (expires): ${tokens.access_token.substring(0, 20)}...`);
  }
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
