import { Stack } from "expo-router";
import { Asset } from "expo-asset";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);

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
    if (isReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isReady]);

  if (!isReady) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="home" />
    </Stack>
  );
}
