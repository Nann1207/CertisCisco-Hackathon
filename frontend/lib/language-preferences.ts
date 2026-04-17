export type LanguagePreference = "English" | "Tamil" | "Malay" | "Chinese";

let currentLanguagePreference: LanguagePreference = "English";
const listeners = new Set<(value: LanguagePreference) => void>();

export function getLanguagePreference(): LanguagePreference {
  return currentLanguagePreference;
}

export function setLanguagePreference(next: LanguagePreference) {
  if (currentLanguagePreference === next) return;
  currentLanguagePreference = next;
  listeners.forEach((listener) => listener(next));
}

export function subscribeLanguagePreference(listener: (value: LanguagePreference) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
