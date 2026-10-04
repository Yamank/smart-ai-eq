import { Feather } from "@react-native-vector-icons/feather";
import * as AppleAuthentication from "expo-apple-authentication";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const HERO =
  "https://images.unsplash.com/photo-1487215078519-e21cc028cb29?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80";

export default function Login() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { signInGoogle, signInApple, signInEmail } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (Platform.OS === "ios") AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, []);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e: any) {
      if (e?.code !== "ERR_REQUEST_CANCELED") toast(e?.message ?? "Sign-in failed", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.root}>
      <Image source={{ uri: HERO }} style={styles.hero} contentFit="cover" />
      <LinearGradient colors={["transparent", colors.surface]} locations={[0, 0.75]} style={styles.heroFade} />
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xxxl, paddingBottom: insets.bottom + spacing.xl }]}
      >
        <View style={styles.top}>
          <Text style={styles.kicker}>SMART · AI · EQ</Text>
          <Text style={styles.title} testID="login-title">Equaliser</Text>
          <Text style={styles.sub}>Tuned to your song, your headphones and their firmware.</Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            testID="login-google-button"
            disabled={!!busy}
            onPress={() => run("google", signInGoogle)}
            style={({ pressed }) => [styles.btnPrimary, pressed && styles.pressed]}
          >
            {busy === "google" ? (
              <ActivityIndicator color={colors.onBrandSecondary} />
            ) : (
              <Text style={styles.btnPrimaryText}>Continue with Google</Text>
            )}
          </Pressable>

          {appleAvailable && (
            <AppleAuthentication.AppleAuthenticationButton
              testID="login-apple-button"
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE}
              cornerRadius={radius.pill}
              style={styles.apple}
              onPress={() => run("apple", signInApple)}
            />
          )}
          <Text style={styles.note}>New here? Signing in creates your account.</Text>

          <Pressable testID="login-admin-toggle" onPress={() => setShowEmail((s) => !s)} style={styles.link} hitSlop={8}>
            <Feather name="shield" size={14} color={colors.onSurfaceTertiary} />
            <Text style={styles.linkText}>Admin sign-in</Text>
          </Pressable>

          {showEmail && (
            <View style={styles.form}>
              <TextInput
                testID="login-email-input"
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
              />
              <TextInput
                testID="login-password-input"
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={colors.muted}
                secureTextEntry
                style={styles.input}
                onSubmitEditing={() => run("email", () => signInEmail(email.trim(), password))}
              />
              <Pressable
                testID="login-email-submit-button"
                disabled={!!busy || !email || !password}
                onPress={() => run("email", () => signInEmail(email.trim(), password))}
                style={({ pressed }) => [styles.btnOutline, (!email || !password) && styles.disabled, pressed && styles.pressed]}
              >
                {busy === "email" ? <ActivityIndicator color={colors.onSurface} /> : <Text style={styles.btnOutlineText}>Sign in</Text>}
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  hero: { position: "absolute", top: 0, left: 0, right: 0, height: 420, opacity: 0.55 },
  heroFade: { position: "absolute", top: 0, left: 0, right: 0, height: 420 },
  content: { flexGrow: 1, paddingHorizontal: spacing.xl, justifyContent: "space-between", gap: spacing.xxxl },
  top: { gap: spacing.md, marginTop: 120 },
  kicker: { color: c.brandPrimary, fontFamily: fonts.mono, fontSize: 12, letterSpacing: 3 },
  title: { color: c.onSurface, fontFamily: fonts.display, fontSize: 56, lineHeight: 64 },
  sub: { color: c.onSurfaceTertiary, fontFamily: fonts.mono, fontSize: 14, lineHeight: 22, maxWidth: 300 },
  actions: { gap: spacing.md },
  btnPrimary: { height: 56, borderRadius: radius.pill, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
  btnPrimaryText: { color: c.onBrandSecondary, fontFamily: fonts.mono, fontSize: 15 },
  apple: { height: 56, width: "100%" },
  btnOutline: { height: 52, borderRadius: radius.pill, borderWidth: 1, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
  btnOutlineText: { color: c.onSurface, fontFamily: fonts.mono, fontSize: 15 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
  note: { color: c.muted, fontFamily: fonts.mono, fontSize: 11, textAlign: "center" },
  link: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, minHeight: 44 },
  linkText: { color: c.onSurfaceTertiary, fontFamily: fonts.mono, fontSize: 12 },
  form: { gap: spacing.md },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    color: c.onSurface,
    fontFamily: fonts.mono,
    fontSize: 14,
  },
}));
