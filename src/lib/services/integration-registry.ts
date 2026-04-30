import {
  hasCredential,
  saveProviderCredentials,
  type IntegrationProviderId,
} from "@/lib/services/integration-store";
import { getGoogleIntegrationStatus, saveGoogleClientConfig } from "@/lib/services/gmail-integration";
import { getInstagramOAuthStatus, getLinkedInOAuthStatus } from "@/lib/services/social-oauth";

type IntegrationField = {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  placeholder: string;
  valueSet: boolean;
};

type IntegrationStatusDetail = {
  label: string;
  value: string;
  ok?: boolean;
};

export type IntegrationProviderView = {
  id: IntegrationProviderId;
  title: string;
  providerLabel: string;
  icon: "mail" | "linkedin" | "instagram";
  description: string;
  status: {
    configured: boolean;
    connected: boolean;
    label: string;
    tone: "success" | "warning" | "muted";
    details: IntegrationStatusDetail[];
  };
  setup: {
    fields: IntegrationField[];
    instructions: string[];
    redirectUri?: string;
    scope?: string;
  };
  actions: {
    connectPath?: string;
    supportsTestEmail?: boolean;
    supportsInstagramPublishTest?: boolean;
  };
};

function statusLabel(configured: boolean, connected: boolean) {
  if (!configured) return "not configured";
  if (!connected) return "needs auth";
  return "ready";
}

function statusTone(configured: boolean, connected: boolean) {
  if (configured && connected) return "success" as const;
  if (configured) return "warning" as const;
  return "muted" as const;
}

