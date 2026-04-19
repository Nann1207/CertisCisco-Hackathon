import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { AlertTriangle, Check, ChevronLeft, ClipboardPen, ListChecks, PhoneCall, SendHorizontal } from "lucide-react-native";
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import Text from "../../components/TranslatedText";
import { supabase } from "../../lib/supabase";
import { askSeaLion, isSeaLionConfigured } from "../../lib/sealion";

type BotReply = {
  id: string;
  title: string;
  body: React.ReactNode;
  time: string;
  suggestions?: string[];
};

type DynamicReply = {
  id: string;
  question: string;
  answer: string;
  time: string;
  loading: boolean;
  showGuide: boolean;
};

type ShiftReportTarget = {
  shift_id: string;
  shift_description: string | null;
  shift_date: string | null;
  clockin_time: string | null;
  clockout_time: string | null;
};

type ActiveIncident = {
  id: string;
  incident_category: string | null;
  location_name: string | null;
  location_unit_no: string | null;
  location_description: string | null;
  created_at: string | null;
  assigned_at: string | null;
};

type SopStep = {
  step_no: number;
  step_short: string | null;
  step_description: string | null;
};

const FIRE_QUICK_REPLIES = [
  "Show evacuation steps",
  "Escalation contacts",
  "Mark evacuation complete",
  "Location of fire alarm",
];

const GENERIC_QUICK_REPLIES = [
  "Show SOP steps",
  "Escalation contacts",
  "Logistics needed",
];

const BASE_RESPONSE_RULES = `Role: Security officer response assistant.
Response rules:
- Adapt to the officer's latest update. If the officer says something cannot be done, do not simply repeat that step. Give the next best contingency.
- For "cannot contact control room", give practical alternatives (retry other channel, escalate to supervisor/nearby officer relay, proceed with life-safety steps).
- Use 3 to 5 short numbered steps.
- Use plain text only. Do not use markdown, bold markers, headings, or asterisks.
- Do not invent names, phone numbers, or building details that are not provided.`;

const CONVO_BOT_IMAGE = require("./assets/robot.png");

type SessionChatState = {
  replies: DynamicReply[];
  showFullSteps: boolean;
};

const sessionChatCache = new Map<string, SessionChatState>();

let chatAuthSubscriptionStarted = false;
const ensureChatAuthSubscription = () => {
  if (chatAuthSubscriptionStarted) return;
  chatAuthSubscriptionStarted = true;

  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      sessionChatCache.clear();
    }
  });
};

ensureChatAuthSubscription();

const ExtinguisherGuide = ({ width }: { width: number }) => {
  const guideWidth = Math.min(width, 330);
  const guideHeight = Math.round(guideWidth * 0.78);

  return (
    <View style={styles.guideWrap}>
      <Svg width={guideWidth} height={guideHeight} viewBox="0 0 330 258">
        <Rect x="4" y="4" width="322" height="250" rx="6" fill="#FFFFFF" stroke="#EF3338" strokeWidth="4" />
        <Rect x="4" y="4" width="322" height="34" rx="6" fill="#EF3338" />
        <SvgText x="165" y="28" textAnchor="middle" fill="#FFFFFF" fontSize="17" fontWeight="700">
          HOW TO USE A FIRE EXTINGUISHER
        </SvgText>

        <Rect x="32" y="77" width="60" height="132" rx="18" fill="#F54444" />
        <Rect x="44" y="69" width="36" height="24" rx="6" fill="#D92F31" />
        <Rect x="52" y="51" width="24" height="20" rx="4" fill="#6B7280" />
        <Line x1="64" y1="51" x2="128" y2="31" stroke="#EF3338" strokeWidth="5" strokeLinecap="round" />
        <Path d="M55 93 C 10 102, 16 152, 24 214" stroke="#374151" strokeWidth="3" fill="none" />
        <Rect x="14" y="204" width="18" height="28" rx="2" fill="#374151" />

        <Rect x="132" y="55" width="85" height="70" rx="4" fill="#FFF4F4" stroke="#EF3338" strokeWidth="2" />
        <Rect x="158" y="82" width="22" height="36" rx="7" fill="#F54444" />
        <Rect x="161" y="76" width="16" height="10" rx="3" fill="#6B7280" />
        <Path d="M177 78 L199 66" stroke="#EF3338" strokeWidth="3" strokeLinecap="round" />
        <Path d="M178 85 C 194 86, 203 81, 210 74" stroke="#F97373" strokeWidth="7" strokeLinecap="round" />
        <Path d="M198 69 L212 69 M212 69 L204 62 M212 69 L204 76" stroke="#EF3338" strokeWidth="3" strokeLinecap="round" />
        <SvgText x="174" y="136" textAnchor="middle" fill="#263238" fontSize="8" fontWeight="700">
          PULL SAFETY PIN
        </SvgText>

        <Rect x="230" y="55" width="85" height="70" rx="4" fill="#FFF4F4" stroke="#EF3338" strokeWidth="2" />
        <Circle cx="251" cy="72" r="13" fill="#E5E7EB" />
        <Circle cx="264" cy="84" r="17" fill="#E5E7EB" />
        <Circle cx="246" cy="94" r="10" fill="#E5E7EB" />
        <Path d="M276 94 L309 74" stroke="#1F2937" strokeWidth="8" strokeLinecap="round" />
        <Path d="M284 85 L305 69 M284 85 L296 84 M284 85 L291 75" stroke="#EF3338" strokeWidth="3" strokeLinecap="round" />
        <SvgText x="272" y="136" textAnchor="middle" fill="#263238" fontSize="8" fontWeight="700">
          AIM AT BASE OF FIRE
        </SvgText>

        <Rect x="132" y="151" width="85" height="70" rx="4" fill="#FFF4F4" stroke="#EF3338" strokeWidth="2" />
        <Rect x="156" y="184" width="24" height="31" rx="7" fill="#F54444" />
        <Rect x="160" y="178" width="16" height="10" rx="3" fill="#6B7280" />
        <Path d="M177 179 L200 167" stroke="#EF3338" strokeWidth="3" strokeLinecap="round" />
        <Path d="M186 163 C 203 160, 209 154, 212 147" stroke="#F97373" strokeWidth="7" strokeLinecap="round" />
        <Path d="M203 154 L203 182 M203 182 L196 172 M203 182 L210 172" stroke="#EF3338" strokeWidth="3" strokeLinecap="round" />
        <SvgText x="174" y="232" textAnchor="middle" fill="#263238" fontSize="8" fontWeight="700">
          SQUEEZE THE LEVER
        </SvgText>

        <Rect x="230" y="151" width="85" height="70" rx="4" fill="#FFF4F4" stroke="#EF3338" strokeWidth="2" />
        <Rect x="253" y="184" width="24" height="31" rx="7" fill="#F54444" />
        <Rect x="257" y="178" width="16" height="10" rx="3" fill="#6B7280" />
        <Path d="M274 179 L309 158" stroke="#1F2937" strokeWidth="7" strokeLinecap="round" />
        <Path d="M273 166 L266 146 M266 146 L259 158 M266 146 L276 155" stroke="#EF3338" strokeWidth="3" strokeLinecap="round" />
        <Path d="M275 207 L294 196 M294 196 L281 193 M294 196 L286 207" stroke="#EF3338" strokeWidth="3" strokeLinecap="round" />
        <SvgText x="272" y="232" textAnchor="middle" fill="#263238" fontSize="8" fontWeight="700">
          SWEEP SIDE TO SIDE
        </SvgText>
      </Svg>
    </View>
  );
};

