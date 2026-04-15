import { Stack } from "expo-router";

export default function Layout() {
  return (
    <Stack>
      <Stack.Screen name="home" />
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="reports" />
      <Stack.Screen name="incidents" />
    </Stack>
  );
}
