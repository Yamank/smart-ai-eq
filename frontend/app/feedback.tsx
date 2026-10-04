import { Feather } from "@react-native-vector-icons/feather";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useToast } from "@/src/components/Toast";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const KINDS = [
  { value: "manufacturer", label: "Brand" },
  { value: "model", label: "Model" },
  { value: "firmware", label: "Firmware" },
];

export default function FeedbackScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ manufacturer?: string; model?: string }>();
  const [kind, setKind] = useState(params.model ? "firmware" : params.manufacturer ? "model" : "manufacturer");
  const [manufacturer, setManufacturer] = useState(params.manufacturer ?? "");
  const [model, setModel] = useState(params.model ?? "");
  const [firmware, setFirmware] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const valid = manufacturer.trim() && (kind === "manufacturer" || model.trim()) && (kind !== "firmware" || firmware.trim());

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      await api("/feedback", { method: "POST", body: { kind, manufacturer, model, firmware, notes } });
      toast("Thanks! We’ll add it soon.", "success");
      router.back();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const field = (testID: string, label: string, value: string, set: (v: string) => void, placeholder: string, multiline = false) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={set}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={[styles.input, multiline && styles.multi]}
        multiline={multiline}
      />
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.title}>Feedback</Text>
        <Pressable testID="feedback-close-button" onPress={() => router.back()} style={styles.iconBtn}>
          <Feather name="x" size={22} color={colors.onSurface} />
        </Pressable>
      </View>
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      >
        <Text style={styles.lead}>Tell us what’s missing. An admin will add it to the master list.</Text>
        <View style={styles.kinds}>
          {KINDS.map((k) => (
            <Pressable key={k.value} testID={`feedback-kind-${k.value}`} onPress={() => setKind(k.value)} style={[styles.kind, kind === k.value && styles.kindActive]}>
              <Text style={[styles.kindText, kind === k.value && styles.kindTextActive]}>Missing {k.label}</Text>
            </Pressable>
          ))}
        </View>
        {field("feedback-manufacturer-input", "Manufacturer", manufacturer, setManufacturer, "e.g. Nothing")}
        {kind !== "manufacturer" && field("feedback-model-input", "Model", model, setModel, "e.g. Headphone (1)")}
        {field("feedback-firmware-input", kind === "firmware" ? "Firmware version" : "Firmware (optional)", firmware, setFirmware, "e.g. 1.0.1.74")}
        {field("feedback-notes-input", "Notes (optional)", notes, setNotes, "Release date, source link…", true)}
        <Pressable
          testID="feedback-submit-button"
          disabled={!valid || busy}
          onPress={submit}
          style={({ pressed }) => [styles.cta, !valid && styles.ctaDisabled, pressed && styles.pressed]}
        >
          {busy ? <ActivityIndicator color={colors.onBrandSecondary} /> : <Text style={[styles.ctaText, !valid && styles.ctaTextDisabled]}>Send feedback</Text>}
        </Pressable>
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
  kinds: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  kind: { height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, justifyContent: "center" },
  kindActive: { borderColor: c.brandPrimary },
  kindText: { color: c.onSurfaceTertiary, fontFamily: fonts.mono, fontSize: 12 },
  kindTextActive: { color: c.onSurface },
  field: { gap: spacing.sm },
  label: { color: c.onSurfaceTertiary, fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase" },
  input: { height: 52, borderWidth: 1, borderColor: c.borderStrong, borderRadius: radius.sm, paddingHorizontal: spacing.lg, color: c.onSurface, fontFamily: fonts.mono, fontSize: 14 },
  multi: { height: 96, paddingTop: spacing.md, textAlignVertical: "top" },
  cta: { height: 56, borderRadius: radius.pill, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  ctaDisabled: { backgroundColor: c.brandTertiary },
  ctaText: { color: c.onBrandSecondary, fontFamily: fonts.mono, fontSize: 15 },
  ctaTextDisabled: { color: c.muted },
  pressed: { opacity: 0.7 },
}));
