import { Feather } from "@react-native-vector-icons/feather";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Share, Text, TextInput, useWindowDimensions, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, ApiError, cacheGet, cacheSet, KEYS } from "@/src/api";
import { ABTest } from "@/src/components/ABTest";
import { BandSlider } from "@/src/components/BandSlider";
import { EqGraph } from "@/src/components/EqGraph";
import { useToast } from "@/src/components/Toast";
import { Band, BandCount, bandsText, clampFreq, flatBands, fmtHz, roundQ } from "@/src/eq";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { storage } from "@/src/utils/storage";

type Analysis = {
  song?: Record<string, any>;
  headphone?: Record<string, any>;
  summary?: string;
  firmware?: string;
  ai_model?: string;
  preamp?: number;
};
export type Profile = {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  firmware: string;
  band_count: number;
  bands: Band[];
  song: { title?: string; artist?: string };
  analysis: Analysis;
  created_at: string;
};

export default function EqScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const p = useLocalSearchParams<{ manufacturer: string; model: string; firmware: string; bands: string; profileId?: string }>();
  const count = (Number(p.bands) === 10 ? 10 : 8) as BandCount;

  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [lastSong, setLastSong] = useState({ title: "", artist: "" });
  const [bands, setBands] = useState<Band[]>(flatBands(count));
  const [aiBands, setAiBands] = useState<Band[]>(flatBands(count));
  const [analysis, setAnalysis] = useState<Analysis>({});
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState<"eq" | "insights">("eq");
  const [history, setHistory] = useState<Band[][]>([]);
  const [hIndex, setHIndex] = useState(-1);
  const [saving, setSaving] = useState(false);
  const reqId = useRef(0);

  const applyNew = useCallback((b: Band[]) => {
    setBands(b);
    setAiBands(b);
    setHistory([b]);
    setHIndex(0);
  }, []);

  const optimize = useCallback(
    async (songTitle: string, songArtist: string) => {
      const id = ++reqId.current;
      setStatus("loading");
      setError("");
      const [userKey, userModel] = await Promise.all([
        storage.secureGet<string | null>(KEYS.userKey, null),
        cacheGet<{ provider: string; model: string }>(KEYS.userModel),
      ]);
      try {
        const res = await api<Analysis & { bands: Band[] }>("/eq/recommend", {
          method: "POST",
          body: {
            manufacturer: p.manufacturer,
            model: p.model,
            firmware: p.firmware,
            band_count: count,
            song_title: songTitle,
            artist: songArtist,
            ...(userKey && userModel ? { api_key: userKey, provider: userModel.provider, model_name: userModel.model } : {}),
          },
        });
        if (id !== reqId.current) return;
        applyNew(res.bands);
        setAnalysis(res);
        setLastSong({ title: songTitle, artist: songArtist });
        await cacheSet("last_song", { title: songTitle, artist: songArtist });
        setStatus("idle");
      } catch (e) {
        if (id !== reqId.current) return;
        const offline = e instanceof ApiError && e.status === 0;
        // offline: fall back to a saved profile for this headphone
        if (offline) {
          const saved = (await cacheGet<Profile[]>(KEYS.profiles)) ?? [];
          const match = saved.find((s) => s.model === p.model && s.band_count === count);
          if (match) {
            applyNew(match.bands);
            setAnalysis(match.analysis ?? {});
            toast(`Offline · loaded saved “${match.name}”`);
            setStatus("idle");
            return;
          }
        }
        setError(offline ? "Offline. AI needs a connection — saved EQs still work." : (e as Error).message);
        setStatus("error");
      }
    },
    [p.manufacturer, p.model, p.firmware, count, applyNew, toast],
  );

  useEffect(() => {
    (async () => {
      if (p.profileId) {
        const saved = (await cacheGet<Profile[]>(KEYS.profiles)) ?? [];
        const prof = saved.find((s) => s.id === p.profileId);
        if (prof) {
          applyNew(prof.bands);
          setAnalysis(prof.analysis ?? {});
          setTitle(prof.song?.title ?? "");
          setArtist(prof.song?.artist ?? "");
          setLastSong({ title: prof.song?.title ?? "", artist: prof.song?.artist ?? "" });
          return;
        }
      }
      const s = await cacheGet<{ title: string; artist: string }>("last_song");
      setTitle(s?.title ?? "");
      setArtist(s?.artist ?? "");
      optimize(s?.title ?? "", s?.artist ?? "");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const songChanged = title.trim() !== lastSong.title || artist.trim() !== lastSong.artist;
  const submitSong = () => {
    if (status === "loading") return;
    optimize(title.trim(), artist.trim());
  };

  const commit = (next: Band[]) => {
    const h = [...history.slice(0, hIndex + 1), next].slice(-50);
    setHistory(h);
    setHIndex(h.length - 1);
  };
  const update = (i: number, patch: Partial<Band>, push = false) => {
    setBands((prev) => {
      const next = prev.map((b, j) => (j === i ? { ...b, ...patch } : b));
      if (push) commit(next);
      return next;
    });
  };
  const undo = () => {
    if (hIndex <= 0) return;
    setHIndex(hIndex - 1);
    setBands(history[hIndex - 1]);
  };
  const redo = () => {
    if (hIndex >= history.length - 1) return;
    setHIndex(hIndex + 1);
    setBands(history[hIndex + 1]);
  };
  const reset = () => {
    setBands(aiBands);
    commit(aiBands);
    toast("Reset to AI recommendation");
  };

  const sel = bands[selected];
  const stepFreq = (dir: 1 | -1) => {
    const f = clampFreq(sel.freq * (dir > 0 ? 1.06 : 1 / 1.06) + dir, selected, count);
    update(selected, { freq: f }, true);
  };
  const stepQ = (dir: 1 | -1) => update(selected, { q: roundQ(sel.q + dir * 0.1) }, true);

  const save = async () => {
    setSaving(true);
    const name = lastSong.title ? `${lastSong.title}${lastSong.artist ? ` — ${lastSong.artist}` : ""}` : `${p.model} · General`;
    const body = {
      name,
      manufacturer: p.manufacturer,
      model: p.model,
      firmware: analysis.firmware ?? p.firmware,
      band_count: count,
      bands: bands.map(({ freq, gain, q, reason }) => ({ freq, gain, q, reason: reason ?? "" })),
      song: lastSong,
      analysis,
    };
    try {
      const saved = await api<Profile>("/eq/profiles", { method: "POST", body });
      const list = (await cacheGet<Profile[]>(KEYS.profiles)) ?? [];
      await cacheSet(KEYS.profiles, [saved, ...list]);
      toast("Saved to profiles", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const share = () =>
    Share.share({
      message: `AI EQ · ${p.manufacturer} ${p.model} (FW ${analysis.firmware ?? p.firmware})${lastSong.title ? `\nSong: ${lastSong.title} ${lastSong.artist}` : ""}\nPreamp ${analysis.preamp ?? 0} dB\n${bandsText(bands)}`,
    }).catch(() => {});

  const colW = Math.floor((width - spacing.xl * 2) / count);
  const song = analysis.song ?? {};
  const hp = analysis.headphone ?? {};

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="eq-back-button" onPress={() => router.back()} style={styles.iconBtn} hitSlop={6}>
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={styles.headerIcons}>
          <Pressable testID="eq-share-button" onPress={share} style={styles.iconBtn} hitSlop={6}>
            <Feather name="share-2" size={20} color={colors.onSurface} />
          </Pressable>
          <Pressable testID="eq-save-button" onPress={save} disabled={saving || status === "loading"} style={styles.iconBtn} hitSlop={6}>
            {saving ? <ActivityIndicator color={colors.onSurface} /> : <Feather name="bookmark" size={20} color={colors.onSurface} />}
          </Pressable>
        </View>
      </View>

      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Text style={styles.title}>Equaliser</Text>
        <Text style={styles.device} testID="eq-device-info" numberOfLines={2}>
          {p.manufacturer} · {p.model} · FW {analysis.firmware ?? p.firmware} · {count} BAND
        </Text>

        {/* Now playing */}
        <View style={styles.now}>
          <View style={styles.nowHead}>
            <View style={[styles.liveDot, status === "loading" && styles.liveDotBusy]} />
            <Text style={styles.nowLabel}>NOW PLAYING</Text>
          </View>
          <TextInput
            testID="song-title-input"
            value={title}
            onChangeText={setTitle}
            placeholder="Song title (leave empty for general EQ)"
            placeholderTextColor={colors.muted}
            style={styles.songInput}
            returnKeyType="search"
            onSubmitEditing={submitSong}
          />
          <View style={styles.nowRow}>
            <TextInput
              testID="song-artist-input"
              value={artist}
              onChangeText={setArtist}
              placeholder="Artist"
              placeholderTextColor={colors.muted}
              style={[styles.artistInput]}
              returnKeyType="search"
              onSubmitEditing={submitSong}
            />
            <Pressable
              testID="reoptimize-button"
              onPress={submitSong}
              disabled={status === "loading"}
              style={({ pressed }) => [styles.reBtn, songChanged && styles.reBtnHot, pressed && styles.pressed]}
            >
              {status === "loading" ? (
                <ActivityIndicator size="small" color={colors.onSurface} />
              ) : (
                <Feather name="refresh-cw" size={16} color={songChanged ? colors.onBrandPrimary : colors.onSurface} />
              )}
            </Pressable>
          </View>
        </View>

        {status === "loading" && (
          <Text style={styles.statusText} testID="eq-status-loading">AI analysing song, headphones & firmware…</Text>
        )}
        {status === "error" && (
          <Pressable testID="eq-error-retry" onPress={submitSong} style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.errorRetry}>Tap to retry</Text>
          </Pressable>
        )}
        {status === "idle" && !!analysis.summary && (
          <Text style={styles.summary} testID="eq-summary" numberOfLines={3}>
            {analysis.summary}
          </Text>
        )}

        <View style={styles.tabs}>
          {(["eq", "insights"] as const).map((t) => (
            <Pressable key={t} testID={`eq-tab-${t}`} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t === "eq" ? "Advanced" : "Insights"}</Text>
            </Pressable>
          ))}
        </View>

        {tab === "eq" ? (
          <View style={styles.eqWrap}>
            <EqGraph testID="eq-graph" bands={bands} selected={selected} onSelect={setSelected} />

            <View style={styles.sliders} testID="eq-sliders">
              {bands.map((b, i) => (
                <BandSlider
                  key={i}
                  index={i}
                  band={b}
                  width={colW}
                  selected={i === selected}
                  onSelect={() => setSelected(i)}
                  onChange={(g) => update(i, { gain: g })}
                  onCommit={() => commit(bands)}
                />
              ))}
            </View>

            <View style={styles.pills}>
              <View style={styles.pill} testID="freq-control">
                <Pressable testID="freq-down-button" onPress={() => stepFreq(-1)} style={styles.pillBtn} hitSlop={4}>
                  <Feather name="minus" size={16} color={colors.onSurface} />
                </Pressable>
                <View style={styles.pillCenter}>
                  <View style={styles.pillLine} />
                  <Text style={styles.pillText} testID="freq-value">F {fmtHz(sel.freq)}HZ</Text>
                </View>
                <Pressable testID="freq-up-button" onPress={() => stepFreq(1)} style={styles.pillBtn} hitSlop={4}>
                  <Feather name="plus" size={16} color={colors.onSurface} />
                </Pressable>
              </View>
              <View style={styles.pill} testID="q-control">
                <Pressable testID="q-down-button" onPress={() => stepQ(-1)} style={styles.pillBtn} hitSlop={4}>
                  <Feather name="minus" size={16} color={colors.onSurface} />
                </Pressable>
                <View style={styles.pillCenter}>
                  <View style={styles.pillLine} />
                  <Text style={styles.pillText} testID="q-value">Q {sel.q.toFixed(1)}</Text>
                </View>
                <Pressable testID="q-up-button" onPress={() => stepQ(1)} style={styles.pillBtn} hitSlop={4}>
                  <Feather name="plus" size={16} color={colors.onSurface} />
                </Pressable>
              </View>
            </View>
            {!!sel.reason && <Text style={styles.reason}>B{selected + 1} · {sel.reason}</Text>}

            <View style={styles.actions}>
              <Pressable testID="eq-reset-button" onPress={reset} style={({ pressed }) => [styles.reset, pressed && styles.pressed]}>
                <Text style={styles.resetText}>Reset</Text>
              </Pressable>
              <View style={styles.undoRow}>
                <Pressable testID="eq-undo-button" onPress={undo} disabled={hIndex <= 0} style={[styles.undo, hIndex <= 0 && styles.dim]}>
                  <Feather name="rotate-ccw" size={18} color={colors.onSurface} />
                </Pressable>
                <Pressable
                  testID="eq-redo-button"
                  onPress={redo}
                  disabled={hIndex >= history.length - 1}
                  style={[styles.undo, hIndex >= history.length - 1 && styles.dim]}
                >
                  <Feather name="rotate-cw" size={18} color={colors.onSurface} />
                </Pressable>
              </View>
            </View>

            <ABTest bands={bands} />
            <Text style={styles.note}>
              Test plays a reference track with and without your AI EQ. Applying EQ to other apps’ audio needs the native build.
            </Text>
          </View>
        ) : (
          <ScrollView scrollEnabled={false} contentContainerStyle={styles.insights} testID="eq-insights">
            <Info label="Genre" value={song.genre} />
            <Info label="BPM" value={song.bpm ? String(song.bpm) : undefined} />
            <Info label="Key" value={song.key} />
            <Info label="Dynamic range" value={song.dynamic_range} />
            <Info label="Spectral profile" value={song.spectral_profile} />
            <Info label="Headphone signature" value={hp.sound_signature} />
            <Info label="Firmware notes" value={hp.firmware_notes} />
            <Info label="Known issues" value={hp.known_issues} />
            <Info label="Preamp" value={analysis.preamp !== undefined ? `${analysis.preamp} dB` : undefined} />
            <Info label="AI model" value={analysis.ai_model} />
            <Text style={styles.sectionLabel}>BANDS</Text>
            {bands.map((b, i) => (
              <View key={i} style={styles.bandRow}>
                <Text style={styles.bandRowHead}>
                  B{i + 1} · {fmtHz(b.freq)}Hz · {b.gain > 0 ? "+" : ""}
                  {b.gain}dB · Q{b.q.toFixed(1)}
                </Text>
                {!!b.reason && <Text style={styles.bandRowReason}>{b.reason}</Text>}
              </View>
            ))}
          </ScrollView>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

function Info({ label, value }: { label: string; value?: string }) {
  const styles = useStyles();
  if (!value) return null;
  return (
    <View style={styles.info}>
      <Text style={styles.sectionLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.md },
  headerIcons: { flexDirection: "row" },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: spacing.xl, gap: spacing.lg },
  title: { color: c.onSurface, fontFamily: fonts.display, fontSize: 40, lineHeight: 48 },
  device: { color: c.onSurfaceTertiary, fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, marginTop: -spacing.sm },
  now: { borderWidth: 1, borderColor: c.border, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, backgroundColor: c.surfaceSecondary },
  nowHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.brandPrimary },
  liveDotBusy: { backgroundColor: c.warning },
  nowLabel: { color: c.onSurfaceTertiary, fontFamily: fonts.mono, fontSize: 11, letterSpacing: 2 },
  songInput: { color: c.onSurface, fontFamily: fonts.display, fontSize: 22, paddingVertical: spacing.xs, minHeight: 40 },
  nowRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  artistInput: { flex: 1, color: c.onSurfaceTertiary, fontFamily: fonts.mono, fontSize: 13, minHeight: 40 },
  reBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
  reBtnHot: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  pressed: { opacity: 0.6 },
  statusText: { color: c.warning, fontFamily: fonts.mono, fontSize: 12 },
  errorBox: { borderWidth: 1, borderColor: c.error, borderRadius: radius.sm, padding: spacing.md, gap: spacing.xs },
  errorText: { color: c.error, fontFamily: fonts.mono, fontSize: 12 },
  errorRetry: { color: c.onSurface, fontFamily: fonts.mono, fontSize: 11, textDecorationLine: "underline" },
  summary: { color: c.onSurfaceTertiary, fontFamily: fonts.mono, fontSize: 12, lineHeight: 18 },
  tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: c.divider },
  tab: { flex: 1, alignItems: "center", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: "transparent", marginBottom: -1 },
  tabActive: { borderBottomColor: c.borderStrong },
  tabText: { color: c.muted, fontFamily: fonts.mono, fontSize: 14 },
  tabTextActive: { color: c.onSurface },
  eqWrap: { gap: spacing.lg },
  sliders: { flexDirection: "row", justifyContent: "space-between" },
  pills: { flexDirection: "row", gap: spacing.md },
  pill: {
    flex: 1,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1,
    borderColor: c.border,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  pillBtn: { width: 40, height: 56, alignItems: "center", justifyContent: "center" },
  pillCenter: { flex: 1, height: 56, alignItems: "center", justifyContent: "center" },
  pillLine: { position: "absolute", left: "30%", top: 0, bottom: 0, width: 1, backgroundColor: c.brandPrimary },
  pillText: { color: c.onSurface, fontFamily: fonts.mono, fontSize: 13 },
  reason: { color: c.onSurfaceTertiary, fontFamily: fonts.mono, fontSize: 11, lineHeight: 17 },
  actions: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  reset: { width: 88, height: 88, borderRadius: 22, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  resetText: { color: c.onBrandPrimary, fontFamily: fonts.mono, fontSize: 13 },
  undoRow: { flexDirection: "row", gap: spacing.md },
  undo: { width: 80, height: 52, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  dim: { opacity: 0.35 },
  note: { color: c.muted, fontFamily: fonts.mono, fontSize: 10, lineHeight: 15 },
  insights: { gap: spacing.lg },
  info: { gap: spacing.xs },
  sectionLabel: { color: c.muted, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 2 },
  infoValue: { color: c.onSurface, fontFamily: fonts.mono, fontSize: 13, lineHeight: 20 },
  bandRow: { borderLeftWidth: 1, borderLeftColor: c.brandPrimary, paddingLeft: spacing.md, gap: 2 },
  bandRowHead: { color: c.onSurface, fontFamily: fonts.mono, fontSize: 12 },
  bandRowReason: { color: c.onSurfaceTertiary, fontFamily: fonts.mono, fontSize: 11, lineHeight: 16 },
}));
