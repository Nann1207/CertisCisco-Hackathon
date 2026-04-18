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
  disableDynamicFontSize?: boolean;
};

function toPlainString(children: React.ReactNode): string | null {
  const extract = (node: React.ReactNode): string => {
    if (typeof node === "string" || typeof node === "number") {
      return String(node);
    }

    if (Array.isArray(node)) {
      return node.map((item) => extract(item)).join("");
    }

    if (React.isValidElement(node)) {
      const childProp = (node.props as { children?: React.ReactNode } | null)?.children;
      return extract(childProp ?? null);
    }

    return "";
  };

  const joined = extract(children);
  return joined.trim().length > 0 ? joined : null;
}

export default function TranslatedText({
  children,
  disableDynamicFontSize = false,
  ...props
}: TranslatedTextProps) {
  const [language, setLanguage] = useState<LanguagePreference>(getLanguagePreference());
  const [translatedText, setTranslatedText] = useState<string | null>(null);

  const plainText = useMemo(() => toPlainString(children), [children]);
  const renderedText = translatedText ?? plainText;

  const flattenedStyle = useMemo(() => {
    return StyleSheet.flatten(props.style) as TextStyle | undefined;
  }, [props.style]);

  const dynamicFontSize = useMemo(() => {
    if (disableDynamicFontSize) return undefined;
    if (!renderedText || !plainText) return undefined;

    const baseFontSize = flattenedStyle?.fontSize;
    if (typeof baseFontSize !== "number") return undefined;

    const sourceLength = Math.max(plainText.replace(/\s+/g, " ").trim().length, 1);
    const renderedLength = renderedText.replace(/\s+/g, " ").trim().length;
    const expansionRatio = renderedLength / sourceLength;

    const hasLineBreaks = renderedText.includes("\n");

    // Keep original size when translation length is close to source and still short.
    if (expansionRatio <= 1.1 && renderedLength <= 32 && !hasLineBreaks) {
      return undefined;
    }

    // Combine penalties from relative expansion, absolute length, and explicit line breaks.
    const expansionPenalty = expansionRatio > 1.08 ? Math.min(0.24, (expansionRatio - 1.08) * 0.3) : 0;
    const lengthPenalty = renderedLength > 64 ? Math.min(0.15, (renderedLength - 64) / 240) : 0;
    const multilinePenalty = hasLineBreaks ? 0.08 : 0;

    const scale = Math.max(0.72, 1 - expansionPenalty - lengthPenalty - multilinePenalty);
    if (scale >= 0.99) return undefined;

    return Math.round(baseFontSize * scale * 100) / 100;
  }, [disableDynamicFontSize, flattenedStyle?.fontSize, plainText, renderedText]);

  const adaptiveStyle = useMemo(() => {
    const patch: TextStyle = {
      flexShrink: 1,
      minWidth: 0,
      maxWidth: "100%",
      flexWrap: "wrap",
    };
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
      minimumFontScale={props.minimumFontScale ?? 0.72}
    >
      {renderedText}
    </RNText>
  );
}
