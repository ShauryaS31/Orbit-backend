import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

type RuntimeGoogleTokens = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
};

type SendGmailMessageInput = {
  to: string;
  subject: string;
  text: string;
};

const googleAuthBaseUrl = "https://accounts.google.com/o/oauth2/v2/auth";
const googleTokenUrl = "https://oauth2.googleapis.com/token";
const gmailSendUrl = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const gmailSendScope = "https://www.googleapis.com/auth/gmail.send";

const runtimeTokens: RuntimeGoogleTokens = {};
const validOAuthStates = new Set<string>();

async function upsertLocalEnvValue(key: string, value: string) {
  const envPath = path.join(process.cwd(), ".env.local");
  let content = "";

  try {
    content = await readFile(envPath, "utf8");
  } catch {
    content = "";
  }

  const lines = content.split(/\r?\n/);
  const keyPattern = new RegExp(`^${key}=`);
  let updated = false;
  const nextLines = lines.map((line) => {
    if (!keyPattern.test(line)) return line;
    updated = true;
    return `${key}=${value}`;
  });

  if (!updated) {
    const trimmedTrailingEmptyLines = nextLines.join("\n").replace(/\n*$/, "");
    await writeFile(envPath, `${trimmedTrailingEmptyLines}\n${key}=${value}\n`, "utf8");
    return;
  }

  await writeFile(envPath, `${nextLines.join("\n").replace(/\n*$/, "")}\n`, "utf8");
}

function configuredRedirectUri() {
  return process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3000/api/integrations/google/callback";
}

function configuredRefreshToken() {
  return runtimeTokens.refreshToken ?? process.env.GOOGLE_REFRESH_TOKEN ?? process.env.GMAIL_REFRESH_TOKEN;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function assertGoogleClientConfigured() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured.");
  }
}

function assertGoogleConnected() {
  const refreshToken = configuredRefreshToken();
  if (!refreshToken && !runtimeTokens.accessToken) {
    throw new Error("Gmail is not connected yet. Visit /api/integrations/google/start first, or set GOOGLE_REFRESH_TOKEN.");
  }
}

async function requestGoogleToken(body: URLSearchParams) {
  const response = await fetch(googleTokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = (await response.json().catch(() => ({}))) as GoogleTokenResponse;

  if (!response.ok) {
    throw new Error(payload.error_description ?? payload.error ?? `Google token request failed with ${response.status}.`);
  }

  return payload;
}

export function getGoogleIntegrationStatus() {
  const refreshToken = configuredRefreshToken();
  return {
    configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    redirectUri: configuredRedirectUri(),
    scope: gmailSendScope,
    connected: Boolean(refreshToken || runtimeTokens.accessToken),
    hasEnvRefreshToken: Boolean(process.env.GOOGLE_REFRESH_TOKEN ?? process.env.GMAIL_REFRESH_TOKEN),
    hasRuntimeRefreshToken: Boolean(runtimeTokens.refreshToken),
    hasAccessToken: Boolean(runtimeTokens.accessToken && (!runtimeTokens.expiresAt || runtimeTokens.expiresAt > Date.now())),
    testRecipientConfigured: Boolean(process.env.GOOGLE_TEST_RECIPIENT ?? process.env.GMAIL_TEST_TO),
  };
}

export function createGoogleAuthUrl() {
  assertGoogleClientConfigured();

  const state = crypto.randomUUID();
  validOAuthStates.add(state);
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: configuredRedirectUri(),
    response_type: "code",
    scope: gmailSendScope,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });

  return `${googleAuthBaseUrl}?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string, state?: string | null) {
  assertGoogleClientConfigured();

  const strictState = process.env.GOOGLE_OAUTH_STRICT_STATE === "true" || process.env.NODE_ENV === "production";
  if (strictState && state && !validOAuthStates.has(state)) {
    throw new Error("Invalid Google OAuth state.");
  }
  if (state) validOAuthStates.delete(state);

  const payload = await requestGoogleToken(
    new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: configuredRedirectUri(),
      grant_type: "authorization_code",
    }),
  );

  runtimeTokens.accessToken = payload.access_token;
  runtimeTokens.refreshToken = payload.refresh_token ?? runtimeTokens.refreshToken;
  runtimeTokens.expiresAt = payload.expires_in ? Date.now() + payload.expires_in * 1000 - 60_000 : undefined;

  if (payload.refresh_token) {
    await upsertLocalEnvValue("GOOGLE_REFRESH_TOKEN", payload.refresh_token);
  }

  return {
    connected: true,
    hasRefreshToken: Boolean(runtimeTokens.refreshToken),
    expiresIn: payload.expires_in ?? null,
    scope: payload.scope ?? gmailSendScope,
  };
}

async function getGmailAccessToken() {
  assertGoogleClientConfigured();
  assertGoogleConnected();

  if (runtimeTokens.accessToken && (!runtimeTokens.expiresAt || runtimeTokens.expiresAt > Date.now())) {
    return runtimeTokens.accessToken;
  }

  const refreshToken = configuredRefreshToken();
  if (!refreshToken) {
    throw new Error("No Google refresh token available.");
  }

  const payload = await requestGoogleToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  );

  runtimeTokens.accessToken = payload.access_token;
  runtimeTokens.expiresAt = payload.expires_in ? Date.now() + payload.expires_in * 1000 - 60_000 : undefined;
  return runtimeTokens.accessToken!;
}

function buildRawEmail({ to, subject, text }: SendGmailMessageInput) {
  const escapedSubject = subject.replace(/\r?\n/g, " ").trim();
  const headers = [
    process.env.GMAIL_FROM ? `From: ${process.env.GMAIL_FROM}` : null,
    `To: ${to}`,
    `Subject: ${escapedSubject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
  ].filter((header): header is string => Boolean(header));

  return [
    ...headers,
    "",
    text,
  ].join("\r\n");
}

export async function sendGmailMessage(input: SendGmailMessageInput) {
  const accessToken = await getGmailAccessToken();
  const response = await fetch(gmailSendUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      raw: base64UrlEncode(buildRawEmail(input)),
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as { id?: string; threadId?: string; error?: { message?: string } };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Gmail send failed with ${response.status}.`);
  }

  return {
    id: payload.id,
    threadId: payload.threadId,
  };
}
