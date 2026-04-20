import { supabase } from "./supabase";

const INCIDENT_IMAGE_BUCKET = "incident-frames";
const INCIDENT_FRAME_URL_TTL_SECONDS = 60 * 10;

type SignedUrlData = {
  signedUrl?: string;
  signedURL?: string;
} | null;

function normalizeIncidentFramePath(rawPath: string) {
  let path = rawPath.trim().replace(/^\/+/, "");
  if (path.startsWith(`${INCIDENT_IMAGE_BUCKET}/`)) {
    path = path.slice(INCIDENT_IMAGE_BUCKET.length + 1);
  }
  return path;
}

function readSignedUrl(data: SignedUrlData) {
  return data?.signedUrl ?? data?.signedURL ?? null;
}

export async function resolveIncidentFrameUrls(rawPaths: Array<string | null | undefined>) {
  const urls = await Promise.all(
    rawPaths.map(async (rawPath) => {
      const trimmed = rawPath?.trim();
      if (!trimmed) return null;
      if (/^https?:\/\//i.test(trimmed)) return trimmed;

      const normalizedPath = normalizeIncidentFramePath(trimmed);
      if (!normalizedPath) return null;

      const { data: signedData, error: signedError } = await supabase.storage
        .from(INCIDENT_IMAGE_BUCKET)
        .createSignedUrl(normalizedPath, INCIDENT_FRAME_URL_TTL_SECONDS);
      const signedUrl = readSignedUrl(signedData as SignedUrlData);
      if (!signedError && signedUrl) return signedUrl;

      const { data: publicData } = supabase.storage.from(INCIDENT_IMAGE_BUCKET).getPublicUrl(normalizedPath);
      return publicData.publicUrl ?? null;
    })
  );

  return urls.filter((item): item is string => Boolean(item));
}
