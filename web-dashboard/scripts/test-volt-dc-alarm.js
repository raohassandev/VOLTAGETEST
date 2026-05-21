/**
 * Volt_dc alarm calibration test proof.
 *
 * Replicates buildBatteryThresholds + evaluateThreshold logic from
 * src/lib/alarm-engine.ts and applies the same VOLT_DC_DEFAULT_SCALE
 * constant from worker/mqtt-worker.ts.
 *
 * Run:  node scripts/test-volt-dc-alarm.js
 */

const VOLT_DC_DEFAULT_SCALE = 0.0442; // matches worker/mqtt-worker.ts

function buildBatteryThresholds(nominalV) {
  return {
    lowCritical:  nominalV * 0.875,
    lowWarning:   nominalV * 0.917,
    highWarning:  nominalV * 1.125,
    highCritical: nominalV * 1.188,
  };
}

function evaluateVoltDc(calibratedV, batteryNominalV) {
  const t = buildBatteryThresholds(batteryNominalV);
  if (calibratedV < t.lowCritical)  return { alarm: true,  severity: "CRITICAL", direction: "LOW",  msg: `Battery Voltage critically low: ${calibratedV.toFixed(1)}V (limit ${t.lowCritical.toFixed(1)}V)` };
  if (calibratedV < t.lowWarning)   return { alarm: true,  severity: "WARNING",  direction: "LOW",  msg: `Battery Voltage low: ${calibratedV.toFixed(1)}V` };
  if (calibratedV > t.highCritical) return { alarm: true,  severity: "CRITICAL", direction: "HIGH", msg: `Battery Voltage critically high: ${calibratedV.toFixed(1)}V (limit ${t.highCritical.toFixed(1)}V)` };
  if (calibratedV > t.highWarning)  return { alarm: true,  severity: "WARNING",  direction: "HIGH", msg: `Battery Voltage high: ${calibratedV.toFixed(1)}V` };
  return { alarm: false, severity: "NONE", direction: "NONE", msg: "No alarm" };
}

// ── OLD BEHAVIOR (before fix: scale=1.0, raw ADC passed as voltage) ────────
console.log("=== OLD BEHAVIOR (scale=1.0 — raw ADC passed directly to alarm engine) ===\n");
const oldCalibrated = 556 * 1.0;
const oldResult = evaluateVoltDc(oldCalibrated, 48);
const oldThresholds = buildBatteryThresholds(48);
console.log(`  raw ADC: 556,  scale: 1.0,  used as voltage: ${oldCalibrated}V`);
console.log(`  48V thresholds: lowCrit=${oldThresholds.lowCritical.toFixed(1)} / highCrit=${oldThresholds.highCritical.toFixed(1)}`);
console.log(`  Alarm: ${oldResult.severity} ${oldResult.direction}`);
console.log(`  Message: "${oldResult.msg}"`);
console.log(`  ❌  556 > 57.0 → false CRITICAL HIGH (wrong direction, wrong value)\n`);

// ── NEW BEHAVIOR (after fix: scale=0.0442 applied) ─────────────────────────
console.log("=== NEW BEHAVIOR (scale=0.0442 applied — CalibrationProfile default) ===\n");

const tests = [
  {
    id: 1,
    name: "24V UPS — raw ADC 556 — no CalibrationProfile",
    rawAdc: 556,
    batteryNominalV: 24,
    expectedAlarm: false,
    expectedSeverity: "NONE",
    expectedDirection: "NONE",
  },
  {
    id: 2,
    name: "48V UPS — raw ADC 556 — no CalibrationProfile (bench board, battery disconnected)",
    rawAdc: 556,
    batteryNominalV: 48,
    expectedAlarm: true,
    expectedSeverity: "CRITICAL",
    expectedDirection: "LOW",
  },
  {
    id: 3,
    name: "48V UPS — raw ADC 1176 (calibrated ≈52V) — no CalibrationProfile",
    rawAdc: Math.round(52 / VOLT_DC_DEFAULT_SCALE), // 1176
    batteryNominalV: 48,
    expectedAlarm: false,
    expectedSeverity: "NONE",
    expectedDirection: "NONE",
  },
];

let pass = 0;
let fail = 0;

for (const tc of tests) {
  const calibrated = tc.rawAdc * VOLT_DC_DEFAULT_SCALE;
  const result = evaluateVoltDc(calibrated, tc.batteryNominalV);
  const thresholds = buildBatteryThresholds(tc.batteryNominalV);

  const ok =
    result.alarm     === tc.expectedAlarm &&
    result.severity  === tc.expectedSeverity &&
    result.direction === tc.expectedDirection;

  if (ok) pass++; else fail++;

  console.log(`Case ${tc.id}: ${tc.name}`);
  console.log(`  rawAdc=${tc.rawAdc}, scale=${VOLT_DC_DEFAULT_SCALE}, calibrated=${calibrated.toFixed(2)}V`);
  console.log(`  batteryNominalV=${tc.batteryNominalV}`);
  console.log(`  Thresholds: lowCrit=${thresholds.lowCritical.toFixed(2)}V lowWarn=${thresholds.lowWarning.toFixed(2)}V highWarn=${thresholds.highWarning.toFixed(2)}V highCrit=${thresholds.highCritical.toFixed(2)}V`);
  console.log(`  Expected: alarm=${tc.expectedAlarm}, ${tc.expectedSeverity} ${tc.expectedDirection}`);
  console.log(`  Got:      alarm=${result.alarm}, ${result.severity} ${result.direction}`);
  console.log(`  Message:  "${result.msg}"`);
  console.log(`  ${ok ? "✓ PASS" : "✗ FAIL"}\n`);
}

console.log(`─────────────────────────────`);
console.log(`Results: ${pass} PASS  ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
