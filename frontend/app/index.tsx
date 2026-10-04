import { Feather } from "@react-native-vector-icons/feather";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, cacheGet, cacheSet, KEYS } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Dropdown } from "@/src/components/Dropdown";
import { useToast } from "@/src/components/Toast";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export type Catalog = {
  updated_at: string;
  manufacturers: { name: string; models: { id: string; name: string; year?: number; type?: string; firmware: string[] }[] }[];
};
export type Selection = { manufacturer: string | null; model: string | null; firmware: string | null; bands: 8 | 10 };

export default function Setup() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user, signOut } = useAuth();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [allowKeys, setAllowKeys] = useState(false);
  const [sel, setSel] = useState<Selection>({ manufacturer: null, model: null, firmware: null, bands: 8 });

  const load = useCallback(async () => {
    try {
      const fresh = await api<Catalog>("/catalog");
      setCatalog(fresh);
      setOffline(false);
      await cacheSet(KEYS.catalog, fresh);
    } catch {
      setOffline(true);
    }
    try {
      const s = await api<{ allow_user_keys: boolean }>("/settings");
      setAllowKeys(s.allow_user_keys);
      await cacheSet(KEYS.settings, s);
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      const [cached, last, s] = await Promise.all([
        cacheGet<Catalog>(KEYS.catalog),
        cacheGet<Selection>(KEYS.selection),
        cacheGet<{ allow_user_keys: boolean }>(KEYS.settings),
      ]);
      if (cached) setCatalog(cached);
      if (last) setSel(last);
      if (s) setAllowKeys(s.allow_user_keys);
      load();
    })();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      api<{ allow_user_keys: boolean }>("/settings").then((s) => setAllowKeys(s.allow_user_keys)).catch(() => {});
    }, []),
  );

  const manufacturer = catalog?.manufacturers.find((m) => m.name === sel.manufacturer);
  const model = manufacturer?.models.find((m) => m.name === sel.model);

  const manOptions = useMemo(
    () => (catalog?.manufacturers ?? []).map((m) => ({ value: m.name, label: m.name, hint: `${m.models.length} models` })),
    [catalog],
  );
  const modelOptions = useMemo(
    () => (manufacturer?.models ?? []).map((m) => ({ value: m.name, label: m.name, hint: [m.year, m.type].filter(Boolean).join(" · ") })),
    [manufacturer],
  );
  const fwOptions = useMemo(
    () =>
      (model?.firmware ?? []).map((f, i) => ({ value: i === 0 ? "Latest" : f, label: i === 0 ? `${f} · Latest` : f })),
    [model],
  );

  const ready = !!(manufacturer && model && sel.firmware);

  const optimize = async () => {
    if (!ready) return;
    await cacheSet(KEYS.selection, sel);
    router.push({
      pathname: "/eq",
      params: { manufacturer: sel.manufacturer!, model: sel.model!, firmware: sel.firmware!, bands: String(sel.bands) },
    });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.title} testID="setup-title">Equaliser</Text>
        <View style={styles.headerIcons}>
          <Pressable testID="open-profiles-button" hitSlop={6} onPress={() => router.push("/profiles")} style={styles.iconBtn}>
            <Feather name="bookmark" size={20} color={colors.onSurface} />
          </Pressable>
          {allowKeys && (
            <Pressable testID="open-ai-settings-button" hitSlop={6} onPress={() => router.push("/ai-settings")} style={styles.iconBtn}>
              <Feather name="cpu" size={20} color={colors.onSurface} />
            </Pressable>
          )}
          {user?.role === "admin" && (
            <Pressable testID="open-admin-button" hitSlop={6} onPress={() => router.push("/admin")} style={styles.iconBtn}>
              <Feather name="shield" size={20} color={colors.onSurface} />
            </Pressable>
          )}
          <Pressable testID="logout-button" hitSlop={6} onPress={signOut} style={styles.iconBtn}>
            <Feather name="log-out" size={20} color={colors.onSurface} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.onSurface} />}
      >
        <Text style={styles.lead}>Select your headphones. The AI tunes the EQ to them and to what you’re playing.</Text>

        {offline && (
          <View style={styles.banner} testID="offline-banner">
            <Feather name="wifi-off" size={14} color={colors.warning} />
            <Text style={styles.bannerText}>Offline · using saved device list</Text>
          </View>
        )}

        {!catalog ? (
          <ActivityIndicator color={colors.onSurface} style={{ marginTop: spacing.xxl }} />
        ) : (
          <View style={styles.form}>
            <Dropdown
              testID="manufacturer-dropdown"
              label="01 · Manufacturer"
              placeholder="Select brand"
              value={sel.manufacturer}
              options={manOptions}
              onChange={(v) => setSel((s) => ({ ...s, manufacturer: v, model: null, firmware: null }))}
            />
            <Dropdown
              testID="headphone-dropdown"
              label="02 · Headphones"
              placeholder={manufacturer ? "Select model" : "Choose a brand first"}
              value={sel.model}
              disabled={!manufacturer}
              options={modelOptions}
              onChange={(v) => setSel((s) => ({ ...s, model: v, firmware: "Latest" }))}
            />
            <Dropdown
              testID="firmware-dropdown"
              label="03 · Firmware"
              placeholder={model ? "Select firmware" : "Choose a model first"}
              value={sel.firmware}
              disabled={!model}
              options={fwOptions}
              searchable={false}
              onChange={(v) => setSel((s) => ({ ...s, firmware: v }))}
            />

            <View style={styles.bandsWrap}>
              <Text style={styles.label}>04 · Frequency bands</Text>
              <View style={styles.radios}>
                {([8, 10] as const).map((n) => {
                  const active = sel.bands === n;
                  return (
                    <Pressable
                      key={n}
                      testID={`bands-radio-${n}`}
                      onPress={() => setSel((s) => ({ ...s, bands: n }))}
                      style={[styles.radio, active && styles.radioActive]}
                    >
                      <View style={[styles.radioDot, active && styles.radioDotActive]}>{active && <View style={styles.radioInner} />}</View>
                      <Text style={styles.radioText}>{n} Band</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Pressable
              testID="send-feedback-link"
              onPress={() =>
                router.push({
                  pathname: "/feedback",
                  params: { manufacturer: sel.manufacturer ?? "", model: sel.model ?? "" },
                })
              }
              style={styles.feedback}
              hitSlop={6}
            >
              <Feather name="message-square" size={14} color={colors.onSurfaceTertiary} />
              <Text style={styles.feedbackText}>Missing brand, model or firmware? Tell us</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Pressable
          testID="optimize-eq-button"
          disabled={!ready}
          onPress={() => {
            if (!ready) toast("Select all fields first");
            optimize();
          }}
          style={({ pressed }) => [styles.cta, !ready && styles.ctaDisabled, pressed && styles.pressed]}
        >
          <Feather name="zap" size={18} color={ready ? colors.onBrandSecondary : colors.muted} />
          <Text style={[styles.ctaText, !ready && styles.ctaTextDisabled]}>Optimize EQ</Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  title: { color: c.onSurface, fontFamily: fonts.display, fontSize: 34 },
  headerIcons: { flexDirection: "row" },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.xl, gap: spacing.xl },
  lead: { color: c.onSurfaceTertiary, fontFamily: fonts.mono, fontSize: 13, lineHeight: 20 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: c.warning,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  bannerText: { color: c.warning, fontFamily: fonts.mono, fontSize: 12 },
  form: { gap: spacing.xl },
  bandsWrap: { gap: spacing.sm },
  label: { color: c.onSurfaceTertiary, fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase" },
  radios: { flexDirection: "row", gap: spacing.md },
  radio: {
    flex: 1,
    height: 52,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  radioActive: { borderColor: c.borderStrong },
  radioDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: c.muted, alignItems: "center", justifyContent: "center" },
  radioDotActive: { borderColor: c.brandPrimary },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.brandPrimary },
  radioText: { color: c.onSurface, fontFamily: fonts.mono, fontSize: 14 },
  feedback: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44 },
  feedbackText: { color: c.onSurfaceTertiary, fontFamily: fonts.mono, fontSize: 12, textDecorationLine: "underline" },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: c.divider, backgroundColor: c.surface },
  cta: {
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: c.brandSecondary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  ctaDisabled: { backgroundColor: c.brandTertiary },
  ctaText: { color: c.onBrandSecondary, fontFamily: fonts.mono, fontSize: 16 },
  ctaTextDisabled: { color: c.muted },
  pressed: { opacity: 0.7 },
}));
