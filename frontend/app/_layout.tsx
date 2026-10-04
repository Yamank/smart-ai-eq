import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, LogBox, StyleSheet, Text, View } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "@/src/auth";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { ToastProvider } from "@/src/components/Toast";
import { queryClient } from "@/src/query-client";
import { colors, fonts } from "@/src/theme";

// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);

function Gate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const onLogin = segments[0] === "login";

  useEffect(() => {
    if (loading) return;
    if (!user && !onLogin) router.replace("/login");
    else if (user && onLogin) router.replace("/");
    else if (user && segments[0] === "admin" && user.role !== "admin") router.replace("/");
  }, [user, loading, onLogin, segments, router]);

  if (loading) {
    return (
      <View style={styles.splash} testID="app-loading">
        <ActivityIndicator color={colors.onSurface} />
        <Text style={styles.splashText}>LOADING_</Text>
      </View>
    );
  }
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
      <Stack.Screen name="feedback" options={{ presentation: "modal" }} />
      <Stack.Screen name="ai-settings" options={{ presentation: "modal" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    PlayfairDisplay: require("../assets/fonts/PlayfairDisplay.ttf"),
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });
  // One app level ErrorBoundary; a render crash shows a reload screen
  // instead of a blank app.
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <KeyboardProvider>
            <StatusBar style="light" />
            <ToastProvider>
              <AuthProvider>
                {loaded ? <Gate /> : <View style={styles.splash} />}
              </AuthProvider>
            </ToastProvider>
          </KeyboardProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", gap: 12 },
  splashText: { color: colors.onSurfaceTertiary, fontFamily: fonts.mono, fontSize: 12, letterSpacing: 2 },
});
