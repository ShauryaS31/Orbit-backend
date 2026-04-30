import {
  getStoredCredential,
  hasCredential,
  resolveCredential,
  resolveToken,
  saveProviderTokens,
} from "@/lib/services/integration-store";

type OAuthTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string | { message?: string; type?: string; code?: number; error_subcode?: number; fbtrace_id?: string };
  error_description?: string;
  message?: string;
};

type LinkedInStatus = {
  configured: boolean;
  connected: boolean;
  hasClientId: boolean;
  hasClientSecret: boolean;
  redirectUri: string;
  scope: string;
  tokenSourceLabel: string;
  expiresAt?: string;
};

type InstagramStatus = {
  configured: boolean;
  connected: boolean;
  hasAppId: boolean;
  hasAppSecret: boolean;
  hasMetaAppId: boolean;
  hasMetaAppSecret: boolean;
  redirectUri: string;
  scope: string;
  tokenSourceLabel: string;
  pageName?: string;
  pageId?: string;
  instagramAccountId?: string;
  instagramUsername?: string;
  expiresAt?: string;
};

type MetaPage = {
  id?: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: {
    id?: string;
    username?: string;
    name?: string;
  };
};

const linkedInAuthBaseUrl = "https://www.linkedin.com/oauth/v2/authorization";
const linkedInTokenUrl = "https://www.linkedin.com/oauth/v2/accessToken";
const instagramAuthBaseUrl = "https://www.instagram.com/oauth/authorize";
const instagramShortLivedTokenUrl = "https://api.instagram.com/oauth/access_token";
const instagramGraphBaseUrl = "https://graph.instagram.com";
const metaGraphVersion = process.env.META_GRAPH_VERSION ?? "v20.0";
const metaAuthBaseUrl = `https://www.facebook.com/${metaGraphVersion}/dialog/oauth`;
const metaGraphBaseUrl = `https://graph.facebook.com/${metaGraphVersion}`;

const validOAuthStates = {
  linkedin: new Set<string>(),
  instagram: new Set<string>(),
};

function appBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

function providerRedirectUri(provider: "linkedin" | "instagram") {
  const explicit =
    provider === "linkedin"
      ? process.env.LINKEDIN_REDIRECT_URI
      : process.env.INSTAGRAM_REDIRECT_URI ?? process.env.META_REDIRECT_URI;
  return explicit ?? `${appBaseUrl()}/api/integrations/${provider}/callback`;
}

function linkedInScope() {
  return process.env.LINKEDIN_SCOPES ?? "openid profile w_member_social";
}

function instagramScope() {
  return process.env.INSTAGRAM_SCOPES ?? "instagram_business_basic,instagram_business_content_publish";
}

function isFutureTimestamp(value?: string) {
  if (!value) return false;
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

function sourceLabel(hasStoredToken: boolean, hasEnvToken: boolean, hasRuntime = false) {
  if (hasRuntime) return "Runtime token";
  if (hasStoredToken) return "Backend store";
  if (hasEnvToken) return "Environment";
  return "No access token";
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => ({}))) as T & OAuthTokenResponse;

  if (!response.ok) {
    throw new Error(oauthErrorMessage(payload, response.status));
  }

  return payload;
}

function oauthErrorMessage(payload: OAuthTokenResponse, status: number) {
  if (payload.error_description) return payload.error_description;
  if (payload.message) return payload.message;

  const error = payload.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const parts = [
      error.message,
      error.type ? `type ${error.type}` : "",
      typeof error.code === "number" ? `code ${error.code}` : "",
      typeof error.error_subcode === "number" ? `subcode ${error.error_subcode}` : "",
      error.fbtrace_id ? `trace ${error.fbtrace_id}` : "",
    ].filter(Boolean);
    if (parts.length) return parts.join(" - ");
  }

  return `OAuth request failed with ${status}.`;
}

function assertOAuthState(provider: "linkedin" | "instagram", state?: string | null) {
  const strictState = process.env.OAUTH_STRICT_STATE === "true" || process.env.NODE_ENV === "production";
  if (!state) {
    if (strictState) throw new Error("Missing OAuth state.");
    return;
  }

  const stateSet = validOAuthStates[provider];
  if (strictState && !stateSet.has(state)) {
    throw new Error("Invalid OAuth state.");
  }
  stateSet.delete(state);
}

