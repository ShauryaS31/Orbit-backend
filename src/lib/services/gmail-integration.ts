import {
  resolveCredential,
  resolveToken,
  saveProviderCredentials,
  saveProviderTokens,
} from "@/lib/services/integration-store";

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

type GoogleClientConfigInput = {
  clientId?: string;
  clientSecret?: string;
};

const googleAuthBaseUrl = "https://accounts.google.com/o/oauth2/v2/auth";
const googleTokenUrl = "https://oauth2.googleapis.com/token";
const gmailSendUrl = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const gmailSendScope = "https://www.googleapis.com/auth/gmail.send";

const runtimeTokens: RuntimeGoogleTokens = {};
const validOAuthStates = new Set<string>();

function configuredRedirectUri() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return process.env.GOOGLE_REDIRECT_URI ?? (appUrl ? `${appUrl}/api/integrations/google/callback` : "http://localhost:3000/api/integrations/google/callback");
}

async function configuredRefreshToken() {
  return runtimeTokens.refreshToken ?? await resolveToken("google", "refreshToken", ["GOOGLE_REFRESH_TOKEN", "GMAIL_REFRESH_TOKEN"]);
}

async function googleClientId() {
  return resolveCredential("google", "clientId", ["GOOGLE_CLIENT_ID"]);
}

async function googleClientSecret() {
  return resolveCredential("google", "clientSecret", ["GOOGLE_CLIENT_SECRET"]);
}

function base64UrlEncode(value: string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function assertGoogleClientConfigured() {
  if (!await googleClientId() || !await googleClientSecret()) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured.");
  }
}

async function assertGoogleConnected() {
  const refreshToken = await configuredRefreshToken();
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

export async function getGoogleIntegrationStatus() {
  const refreshToken = await configuredRefreshToken();
  const hasClientId = Boolean(await googleClientId());
  const hasClientSecret = Boolean(await googleClientSecret());
  const hasEnvRefreshToken = Boolean(process.env.GOOGLE_REFRESH_TOKEN ?? process.env.GMAIL_REFRESH_TOKEN);
  const hasStoredRefreshToken = Boolean(await resolveToken("google", "refreshToken"));
  return {
    configured: hasClientId && hasClientSecret,
    redirectUri: configuredRedirectUri(),
    scope: gmailSendScope,
    connected: Boolean(refreshToken || runtimeTokens.accessToken),
    hasClientId,
    hasClientSecret,
    hasEnvRefreshToken,
    hasStoredRefreshToken,
    hasRuntimeRefreshToken: Boolean(runtimeTokens.refreshToken),
    hasAccessToken: Boolean(runtimeTokens.accessToken && (!runtimeTokens.expiresAt || runtimeTokens.expiresAt > Date.now())),
    testRecipientConfigured: Boolean(process.env.GOOGLE_TEST_RECIPIENT ?? process.env.GMAIL_TEST_TO),
    tokenSourceLabel: runtimeTokens.refreshToken
      ? "Runtime token"
      : hasStoredRefreshToken
        ? "Backend store"
        : hasEnvRefreshToken
          ? "Environment"
          : "No refresh token",
  };
}

export async function saveGoogleClientConfig(input: GoogleClientConfigInput) {
  const clientId = input.clientId?.trim();
  const clientSecret = input.clientSecret?.trim();

  await saveProviderCredentials("google", {
    clientId,
    clientSecret,
  });

  return getGoogleIntegrationStatus();
}

export async function createGoogleAuthUrl() {
  await assertGoogleClientConfigured();

  const state = crypto.randomUUID();
  validOAuthStates.add(state);
  const clientId = await googleClientId();
  const params = new URLSearchParams({
    client_id: clientId!,
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
  await assertGoogleClientConfigured();
  const clientId = await googleClientId();
  const clientSecret = await googleClientSecret();

  const strictState = process.env.GOOGLE_OAUTH_STRICT_STATE === "true" || process.env.NODE_ENV === "production";
  if (strictState && state && !validOAuthStates.has(state)) {
    throw new Error("Invalid Google OAuth state.");
  }
  if (state) validOAuthStates.delete(state);

  const payload = await requestGoogleToken(
    new URLSearchParams({
      code,
      client_id: clientId!,
      client_secret: clientSecret!,
      redirect_uri: configuredRedirectUri(),
      grant_type: "authorization_code",
    }),
  );

  runtimeTokens.accessToken = payload.access_token;
  runtimeTokens.refreshToken = payload.refresh_token ?? runtimeTokens.refreshToken;
  runtimeTokens.expiresAt = payload.expires_in ? Date.now() + payload.expires_in * 1000 - 60_000 : undefined;

  if (payload.refresh_token) {
    await saveProviderTokens("google", { refreshToken: payload.refresh_token });
  }

  return {
    connected: true,
    hasRefreshToken: Boolean(runtimeTokens.refreshToken),
    expiresIn: payload.expires_in ?? null,
    scope: payload.scope ?? gmailSendScope,
  };
}

async function getGmailAccessToken() {
  await assertGoogleClientConfigured();
  await assertGoogleConnected();
  const clientId = await googleClientId();
  const clientSecret = await googleClientSecret();

  if (runtimeTokens.accessToken && (!runtimeTokens.expiresAt || runtimeTokens.expiresAt > Date.now())) {
    return runtimeTokens.accessToken;
  }

  const refreshToken = await configuredRefreshToken();
  if (!refreshToken) {
    throw new Error("No Google refresh token available.");
  }

  const payload = await requestGoogleToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId!,
      client_secret: clientSecret!,
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
