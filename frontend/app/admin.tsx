import { Feather } from "@react-native-vector-icons/feather";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Switch, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useToast } from "@/src/components/Toast";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Fb = { id: string; kind: string; manufacturer: string; model: string; firmware: string; notes: string; user_email: string; status: string; created_at: string };
type Settings = { allow_user_keys: boolean; default_provider: string; default_model: string; available_models: { provider: string; model: string; label: string }[] };

export default function Admin() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [feedback, setFeedback] = useState<Fb[] | null>(null);
  const [form, setForm] = useState({ manufacturer: "", model: "", year: "", type: "", firmware: "" });
  const [busy, setBusy] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, f] = await Promise.all([api<Settings>("/settings"), api<Fb[]>("/admin/feedback")]);
      setSettings(s);
      setFeedback(f);
    } catch (e) {
      toast((e as Error).message, "error");
      setFeedback([]);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const saveSettings = async (patch: Partial<Settings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      const s = await api<Settings>("/admin/settings", {
        method: "PUT",
        body: { allow_user_keys: next.allow_user_keys, default_provider: next.default_provider, default_model: next.default_model },
      });
      setSettings(s);
      toast("Settings saved", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const addToCatalog = async () => {
    if (!form.manufacturer.trim()) return;
    setBusy(true);
    try {
      const res = await api<{ manufacturer: string; model: string | null; added_firmware: string[] }>("/admin/catalog", {
        method: "POST",
        body: {
          manufacturer: form.manufacturer,
          model: form.model,
          year: form.year ? Number(form.year) : null,
          type: form.type,
          firmware: form.firmware.split(",").map((s) => s.trim()).filter(Boolean),
        },
      });
      toast(`Saved ${res.manufacturer}${res.model ? ` · ${res.model}` : ""}${res.added_firmware.length ? ` (+${res.added_firmware.length} FW)` : ""}`, "success");
      setForm({ manufacturer: "", model: "", year: "", type: "", firmware: "" });
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (f: Fb, status: string) => {
    try {
      await api(`/admin/feedback/${f.id}`, { method: "PATCH", body: { status } });
      setFeedback((prev) => prev?.map((x) => (x.id === f.id ? { ...x, status } : x)) ?? null);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const input = (key: keyof typeof form, label: string, placeholder: string, numeric = false) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        testID={`admin-${key}-input`}
        value={form[key]}
        onChangeText={(v) => setForm((s) => ({ ...s, [key]: v }))}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={numeric ? "number-pad" : "default"}
        style={styles.input}
      />
    </View>
  );

  const visible = (feedback ?? []).filter((f) => showResolved || f.status === "open");

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="admin-back-button" onPress={() => router.back()} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Admin</Text>
        <View style={styles.iconBtn} />
      </View>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        {/* AI settings */}
        <Text style={styles.section}>AI MODEL</Text>
        {!settings ? (
          <ActivityIndicator color={colors.onSurface} />
        ) : (
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Allow users’ own API keys</Text>
                <Text style={styles.rowSub}>Users can pick a model and paste their key</Text>
              </View>
              <Switch
                testID="admin-allow-keys-switch"
                value={settings.allow_user_keys}
                onValueChange={(v) => saveSettings({ allow_user_keys: v })}
                trackColor={{ false: colors.border, true: colors.brandSecondary }}
                thumbColor={settings.allow_user_keys ? colors.onBrandSecondary : colors.onSurfaceTertiary}
              />
            </View>
            <Text style={styles.label}>Default model</Text>
            <View style={styles.chips}>
              {settings.available_models.map((m) => {
                const active = m.model === settings.default_model;
                return (
                  <Pressable
                    key={m.model}
                    testID={`admin-model-${m.model}`}
                    onPress={() => saveSettings({ default_provider: m.provider, default_model: m.model })}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{m.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* Add to master list */}
        <Text style={styles.section}>ADD TO MASTER LIST</Text>
        <View style={styles.card}>
          {input("manufacturer", "Manufacturer *", "e.g. Nothing")}
          {input("model", "Model (optional)", "e.g. Headphone (1)")}
          <View style={styles.twoCol}>
            <View style={{ flex: 1 }}>{input("year", "Year", "2025", true)}</View>
            <View style={{ flex: 1 }}>{input("type", "Type", "Over-ear ANC")}</View>
          </View>
          {input("firmware", "Firmware (newest first, comma separated)", "1.0.1.80, 1.0.1.74")}
          <Text style={styles.hint}>Existing brand/model? New firmware versions are added on top as Latest.</Text>
          <Pressable
            testID="admin-add-catalog-button"
            disabled={busy || !form.manufacturer.trim()}
            onPress={addToCatalog}
            style={({ pressed }) => [styles.cta, !form.manufacturer.trim() && styles.ctaDisabled, pressed && styles.pressed]}
          >
            {busy ? <ActivityIndicator color={colors.onBrandSecondary} /> : <Text style={styles.ctaText}>Save to master list</Text>}
          </Pressable>
        </View>

        {/* Feedback */}
        <View style={styles.sectionRow}>
          <Text style={styles.section}>USER FEEDBACK</Text>
          <Pressable testID="admin-toggle-resolved" onPress={() => setShowResolved((s) => !s)} hitSlop={8}>
            <Text style={styles.linkText}>{showResolved ? "Hide resolved" : "Show resolved"}</Text>
          </Pressable>
        </View>
        {feedback === null ? (
          <ActivityIndicator color={colors.onSurface} />
        ) : visible.length === 0 ? (
          <Text style={styles.empty} testID="admin-feedback-empty">No missing devices reported.</Text>
        ) : (
          visible.map((f) => (
            <View key={f.id} style={[styles.card, f.status !== "open" && styles.dim]} testID={`admin-feedback-${f.id}`}>
              <Text style={styles.fbKind}>MISSING {f.kind.toUpperCase()}</Text>
              <Text style={styles.rowTitle}>
                {[f.manufacturer, f.model, f.firmware].filter(Boolean).join(" · ")}
              </Text>
              {!!f.notes && <Text style={styles.rowSub}>{f.notes}</Text>}
              <Text style={styles.rowSub}>{f.user_email} · {f.created_at.slice(0, 10)}</Text>
              <View style={styles.fbActions}>
                <Pressable
                  testID={`admin-feedback-use-${f.id}`}
                  onPress={() => setForm({ manufacturer: f.manufacturer, model: f.model, year: "", type: "", firmware: f.firmware })}
                  style={styles.smallBtn}
                >
                  <Text style={styles.smallBtnText}>Use in form</Text>
                </Pressable>
                <Pressable
                  testID={`admin-feedback-resolve-${f.id}`}
                  onPress={() => setStatus(f, f.status === "open" ? "resolved" : "open")}
                  style={styles.smallBtn}
                >
                  <Text style={styles.smallBtnText}>{f.status === "open" ? "Resolve" : "Reopen"}</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  title: { color: c.onSurface, fontFamily: fonts.display, fontSize: 28 },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: spacing.xl, gap: spacing.lg },
  section: { color: c.muted, fontFamily: fonts.mono, fontSize: 11, letterSpacing: 2, marginTop: spacing.sm },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  linkText: { color: c.onSurfaceTertiary, fontFamily: fonts.mono, fontSize: 11, textDecorationLine: "underline" },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.divider, padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rowTitle: { color: c.onSurface, fontFamily: fonts.mono, fontSize: 14 },
  rowSub: { color: c.onSurfaceTertiary, fontFamily: fonts.mono, fontSize: 11, lineHeight: 16 },
  label: { color: c.onSurfaceTertiary, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, justifyContent: "center" },
  chipActive: { borderColor: c.brandPrimary },
  chipText: { color: c.onSurfaceTertiary, fontFamily: fonts.mono, fontSize: 12 },
  chipTextActive: { color: c.onSurface },
  field: { gap: spacing.xs },
  input: { height: 48, borderWidth: 1, borderColor: c.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, color: c.onSurface, fontFamily: fonts.mono, fontSize: 14 },
  twoCol: { flexDirection: "row", gap: spacing.md },
  hint: { color: c.muted, fontFamily: fonts.mono, fontSize: 10 },
  cta: { height: 52, borderRadius: radius.pill, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
  ctaDisabled: { backgroundColor: c.brandTertiary },
  ctaText: { color: c.onBrandSecondary, fontFamily: fonts.mono, fontSize: 14 },
  pressed: { opacity: 0.7 },
  empty: { color: c.muted, fontFamily: fonts.mono, fontSize: 12 },
  dim: { opacity: 0.5 },
  fbKind: { color: c.brandPrimary, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.5 },
  fbActions: { flexDirection: "row", gap: spacing.sm },
  smallBtn: { height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: c.borderStrong, justifyContent: "center" },
  smallBtnText: { color: c.onSurface, fontFamily: fonts.mono, fontSize: 12 },
}));
