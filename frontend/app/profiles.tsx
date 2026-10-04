import { Feather } from "@react-native-vector-icons/feather";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, cacheGet, cacheSet, KEYS } from "@/src/api";
import { useToast } from "@/src/components/Toast";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { Profile } from "./eq";

export default function Profiles() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<Profile[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await api<Profile[]>("/eq/profiles");
      setItems(list);
      setOffline(false);
      await cacheSet(KEYS.profiles, list);
    } catch {
      setOffline(true);
      setItems((await cacheGet<Profile[]>(KEYS.profiles)) ?? []);
    }
  }, []);

  useEffect(() => {
    cacheGet<Profile[]>(KEYS.profiles).then((c) => c && setItems(c));
    load();
  }, [load]);

  const remove = async (p: Profile) => {
    try {
      await api(`/eq/profiles/${p.id}`, { method: "DELETE" });
      const next = (items ?? []).filter((x) => x.id !== p.id);
      setItems(next);
      await cacheSet(KEYS.profiles, next);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="profiles-back-button" onPress={() => router.back()} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Saved EQs</Text>
        <View style={styles.iconBtn} />
      </View>
      {offline && <Text style={styles.offline} testID="profiles-offline">OFFLINE · showing saved copies</Text>}
      {items === null ? (
        <ActivityIndicator color={colors.onSurface} style={{ marginTop: spacing.xxl }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.onSurface} />}
          ListEmptyComponent={<Text style={styles.empty} testID="profiles-empty">No saved EQs yet. Tap the bookmark on the EQ screen to save one.</Text>}
          renderItem={({ item }) => (
            <Pressable
              testID={`profile-item-${item.id}`}
              onPress={() =>
                router.push({
                  pathname: "/eq",
                  params: { manufacturer: item.manufacturer, model: item.model, firmware: item.firmware, bands: String(item.band_count), profileId: item.id },
                })
              }
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={styles.bars}>
                {item.bands.map((b, i) => (
                  <View key={i} style={[styles.bar, { height: 4 + Math.abs(b.gain) * 2.5, backgroundColor: b.gain >= 0 ? colors.onSurface : colors.brandPrimary }]} />
                ))}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.meta} numberOfLines={1}>{item.manufacturer} · {item.model} · {item.band_count}B</Text>
              </View>
              <Pressable testID={`profile-delete-${item.id}`} onPress={() => remove(item)} style={styles.iconBtn} hitSlop={6}>
                <Feather name="trash-2" size={18} color={colors.onSurfaceTertiary} />
              </Pressable>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  title: { color: c.onSurface, fontFamily: fonts.display, fontSize: 28 },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  offline: { color: c.warning, fontFamily: fonts.mono, fontSize: 11, paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  list: { paddingHorizontal: spacing.xl, gap: spacing.md },
  empty: { color: c.muted, fontFamily: fonts.mono, fontSize: 12, lineHeight: 18, marginTop: spacing.xl },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.divider },
  pressed: { opacity: 0.7 },
  bars: { flexDirection: "row", alignItems: "center", gap: 2, width: 44, height: 44, justifyContent: "center" },
  bar: { width: 2, borderRadius: 1 },
  name: { color: c.onSurface, fontFamily: fonts.mono, fontSize: 14 },
  meta: { color: c.onSurfaceTertiary, fontFamily: fonts.mono, fontSize: 11 },
}));
