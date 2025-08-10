import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";

/**
 * Expo app: LiFePO4 Battery Time Calculator
 *
 * What it does
 * - User enters total battery capacity (kWh)
 * - Selects/enters State of Charge (SOC %) (slider + input)
 * - Enters Charge Power (kW) and Load/Discharge Power (kW)
 * - App shows Net Power (+ = charging, - = discharging)
 * - App estimates time to FULL (if charging) or to EMPTY (if discharging)
 * - Shows remaining energy and pretty battery ring
 *
 * Dependencies (run these in your Expo project):
 *   expo install expo-linear-gradient react-native-svg @react-native-community/slider
 *
 * Drop this file in your Expo project as App.tsx and run: npx expo start
 */

const RING_SIZE = 160;
const RING_STROKE = 14;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;

function clamp(n: number, min = 0, max = 100) {
  "worklet";
  return Math.min(max, Math.max(min, n));
}

function fmtNumber(n: number, digits = 2) {
  if (!isFinite(n)) return "-";
  const v = Math.abs(n) < 1e-6 ? 0 : n;
  return Number(v.toFixed(digits)).toString();
}

function formatHrs(hours: number): string {
  if (!isFinite(hours)) return "-";
  if (hours < 0) return "-";
  if (hours > 999) return ">999 h";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function BatteryRing({ percent }: { percent: number }) {
  const pct = clamp(percent, 0, 100);
  const circumference = 2 * Math.PI * RING_RADIUS;
  const strokeDashoffset = circumference - (pct / 100) * circumference;
  return (
    <View
      style={styles.ringWrap}
      accessible
      accessibilityLabel={`Battery at ${Math.round(pct)} percent`}
    >
      <Svg width={RING_SIZE} height={RING_SIZE}>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={RING_STROKE}
          fill="none"
        />
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke="white"
          strokeOpacity={0.9}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        />
      </Svg>
      <View style={styles.ringCenter} pointerEvents="none">
        <Text style={styles.ringPercent}>{Math.round(pct)}%</Text>
        <Text style={styles.ringLabel}>SOC</Text>
      </View>
    </View>
  );
}

function validateInput(value: string, max: number): string {
  const num = parseFloat(value) || 0;
  return String(Math.min(Math.max(0, num), max));
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
  placeholder,
  max,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  suffix?: string;
  placeholder?: string;
  max?: number;
}) {
  const isAtMax = max !== undefined && (parseFloat(value) || 0) >= max;
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View
        style={[
          styles.inputRow,
          isAtMax && { borderColor: "#6ee7b7", borderWidth: 1 },
        ]}
      >
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={(text) =>
            onChange(max !== undefined ? validateInput(text, max) : text)
          }
          keyboardType="decimal-pad"
          inputMode="decimal"
          placeholder={placeholder}
          placeholderTextColor="rgba(255,255,255,0.35)"
          accessibilityLabel={label}
        />
        {suffix ? <Text style={styles.inputSuffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

function formatTimeOfDay(date: Date): string {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function App() {
  // Inputs (stored as strings for clean TextInput UX)
  const [capacityStr, setCapacityStr] = useState("15.33"); // kWh
  const [socStr, setSocStr] = useState("100"); // %
  const [chargeStr, setChargeStr] = useState("0"); // kW in
  const [loadStr, setLoadStr] = useState("0"); // kW out
  const [reserveStr, setReserveStr] = useState("20"); // % reserve SOC
  const [maxStr, setMaxStr] = useState("90"); // % max SOC

  // Derived numeric values
  const capacity = useMemo(() => parseFloat(capacityStr) || 0, [capacityStr]);
  const socPct = useMemo(() => clamp(parseFloat(socStr) || 0), [socStr]);
  const chargeKW = useMemo(() => parseFloat(chargeStr) || 0, [chargeStr]);
  const loadKW = useMemo(() => parseFloat(loadStr) || 0, [loadStr]);
  const reservePct = useMemo(
    () => clamp(parseFloat(reserveStr) || 0),
    [reserveStr]
  );
  const maxPct = useMemo(() => clamp(parseFloat(maxStr) || 0), [maxStr]);

  const netKW = useMemo(() => chargeKW - loadKW, [chargeKW, loadKW]);
  const remainingKWh = useMemo(() => {
    const total = (capacity * socPct) / 100;
    const reserve = (capacity * reservePct) / 100;
    return Math.max(total - reserve, 0);
  }, [capacity, socPct, reservePct]);
  const availableChargeKWh = useMemo(() => {
    const maxKWh = (capacity * maxPct) / 100;
    const currentKWh = (capacity * socPct) / 100;
    return Math.max(maxKWh - currentKWh, 0);
  }, [capacity, maxPct, socPct]);
  const missingKWh = useMemo(
    () => Math.max(capacity - remainingKWh, 0),
    [capacity, remainingKWh]
  );

  const status = netKW > 0 ? "Charging" : netKW < 0 ? "Discharging" : "Idle";

  const timeToFullH = useMemo(() => {
    if (netKW <= 0) return Infinity;
    if (availableChargeKWh <= 0) return 0;
    const hrs = availableChargeKWh / netKW;
    return hrs < 0 ? Infinity : hrs;
  }, [availableChargeKWh, netKW]);

  const timeToEmptyH = useMemo(() => {
    if (netKW >= 0) return Infinity;
    if (remainingKWh <= 0) return 0;
    const hrs = remainingKWh / Math.abs(netKW);
    return hrs < 0 ? Infinity : hrs;
  }, [remainingKWh, netKW]);

  const canComputeFull = isFinite(timeToFullH) && timeToFullH >= 0;
  const canComputeEmpty = isFinite(timeToEmptyH) && timeToEmptyH >= 0;

  const finishTimeCharge = useMemo(() => {
    if (!canComputeFull) return null;
    const date = new Date();
    date.setMinutes(date.getMinutes() + timeToFullH * 60);
    return formatTimeOfDay(date);
  }, [canComputeFull, timeToFullH]);

  const finishTimeDischarge = useMemo(() => {
    if (!canComputeEmpty) return null;
    const date = new Date();
    date.setMinutes(date.getMinutes() + timeToEmptyH * 60);
    return formatTimeOfDay(date);
  }, [canComputeEmpty, timeToEmptyH]);

  // Load saved settings on app start
  React.useEffect(() => {
    async function loadSettings() {
      try {
        const [capacity, reserve, max] = await Promise.all([
          AsyncStorage.getItem("capacity"),
          AsyncStorage.getItem("reserve"),
          AsyncStorage.getItem("max"),
        ]);
        if (capacity) setCapacityStr(capacity);
        if (reserve) setReserveStr(reserve);
        if (max) setMaxStr(max);
      } catch (e) {
        console.warn("Failed to load settings:", e);
      }
    }
    loadSettings();
  }, []);

  // Save settings when they change
  React.useEffect(() => {
    async function saveSettings() {
      try {
        await Promise.all([
          AsyncStorage.setItem("capacity", capacityStr),
          AsyncStorage.setItem("reserve", reserveStr),
          AsyncStorage.setItem("max", maxStr),
        ]);
      } catch (e) {
        console.warn("Failed to save settings:", e);
      }
    }
    saveSettings();
  }, [capacityStr, reserveStr, maxStr]);

  function bumpSOC(delta: number) {
    const next = clamp((parseFloat(socStr) || 0) + delta, 0, 100);
    setSocStr(validateInput(String(Math.round(next)), 100));
  }

  function resetAll() {
    const defaults = {
      capacity: "15.33",
      soc: "100",
      charge: "0",
      load: "0",
      reserve: "20",
      max: "90",
    };

    setCapacityStr(defaults.capacity);
    setSocStr(defaults.soc);
    setChargeStr(defaults.charge);
    setLoadStr(defaults.load);
    setReserveStr(defaults.reserve);
    setMaxStr(defaults.max);
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#0f172a" }}>
      <SafeAreaView style={{ flex: 1, marginVertical: 20 }}>
        <KeyboardAvoidingView
          behavior={Platform.select({ ios: "padding", android: undefined })}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.title}>LiFePO₄ Time Estimator</Text>
            <Text style={styles.subtitle}>
              Quickly estimate time to full or empty based on your inputs.
            </Text>

            <View style={styles.cardRow}>
              <View style={[styles.card, { flex: 1 }]}>
                <BatteryRing percent={socPct} />
                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <TouchableOpacity
                    style={styles.chip}
                    onPress={() => bumpSOC(-5)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.chipText}>-5%</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.chip}
                    onPress={() => bumpSOC(+5)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.chipText}>+5%</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={[styles.card, { flex: 1 }]}>
                <Text style={styles.metricLabel}>Status</Text>
                <Text
                  style={[
                    styles.metricValue,
                    status === "Charging"
                      ? styles.green
                      : status === "Discharging"
                      ? styles.red
                      : styles.dim,
                  ]}
                >
                  {status}
                </Text>

                <Text style={[styles.metricLabel, { marginTop: 14 }]}>
                  Net Power
                </Text>
                <Text style={styles.metricValue}>{fmtNumber(netKW, 2)} kW</Text>

                <Text style={[styles.metricLabel, { marginTop: 14 }]}>
                  Energy Left
                </Text>
                <Text style={styles.metricValue}>
                  {fmtNumber(remainingKWh, 2)} kWh
                </Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Inputs</Text>
              <NumberField
                label="Capacity"
                value={capacityStr}
                onChange={setCapacityStr}
                suffix="kWh"
                placeholder="e.g. 10"
              />
              <View style={styles.splitRow}>
                <View style={{ flex: 1 }}>
                  <NumberField
                    label="Reserve SOC"
                    value={reserveStr}
                    onChange={(text) => setReserveStr(validateInput(text, 100))}
                    suffix="%"
                    placeholder="e.g. 20"
                    max={100}
                  />
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                  <NumberField
                    label="Max SOC"
                    value={maxStr}
                    onChange={(text) => setMaxStr(validateInput(text, 100))}
                    suffix="%"
                    placeholder="e.g. 90"
                    max={100}
                  />
                </View>
              </View>
              <NumberField
                label="State of Charge"
                value={socStr}
                onChange={(text) => setSocStr(validateInput(text, 100))}
                suffix="%"
                placeholder="0 – 100"
                max={100}
              />

              <View style={styles.splitRow}>
                <View style={{ flex: 1 }}>
                  <NumberField
                    label="Charge Power"
                    value={chargeStr}
                    onChange={(text) => {
                      if (Number(text) <= 10) {
                        setChargeStr(text);
                      }
                    }}
                    suffix="kW"
                    placeholder="0 – 10"
                    max={10}
                  />
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                  <NumberField
                    label="Load / Discharge"
                    value={loadStr}
                    onChange={(text) => {
                      if (Number(text) <= 10) {
                        setLoadStr(text);
                      }
                    }}
                    suffix="kW"
                    placeholder="0 – 10"
                    max={10}
                  />
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                <TouchableOpacity
                  style={[styles.btn, styles.btnGhost]}
                  onPress={resetAll}
                  accessibilityRole="button"
                >
                  <Text style={styles.btnGhostText}>Reset</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Estimate</Text>

              <View style={styles.estimateRow}>
                <View style={[styles.estimateBlock, styles.blockLeft]}>
                  <Text style={styles.estLabel}>Time to Full</Text>
                  <Text
                    style={[
                      styles.estValue,
                      canComputeFull ? styles.green : styles.dim,
                    ]}
                  >
                    {canComputeFull ? formatHrs(timeToFullH) : "—"}
                  </Text>
                  {finishTimeCharge && (
                    <Text style={[styles.finishTime, styles.green]}>
                      Done at {finishTimeCharge}
                    </Text>
                  )}
                </View>
                <View style={[styles.estimateBlock, styles.blockRight]}>
                  <Text style={styles.estLabel}>Time to Empty</Text>
                  <Text
                    style={[
                      styles.estValue,
                      canComputeEmpty ? styles.red : styles.dim,
                    ]}
                  >
                    {canComputeEmpty ? formatHrs(timeToEmptyH) : "—"}
                  </Text>
                  {finishTimeDischarge && (
                    <Text style={[styles.finishTime, styles.red]}>
                      Done at {finishTimeDischarge}
                    </Text>
                  )}
                </View>
              </View>

              <Text style={styles.hint}>
                Hint: Net Power = Charge kW − Load kW. Positive = charging,
                negative = discharging.
              </Text>
            </View>

            <Text style={styles.footer}>
              Designed for LiFePO₄ packs. For best accuracy, use kW at the
              battery bus (include inverter losses if needed).
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 60,
    gap: 16,
  },
  title: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  subtitle: {
    color: "rgba(255,255,255,0.7)",
    marginTop: 2,
    marginBottom: 6,
  },
  cardRow: { flexDirection: "row", gap: 12 },
  card: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 18,
    padding: 14,
  },
  ringWrap: { alignSelf: "center" },
  ringCenter: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  ringPercent: { color: "#fff", fontSize: 34, fontWeight: "800" },
  ringLabel: { color: "rgba(255,255,255,0.7)", marginTop: -2 },

  chip: {
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  chipText: { color: "#fff", fontWeight: "600" },

  metricLabel: { color: "rgba(255,255,255,0.7)", fontSize: 13 },
  metricValue: { color: "#fff", fontSize: 22, fontWeight: "800" },
  green: { color: "#6ee7b7" },
  red: { color: "#fca5a5" },
  dim: { color: "rgba(255,255,255,0.45)" },

  sectionTitle: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
    marginBottom: 8,
  },

  inputGroup: { marginBottom: 10 },
  inputLabel: { color: "rgba(255,255,255,0.7)", marginBottom: 6, fontSize: 13 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  input: { flex: 1, color: "#fff", fontSize: 16, paddingVertical: 8 },
  inputSuffix: {
    color: "rgba(255,255,255,0.7)",
    marginLeft: 8,
    fontWeight: "700",
  },

  splitRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },

  btn: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12 },
  btnGhost: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  btnGhostText: { color: "#fff", fontWeight: "700" },

  estimateRow: { flexDirection: "row", gap: 12, marginTop: 2 },
  estimateBlock: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  blockLeft: {},
  blockRight: {},
  estLabel: { color: "rgba(255,255,255,0.7)", marginBottom: 8 },
  estValue: { color: "#fff", fontSize: 22, fontWeight: "800" },
  finishTime: {
    fontSize: 13,
    marginTop: 4,
    opacity: 0.9,
  },

  hint: { color: "rgba(255,255,255,0.6)", marginTop: 10, fontSize: 12 },
  footer: {
    color: "rgba(255,255,255,0.45)",
    textAlign: "center",
    marginTop: 8,
    fontSize: 12,
  },
});
