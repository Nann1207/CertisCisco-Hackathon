import type { LanguagePreference } from "./language-preferences";
import Constants from "expo-constants";
import { Alert } from "react-native";

function getDefaultApiUrl() {
  const hostUri = (Constants.expoConfig as { hostUri?: string } | null)?.hostUri;
  const host = hostUri?.split(":")[0] ?? "localhost";
  return `http://${host}:5001/translate`;
}

const API_URL = process.env.EXPO_PUBLIC_TRANSLATE_API_URL ?? getDefaultApiUrl();
const translationCache = new Map<string, string>();
let translationDownAlertShown = false;
const PROTECTED_BRANDS = ["Certis", "Cisco", "Fortis", "Supabase", "Expo", "GPS"];
const UI_NON_NAME_WORDS = new Set([
  "incidents",
  "incident",
  "upcoming",
  "schedule",
  "home",
  "report",
  "reports",
  "shift",
  "clock",
  "in",
  "out",
  "language",
  "languages",
  "translate",
  "settings",
  "notifications",
  "notification",
  "services",
  "service",
  "location",
  "address",
  "supervisor",
  "officer",
  "security",
  "senior",
  "welcome",
  "back",
  "today",
  "user",
  "profile",
  "sign",
  "first",
  "last",
  "name",
  "date",
  "birth",
  "age",
  "email",
  "phone",
  "number",
  "save",
  "saving",
  "load",
  "failed",
  "update",
  "updated",
  "current",
  "preference",
  "preferences",
  "choose",
  "cancel",
  "guidelines",
  "logistics",
  "operation",
]);
const LOCATION_SUFFIXES = [
  "Road",
  "Rd",
  "Street",
  "St",
  "Avenue",
  "Ave",
  "Boulevard",
  "Blvd",
  "Lane",
  "Ln",
  "Drive",
  "Dr",
  "Park",
  "Plaza",
  "Tower",
  "Mall",
  "Station",
  "Terminal",
  "Airport",
  "MRT",
  "Centre",
  "Center",
];
const NUMBER_PATTERN = /\b\d+(?:[.,:/-]\d+)*\b/g;
const ALPHANUMERIC_ID_PATTERN = /\b[A-Za-z]*\d+[A-Za-z0-9_-]*\b/g;
const LOCATION_FIELD_PATTERN = /\b(Location|Address)\s*:\s*([^\n]+)/gi;
const TIME_PATTERN = /\b(?:[01]?\d|2[0-3])[:.][0-5]\d(?:\s?(?:AM|PM|A\.M\.|P\.M\.))?\b/gi;
const AM_PM_PATTERN = /\b(?:AM|PM|A\.M\.|P\.M\.)\b/gi;
const ADDRESS_MARKER_PATTERN = /\b(?:Blk|Block|Unit|#\d{1,3}-\d{1,4}|Singapore\s*\d{6})\b/i;
const POSTAL_CODE_PATTERN = /\b\d{6}\b/;
const ADDRESS_CHUNK_PATTERN =
  /\b(?:Blk|Block)\s*\d+[A-Za-z]?(?:\s+[A-Za-z0-9#(),./-]+){0,12}\b/gi;
const SINGAPORE_ADDRESS_PATTERN =
  /\b[0-9A-Za-z#(),./-]+(?:\s+[0-9A-Za-z#(),./-]+){1,12},\s*Singapore\s*\d{6}\b/gi;
const GREETING_WITH_NAME_PATTERN =
  /\b(?:Hi|Hello|Welcome)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})(?=[!,.?]|\b)/g;
const ROLE_LABEL_WITH_NAME_PATTERN =
  /\b(?:Supervisor|Officer|Name)\s*:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g;

type ProtectedResult = {
  text: string;
  dictionary: Array<{ token: string; original: string }>;
};

function buildCacheKey(language: LanguagePreference, text: string) {
  return `${language}::${text}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isLikelyPersonName(value: string) {
  const trimmed = value.trim().replace(/[!,.?:;]+$/g, "");
  const parts = trimmed.split(/\s+/).filter(Boolean);

  // Names are generally 1-3 title-cased words (e.g., "Anthony", "John Tan").
  if (parts.length < 1 || parts.length > 3) return false;
  if (!parts.every((part) => /^[A-Z][a-z]+$/.test(part))) return false;

  const hasUiWord = parts.some((part) => UI_NON_NAME_WORDS.has(part.toLowerCase()));
  if (hasUiWord) return false;

  return true;
}

function isLikelyLocationName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;

  const suffixPattern = new RegExp(`\\b(?:${LOCATION_SUFFIXES.join("|")})\\b`, "i");
  if (suffixPattern.test(trimmed)) return true;

  return false;
}

function isLikelyAddress(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;

  const hasDigit = /\d/.test(trimmed);
  const hasLocationSuffix = new RegExp(`\\b(?:${LOCATION_SUFFIXES.join("|")})\\b`, "i").test(trimmed);
  const hasAddressMarker = ADDRESS_MARKER_PATTERN.test(trimmed);
  const hasPostalCode = POSTAL_CODE_PATTERN.test(trimmed);

  if (hasAddressMarker && hasDigit) return true;
  if (hasPostalCode && /\bSingapore\b/i.test(trimmed)) return true;
  if (hasDigit && hasLocationSuffix) return true;

  return false;
}

function protectSegments(input: string): ProtectedResult {
  let working = input;
  const dictionary: Array<{ token: string; original: string }> = [];
  let tokenIndex = 0;

  const register = (original: string) => {
    const token = `[[NT_${tokenIndex++}]]`;
    dictionary.push({ token, original });
    return token;
  };

  working = working.replace(TIME_PATTERN, (match) => register(match));
  working = working.replace(AM_PM_PATTERN, (match) => register(match));
  working = working.replace(NUMBER_PATTERN, (match) => register(match));
  working = working.replace(ALPHANUMERIC_ID_PATTERN, (match) => register(match));

  for (const brand of PROTECTED_BRANDS) {
    const regex = new RegExp(`\\b${escapeRegExp(brand)}\\b`, "gi");
    working = working.replace(regex, (match) => register(match));
  }

  // Preserve likely human names in common greeting and role label phrases.
  working = working.replace(GREETING_WITH_NAME_PATTERN, (fullMatch, name: string) => {
    if (!isLikelyPersonName(name)) return fullMatch;
    return fullMatch.replace(name, register(name));
  });

  working = working.replace(ROLE_LABEL_WITH_NAME_PATTERN, (fullMatch, name: string) => {
    if (!isLikelyPersonName(name)) return fullMatch;
    return fullMatch.replace(name, register(name));
  });

  working = working.replace(LOCATION_FIELD_PATTERN, (fullMatch, label: string, value: string) => {
    const safeValue = value.trim();
    if (!safeValue) return fullMatch;
    return `${label}: ${register(safeValue)}`;
  });

  working = working.replace(SINGAPORE_ADDRESS_PATTERN, (match) => register(match));
  working = working.replace(ADDRESS_CHUNK_PATTERN, (match) => register(match));

  const locationPhrasePattern = new RegExp(
    `\\b([A-Z][A-Za-z0-9'().-]*(?:\\s+[A-Z0-9][A-Za-z0-9'().-]*)*\\s+(?:${LOCATION_SUFFIXES.join("|")}))\\b`,
    "g"
  );
  working = working.replace(locationPhrasePattern, (match) => register(match));

  return { text: working, dictionary };
}

function restoreSegments(input: string, dictionary: Array<{ token: string; original: string }>) {
  let restored = input;
  for (const item of dictionary) {
    restored = restored.split(item.token).join(item.original);
  }
  return restored;
}

function hasAnyLetter(value: string) {
  return /[A-Za-z]/.test(value);
}

function isAllUpper(value: string) {
  return hasAnyLetter(value) && value === value.toUpperCase();
}

function isAllLower(value: string) {
  return hasAnyLetter(value) && value === value.toLowerCase();
}

function isSentenceStyle(value: string) {
  const trimmed = value.trim();
  if (!trimmed || !hasAnyLetter(trimmed)) return false;

  const firstLetterMatch = trimmed.match(/[A-Za-z]/);
  if (!firstLetterMatch || typeof firstLetterMatch.index !== "number") return false;

  const firstLetterIndex = firstLetterMatch.index;
  const firstLetter = trimmed[firstLetterIndex];
  if (firstLetter !== firstLetter.toUpperCase()) return false;

  const remainder = trimmed.slice(firstLetterIndex + 1);
  const lettersOnly = remainder.replace(/[^A-Za-z]/g, "");
  if (!lettersOnly) return true;

  return lettersOnly === lettersOnly.toLowerCase();
}

function applySourceCasing(source: string, translated: string) {
  if (!translated.trim()) return translated;

  if (isAllUpper(source)) {
    return translated.toUpperCase();
  }

  if (isAllLower(source)) {
    return translated.toLowerCase();
  }

  if (isSentenceStyle(source)) {
    const firstLetterMatch = translated.match(/[A-Za-z]/);
    if (!firstLetterMatch || typeof firstLetterMatch.index !== "number") {
      return translated;
    }

    const firstLetterIndex = firstLetterMatch.index;
    const head = translated.slice(0, firstLetterIndex);
    const first = translated[firstLetterIndex].toUpperCase();
    const tail = translated.slice(firstLetterIndex + 1);
    return `${head}${first}${tail}`;
  }

  return translated;
}

function showTranslationDownAlert(message: string, technicalError?: string) {
  if (translationDownAlertShown) return;
  translationDownAlertShown = true;

  const detail = __DEV__ && technicalError ? `\n\nTechnical details: ${technicalError}` : "";
  Alert.alert("Translation currently down", `${message}${detail}`);
}

export async function translateText(text: string, language: LanguagePreference): Promise<string> {
  const normalized = text.trim();
  if (!normalized || language === "English") {
    return text;
  }

  if (isLikelyPersonName(normalized)) {
    return text;
  }

  if (isLikelyLocationName(normalized)) {
    return text;
  }

  if (isLikelyAddress(normalized)) {
    return text;
  }

  const protectedResult = protectSegments(text);

  // If everything is protected fragments only, keep original as-is.
  if (!protectedResult.text.replace(/\[\[NT_\d+\]\]/g, "").trim()) {
    return text;
  }

  const cacheKey = buildCacheKey(language, text);
  const cached = translationCache.get(cacheKey);
  if (cached) return cached;

  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: protectedResult.text,
        targetLanguage: language,
      }),
    });
  } catch {
    showTranslationDownAlert(
      "Translation is currently down. Your content is still available in English, and we will restore translation shortly."
    );
    return text;
  }

  if (!response.ok) {
    showTranslationDownAlert(
      "Translation is currently down. Your content is still available in English, and we will restore translation shortly.",
      `HTTP ${response.status}`
    );
    return text;
  }

  const body = (await response.json()) as {
    translatedText?: string;
    translationStatus?: string;
    userMessage?: string;
    technicalError?: string;
  };

  if (body.translationStatus === "down") {
    showTranslationDownAlert(
      body.userMessage ??
        "Translation is currently down. Your content is still available in English, and we will restore translation shortly.",
      body.technicalError
    );
    return text;
  }

  const translatedRaw = body.translatedText?.trim() ? body.translatedText : protectedResult.text;
  const restored = restoreSegments(translatedRaw, protectedResult.dictionary);
  const translated = applySourceCasing(text, restored);
  translationCache.set(cacheKey, translated);
  return translated;
}

export const translateWithGoogle = translateText;
