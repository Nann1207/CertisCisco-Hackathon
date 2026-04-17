import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text as RNText, TextProps, TextStyle } from "react-native";
import {
  getLanguagePreference,
  LanguagePreference,
  subscribeLanguagePreference,
} from "../lib/language-preferences";
import { translateWithGoogle } from "../lib/google-translate";

type TranslatedTextProps = TextProps & {
  children?: React.ReactNode;
};

function toPlainString(children: React.ReactNode): string | null {
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }

  if (Array.isArray(children)) {
    const parts = children.map((item) => {
      if (typeof item === "string" || typeof item === "number") return String(item);
      return "";
    });
    const joined = parts.join("");
    return joined.trim().length > 0 ? joined : null;
  }

  return null;
}

export default function TranslatedText({ children, ...props }: TranslatedTextProps) {
  const [language, setLanguage] = useState<LanguagePreference>(getLanguagePreference());
  const [translatedText, setTranslatedText] = useState<string | null>(null);

  const plainText = useMemo(() => toPlainString(children), [children]);
  const renderedText = translatedText ?? plainText;

  const flattenedStyle = useMemo(() => {
    return StyleSheet.flatten(props.style) as TextStyle | undefined;
  }, [props.style]);

  const dynamicFontSize = useMemo(() => {
    if (!renderedText || !plainText) return undefined;
    if (renderedText.includes("\n")) return undefined;

    const baseFontSize = flattenedStyle?.fontSize;
    if (typeof baseFontSize !== "number") return undefined;

    const sourceLength = Math.max(plainText.length, 1);
    const renderedLength = renderedText.length;
    const expansionRatio = renderedLength / sourceLength;

    // Keep original size when translation length is close to source.
    if (expansionRatio <= 1.1) return undefined;

    // Shrink progressively for longer translations while maintaining readability.
    const scale = Math.max(0.78, 1 - (expansionRatio - 1) * 0.35);
    return Math.round(baseFontSize * scale * 100) / 100;
  }, [flattenedStyle?.fontSize, plainText, renderedText]);

  const adaptiveStyle = useMemo(() => {
    const patch: TextStyle = { flexShrink: 1 };
    if (typeof dynamicFontSize === "number") {
      patch.fontSize = dynamicFontSize;
    }
    return [props.style, patch];
  }, [dynamicFontSize, props.style]);

  useEffect(() => {
    return subscribeLanguagePreference(setLanguage);
  }, []);

  useEffect(() => {
    let alive = true;

    if (!plainText) {
      setTranslatedText(null);
      return;
    }

    if (language === "English") {
      setTranslatedText(plainText);
      return;
    }

    void (async () => {
      const nextText = await translateWithGoogle(plainText, language);
      if (!alive) return;
      setTranslatedText(nextText);
    })();

    return () => {
      alive = false;
    };
  }, [language, plainText]);

  if (!plainText) {
    return <RNText {...props} style={adaptiveStyle}>{children}</RNText>;
  }

  return (
    <RNText
      {...props}
      style={adaptiveStyle}
      adjustsFontSizeToFit={props.adjustsFontSizeToFit ?? true}
      minimumFontScale={props.minimumFontScale ?? 0.78}
    >
      {renderedText}
    </RNText>
  );
}
