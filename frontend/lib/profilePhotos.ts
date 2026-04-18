import { supabase } from "./supabase";
import type { EmployeeProfile } from "./messageData";

const AVATAR_BUCKET = "profile-photos";
const USE_SIGNED_URL = true;

export const getProfilePhotoUrlFromPath = async (rawPath?: string | null) => {
  const trimmed = rawPath?.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  let path = trimmed.replace(/^\/+/, "");
  if (path.startsWith(`${AVATAR_BUCKET}/`)) {
    path = path.slice(AVATAR_BUCKET.length + 1);
  }
  if (!path) return null;

  if (USE_SIGNED_URL) {
    const { data, error } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(path, 60 * 60);
    if (error) return null;
    return data?.signedUrl ?? null;
  }

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return data.publicUrl ?? null;
};

export const getProfilePhotoUrlFromFolder = async (userId: string) => {
  const folder = `employees/${userId}`;
  const { data: files, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .list(folder, { limit: 10, sortBy: { column: "name", order: "asc" } });

  if (error || !files || files.length === 0) return null;

  const file = files.find((item) => item.name && !item.name.endsWith("/")) ?? files[0];
  if (!file?.name) return null;

  return getProfilePhotoUrlFromPath(`${folder}/${file.name}`);
};

export const resolveProfilePhotoUrl = async (
  profile: Pick<EmployeeProfile, "id" | "emp_id" | "profile_photo_path">
) => {
  return (
    (await getProfilePhotoUrlFromPath(profile.profile_photo_path)) ??
    (await getProfilePhotoUrlFromFolder(profile.id)) ??
    (profile.emp_id ? getProfilePhotoUrlFromFolder(profile.emp_id) : null)
  );
};

export const attachProfilePhotoUrls = async <T extends EmployeeProfile>(profiles: T[]) => {
  return Promise.all(
    profiles.map(async (profile) => ({
      ...profile,
      avatarUrl: await resolveProfilePhotoUrl(profile),
    }))
  );
};
