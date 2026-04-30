import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type IntegrationProviderId = "google" | "linkedin" | "instagram";

export type StoredIntegrationProvider = {
  credentials?: Record<string, string>;
  tokens?: Record<string, string>;
  updatedAt?: string;
};

type IntegrationStore = {
  providers: Partial<Record<IntegrationProviderId, StoredIntegrationProvider>>;
};

const storePath = path.join(process.cwd(), ".orbit-integrations.json");

async function readStore(): Promise<IntegrationStore> {
  try {
    const content = await readFile(storePath, "utf8");
    const parsed = JSON.parse(content) as IntegrationStore;
    return {
      providers: parsed.providers ?? {},
    };
  } catch {
    return { providers: {} };
  }
}

async function writeStore(store: IntegrationStore) {
  await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export async function getStoredProvider(providerId: IntegrationProviderId) {
  const store = await readStore();
  return store.providers[providerId] ?? {};
}

export async function getStoredCredential(providerId: IntegrationProviderId, key: string) {
  const provider = await getStoredProvider(providerId);
  return provider.credentials?.[key]?.trim() || undefined;
}

export async function getStoredToken(providerId: IntegrationProviderId, key: string) {
  const provider = await getStoredProvider(providerId);
  return provider.tokens?.[key]?.trim() || undefined;
}

export async function saveProviderCredentials(providerId: IntegrationProviderId, credentials: Record<string, string | undefined>) {
  const store = await readStore();
  const current = store.providers[providerId] ?? {};
  const nextCredentials = { ...(current.credentials ?? {}) };

  for (const [key, value] of Object.entries(credentials)) {
    const trimmed = value?.trim();
    if (trimmed) nextCredentials[key] = trimmed;
  }

  store.providers[providerId] = {
    ...current,
    credentials: nextCredentials,
    updatedAt: new Date().toISOString(),
  };
  await writeStore(store);
}

export async function saveProviderTokens(providerId: IntegrationProviderId, tokens: Record<string, string | undefined>) {
  const store = await readStore();
  const current = store.providers[providerId] ?? {};
  const nextTokens = { ...(current.tokens ?? {}) };

  for (const [key, value] of Object.entries(tokens)) {
    const trimmed = value?.trim();
    if (trimmed) nextTokens[key] = trimmed;
  }

  store.providers[providerId] = {
    ...current,
    tokens: nextTokens,
    updatedAt: new Date().toISOString(),
  };
  await writeStore(store);
}

export async function hasCredential(providerId: IntegrationProviderId, key: string, envKeys: string[] = []) {
  if (await getStoredCredential(providerId, key)) return true;
  return envKeys.some((envKey) => Boolean(process.env[envKey]?.trim()));
}

export async function resolveCredential(providerId: IntegrationProviderId, key: string, envKeys: string[] = []) {
  const stored = await getStoredCredential(providerId, key);
  if (stored) return stored;
  for (const envKey of envKeys) {
    const value = process.env[envKey]?.trim();
    if (value) return value;
  }
  return undefined;
}

export async function resolveToken(providerId: IntegrationProviderId, key: string, envKeys: string[] = []) {
  const stored = await getStoredToken(providerId, key);
  if (stored) return stored;
  for (const envKey of envKeys) {
    const value = process.env[envKey]?.trim();
    if (value) return value;
  }
  return undefined;
}
