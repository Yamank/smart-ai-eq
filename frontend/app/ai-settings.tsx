import { Feather } from "@react-native-vector-icons/feather";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, cacheGet, cacheSet, KEYS } from "@/src/api";
import { useToast } from "@/src/components/Toast";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { storage } from "@/src/utils/storage";

type M = { provider: string; model: string; label: string };

export default function AiSettings() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const [models, setModels] = useState<M[]>([]);
  const [chosen, setChosen] = useState<M | null>(null);
  const [key, setKey] = useState("");
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    api<{ available_models: M[] }>("/settings").then((s) => setModels(s.available_models)).catch(() => {});
    cacheGet<M>(KEYS.userModel).then(setChosen);
    storage.secureGet<string | null>(KEYS.userKey, null).then((k) => setHasKey(!!k));
  }, []);

  const save = async () => {
    if (!chosen || !key.trim()) return;
    await cacheSet(KEYS.userModel, chosen);
    await storage.secureSet(KEYS.userKey, key.trim());
    toast("Your key is saved on this device", "success");
    router.back();
  };

  const clear = async () => {
    await storage.secureRemove(KEYS.userKey);
    await storage.removeItem(KEYS.userModel);
    setHasKey(false);
    setChosen(null);
    toast("Using the app’s default AI");
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.title}>Your AI</Text>
        <Pressable testID="ai-settings-close-button" onPress={() => router.back()} style={styles.iconBtn}>
          <Feather name="x" size={22} color={colors.onSurface} />
        </Pressable>
      </View>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Text style={styles.lead}>Optional. Use your own provider key — it stays encrypted on this device.</Text>
        <Text style={styles.label}>Model</Text>
        <View style={styles.chips}>
          {models.map((m) => (
            <Pressable key={m.model} testID={`ai-model-${m.model}`} onPress={() => setChosen(m)} style={[styles.chip, chosen?.model === m.model && styles.chipActive]}>
              <Text style={[styles.chipText, chosen?.model === m.model && styles.chipTextActive]}>{m.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>{chosen ? `${chosen.provider} API key` : "API key"}</Text>
        <TextInput
          testID="ai-key-input"
          value={key}
          onChangeText={setKey}
          placeholder={hasKey ? "•••••• saved — paste to replace" : "Paste key"}
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={styles.input}
        />
        <Pressable testID="ai-settings-save-button" disabled={!chosen || !key.trim()} onPress={save} style={[styles.cta, (!chosen || !key.trim()) && styles.ctaDisabled]}>
          <Text style={[styles.ctaText, (!chosen || !key.trim()) && styles.ctaTextDisabled]}>Save</Text>
        </Pressable>
        {hasKey && (
          <Pressable testID="ai-settings-clear-button" onPress={clear} style={styles.link}>
            <Text style={styles.linkText}>Remove my key · use default AI</Text>
          </Pressable>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  title: { color: c.onSurface, fontFamily: fonts.display, fontSize: 32 },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: spacing.xl, gap: spacing.lg },
  lead: { color: c.onSurfaceTertiary, fontFamily: fonts.mono, fontSize: 13, lineHeight: 20 },
  label: { color: c.onSurfaceTertiary, fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, justifyContent: "center" },
  chipActive: { borderColor: c.brandPrimary },
  chipText: { color: c.onSurfaceTertiary, fontFamily: fonts.mono, fontSize: 12 },
  chipTextActive: { color: c.onSurface },
  input: { height: 52, borderWidth: 1, borderColor: c.borderStrong, borderRadius: radius.sm, paddingHorizontal: spacing.lg, color: c.onSurface, fontFamily: fonts.mono, fontSize: 14 },
  cta: { height: 56, borderRadius: radius.pill, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
  ctaDisabled: { backgroundColor: c.brandTertiary },
  ctaText: { color: c.onBrandSecondary, fontFamily: fonts.mono, fontSize: 15 },
  ctaTextDisabled: { color: c.muted },
  link: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  linkText: { color: c.onSurfaceTertiary, fontFamily: fonts.mono, fontSize: 12, textDecorationLine: "underline" },
}));
