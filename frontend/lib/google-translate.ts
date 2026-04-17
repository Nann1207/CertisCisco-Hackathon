import type { LanguagePreference } from "./language-preferences";
import Constants from "expo-constants";

function getDefaultApiUrl() {
  const hostUri = (Constants.expoConfig as { hostUri?: string } | null)?.hostUri;
  const host = hostUri?.split(":")[0] ?? "localhost";
  return `http://${host}:5001/translate`;
}

const API_URL = process.env.EXPO_PUBLIC_TRANSLATE_API_URL ?? getDefaultApiUrl();
const translationCache = new Map<string, string>();
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
  "language",
  "translate",
  "settings",
  "notifications",
  "services",
  "location",
  "supervisor",
  "officer",
  "welcome",
  "back",
  "today",
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
  const trimmed = value.trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);

  // Names are generally 2-3 title-cased words (e.g., "John Tan").
  if (parts.length < 2 || parts.length > 3) return false;
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

export async function translateWithGoogle(text: string, language: LanguagePreference): Promise<string> {
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

  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: protectedResult.text,
      targetLanguage: language,
    }),
  });

  if (!response.ok) {
    return text;
  }

  const body = (await response.json()) as { translatedText?: string };
  const translatedRaw = body.translatedText?.trim() ? body.translatedText : protectedResult.text;
  const translated = restoreSegments(translatedRaw, protectedResult.dictionary);
  translationCache.set(cacheKey, translated);
  return translated;
}
