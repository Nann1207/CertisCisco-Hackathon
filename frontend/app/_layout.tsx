import { Stack, router } from "expo-router";
import { supabase } from "../lib/supabase";
import { Asset } from "expo-asset";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import {
  normalizeLanguagePreference,
  setLanguagePreference,
} from "../lib/language-preferences";
import ChatNotificationListener from "../components/ChatNotificationListener";

SplashScreen.preventAutoHideAsync().catch(() => {});


const roleRoutes: Record<string, string> = {
  "Security Officer": "/securityofficer/home",
  "Senior Security Officer": "/sso/home",
  "Security Supervisor": "/securitysupervisor/home",
};

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const [isSessionChecked, setIsSessionChecked] = useState(false);

  // load asset
  useEffect(() => {
    let isMounted = true;

    async function prepare() {
      try {
        await Asset.loadAsync([
          require("../assets/splash.png"),
          require("../assets/fortis-logo.png"),
        ]);
      } finally {
        if (isMounted) {
          setIsReady(true);
        }
      }
    }

    prepare();

    return () => {
      isMounted = false;
    };
  }, []);

 
  useEffect(() => {
    let alive = true;

    const checkUser = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user.id;
        const userEmail = data.session?.user.email;
        if (!userId) {
          return;
        }

        const { data: profile, error } = await supabase
          .from("employees")
          .select("role, language_preferences")
          .eq("id", userId)
          .single();

        if (!profile && userEmail) {
          const { data: profileByEmail } = await supabase
            .from("employees")
            .select("role, language_preferences")
            .eq("email", userEmail)
            .maybeSingle();

          const normalizedLanguage = normalizeLanguagePreference(
            profileByEmail?.language_preferences
          );
          if (normalizedLanguage) {
            setLanguagePreference(normalizedLanguage);
          }

          if (!profileByEmail?.role) {
            await supabase.auth.signOut();
            router.replace("/login");
            return;
          }

          const fallbackRoute = roleRoutes[profileByEmail.role];
          if (!fallbackRoute) {
            await supabase.auth.signOut();
            router.replace("/login");
            return;
          }

          router.replace(fallbackRoute);
          return;
        }

        if (error || !profile?.role) {
          await supabase.auth.signOut();
          router.replace("/login");
          return;
        }

        const normalizedLanguage = normalizeLanguagePreference(
          profile.language_preferences
        );
        if (normalizedLanguage) {
          setLanguagePreference(normalizedLanguage);
        }

        const route = roleRoutes[profile.role];
        if (!route) {
          await supabase.auth.signOut();
          router.replace("/login");
          return;
        }

        router.replace(route);
      } finally {
        if (alive) {
          setIsSessionChecked(true);
        }
      }
    };

    void checkUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void checkUser();
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  // to hide splash screen when ready
  useEffect(() => {
    if (isReady && isSessionChecked) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isReady, isSessionChecked]);

  // prevent render until ready
  if (!isReady || !isSessionChecked) {
    return null;
  }

  // default stack (before routing happens)
  return (
    <>
      <ChatNotificationListener />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen
          name="translate"
          options={{
            presentation: "transparentModal",
            animation: "fade",
            contentStyle: { backgroundColor: "transparent" },
          }}
        />
      </Stack>
    </>
  );
}
