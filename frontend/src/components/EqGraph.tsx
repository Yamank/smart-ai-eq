import React, { useMemo, useState } from "react";
import { Platform, Text, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";

import { Band, responseDb } from "@/src/eq";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const H = 150;
const DB_RANGE = 12;
const AXIS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const AXIS_LABEL: Record<number, string> = { 20: "20", 50: "50", 100: "100", 500: "500", 1000: "1k", 5000: "5k", 10000: "10k", 20000: "20k" };

const xOf = (f: number, w: number) => (Math.log10(f / 20) / Math.log10(1000)) * w;
const yOf = (db: number) => H / 2 - (db / DB_RANGE) * (H / 2 - 10);

type Props = { bands: Band[]; selected: number; onSelect: (i: number) => void; testID?: string };

export function EqGraph({ bands, selected, onSelect, testID }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [w, setW] = useState(0);

  const { line, area } = useMemo(() => {
    if (!w) return { line: "", area: "" };
    const pts: string[] = [];
    for (let i = 0; i <= 120; i++) {
      const f = 20 * Math.pow(1000, i / 120);
      pts.push(`${xOf(f, w).toFixed(1)},${yOf(responseDb(bands, f)).toFixed(1)}`);
    }
    const l = `M${pts.join(" L")}`;
    return { line: l, area: `${l} L${w},${H} L0,${H} Z` };
  }, [bands, w]);

  return (
    <View testID={testID}>
      <View style={styles.panel} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {w > 0 && (
          <Svg width={w} height={H}>
            {AXIS.map((f) => (
              <Line key={f} x1={xOf(f, w)} x2={xOf(f, w)} y1={0} y2={H} stroke={colors.divider} strokeWidth={1} />
            ))}
            <Line x1={0} x2={w} y1={H / 2} y2={H / 2} stroke={colors.border} strokeWidth={1} />
            <Path d={area} fill={colors.surfaceTertiary} opacity={0.9} />
            <Path d={line} stroke={colors.onSurfaceTertiary} strokeWidth={1.5} fill="none" />
            {bands.map((b, i) => (
              <Circle
                key={i}
                cx={xOf(b.freq, w)}
                cy={yOf(b.gain)}
                r={i === selected ? 6 : 4.5}
                fill={i === selected ? colors.brandPrimary : colors.onSurfaceTertiary}
                onPress={Platform.OS === "web" ? undefined : () => onSelect(i)}
              />
            ))}
          </Svg>
        )}
      </View>
      <View style={styles.axis}>
        {w > 0 &&
          Object.keys(AXIS_LABEL).map((k) => {
            const f = Number(k);
            return (
              <Text key={k} style={[styles.axisText, { left: Math.min(Math.max(xOf(f, w) - 12, 0), w - 24) }]}>
                {AXIS_LABEL[f]}
              </Text>
            );
          })}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  panel: { height: H, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: c.divider },
  axis: { height: 20, marginTop: spacing.xs },
  axisText: { position: "absolute", width: 24, textAlign: "center", color: c.muted, fontFamily: fonts.mono, fontSize: 10 },
}));
