import type { LanguagePreference } from "./language-preferences";

let currentPublicLanguagePreference: LanguagePreference = "English";
const listeners = new Set<(value: LanguagePreference) => void>();

export function getPublicLanguagePreference(): LanguagePreference {
  return currentPublicLanguagePreference;
}

export function setPublicLanguagePreference(next: LanguagePreference) {
  if (currentPublicLanguagePreference === next) return;
  currentPublicLanguagePreference = next;
  listeners.forEach((listener) => listener(next));
}

export function subscribePublicLanguagePreference(
  listener: (value: LanguagePreference) => void
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