const BotAvatar = () => (
  <View style={styles.botAvatar}>
    <Image source={CONVO_BOT_IMAGE} style={styles.botAvatarImage} resizeMode="contain" />
  </View>
);

const formatCurrentTime = () =>
  new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

const formatReportTimestamp = () =>
  new Date().toLocaleString("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Singapore",
  });

const todayISO = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const getFallbackAnswer = (prompt: string) => {
  const normalizedPrompt = prompt.toLowerCase();

  if (
    normalizedPrompt.includes("cannot control") ||
    normalizedPrompt.includes("can't control") ||
    normalizedPrompt.includes("cant control") ||
    normalizedPrompt.includes("control room now") ||
    normalizedPrompt.includes("cannot contact")
  ) {
    return [
      "1. Continue evacuation by emergency exit stairs. Do not wait for Control Room before moving people away from the affected area.",
      "2. Retry Control Room using another channel if available, such as radio, phone, or nearby officer relay.",
      "3. Escalate to your supervisor or the nearest available officer and state: Incident at the affected area, evacuation in progress, Control Room unreachable.",
      "4. If there is immediate danger or the fire is spreading, call SCDF at 995.",
      "5. Record the time and method of each failed contact attempt.",
    ].join("\n");
  }

  if (normalizedPrompt.includes("evacuation")) {
    return [
      "Step 1: Confirm the fire alarm is activated. If it is not active, activate the nearest fire alarm immediately.",
      "Step 2: Begin evacuation using the nearest emergency exit stairs. Do not use the lifts.",
      "Step 3: Guide people away from the affected area and keep exits clear.",
      "Step 4: If safe, check the area and use the correct extinguisher only if trained.",
      "Step 5: Inform the Control Room and call SCDF at 995.",
    ].join("\n");
  }

  if (normalizedPrompt.includes("escalation")) {
    return "Inform the Control Room immediately with the incident location, status, and actions taken. Call SCDF at 995 if emergency assistance is required.";
  }

  if (normalizedPrompt.includes("alarm")) {
    return "The nearest fire alarm should be used if the alarm is not already active. Move quickly, stay safe, and report the activation to the Control Room.";
  }

  if (normalizedPrompt.includes("complete")) {
    return "Mark evacuation complete only after occupants are directed to safety, the affected area is cleared where safe to check, and the Control Room has been updated.";
  }

  return "For the active incident: open the SOP guide, confirm the exact category, inform Control Room with the location and current status, and follow the listed steps. Record timestamps for key actions and updates.";
};

const cleanBotAnswer = (answer: string) =>
  answer
    .replace(/\*\*/g, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const formatIncidentTimestamp = (iso: string | null | undefined) => {
  if (!iso) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const buildIncidentTitle = (incident: ActiveIncident) => {
  const category = (incident.incident_category ?? "Incident").trim();
  const locationName = (incident.location_name ?? incident.location_description ?? "Unknown Location").trim();
  return `${category} - ${locationName}`;
};

const formatIncidentInfoLines = (incident: ActiveIncident) => {
  const category = (incident.incident_category ?? "Incident").trim();
  const locationName = (incident.location_name ?? "Unknown Location").trim();
  const unit = (incident.location_unit_no ?? "").trim();
  const desc = (incident.location_description ?? "").trim();

  return [
    { label: "Category:", value: category },
    { label: "Location:", value: [locationName, unit].filter(Boolean).join(" ") || locationName },
    ...(desc ? [{ label: "Details:", value: desc }] : []),
  ];
};

const buildIncidentBanner = (incident: ActiveIncident | null, loaded: boolean) => {
  if (!loaded) {
    return {
      title: "LOADING INCIDENT...",
      subtitle: "Fetching incident details.",
    };
  }

  if (!incident) {
    return {
      title: "NO ACTIVE INCIDENT",
      subtitle: "No incident is currently assigned to you.",
    };
  }

  const category = (incident.incident_category ?? "Incident").trim();
  const locationName = (incident.location_name ?? incident.location_description ?? "Unknown Location").trim();
  const unit = (incident.location_unit_no ?? "").trim();
  const place = [locationName, unit].filter(Boolean).join(" ");

  return {
    title: `ACTIVE INCIDENT - ${place || "UNKNOWN"}`,
    subtitle: `${category} detected at ${place || locationName}. Response in progress`,
  };
};

const extractIncidentAiAssessment = (incident: any): string | null => {
  if (!incident || typeof incident !== "object") return null;

  const value = (incident as any).ai_assessment;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    try {
      const asJson = JSON.stringify(value);
      if (asJson && asJson !== "{}" && asJson !== "[]") return asJson;
    } catch {
      // ignore
    }
  }
  return null;
};

const splitLabelValue = (line: string) => {
  const match = line.match(/^([^:\n]{1,32}):\s*(.+)$/);
  if (!match) return null;
  const label = match[1]?.trim();
  const value = match[2]?.trim();
  if (!label || !value) return null;
  return { label: `${label}:`, value };
};

const splitStepLine = (line: string) => {
  const trimmed = line.trim();
  const stepMatch = trimmed.match(/^(step\s+\d+:\s*)(.+)$/i);
  if (stepMatch) return { label: stepMatch[1].trim(), value: stepMatch[2].trim() };
  const numMatch = trimmed.match(/^(\d+\.\s*)(.+)$/);
  if (numMatch) return { label: numMatch[1].trim(), value: numMatch[2].trim() };
  return null;
};

const splitDashHeadline = (value: string) => {
  const idx = value.indexOf(" - ");
  if (idx <= 0) return null;
  const head = value.slice(0, idx).trim();
  const tail = value.slice(idx + 3).trim();
  if (!head || !tail) return null;
  return { head: `${head} -`, tail };
};

const splitNumberedHeading = (line: string) => {
  const match = line.match(/^(\d+\)\s+)(.+)$/);
  if (!match) return null;
  const prefix = match[1]?.trim();
  const title = match[2]?.trim();
  if (!prefix || !title) return null;
  return { prefix, title };
};

