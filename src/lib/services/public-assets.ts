function cleanBaseUrl(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    return url.origin.replace(/\/$/, "");
  } catch {
    return trimmed.replace(/\/$/, "");
  }
}

function originFromUrl(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed).origin.replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function publicAssetBaseUrl(): string {
  return (
    cleanBaseUrl(process.env.PUBLIC_ASSET_BASE_URL) ??
    originFromUrl(process.env.INSTAGRAM_REDIRECT_URI) ??
    cleanBaseUrl(process.env.NEXT_PUBLIC_APP_URL) ??
    "http://localhost:3000"
  );
}

export function resolveAbsoluteAssetUrl(urlOrPath: string): string {
  if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
    return urlOrPath;
  }

  const path = urlOrPath.startsWith("/") ? urlOrPath : `/${urlOrPath}`;
  return `${publicAssetBaseUrl()}${path}`;
}
