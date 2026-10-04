// Design tokens for this app (dark-only, from /app/design_guidelines.json).
// Components import `colors`-backed styles via makeStyles or useTheme().
import { useMemo } from "react";
import { Appearance, StyleSheet } from "react-native";

export type ColorScheme = "light" | "dark";

const dark = {
  surface: "#000000",
  onSurface: "#FFFFFF",
  surfaceSecondary: "#111111",
  onSurfaceSecondary: "#FFFFFF",
  surfaceTertiary: "#1A1A1A",
  onSurfaceTertiary: "#A0A0A0",
  surfaceInverse: "#FFFFFF",
  onSurfaceInverse: "#000000",
  muted: "#666666",

  brand: "#FF2A2A",
  onBrand: "#FFFFFF",
  brandPrimary: "#FF2A2A",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#FFFFFF",
  onBrandSecondary: "#000000",
  brandTertiary: "#222222",
  onBrandTertiary: "#FFFFFF",
  brandDim: "rgba(255,42,42,0.18)",

  success: "#00FF00",
  onSuccess: "#000000",
  warning: "#FFB800",
  onWarning: "#000000",
  error: "#FF2A2A",
  onError: "#FFFFFF",
  info: "#FFFFFF",
  onInfo: "#000000",

  border: "#333333",
  borderStrong: "#FFFFFF",
  divider: "#222222",
  overlay: "rgba(0,0,0,0.85)",
};

export type ThemeColors = typeof dark;

export const defaultScheme = "dark" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light: dark, dark };

export const fonts = { display: "PlayfairDisplay", mono: "SpaceMono" };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 4, md: 8, lg: 16, pill: 999 };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

setColorScheme?.("dark");

export const colors = dark;

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  return { scheme: "dark", colors: dark };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors: c } = useTheme();
    return useMemo(() => StyleSheet.create(factory(c)), [c]);
  };
}