const isAllCapsHeading = (line: string) => {
  const trimmed = line.trim();
  if (trimmed.length < 6 || trimmed.length > 64) return false;
  if (!/[A-Z]/.test(trimmed)) return false;
  if (!/^[A-Z0-9 ()&.,'/-]+$/.test(trimmed)) return false;
  return trimmed === trimmed.toUpperCase();
};

const normalizeAnswerLines = (answer: string) => {
  const raw = answer.split("\n").map((l) => l.trim());
  const out: string[] = [];

  for (let i = 0; i < raw.length; i += 1) {
    const current = raw[i];
    if (!current) continue;

    const isOrphanStep = /^\d+[.)]$/.test(current);
    if (!isOrphanStep) {
      out.push(current);
      continue;
    }

    let j = i + 1;
    while (j < raw.length && !raw[j]) j += 1;
    if (j >= raw.length) {
      out.push(current);
      continue;
    }

    out.push(`${current} ${raw[j]}`.trim());
    i = j;
  }

  return out;
};

const splitEmphasisPrefix = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const colonIdx = trimmed.indexOf(":");
  if (colonIdx > 0 && colonIdx < 64) {
    const head = trimmed.slice(0, colonIdx + 1).trim();
    const tail = trimmed.slice(colonIdx + 1).trim();
    if (head && tail) return { head, tail: ` ${tail}` };
    if (head) return { head, tail: "" };
  }

  const firstDot = trimmed.indexOf(".");
  if (firstDot > 0 && firstDot < 72) {
    const head = trimmed.slice(0, firstDot + 1).trim();
    const tail = trimmed.slice(firstDot + 1).trim();
    const wordCount = head.split(/\s+/).filter(Boolean).length;
    if (head && wordCount <= 14) return { head, tail: tail ? ` ${tail}` : "" };
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= 6) {
    return { head: trimmed, tail: "" };
  }

  const headWords = words.slice(0, 6).join(" ");
  const rest = trimmed.slice(headWords.length).trim();
  if (!headWords) return null;
  return { head: headWords, tail: rest ? ` ${rest}` : "" };
};

const isLikelySectionTitle = (line: string) => {
  const trimmed = line.trim();
  if (trimmed.length < 6 || trimmed.length > 56) return false;
  if (/^\d+[.)]/.test(trimmed)) return false;
  if (/[:.]\s*$/.test(trimmed)) return false;
  if (!/[A-Za-z]/.test(trimmed)) return false;
  return true;
};

const renderAnswerLines = (answer: string, keyPrefix: string) => {
  const lines = normalizeAnswerLines(answer);

  return lines.map((line, idx) => {
    if (!line) return null;

    const nextLine = lines[idx + 1] ?? "";
    if (isLikelySectionTitle(line) && splitStepLine(nextLine)) {
      return (
        <Text key={`${keyPrefix}-section-${idx}`} style={[styles.messageText, styles.boldText]}>
          {line}
        </Text>
      );
    }

    const numberedHeading = splitNumberedHeading(line);
    if (numberedHeading) {
      return (
        <Text key={`${keyPrefix}-heading-${idx}`} style={[styles.messageText, styles.boldText]}>
          {`${numberedHeading.prefix}${numberedHeading.title}`}
        </Text>
      );
    }

    if (isAllCapsHeading(line)) {
      return (
        <Text key={`${keyPrefix}-caps-${idx}`} style={[styles.messageText, styles.boldText]}>
          {line}
        </Text>
      );
    }

    const labelValue = splitLabelValue(line);
    if (labelValue) {
      return (
        <View key={`${keyPrefix}-label-${idx}`} style={styles.inlineRow}>
          <Text style={[styles.messageText, styles.fallbackLabel]}>{labelValue.label}</Text>
          <Text style={[styles.messageText, styles.inlineValue]}>{labelValue.value}</Text>
        </View>
      );
    }

    const stepParts = splitStepLine(line);
    if (stepParts) {
      const dash = splitDashHeadline(stepParts.value);
      const emphasis = !dash ? splitEmphasisPrefix(stepParts.value) : null;
      return (
        <View key={`${keyPrefix}-step-${idx}`} style={styles.inlineRow}>
          <Text style={[styles.messageText, styles.fallbackLabel]}>{stepParts.label}</Text>
          {dash ? (
            <>
              <Text style={[styles.messageText, styles.boldText, styles.inlineValue]}>{dash.head}</Text>
              <Text style={[styles.messageText, styles.inlineValue]}>{dash.tail}</Text>
            </>
          ) : emphasis ? (
            <>
              <Text style={[styles.messageText, styles.boldText, styles.inlineValue]}>{emphasis.head}</Text>
              {emphasis.tail ? <Text style={[styles.messageText, styles.inlineValue]}>{emphasis.tail}</Text> : null}
            </>
          ) : (
            <Text style={[styles.messageText, styles.inlineValue]}>{stepParts.value}</Text>
          )}
        </View>
      );
    }

    const dash = splitDashHeadline(line);
    if (dash) {
      return (
        <View key={`${keyPrefix}-dash-${idx}`} style={styles.inlineRow}>
          <Text style={[styles.messageText, styles.boldText]}>{dash.head}</Text>
          <Text style={[styles.messageText, styles.inlineValue]}>{dash.tail}</Text>
        </View>
      );
    }

    return (
      <Text key={`${keyPrefix}-line-${idx}`} style={styles.messageText}>
        {line}
      </Text>
    );
  });
};

const sopCategoryLabelForSlug = (slug: string | null | undefined) => {
  if (!slug) return null;

  // Keep in sync with `frontend/app/securityofficer/[category].tsx`
  const categoryMap: Record<string, string> = {
    "fire-evacuation": "Fire & Evacuation",
    robbery: "Robbery",
    violence: "Violence",
    "lift-alarm": "Lift Alarm",
    medical: "Medical",
    "bomb-threat": "Bomb Threat",
    "suspicious-item": "Suspicious Item",
    "suspicious-person": "Suspicious Person",
  };

  return categoryMap[slug] ?? null;
};