async function linkedInClientId() {
  return resolveCredential("linkedin", "clientId", ["LINKEDIN_CLIENT_ID"]);
}

async function linkedInClientSecret() {
  return resolveCredential("linkedin", "clientSecret", ["LINKEDIN_CLIENT_SECRET"]);
}

async function instagramAppId() {
  return resolveCredential("instagram", "instagramAppId", ["INSTAGRAM_APP_ID"]);
}

async function instagramAppSecret() {
  return resolveCredential("instagram", "instagramAppSecret", ["INSTAGRAM_APP_SECRET"]);
}

async function metaAppId() {
  return resolveCredential("instagram", "metaAppId", ["META_APP_ID"]) ?? await getStoredCredential("instagram", "appId");
}

async function metaAppSecret() {
  return resolveCredential("instagram", "metaAppSecret", ["META_APP_SECRET"]) ?? await getStoredCredential("instagram", "appSecret");
}

export async function getLinkedInOAuthStatus(): Promise<LinkedInStatus> {
  const hasClientId = Boolean(await linkedInClientId());
  const hasClientSecret = Boolean(await linkedInClientSecret());
  const storedAccessToken = await resolveToken("linkedin", "accessToken");
  const envAccessToken = process.env.LINKEDIN_ACCESS_TOKEN?.trim();
  const expiresAt = await resolveToken("linkedin", "expiresAt", ["LINKEDIN_ACCESS_TOKEN_EXPIRES_AT"]);
  const connected = Boolean(storedAccessToken || envAccessToken) && (!expiresAt || isFutureTimestamp(expiresAt));

  return {
    configured: hasClientId && hasClientSecret,
    connected,
    hasClientId,
    hasClientSecret,
    redirectUri: providerRedirectUri("linkedin"),
    scope: linkedInScope(),
    tokenSourceLabel: sourceLabel(Boolean(storedAccessToken), Boolean(envAccessToken)),
    expiresAt: expiresAt ? new Date(Number(expiresAt)).toISOString() : undefined,
  };
}

export async function createLinkedInAuthUrl() {
  const clientId = await linkedInClientId();
  const clientSecret = await linkedInClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error("LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET must be configured.");
  }

  const state = crypto.randomUUID();
  validOAuthStates.linkedin.add(state);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: providerRedirectUri("linkedin"),
    state,
    scope: linkedInScope(),
  });

  return `${linkedInAuthBaseUrl}?${params.toString()}`;
}

export async function exchangeLinkedInCode(code: string, state?: string | null) {
  assertOAuthState("linkedin", state);
  const clientId = await linkedInClientId();
  const clientSecret = await linkedInClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error("LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET must be configured.");
  }

  const payload = await fetchJson<OAuthTokenResponse>(linkedInTokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: providerRedirectUri("linkedin"),
    }),
  });

  if (!payload.access_token) {
    throw new Error("LinkedIn did not return an access token.");
  }

  await saveProviderTokens("linkedin", {
    accessToken: payload.access_token,
    expiresAt: payload.expires_in ? String(Date.now() + payload.expires_in * 1000 - 60_000) : undefined,
    scope: payload.scope ?? linkedInScope(),
    tokenType: payload.token_type,
  });

  return {
    connected: true,
    expiresIn: payload.expires_in ?? null,
    scope: payload.scope ?? linkedInScope(),
  };
}

export async function getInstagramOAuthStatus(): Promise<InstagramStatus> {
  const hasAppId = Boolean(await instagramAppId());
  const hasAppSecret = Boolean(await instagramAppSecret());
  const hasMetaAppId = Boolean(await metaAppId());
  const hasMetaAppSecret = Boolean(await metaAppSecret());
  const storedAccessToken = await resolveToken("instagram", "accessToken");
  const envAccessToken = process.env.INSTAGRAM_ACCESS_TOKEN?.trim() ?? process.env.META_ACCESS_TOKEN?.trim();
  const expiresAt = await resolveToken("instagram", "expiresAt", ["INSTAGRAM_ACCESS_TOKEN_EXPIRES_AT", "META_ACCESS_TOKEN_EXPIRES_AT"]);
  const instagramAccountId = await resolveToken("instagram", "instagramAccountId", ["INSTAGRAM_ACCOUNT_ID"]);
  const connected = Boolean((storedAccessToken || envAccessToken) && instagramAccountId) && (!expiresAt || isFutureTimestamp(expiresAt));

  return {
    configured: hasAppId && hasAppSecret,
    connected,
    hasAppId,
    hasAppSecret,
    hasMetaAppId,
    hasMetaAppSecret,
    redirectUri: providerRedirectUri("instagram"),
    scope: instagramScope(),
    tokenSourceLabel: sourceLabel(Boolean(storedAccessToken), Boolean(envAccessToken)),
    pageName: await resolveToken("instagram", "pageName"),
    pageId: await resolveToken("instagram", "pageId", ["FACEBOOK_PAGE_ID", "META_PAGE_ID"]),
    instagramAccountId,
    instagramUsername: await resolveToken("instagram", "instagramUsername", ["INSTAGRAM_USERNAME"]),
    expiresAt: expiresAt ? new Date(Number(expiresAt)).toISOString() : undefined,
  };
}