export async function getIntegrationProviders(): Promise<IntegrationProviderView[]> {
  const gmail = await getGoogleIntegrationStatus();
  const linkedIn = await getLinkedInOAuthStatus();
  const instagram = await getInstagramOAuthStatus();
  const instagramPublishingMode = instagram.pageId
    ? instagram.pageName ?? instagram.pageId
    : instagram.connected
      ? "Direct Instagram Login"
      : "Pending connection";

  return [
    {
      id: "google",
      title: "Gmail",
      providerLabel: "Google",
      icon: "mail",
      description: "Send approved Orbit email drafts through a connected Gmail account using the native Gmail API.",
      status: {
        configured: gmail.configured,
        connected: gmail.connected,
        label: statusLabel(gmail.configured, gmail.connected),
        tone: statusTone(gmail.configured, gmail.connected),
        details: [
          { label: "App credentials", value: gmail.configured ? "Saved" : "Missing", ok: gmail.configured },
          { label: "OAuth connection", value: gmail.connected ? "Authorized" : "Not authorized", ok: gmail.connected },
          { label: "Token source", value: gmail.tokenSourceLabel, ok: gmail.connected },
          { label: "Test recipient", value: gmail.testRecipientConfigured ? "Configured" : "Optional input", ok: gmail.testRecipientConfigured },
        ],
      },
      setup: {
        fields: [
          {
            key: "clientId",
            label: "GOOGLE_CLIENT_ID",
            secret: true,
            required: true,
            placeholder: "Paste Google OAuth Client ID",
            valueSet: gmail.hasClientId,
          },
          {
            key: "clientSecret",
            label: "GOOGLE_CLIENT_SECRET",
            secret: true,
            required: true,
            placeholder: "Paste Google OAuth Client Secret",
            valueSet: gmail.hasClientSecret,
          },
        ],
        instructions: [
          "Open console.cloud.google.com and sign in with the Google account that owns the Gmail inbox you want to test with.",
          "Use the project selector at the top of Google Cloud Console. Create a new project for Orbit or select the existing project you want to use.",
          "Open APIs & Services > Library. Search for Gmail API, open it, then click Enable. Do not skip this step; OAuth can succeed but sending will fail if the Gmail API is disabled.",
          "Open APIs & Services > OAuth consent screen. Choose External unless this is a Google Workspace-only internal app.",
          "Fill in the app name, support email, and developer contact email. Use names that clearly identify Orbit so the consent screen is not confusing.",
          "On the Scopes step, add the Gmail send scope: https://www.googleapis.com/auth/gmail.send. This lets Orbit send email but does not grant full mailbox read access.",
          "On the Test users step, add the Gmail account that will connect Orbit. In testing mode, OAuth only works for listed test users.",
          "Save the OAuth consent screen. Publishing the consent screen is not required for local development with your own test users.",
          "Open APIs & Services > Credentials. Click Create credentials, then choose OAuth client ID.",
          "For Application type, choose Web application. Do not choose Desktop app, Android, iOS, or Chrome extension.",
          "Give the OAuth client a clear name, such as Orbit Local Gmail.",
          "In Authorized redirect URIs, add the redirect URI shown on this Orbit card exactly. The protocol, domain, port, path, and trailing slash must match exactly.",
          "Click Create. Google will show a Client ID and Client Secret.",
          "Copy the Client ID into GOOGLE_CLIENT_ID on this page. Copy the Client Secret into GOOGLE_CLIENT_SECRET on this page.",
          "Click Save Credentials in Orbit. The App credentials status should change from Missing to Saved.",
          "Click Connect or Reconnect. Google should show the OAuth consent screen for the test Gmail account.",
          "Approve the Gmail send permission. After Google redirects back, refresh the Integrations page and confirm OAuth connection says Authorized.",
          "Use Send Test with a real recipient address. If it fails, check that the Gmail API is enabled, the redirect URI is exact, and the connected account is listed as a test user.",
          "For production, complete Google's OAuth app verification before letting arbitrary users connect their Gmail accounts.",
        ],
        redirectUri: gmail.redirectUri,
        scope: gmail.scope,
      },
      actions: {
        connectPath: "/api/integrations/google/start",
        supportsTestEmail: true,
      },
    },
    {
      id: "linkedin",
      title: "LinkedIn",
      providerLabel: "LinkedIn",
      icon: "linkedin",
      description: "Publish approved LinkedIn posts once the LinkedIn app OAuth flow and posting permissions are connected.",
      status: {
        configured: linkedIn.configured,
        connected: linkedIn.connected,
        label: statusLabel(linkedIn.configured, linkedIn.connected),
        tone: statusTone(linkedIn.configured, linkedIn.connected),
        details: [
          { label: "App credentials", value: linkedIn.configured ? "Saved" : "Missing", ok: linkedIn.configured },
          { label: "OAuth connection", value: linkedIn.connected ? "Authorized" : "Not authorized", ok: linkedIn.connected },
          { label: "Token source", value: linkedIn.tokenSourceLabel, ok: linkedIn.connected },
          { label: "Token expiry", value: linkedIn.expiresAt ?? "Unknown", ok: linkedIn.connected },
        ],
      },
      setup: {
        fields: [
          {
            key: "clientId",
            label: "LINKEDIN_CLIENT_ID",
            secret: true,
            required: true,
            placeholder: "Paste LinkedIn Client ID",
            valueSet: await hasCredential("linkedin", "clientId", ["LINKEDIN_CLIENT_ID"]),
          },
          {
            key: "clientSecret",
            label: "LINKEDIN_CLIENT_SECRET",
            secret: true,
            required: true,
            placeholder: "Paste LinkedIn Client Secret",
            valueSet: await hasCredential("linkedin", "clientSecret", ["LINKEDIN_CLIENT_SECRET"]),
          },
        ],
        instructions: [
          "Open developer.linkedin.com and sign in with the LinkedIn account that owns or manages the app.",
          "Open My Apps. Create a new app or open the existing Orbit app if you already made one.",
          "When creating a new app, choose a clear app name, add your company/page association if LinkedIn asks for it, upload a logo if required, and complete the required business details.",
          "After the app is created, open the Auth tab. This is where LinkedIn shows the Client ID and Client Secret.",
          "Copy the Client ID into LINKEDIN_CLIENT_ID on this Orbit page.",
          "Copy the Client Secret into LINKEDIN_CLIENT_SECRET on this Orbit page. Treat it like a password; LinkedIn may not let you reveal or regenerate it freely later.",
          "Click Save Credentials in Orbit. The App credentials status should change from Missing to Saved.",
          "In the LinkedIn app Auth settings, add Orbit's LinkedIn OAuth redirect URL once Orbit shows one. The URL must match exactly, including protocol, port, path, and trailing slash.",
          "Open the Products tab in the LinkedIn Developer app. Request or enable the product that supports Sign In and sharing/posting for your use case.",
          "For posting to a member profile, the app needs the member social posting permission LinkedIn exposes for your approved product. For company/page posting, the app needs organization social permissions and the connected user must have the right Page role.",
          "Do not assume a permission is active just because the app exists. LinkedIn often gates sharing permissions behind product access or review.",
          "Keep the app in a test/internal state while developing. Use only accounts that are allowed for the app and do not run repeated publishing tests on a personal profile.",
          "Orbit should use LinkedIn in manual handoff or sandbox mode until the official OAuth and posting route is approved and stable.",
          "When real posting is enabled, every LinkedIn post should require an explicit user approval click. Do not let agents silently publish to LinkedIn.",
          "Never collect LinkedIn passwords, scrape LinkedIn pages, automate browser activity, auto-comment, auto-message, auto-connect, or try to bypass LinkedIn rate limits.",
          "If LinkedIn rejects a publish request later, check the app product access, requested scopes, OAuth redirect URL, token expiry, and whether the posting target is a member profile or organization page.",
        ],
        redirectUri: linkedIn.redirectUri,
        scope: linkedIn.scope,
      },
      actions: {
        connectPath: "/api/integrations/linkedin/start",
      },
    },
    {
      id: "instagram",
      title: "Instagram",
      providerLabel: "Meta",
      icon: "instagram",
      description: "Publish approved Instagram captions and media after Meta app, account permissions, and media hosting are connected.",
      status: {
        configured: instagram.configured,
        connected: instagram.connected,
        label: statusLabel(instagram.configured, instagram.connected),
        tone: statusTone(instagram.configured, instagram.connected),
        details: [
          { label: "App credentials", value: instagram.configured ? "Saved" : "Missing", ok: instagram.configured },
          { label: "OAuth connection", value: instagram.connected ? "Authorized" : "Not authorized", ok: instagram.connected },
          { label: "IG account", value: instagram.instagramUsername ?? instagram.instagramAccountId ?? "Not found", ok: Boolean(instagram.instagramAccountId) },
          { label: "Publishing mode", value: instagramPublishingMode, ok: instagram.connected },
          { label: "Token source", value: instagram.tokenSourceLabel, ok: instagram.connected },
          { label: "Token expiry", value: instagram.expiresAt ?? "Unknown", ok: instagram.connected },
        ],
      },
      setup: {
        fields: [
          {
            key: "instagramAppId",
            label: "INSTAGRAM_APP_ID",
            secret: true,
            required: true,
            placeholder: "Paste the Instagram App ID from API setup with Instagram Login",
            valueSet: await hasCredential("instagram", "instagramAppId", ["INSTAGRAM_APP_ID"]),
          },
          {
            key: "instagramAppSecret",
            label: "INSTAGRAM_APP_SECRET",
            secret: true,
            required: true,
            placeholder: "Paste the Instagram App Secret from API setup with Instagram Login",
            valueSet: await hasCredential("instagram", "instagramAppSecret", ["INSTAGRAM_APP_SECRET"]),
          },
          {
            key: "metaAppId",
            label: "META_APP_ID",
            secret: true,
            required: false,
            placeholder: "Optional: main Meta/Facebook App ID from App settings > Basic",
            valueSet: instagram.hasMetaAppId,
          },
          {
            key: "metaAppSecret",
            label: "META_APP_SECRET",
            secret: true,
            required: false,
            placeholder: "Optional: main Meta/Facebook App Secret from App settings > Basic",
            valueSet: instagram.hasMetaAppSecret,
          },
        ],
        instructions: [
          "Before opening Meta, confirm the Instagram account is Professional. In Instagram, go to Settings and activity > Account type and tools, then switch to Business or Creator if it is still Personal.",
          "Open developers.facebook.com and sign in with the Meta/Facebook account that owns or manages the developer app.",
          "Open My Apps, then click Create App. If Meta asks for an app type or use case, choose a business/consumer app path that supports Instagram or Facebook Login. Avoid game, workplace, or unsupported app types.",
          "Give the app a clear name, add your contact email, select or create a Business Portfolio if Meta asks for one, then create the app.",
          "In the app dashboard, open Use cases or Instagram, then open the Instagram use case / API setup with Instagram Login page.",
          "Copy the Instagram App ID from that Instagram setup page. Paste it into INSTAGRAM_APP_ID on this Orbit page.",
          "Copy the Instagram App Secret from that same Instagram setup page. Paste it into INSTAGRAM_APP_SECRET on this Orbit page.",
          "If Meta also shows a main App ID and App Secret under App settings > Basic, those are a separate credential pair. You may paste them into META_APP_ID and META_APP_SECRET for reference/fallback, but the current Orbit Instagram Connect button uses the Instagram App ID and Instagram App Secret.",
          "Do not mix pairs. The Instagram App ID must be used with the Instagram App Secret. The main Meta App ID must be used with the main Meta App Secret.",
          "Click Save Credentials in Orbit. The page should change App credentials from Missing to Saved after the backend stores the values.",
          "In the Instagram setup page, add the Orbit Instagram Redirect URI exactly as shown. The protocol, domain, port, path, and trailing slash must match exactly.",
          "Add the required Instagram Login permissions for publishing: instagram_business_basic and instagram_business_content_publish.",
          "Add your Instagram account as an Instagram tester/developer/admin if the app is in development mode. The Instagram account may need to accept the tester invite from Instagram settings before OAuth works.",
          "Click Connect in Orbit. The login screen should be Instagram-branded, not the Facebook Page picker.",
          "After approval, Orbit exchanges the code for an Instagram token, upgrades it to a long-lived token, then reads /me from graph.instagram.com to store the Instagram account ID and username.",
          "If OAuth says invalid client id, you probably pasted the main Meta App ID instead of the Instagram App ID.",
          "If OAuth says error validating client secret, you probably mixed the Instagram App ID with the main Meta App Secret, or the main Meta App ID with the Instagram App Secret.",
          "For local testing, keep the Meta app in development mode and use only your own app-role accounts. For real customer accounts, submit the app for Meta App Review before switching to live use.",
          "Orbit should publish only after a user approval click. Do not use unofficial Instagram automation, password collection, browser bots, or scraping.",
        ],
        redirectUri: instagram.redirectUri,
        scope: instagram.scope,
      },
      actions: {
        connectPath: "/api/integrations/instagram/start",
        supportsInstagramPublishTest: true,
      },
    },
  ];
}

export async function saveIntegrationProviderConfig(providerId: IntegrationProviderId, values: Record<string, string | undefined>) {
  if (providerId === "google") {
    await saveGoogleClientConfig({
      clientId: values.clientId,
      clientSecret: values.clientSecret,
    });
  } else {
    await saveProviderCredentials(providerId, values);
  }

  return getIntegrationProviders();
}

export function isIntegrationProviderId(value: string): value is IntegrationProviderId {
  return value === "google" || value === "linkedin" || value === "instagram";
}