const pickBestSopTitle = (titles: string[], incidentHints: string[]) => {
  const normalizedTitles = titles
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter(Boolean);
  if (!normalizedTitles.length) return null;

  const hintText = incidentHints
    .map((h) => (h ?? "").toString().toLowerCase())
    .filter(Boolean)
    .join(" ");

  // If we have no hints, keep stable behavior (first alphabetical).
  if (!hintText.trim()) return normalizedTitles[0];

  const normalizedKey = (value: string) =>
    value
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  // Special-case: avoid picking "Multi Site Bomb Threat" unless the incident explicitly indicates multi-site.
  if (hintText.includes("bomb") && !hintText.includes("multi") && !hintText.includes("multiple") && !hintText.includes("site")) {
    // Preferred default for Bomb Threat incidents.
    // If Risk Assessment exists, always use it as the default (even if hints mention "written bomb threat").
    const riskAssessment =
      normalizedTitles.find((t) => normalizedKey(t) === "bomb threat risk assessment") ??
      normalizedTitles.find((t) => normalizedKey(t).startsWith("bomb threat risk assessment"));
    if (riskAssessment) return riskAssessment;

    const exactBombThreat = normalizedTitles.find((t) => normalizedKey(t) === "bomb threat");
    if (exactBombThreat) return exactBombThreat;
  }

  const hintTokens = Array.from(
    new Set(
      hintText
        .split(/[^a-z0-9]+/g)
        .map((t) => t.trim())
        .filter((t) => t.length >= 3)
    )
  );

  let bestTitle: string | null = null;
  let bestScore = -1;

  for (const title of normalizedTitles) {
    const tLower = title.toLowerCase();

    let score = 0;
    // Phrase boost for very common categories.
    if (hintText.includes("bomb") && tLower.includes("bomb")) score += 8;
    if (hintText.includes("fire") && tLower.includes("fire")) score += 8;
    if (hintText.includes("robber") && tLower.includes("robber")) score += 8;
    if (hintText.includes("lift") && tLower.includes("lift")) score += 8;
    if (hintText.includes("medical") && tLower.includes("medical")) score += 8;
    if (hintText.includes("violence") && tLower.includes("violence")) score += 8;

    // Token overlap.
    for (const tok of hintTokens) {
      if (tLower.includes(tok)) score += 2;
    }

    // Penalize multi-site titles unless hints mention it.
    const titleKey = normalizedKey(title);
    const wantsMulti = hintText.includes("multi") || hintText.includes("multiple") || hintText.includes("site");
    if (!wantsMulti && (titleKey.includes("multi site") || titleKey.includes("multi-site") || titleKey.includes("multiple site"))) {
      score -= 6;
    }

    // Prefer more specific titles when scores tie: longer (but cap effect).
    score += Math.min(3, Math.floor(title.length / 20));

    if (score > bestScore) {
      bestScore = score;
      bestTitle = title;
    }
  }

  return bestTitle ?? normalizedTitles[0];
};

const formatSopStepsForPrompt = (title: string | null, steps: SopStep[]) => {
  if (!steps.length) return "Known SOP: (not loaded)";
  const header = title ? `Known SOP (${title}):` : "Known SOP:";

  const lines = steps.slice(0, 10).map((s) => {
    const short = (s.step_short ?? "").trim();
    const desc = (s.step_description ?? "").trim();
    const details = [short, desc].filter(Boolean).join(" - ");
    return `${s.step_no}. ${details || "Step"}`;
  });

  return [header, ...lines].join("\n");
};

const buildIncidentContext = (
  incident: ActiveIncident | null,
  sopSlug: string | null,
  sopTitle: string | null,
  sopSteps: SopStep[],
  incidentAiAssessment: string | null
) => {
  if (!incident) {
    return `Active incident: none assigned.\n${BASE_RESPONSE_RULES}`;
  }

  const title = buildIncidentTitle(incident);
  const unit = (incident.location_unit_no ?? "").trim();
  const desc = (incident.location_description ?? "").trim();
  const created = formatIncidentTimestamp(incident.created_at);
  const assigned = formatIncidentTimestamp(incident.assigned_at);
  const timing = [assigned ? `assigned ${assigned}` : null, created ? `created ${created}` : null]
    .filter(Boolean)
    .join(", ");
  const locationBits = [unit, desc].filter(Boolean).join(" • ");

  const sopCategory = sopCategoryLabelForSlug(sopSlug);
  const sopBlock = sopCategory
    ? `${formatSopStepsForPrompt(sopTitle, sopSteps)}\nSOP category: ${sopCategory}`
    : formatSopStepsForPrompt(sopTitle, sopSteps);
  const aiBlock = incidentAiAssessment ? `Incident AI assessment:\n${incidentAiAssessment}\n` : "";

  return `Active incident: ${title}${timing ? ` (${timing})` : ""}\nLocation: ${locationBits || "Unknown"}\n${aiBlock}${sopBlock}\n${BASE_RESPONSE_RULES}`;
};

const normalizeIncidentCategoryToSopSlug = (category: string | null | undefined, aiAssessment?: string | null) => {
  const raw = (category ?? "").trim().toLowerCase();
  if (!raw) return null;

  const assessment = (aiAssessment ?? "").toString().trim().toLowerCase();
  if (assessment.includes("bomb")) return "bomb-threat";
  if (assessment.includes("fire") || assessment.includes("evac")) return "fire-evacuation";

  // Explicit mappings (prefer matching SOP slugs in `frontend/app/securityofficer/sop.tsx`).
  const mappings: Record<string, string> = {
    fire: "fire-evacuation",
    "fire & evacuation": "fire-evacuation",
    "fire incident": "fire-evacuation",
    evacuation: "fire-evacuation",
    robbery: "robbery",
    violence: "violence",
    "lift alarm": "lift-alarm",
    lift: "lift-alarm",
    medical: "medical",
    "medical emergency": "medical",
    "bomb threat": "bomb-threat",
    bomb: "bomb-threat",
    "suspicious item": "suspicious-item",
    "suspicious items": "suspicious-item",
    "suspicious person": "suspicious-person",
    "suspicious persons": "suspicious-person",
  };

  if (mappings[raw]) return mappings[raw];

  // Keyword fallback (handles values like "Bomb Threat Incident" / "Fire Incident - Zone 4B")
  if (raw.includes("bomb")) return "bomb-threat";
  if (raw.includes("abandon") && (raw.includes("object") || raw.includes("bag") || raw.includes("package"))) return "bomb-threat";
  if (raw.includes("fire") || raw.includes("evac")) return "fire-evacuation";
  if (raw.includes("robber") || raw.includes("theft")) return "robbery";
  if (raw.includes("violence") || raw.includes("assault") || raw.includes("fight")) return "violence";
  if (raw.includes("lift") || raw.includes("elevator")) return "lift-alarm";
  if (raw.includes("medical") || raw.includes("injury") || raw.includes("aed")) return "medical";
  if (raw.includes("suspicious") && raw.includes("item")) return "suspicious-item";
  if (raw.includes("suspicious") && (raw.includes("person") || raw.includes("people"))) return "suspicious-person";

  // Best-effort normalization: "Lift Alarm" -> "lift-alarm"
  const normalized = raw
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || null;
};

