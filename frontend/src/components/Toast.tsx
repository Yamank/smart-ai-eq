import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Animated, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts, makeStyles, spacing, radius } from "@/src/theme";

type Kind = "info" | "error" | "success";
const Ctx = createContext<(msg: string, kind?: Kind) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState<{ text: string; kind: Kind } | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (text: string, kind: Kind = "info") => {
      setMsg({ text, kind });
      if (timer.current) clearTimeout(timer.current);
      Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setMsg(null));
      }, 2600);
    },
    [anim],
  );

  return (
    <Ctx.Provider value={show}>
      {children}
      {msg && (
        <Animated.View
          pointerEvents="none"
          testID="toast"
          style={[
            styles.toast,
            msg.kind === "error" && styles.error,
            { top: insets.top + spacing.sm, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] },
          ]}
        >
          <Text style={[styles.text, msg.kind === "error" && styles.errorText]}>{msg.text}</Text>
        </Animated.View>
      )}
    </Ctx.Provider>
  );
}

const useStyles = makeStyles((c) => ({
  toast: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: c.surfaceInverse,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  error: { backgroundColor: c.error },
  text: { color: c.onSurfaceInverse, fontFamily: fonts.mono, fontSize: 13 },
  errorText: { color: c.onError },
}));
