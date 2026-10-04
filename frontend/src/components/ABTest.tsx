import { Feather } from "@react-native-vector-icons/feather";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { API_BASE } from "@/src/api";
import { Band, bandsSpec } from "@/src/eq";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const ORIGINAL = `${API_BASE}/eq/preview?p=`;

/** A/B comparison: same reference clip, flat vs. with the current EQ (rendered server-side, loudness matched). */
export function ABTest({ bands }: { bands: Band[] }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [eqOn, setEqOn] = useState(true);
  const [playing, setPlaying] = useState(false);
  const spec = bandsSpec(bands);
  const [eqUrl, setEqUrl] = useState(`${ORIGINAL}${spec}`);

  const flat = useAudioPlayer(ORIGINAL);
  const eq = useAudioPlayer(eqUrl);
  const flatStatus = useAudioPlayerStatus(flat);
  const eqStatus = useAudioPlayerStatus(eq);
  const firstSpec = useRef(true);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    flat.loop = true;
    eq.loop = true;
  }, [flat, eq]);

  // debounce EQ re-render as the user drags sliders
  useEffect(() => {
    if (firstSpec.current) {
      firstSpec.current = false;
      return;
    }
    const t = setTimeout(() => {
      const pos = eq.currentTime || flat.currentTime || 0;
      const url = `${ORIGINAL}${spec}`;
      setEqUrl(url);
      eq.replace(url);
      eq.loop = true;
      if (playing && eqOn) {
        eq.seekTo(pos);
        eq.play();
      }
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec]);

  useEffect(() => {
    return () => {
      try {
        flat.pause();
        eq.pause();
      } catch {}
    };
  }, [flat, eq]);

  const activate = (useEq: boolean, play: boolean) => {
    const from = useEq ? flat : eq;
    const to = useEq ? eq : flat;
    const pos = from.currentTime || to.currentTime || 0;
    from.pause();
    if (play) {
      to.seekTo(pos);
      to.play();
    } else {
      to.pause();
    }
  };

  const togglePlay = () => {
    const next = !playing;
    setPlaying(next);
    activate(eqOn, next);
  };

  const setMode = (on: boolean) => {
    setEqOn(on);
    activate(on, playing);
  };

  const buffering = playing && (eqOn ? !eqStatus.isLoaded || eqStatus.isBuffering : !flatStatus.isLoaded || flatStatus.isBuffering);

  return (
    <View style={styles.wrap} testID="ab-test">
      <Pressable testID="ab-test-play-button" onPress={togglePlay} style={({ pressed }) => [styles.play, pressed && styles.pressed]}>
        {buffering ? (
          <ActivityIndicator color={colors.onBrandSecondary} />
        ) : (
          <Feather name={playing ? "pause" : "play"} size={20} color={colors.onBrandSecondary} />
        )}
      </Pressable>
      <View style={styles.info}>
        <Text style={styles.title}>Test</Text>
        <Text style={styles.sub}>Reference clip · loudness-matched</Text>
      </View>
      <View style={styles.seg}>
        <Pressable testID="ab-test-off-button" onPress={() => setMode(false)} style={[styles.segBtn, !eqOn && styles.segActiveOff]}>
          <Text style={[styles.segText, !eqOn && styles.segTextOff]}>OFF</Text>
        </Pressable>
        <Pressable testID="ab-test-on-button" onPress={() => setMode(true)} style={[styles.segBtn, eqOn && styles.segActiveOn]}>
          <Text style={[styles.segText, eqOn && styles.segTextOn]}>AI EQ</Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.pill,
    padding: spacing.sm,
  },
  play: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.6 },
  info: { flex: 1 },
  title: { color: c.onSurface, fontFamily: fonts.mono, fontSize: 14 },
  sub: { color: c.muted, fontFamily: fonts.mono, fontSize: 10 },
  seg: { flexDirection: "row", borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, overflow: "hidden" },
  segBtn: { paddingHorizontal: spacing.md, height: 36, justifyContent: "center" },
  segActiveOff: { backgroundColor: c.surfaceTertiary },
  segActiveOn: { backgroundColor: c.brandPrimary },
  segText: { color: c.onSurfaceTertiary, fontFamily: fonts.mono, fontSize: 12 },
  segTextOff: { color: c.onSurface },
  segTextOn: { color: c.onBrandPrimary },
}));
