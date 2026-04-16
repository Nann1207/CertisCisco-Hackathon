import { Stack, router } from "expo-router";
import { supabase } from "../lib/supabase";
import { Asset } from "expo-asset";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";

SplashScreen.preventAutoHideAsync().catch(() => {});


const roleRoutes: Record<string, string> = {
  "Security Officer": "/securityofficer/home",
  "Senior Security Officer": "/sso/home",
  "Security Supervisor": "/securitysupervisor/home",
};

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);

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
    const checkUser = async () => {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) return;

      const { data: profile, error } = await supabase
        .from("employees")
        .select("role")
        .eq("id", userId)
        .single();

      if (error || !profile?.role) {
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      const route = roleRoutes[profile.role];
      if (!route) {
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      router.replace(route);
    };

    checkUser();
  }, []);

  // to hide splash screen when ready
  useEffect(() => {
    if (isReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isReady]);

  // prevent render until ready
  if (!isReady) {
    return null;
  }

  // default stack (before routing happens)
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
    </Stack>
  );
}