export default function ChatBotPage() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const scrollViewRef = useRef<ScrollView | null>(null);
  const lastUserIdRef = useRef<string | null>(null);
  const [input, setInput] = useState("");
  const [showFullSteps, setShowFullSteps] = useState(false);
  const [dynamicReplies, setDynamicReplies] = useState<DynamicReply[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [initialBotTime, setInitialBotTime] = useState(formatCurrentTime());
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [activeIncident, setActiveIncident] = useState<ActiveIncident | null>(null);
  const [incidentLoaded, setIncidentLoaded] = useState(false);
  const [incidentAiAssessment, setIncidentAiAssessment] = useState<string | null>(null);
  const [incidentAiLoaded, setIncidentAiLoaded] = useState(false);
  const [incidentSopTitle, setIncidentSopTitle] = useState<string | null>(null);
  const [incidentSopSteps, setIncidentSopSteps] = useState<SopStep[]>([]);
  const [appRoutePrefix, setAppRoutePrefix] = useState("/securityofficer");
  const [shiftOwnerColumn, setShiftOwnerColumn] = useState<"officer_id" | "supervisor_id">("officer_id");

  useEffect(() => {
    let alive = true;

    const loadRoleContext = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;

      if (!userId || !alive) return;

      const { data: profile } = await supabase
        .from("employees")
        .select("role")
        .eq("id", userId)
        .maybeSingle();

      if (!alive) return;

      const role = profile?.role ?? "";
      const isSsoUser = role === "Senior Security Officer";

      if (isSsoUser) {
        setAppRoutePrefix("/sso");
        setShiftOwnerColumn("supervisor_id");
        return;
      }

      setAppRoutePrefix("/securityofficer");
      setShiftOwnerColumn("officer_id");
    };

    void loadRoleContext();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    const loadHistory = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id ?? null;
      if (!alive) return;
      setAuthUserId(userId);
      lastUserIdRef.current = userId;
      if (!userId) return;

      const cached = sessionChatCache.get(userId);
      if (cached) {
        setDynamicReplies(cached.replies);
        setShowFullSteps(cached.showFullSteps);
      }
    };

    void loadHistory();

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      const prevUserId = lastUserIdRef.current;
      const nextUserId = session?.user?.id ?? null;
      setAuthUserId(nextUserId);
      lastUserIdRef.current = nextUserId;

      if (event === "SIGNED_OUT" || !nextUserId) {
        if (prevUserId) sessionChatCache.delete(prevUserId);
        setDynamicReplies([]);
        setShowFullSteps(false);
        setInput("");
      }
    });

    return () => {
      alive = false;
      subscription?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authUserId) return;
    sessionChatCache.set(authUserId, {
      replies: dynamicReplies.map((r) => ({ ...r, loading: false })),
      showFullSteps,
    });
  }, [authUserId, dynamicReplies, showFullSteps]);

  useEffect(() => {
    if (!incidentLoaded) return;
    setInitialBotTime(formatCurrentTime());
  }, [activeIncident?.id, incidentLoaded]);

  const sopSlug = useMemo(
    () => normalizeIncidentCategoryToSopSlug(activeIncident?.incident_category, incidentAiAssessment),
    [activeIncident?.incident_category, incidentAiAssessment]
  );
  const isFireIncident = sopSlug === "fire-evacuation";
  const quickReplies = useMemo(
    () => (isFireIncident ? FIRE_QUICK_REPLIES : GENERIC_QUICK_REPLIES),
    [isFireIncident]
  );

  const botReplies = useMemo<BotReply[]>(() => {
    const title = activeIncident ? buildIncidentTitle(activeIncident) : "Incident";
    const showLoading = !incidentLoaded || (Boolean(activeIncident) && !incidentAiLoaded);
    const incidentInfoLines = activeIncident ? formatIncidentInfoLines(activeIncident) : [];

    return [
      {
        id: "initial",
        title,
        time: initialBotTime,
        suggestions: quickReplies,
        body: (
          <>
            <Text style={[styles.messageText, styles.assessmentHeader]}>AI Incident Assessment</Text>
            {showLoading ? <Text style={styles.messageText}>Loading incident details...</Text> : null}
            {!showLoading && incidentAiAssessment ? (
              renderAnswerLines(incidentAiAssessment, "ai-assign")
            ) : null}
            {!showLoading && !incidentAiAssessment && incidentInfoLines.length
              ? incidentInfoLines.map((line, idx) => (
                  <View key={`incident-fallback-${idx}`} style={styles.fallbackRow}>
                    <Text style={[styles.messageText, styles.fallbackLabel]}>{line.label}</Text>
                    <Text style={[styles.messageText, styles.fallbackValue]}>{line.value}</Text>
                  </View>
                ))
              : null}
            {!showLoading && !incidentAiAssessment && !incidentInfoLines.length ? (
              <Text style={styles.messageText}>No incident details available right now.</Text>
            ) : null}
          </>
        ),
      },
    ];
  }, [activeIncident, incidentAiAssessment, incidentAiLoaded, incidentLoaded, initialBotTime, quickReplies]);

  const incidentBanner = useMemo(
    () => buildIncidentBanner(activeIncident, incidentLoaded),
    [activeIncident, incidentLoaded]
  );

  const openSopGuide = useCallback(() => {
    if (sopSlug) {
      const titleQuery = incidentSopTitle ? `?title=${encodeURIComponent(incidentSopTitle)}` : "";
      router.push(`/securityofficer/${sopSlug}${titleQuery}`);
      return;
    }

    router.push("/securityofficer/sop");
  }, [router, incidentSopTitle, sopSlug]);

  const openSopLogistics = useCallback(() => {
    if (sopSlug) {
      const titleQuery = incidentSopTitle ? `&title=${encodeURIComponent(incidentSopTitle)}` : "";
      router.push(`/securityofficer/${sopSlug}?tab=logistics${titleQuery}`);
      return;
    }

    router.push("/securityofficer/sop");
  }, [router, incidentSopTitle, sopSlug]);

  useEffect(() => {
    let alive = true;

    const loadActiveIncident = async () => {
      setIncidentLoaded(false);
      setIncidentAiLoaded(false);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id ?? null;

      if (!alive) return;

      if (sessionError || !userId) {
        setActiveIncident(null);
        setIncidentLoaded(true);
        setIncidentAiAssessment(null);
        setIncidentAiLoaded(true);
        return;
      }

      const { data: assignmentRow, error: assignmentError } = await supabase
        .from("incident_assignments")
        .select(
          "assignment_id, incident_id, assigned_at, active_status, incidents(*)"
        )
        .eq("officer_id", userId)
        .eq("active_status", true)
        .order("assigned_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!alive) return;

      if (assignmentError || !assignmentRow) {
        setActiveIncident(null);
        setIncidentLoaded(true);
        setIncidentAiAssessment(null);
        setIncidentAiLoaded(true);
        return;
      }

      const incident = Array.isArray((assignmentRow as any).incidents)
        ? (assignmentRow as any).incidents?.[0]
        : (assignmentRow as any).incidents;

      if (!incident?.incident_id) {
        setActiveIncident(null);
        setIncidentLoaded(true);
        setIncidentAiAssessment(null);
        setIncidentAiLoaded(true);
        return;
      }

      setActiveIncident({
        id: incident.incident_id,
        incident_category: incident.incident_category ?? null,
        location_name: incident.location_name ?? null,
        location_unit_no: incident.location_unit_no ?? null,
        location_description: incident.location_description ?? null,
        created_at: incident.created_at ?? null,
        assigned_at: (assignmentRow as any).assigned_at ?? null,
      });
      setIncidentAiAssessment(extractIncidentAiAssessment(incident));
      setIncidentAiLoaded(true);
      setIncidentLoaded(true);
    };

    void loadActiveIncident();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    const loadIncidentSop = async () => {
      setIncidentSopTitle(null);
      setIncidentSopSteps([]);

      const categoryLabel = sopCategoryLabelForSlug(sopSlug);
      if (!categoryLabel) {
        return;
      }

      try {
        const { data: titleRows, error: titleError } = await supabase
          .from("sop")
          .select("title")
          .eq("category", categoryLabel)
          .order("title", { ascending: true });

        if (!alive) return;
        if (titleError) throw titleError;

        const allTitles = ((titleRows ?? []) as any[])
          .map((row) => (row as any)?.title)
          .filter((t) => typeof t === "string" && t.trim().length > 0) as string[];

        const title = pickBestSopTitle(allTitles, [
          activeIncident?.incident_category ?? "",
          incidentAiAssessment ?? "",
          categoryLabel,
          sopSlug ?? "",
        ]);
        setIncidentSopTitle(title);

        if (!title) {
          return;
        }

        const { data: stepsRows, error: stepsError } = await supabase
          .from("sop")
          .select("step_no, step_short, step_description")
          .eq("title", title)
          .order("step_no", { ascending: true });

        if (!alive) return;
        if (stepsError) throw stepsError;

        const parsed = ((stepsRows ?? []) as any[]).map((row) => ({
          step_no: Number(row.step_no),
          step_short: row.step_short ?? null,
          step_description: row.step_description ?? null,
        })) as SopStep[];

        setIncidentSopSteps(parsed.filter((s) => Number.isFinite(s.step_no)).sort((a, b) => a.step_no - b.step_no));
      } catch (error) {
        console.error("Error loading incident SOP:", error);
      }
    };

    void loadIncidentSop();
    return () => {
      alive = false;
    };
  }, [activeIncident?.incident_category, incidentAiAssessment, sopSlug]);

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollToEnd({ animated });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [dynamicReplies, showFullSteps, scrollToBottom]);

  const askBot = async (prompt: string) => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || isAsking) return;

    const replyId = `sealion-${Date.now()}`;
    const normalizedPrompt = trimmedPrompt.toLowerCase();
    const wantsFireGuide =
      normalizedPrompt.includes("evacuation") ||
      normalizedPrompt.includes("extinguisher") ||
      normalizedPrompt.includes("fire");
    const showGuide = isFireIncident && wantsFireGuide;
    const time = formatCurrentTime();

    setInput("");
    setIsAsking(true);
    if (showGuide) setShowFullSteps(true);
    setDynamicReplies((prev) => [
      ...prev,
      {
        id: replyId,
        question: trimmedPrompt,
        answer: "",
        time,
        loading: true,
        showGuide,
      },
    ]);
    scrollToBottom();

    try {
      const answer = isSeaLionConfigured()
          ? await askSeaLion([
              {
                role: "system",
                content: buildIncidentContext(activeIncident, sopSlug, incidentSopTitle, incidentSopSteps, incidentAiAssessment),
              },
              {
                role: "user",
                content: `Officer update: "${trimmedPrompt}"\n\nGive the immediate next actions for the active incident. If the officer reports a blocker, give a practical workaround.`,
              },
            ])
        : getFallbackAnswer(trimmedPrompt);

      setDynamicReplies((prev) =>
        prev.map((reply) => (reply.id === replyId ? { ...reply, answer: cleanBotAnswer(answer), loading: false } : reply))
      );
      scrollToBottom();
    } catch (error) {
      console.error("SEA-LION chatbot error:", error);
      setDynamicReplies((prev) =>
        prev.map((reply) =>
          reply.id === replyId
            ? {
                ...reply,
                answer: cleanBotAnswer(
                  `${getFallbackAnswer(trimmedPrompt)}\n\nSEA-LION is unavailable right now, so this fallback SOP response is shown.`
                ),
                loading: false,
              }
            : reply
        )
      );
      scrollToBottom();
    } finally {
      setIsAsking(false);
    }
  };

  const handleSend = () => {
    askBot(input);
  };

  const addLocalReply = (question: string, answer: string) => {
    setDynamicReplies((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        question,
        answer,
        time: formatCurrentTime(),
        loading: false,
        showGuide: false,
      },
    ]);
    scrollToBottom();
  };

  const markShiftReportNote = async (question: string, note: string, successMessage: string) => {
    if (isAsking) return;

    setInput("");
    setIsAsking(true);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;

      if (sessionError || !userId) {
        throw new Error("Unable to find current user session");
      }

      const { data: shiftsData, error: shiftsError } = await supabase
        .from("shifts")
        .select("shift_id, shift_description, shift_date, clockin_time, clockout_time")
        .eq(shiftOwnerColumn, userId)
        .order("shift_date", { ascending: false })
        .limit(10);

      if (shiftsError) throw shiftsError;

      const shifts = (shiftsData || []) as ShiftReportTarget[];
      const targetShift =
        shifts.find((shift) => shift.clockin_time && !shift.clockout_time) ??
        shifts.find((shift) => shift.shift_date === todayISO()) ??
        shifts[0];

      if (!targetShift?.shift_id) {
        throw new Error("No shift report found to update");
      }

      const existingDescription = targetShift.shift_description?.trim();
      const updatedDescription = existingDescription ? `${existingDescription}\n${note}` : note;

      const { error: updateError } = await supabase
        .from("shifts")
        .update({ shift_description: updatedDescription })
        .eq("shift_id", targetShift.shift_id);

      if (updateError) throw updateError;

      addLocalReply(question, successMessage);
    } catch (error) {
      console.error("Error updating shift report:", error);
      addLocalReply(question, `I could not update the shift report automatically. Please add this note manually:\n${note}`);
    } finally {
      setIsAsking(false);
    }
  };

  const markEvacuationComplete = async () => {
    if (!activeIncident) {
      Alert.alert("No active incident", "You can only mark evacuation complete when an incident is assigned to you.");
      return;
    }
    const completedAt = formatReportTimestamp();
    const incidentLabel = buildIncidentTitle(activeIncident);
    const note = `[${completedAt}] Evacuation marked complete for ${incidentLabel}.`;
    setShowFullSteps(true);
    await markShiftReportNote(
      "Mark evacuation complete",
      note,
      `Evacuation complete has been recorded in the shift report.\nTime noted: ${completedAt}`
    );
  };

  const showIncidentSopSteps = () => {
    if (!incidentSopSteps.length) {
      openSopGuide();
      return;
    }

    setShowFullSteps(true);
    const stepsToShow = incidentSopSteps.slice(0, 12);
    const question = isFireIncident ? "Show evacuation steps" : "Show SOP steps";

    const lines: string[] = [];
    if (incidentSopTitle) lines.push(incidentSopTitle);
    for (const s of stepsToShow) {
      const short = (s.step_short ?? "").trim();
      const desc = (s.step_description ?? "").trim();
      const parts = short && desc ? `${short} - ${desc}` : [short, desc].filter(Boolean).join(" ");
      lines.push(`${s.step_no}. ${parts || "Step"}`.trim());
    }
    addLocalReply(question, lines.join("\n"));
  };

  const handleSuggestionPress = (suggestion: string) => {
    if (suggestion === "Show evacuation steps") {
      showIncidentSopSteps();
      return;
    }

    if (suggestion === "Show SOP steps") {
      showIncidentSopSteps();
      return;
    }

    if (suggestion === "Escalation contacts") {
      router.push("/securityofficer/phonecalls");
      return;
    }

    if (
      suggestion === "Location of fire alarm" ||
      suggestion === "Logistics needed"
    ) {
      if (suggestion === "Logistics needed") {
        openSopLogistics();
      } else {
        openSopGuide();
      }
      return;
    }

    if (suggestion === "Mark evacuation complete") {
      if (!activeIncident) {
        Alert.alert("No active incident", "You can only mark evacuation complete when an incident is assigned to you.");
        return;
      }
      void markEvacuationComplete();
      return;
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.replace(`${appRoutePrefix}/home` as any)} hitSlop={10}>
          <ChevronLeft size={28} color="#FFFFFF" strokeWidth={3} />
        </Pressable>
        <Text style={styles.headerTitle}>Chat Bot</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.incidentBanner}>
        <View style={styles.alertIconWrap}>
          <AlertTriangle size={20} color="#D85B53" strokeWidth={2.6} />
        </View>
        <View style={styles.incidentTextWrap}>
          <Text style={styles.incidentTitle}>{incidentBanner.title}</Text>
          <Text style={styles.incidentSubtitle}>{incidentBanner.subtitle}</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.chatArea}
        contentContainerStyle={styles.chatContent}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollToBottom(false)}
      >
        {botReplies.map((reply) => (
          <View key={reply.id} style={styles.botBlock}>
            <View style={styles.botHeaderRow}>
              <BotAvatar />
              <View style={styles.botTitleWrap}>
                <Text style={styles.followText}>Follow up -</Text>
                <Text style={styles.botTitle}>{reply.title}</Text>
              </View>
            </View>

            <View style={styles.botBody}>{reply.body}</View>

            {reply.suggestions ? (
              <View style={styles.suggestionsWrap}>
                <Text style={styles.suggestionHelp}>Click on the suggested questions or type out your question.</Text>
                {reply.suggestions.map((suggestion) => {
                  const isMarkAction = suggestion.startsWith("Mark ");
                  const suggestionDisabled = isAsking || (isMarkAction && !activeIncident);

                  return (
                    <Pressable
                      key={suggestion}
                      style={[styles.suggestionButton, suggestionDisabled && styles.disabledButton]}
                      disabled={suggestionDisabled}
                      onPress={() => handleSuggestionPress(suggestion)}
                    >
                      <Text style={styles.suggestionText}>{suggestion}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <Text style={styles.replyTime}>{reply.time}</Text>

          </View>
        ))}

        {dynamicReplies.map((reply) => (
          <View key={reply.id} style={styles.botBlock}>
            <View style={styles.userBubbleWrap}>
              <View style={styles.userBubble}>
                <Text style={styles.userBubbleText}>{reply.question}</Text>
              </View>
              <Text style={styles.userTime}>{reply.time}</Text>
            </View>

            <View style={styles.botHeaderRow}>
              <BotAvatar />
              <View style={styles.botTitleWrap}>
                <Text style={styles.followText}>Follow up -</Text>
                <Text style={styles.botTitle}>{activeIncident ? buildIncidentTitle(activeIncident) : "Incident"}</Text>
              </View>
            </View>

            <View style={styles.botBody}>
              {reply.loading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color="#16518E" />
                  <Text style={styles.loadingText}>Checking SOP with SEA-LION...</Text>
                </View>
              ) : (
                <>
                  {renderAnswerLines(reply.answer, reply.id)}
                  {reply.showGuide ? (
                    <>
                      <Text style={styles.messageText}>Use correct extinguisher:</Text>
                      <ExtinguisherGuide width={width - 96} />
                    </>
                  ) : null}
                </>
              )}
            </View>

            <Text style={styles.replyTime}>{reply.time}</Text>
          </View>
        ))}

        {showFullSteps ? (
          <View style={styles.actionRow}>
            <Pressable style={styles.actionButton} onPress={() => Linking.openURL("tel:995")}>
              <View style={styles.actionCircle}>
                <PhoneCall size={28} color="#0E2D52" strokeWidth={2.4} />
              </View>
              <Text style={styles.actionLabel}>Call SCDF</Text>
            </Pressable>
            <Pressable style={styles.actionButton} onPress={openSopGuide}>
              <View style={styles.actionCircle}>
                <ListChecks size={30} color="#0E2D52" strokeWidth={2.4} />
              </View>
              <Text style={styles.actionLabel}>View SOP Guide</Text>
            </Pressable>
            <Pressable style={styles.actionButton} onPress={() => router.push(`${appRoutePrefix}/incidents` as any)}>
              <View style={styles.actionCircle}>
                <Check size={36} color="#0E2D52" strokeWidth={2.4} />
              </View>
              <Text style={styles.actionLabel}>Open Incident Checklist</Text>
            </Pressable>
            <Pressable style={styles.actionButton} onPress={() => router.push(`${appRoutePrefix}/reports` as any)}>
              <View style={styles.actionCircle}>
                <ClipboardPen size={30} color="#0E2D52" strokeWidth={2.4} />
              </View>
              <Text style={styles.actionLabel}>Report Incident</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.inputBar}>
        <View style={styles.inputWrap}>
          <TextInput
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
            placeholder="Type here..."
            placeholderTextColor="#000000"
            returnKeyType="send"
            style={styles.input}
          />
          <Pressable
            style={[styles.sendButton, (!input.trim() || isAsking) && styles.disabledButton]}
            onPress={handleSend}
            disabled={!input.trim() || isAsking}
            hitSlop={8}
          >
            <SendHorizontal size={16} color="#FFFFFF" strokeWidth={2.6} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    minHeight: 104,
    backgroundColor: "#16518E",
    paddingTop: 40,
    paddingBottom: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    color: "#FFFFFF",
    fontFamily: "Inter",
    fontStyle: "normal",
    fontSize: 26,
    lineHeight: 24,
    fontWeight: "600",
    textAlign: "center",
    marginHorizontal: 10,
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  incidentBanner: {
    minHeight: 59,
    backgroundColor: "#E19D9D",
    borderBottomWidth: 1.5,
    borderBottomColor: "rgba(255, 61, 61, 0.4)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  alertIconWrap: {
    width: 30,
    height: 31,
    borderRadius: 10,
    backgroundColor: "#802A2A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  incidentTextWrap: {
    flex: 1,
    alignItems: "center",
  },
  incidentTitle: {
    color: "#A50909",
    fontFamily: "Inter",
    fontStyle: "normal",
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "600",
    letterSpacing: 0,
    textAlign: "center",
  },
  incidentSubtitle: {
    color: "#151414",
    fontFamily: "Inter",
    fontStyle: "normal",
    fontSize: 15,
    lineHeight: 24,
    letterSpacing: 0,
    fontWeight: "400",
    textAlign: "center",
  },
  chatArea: {
    flex: 1,
  },
  chatContent: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 22,
  },
  botBlock: {
    marginBottom: 18,
  },
  botHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  botAvatar: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  botAvatarImage: {
    width: 48,
    height: 48,
  },
  botTitleWrap: {
    flex: 1,
  },
  followText: {
    color: "#151414",
    fontFamily: "Inter",
    fontStyle: "normal",
    fontWeight: "400",
    fontSize: 12,
    lineHeight: 24,
  },
  botTitle: {
    color: "#000000",
    fontFamily: "Inter",
    fontStyle: "normal",
    fontWeight: "600",
    fontSize: 14,
    lineHeight: 24,
  },
  botBody: {
    marginTop: 8,
    paddingHorizontal: 6,
  },
  messageText: {
    color: "#151414",
    fontFamily: "Inter",
    fontStyle: "normal",
    fontWeight: "400",
    fontSize: 15,
    lineHeight: 24,
    letterSpacing: 0,
  },
  fireIcon: {
    fontSize: 20,
  },
  suggestionsWrap: {
    marginTop: 12,
  },
  suggestionHelp: {
    color: "#151414",
    fontFamily: "Inter",
    fontStyle: "normal",
    fontWeight: "400",
    fontSize: 13,
    lineHeight: 24,
    marginBottom: 8,
  },
  suggestionButton: {
    minHeight: 30,
    justifyContent: "center",
    backgroundColor: "#E4F0FF",
    borderWidth: 1,
    borderColor: "rgba(116, 144, 177, 0.36)",
    marginBottom: 9,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 2,
  },
  disabledButton: {
    opacity: 0.55,
  },
  suggestionText: {
    color: "#416F9E",
    fontFamily: "Inter",
    fontStyle: "normal",
    fontWeight: "400",
    fontSize: 13,
    lineHeight: 24,
    letterSpacing: 0,
  },
  replyTime: {
    color: "#416F9E",
    fontFamily: "Inter",
    fontStyle: "normal",
    fontWeight: "400",
    fontSize: 12,
    lineHeight: 24,
    marginTop: 1,
    marginLeft: 12,
  },
  userBubbleWrap: {
    alignItems: "flex-end",
    marginTop: 26,
  },
  userBubble: {
    width: "73%",
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#B6D6FF",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubbleText: {
    color: "#111827",
    fontFamily: "Inter",
    fontStyle: "normal",
    fontWeight: "400",
    fontSize: 15,
    lineHeight: 24,
  },
  userTime: {
    color: "#416F9E",
    fontFamily: "Inter",
    fontStyle: "normal",
    fontWeight: "400",
    fontSize: 12,
    lineHeight: 24,
    marginTop: 1,
    marginRight: 6,
  },
  guideWrap: {
    alignItems: "center",
    marginVertical: 12,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  loadingText: {
    color: "#202124",
    fontFamily: "Inter",
    fontSize: 18,
    lineHeight: 24,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 8,
    marginTop: 6,
  },
  actionButton: {
    width: "24%",
    alignItems: "center",
  },
  actionCircle: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: "#F2D8CB",
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    color: "#111827",
    fontFamily: "Inter",
    fontSize: 12,
    lineHeight: 15,
    textAlign: "center",
    marginTop: 8,
  },
  inputBar: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#DADDE3",
    paddingHorizontal: 6,
    paddingTop: 10,
    paddingBottom: 10,
  },
  inputWrap: {
    minHeight: 37,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(116, 144, 177, 0.36)",
    backgroundColor: "#E4F0FF",
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 20,
    paddingRight: 8,
  },
  input: {
    flex: 1,
    color: "#000000",
    fontFamily: "Inter",
    fontStyle: "normal",
    fontWeight: "400",
    fontSize: 12,
    lineHeight: 19,
    textAlign: "left",
    textAlignVertical: "center",
    height: 37,
    paddingTop: -1,
    paddingBottom: 1,
  },
  sendButton: {
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: "#0E2D52",
    alignItems: "center",
    justifyContent: "center",
  },
  assessmentHeader: {
    fontWeight: "900",
  },
  boldText: {
    fontWeight: "800",
  },
  fallbackLabel: {
    fontWeight: "800",
  },
  fallbackRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
  },
  fallbackValue: {
    flexShrink: 1,
    minWidth: 0,
    marginLeft: 6,
  },
  inlineRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
  },
  inlineValue: {
    flexShrink: 1,
    minWidth: 0,
    marginLeft: 6,
  },
});
