type UploadPublicAssetInput = {
  buffer: Buffer;
  objectPath: string;
  contentType: string;
  cacheControl?: string;
};

function normalizeSupabaseUrl(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    return url.origin.replace(/\/$/, "");
  } catch {
    return trimmed
      .replace(/\/rest\/v1\/?$/, "")
      .replace(/\/storage\/v1\/?$/, "")
      .replace(/\/$/, "");
  }
}

function encodeObjectPath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export function getSupabaseStorageConfig() {
  const projectUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim();

  if (!projectUrl || !serviceRoleKey || !bucket) {
    return null;
  }

  return {
    projectUrl,
    serviceRoleKey,
    bucket,
  };
}

export function supabasePublicUrl(objectPath: string): string | null {
  const config = getSupabaseStorageConfig();
  if (!config) return null;

  return `${config.projectUrl}/storage/v1/object/public/${encodeURIComponent(
    config.bucket,
  )}/${encodeObjectPath(objectPath)}`;
}

export async function uploadPublicAsset({
  buffer,
  objectPath,
  contentType,
  cacheControl = "31536000",
}: UploadPublicAssetInput): Promise<string> {
  const config = getSupabaseStorageConfig();
  if (!config) {
    throw new Error(
      "Supabase Storage is not configured. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_STORAGE_BUCKET.",
    );
  }

  const encodedBucket = encodeURIComponent(config.bucket);
  const encodedPath = encodeObjectPath(objectPath);
  const body = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
  const response = await fetch(
    `${config.projectUrl}/storage/v1/object/${encodedBucket}/${encodedPath}`,
    {
      method: "POST",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": contentType,
        "cache-control": cacheControl,
        "x-upsert": "true",
      },
      body: new Blob([body], { type: contentType }),
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Supabase Storage upload failed with ${response.status}: ${body || response.statusText}`,
    );
  }

  const publicUrl = supabasePublicUrl(objectPath);
  if (!publicUrl) {
    throw new Error("Unable to resolve Supabase public URL after upload.");
  }

  return publicUrl;
}
