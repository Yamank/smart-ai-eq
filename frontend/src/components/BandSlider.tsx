import * as Haptics from "expo-haptics";
import React, { useRef } from "react";
import { PanResponder, Platform, Text, View } from "react-native";

import { Band, fmtHz, GAIN_MAX, roundGain } from "@/src/eq";
import { fonts, makeStyles, radius, spacing } from "@/src/theme";

const TRACK_H = 190;
const KNOB = 26;
const TRAVEL = TRACK_H - KNOB - 8;

type Props = {
  index: number;
  band: Band;
  selected: boolean;
  width: number;
  onSelect: () => void;
  onChange: (gain: number) => void;
  onCommit: () => void;
};

export function BandSlider({ index, band, selected, width, onSelect, onChange, onCommit }: Props) {
  const styles = useStyles();
  const start = useRef(0);
  const last = useRef(band.gain);
  const live = useRef({ band, onChange, onSelect, onCommit });
  live.current = { band, onChange, onSelect, onCommit };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        start.current = live.current.band.gain;
        last.current = live.current.band.gain;
        live.current.onSelect();
      },
      onPanResponderMove: (_, g) => {
        const next = roundGain(start.current - (g.dy / TRAVEL) * (GAIN_MAX * 2));
        if (next !== last.current) {
          last.current = next;
          if (Platform.OS !== "web") Haptics.selectionAsync();
          live.current.onChange(next);
        }
      },
      onPanResponderRelease: () => live.current.onCommit(),
    }),
  ).current;

  const center = TRACK_H / 2;
  const knobCenter = center - (band.gain / GAIN_MAX) * (TRAVEL / 2);
  const fillTop = Math.min(center, knobCenter);
  const fillH = Math.abs(center - knobCenter);

  return (
    <View style={[styles.col, { width }]}>
      <View testID={`band-slider-${index}`} {...pan.panHandlers} style={[styles.track, selected && styles.trackActive]}>
        {[0.12, 0.31, 0.5, 0.69, 0.88].map((p) => (
          <View key={p} style={[styles.tick, { top: TRACK_H * p - 2 }]} />
        ))}
        <View style={[styles.fill, selected && styles.fillActive, { top: fillTop, height: fillH }]} />
        <View style={[styles.knob, selected && styles.knobActive, { top: knobCenter - KNOB / 2 }]} />
      </View>
      <Text style={[styles.gain, selected && styles.gainActive]} testID={`band-gain-${index}`}>
        {band.gain > 0 ? "+" : ""}
        {band.gain}
      </Text>
      <Text style={styles.freq}>{fmtHz(band.freq)}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  col: { alignItems: "center", gap: spacing.xs },
  track: {
    width: 34,
    height: TRACK_H,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
    overflow: "hidden",
  },
  trackActive: { borderColor: c.borderStrong },
  tick: { position: "absolute", width: 4, height: 4, borderRadius: 2, backgroundColor: c.border },
  fill: { position: "absolute", width: 22, backgroundColor: c.brandTertiary, borderRadius: radius.pill },
  fillActive: { backgroundColor: c.brandDim },
  knob: { position: "absolute", width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: c.onSurface },
  knobActive: { backgroundColor: c.brandPrimary },
  gain: { color: c.onSurfaceTertiary, fontFamily: fonts.mono, fontSize: 11, marginTop: spacing.xs },
  gainActive: { color: c.brandPrimary },
  freq: { color: c.muted, fontFamily: fonts.mono, fontSize: 10 },
}));
