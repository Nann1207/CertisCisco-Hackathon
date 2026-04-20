export type LanguagePreference = "English" | "Tamil" | "Malay" | "Chinese";

let currentLanguagePreference: LanguagePreference = "English";
const listeners = new Set<(value: LanguagePreference) => void>();

export function normalizeLanguagePreference(value: unknown): LanguagePreference | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  if (normalized === "english" || normalized === "en") return "English";
  if (normalized === "tamil" || normalized === "ta") return "Tamil";
  if (normalized === "malay" || normalized === "ms") return "Malay";
  if (normalized === "chinese" || normalized === "zh" || normalized === "zh-cn") return "Chinese";

  return null;
}

export function getLanguagePreference(): LanguagePreference {
  return currentLanguagePreference;
}

export function setLanguagePreference(
  next: LanguagePreference,
  options?: { forceNotify?: boolean }
) {
  const shouldForceNotify = options?.forceNotify ?? false;
  if (currentLanguagePreference === next && !shouldForceNotify) return;
  currentLanguagePreference = next;
  listeners.forEach((listener) => listener(next));
}

export function subscribeLanguagePreference(listener: (value: LanguagePreference) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
