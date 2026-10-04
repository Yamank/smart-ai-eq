import { Feather } from "@react-native-vector-icons/feather";
import React, { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export type Option = { value: string; label: string; hint?: string };

type Props = {
  label: string;
  placeholder: string;
  value: string | null;
  options: Option[];
  disabled?: boolean;
  onChange: (v: string) => void;
  testID: string;
  searchable?: boolean;
};

export function Dropdown({ label, placeholder, value, options, disabled, onChange, testID, searchable = true }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(
    () => (q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options),
    [q, options],
  );

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, disabled && styles.dim]}>{label}</Text>
      <Pressable
        testID={testID}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.field, disabled && styles.fieldDisabled, pressed && styles.pressed]}
      >
        <Text numberOfLines={1} style={[styles.value, !selected && styles.placeholder, disabled && styles.dim]}>
          {selected ? selected.label : placeholder}
        </Text>
        <Feather name="chevron-down" size={18} color={disabled ? colors.muted : colors.onSurface} />
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg, marginTop: insets.top + spacing.xxxl }]}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{label}</Text>
              <Pressable testID={`${testID}-close`} hitSlop={12} onPress={() => setOpen(false)} style={styles.close}>
                <Feather name="x" size={22} color={colors.onSurface} />
              </Pressable>
            </View>
            {searchable && options.length > 8 && (
              <View style={styles.search}>
                <Feather name="search" size={16} color={colors.muted} />
                <TextInput
                  testID={`${testID}-search`}
                  value={q}
                  onChangeText={setQ}
                  placeholder="Search"
                  placeholderTextColor={colors.muted}
                  style={styles.searchInput}
                  autoCorrect={false}
                />
              </View>
            )}
            <FlatList
              data={filtered}
              keyExtractor={(o) => o.value}
              keyboardShouldPersistTaps="handled"
              ItemSeparatorComponent={() => <View style={styles.sep} />}
              renderItem={({ item }) => {
                const active = item.value === value;
                return (
                  <Pressable
                    testID={`${testID}-option-${item.value}`}
                    onPress={() => {
                      onChange(item.value);
                      setQ("");
                      setOpen(false);
                    }}
                    style={({ pressed }) => [styles.option, pressed && styles.pressed]}
                  >
                    <View style={styles.optionText}>
                      <Text style={[styles.optionLabel, active && styles.active]}>{item.label}</Text>
                      {!!item.hint && <Text style={styles.hint}>{item.hint}</Text>}
                    </View>
                    {active && <View style={styles.dot} />}
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { gap: spacing.sm },
  label: { color: c.onSurfaceTertiary, fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase" },
  field: {
    height: 52,
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  fieldDisabled: { borderColor: c.border },
  pressed: { opacity: 0.6 },
  value: { color: c.onSurface, fontFamily: fonts.mono, fontSize: 15, flex: 1 },
  placeholder: { color: c.onSurfaceTertiary },
  dim: { color: c.muted },
  backdrop: { flex: 1, backgroundColor: c.overlay },
  sheet: {
    flex: 1,
    backgroundColor: c.surfaceSecondary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: spacing.lg,
  },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.lg },
  sheetTitle: { color: c.onSurface, fontFamily: fonts.display, fontSize: 24 },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    height: 44,
    marginBottom: spacing.sm,
  },
  searchInput: { flex: 1, color: c.onSurface, fontFamily: fonts.mono, fontSize: 14, height: 44 },
  sep: { height: 1, backgroundColor: c.divider },
  option: { minHeight: 52, paddingVertical: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  optionText: { flex: 1, gap: 2 },
  optionLabel: { color: c.onSurface, fontFamily: fonts.mono, fontSize: 15 },
  active: { color: c.brandPrimary },
  hint: { color: c.muted, fontFamily: fonts.mono, fontSize: 11 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.brandPrimary },
}));