export async function createInstagramAuthUrl() {
  const appId = await instagramAppId();
  const appSecret = await instagramAppSecret();
  if (!appId || !appSecret) {
    throw new Error("INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET from the Instagram API setup must be configured.");
  }

  const state = crypto.randomUUID();
  validOAuthStates.instagram.add(state);

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: providerRedirectUri("instagram"),
    response_type: "code",
    scope: instagramScope(),
    enable_fb_login: "0",
    force_authentication: "1",
    state,
  });

  return `${instagramAuthBaseUrl}?${params.toString()}`;
}

async function discoverInstagramAccount(userAccessToken: string) {
  const params = new URLSearchParams({
    fields: "id,name,access_token,instagram_business_account{id,username,name}",
    access_token: userAccessToken,
  });
  const payload = await fetchJson<{ data?: MetaPage[] }>(`${metaGraphBaseUrl}/me/accounts?${params.toString()}`);
  const pages = payload.data ?? [];
  const page = pages.find((item) => item.instagram_business_account?.id);

  if (!page?.instagram_business_account?.id) {
    throw new Error("Meta OAuth succeeded, but no connected Instagram Business/Creator account was found on the managed Pages.");
  }

  return {
    pageId: page.id,
    pageName: page.name,
    pageAccessToken: page.access_token,
    instagramAccountId: page.instagram_business_account.id,
    instagramUsername: page.instagram_business_account.username ?? page.instagram_business_account.name,
  };
}

export async function exchangeInstagramCode(code: string, state?: string | null) {
  assertOAuthState("instagram", state);
  const appId = await instagramAppId();
  const appSecret = await instagramAppSecret();
  if (!appId || !appSecret) {
    throw new Error("INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET from the Instagram API setup must be configured.");
  }

  const payload = await fetchJson<OAuthTokenResponse & { user_id?: string | number; permissions?: string[] }>(instagramShortLivedTokenUrl, {
    method: "POST",
    body: new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: "authorization_code",
      redirect_uri: providerRedirectUri("instagram"),
      code,
    }),
  });

  if (!payload.access_token) {
    throw new Error("Meta did not return an access token.");
  }

  const longLivedParams = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: appSecret,
    access_token: payload.access_token,
  });
  const longLived = await fetchJson<OAuthTokenResponse>(`${instagramGraphBaseUrl}/access_token?${longLivedParams.toString()}`);
  const accessToken = longLived.access_token ?? payload.access_token;
  const meParams = new URLSearchParams({
    fields: "id,username,account_type",
    access_token: accessToken,
  });
  const me = await fetchJson<{ id?: string; username?: string; account_type?: string }>(`${instagramGraphBaseUrl}/me?${meParams.toString()}`);
  const instagramAccountId = me.id ?? (payload.user_id ? String(payload.user_id) : undefined);

  if (!instagramAccountId) {
    throw new Error("Instagram OAuth succeeded, but no Instagram account id was returned.");
  }

  await saveProviderTokens("instagram", {
    accessToken,
    instagramAccountId,
    instagramUsername: me.username,
    accountType: me.account_type,
    expiresAt: longLived.expires_in ? String(Date.now() + longLived.expires_in * 1000 - 60_000) : undefined,
    scope: instagramScope(),
    permissions: payload.permissions?.join(","),
    tokenType: longLived.token_type ?? payload.token_type,
  });

  return {
    connected: true,
    expiresIn: longLived.expires_in ?? payload.expires_in ?? null,
    scope: instagramScope(),
    instagramAccountId,
    instagramUsername: me.username,
    accountType: me.account_type,
  };
}
