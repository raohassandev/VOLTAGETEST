/**
 * VOLTAGETEST.ino â€” ESP32 UPS Energy Analyzer Firmware
 * Branch: firmware-energy-analyzer
 *
 * Hardware:
 *   GPIO34 (ADC1_CH6) â€” DC battery voltage        (single-ended, no centering)
 *   GPIO35 (ADC1_CH7) â€” AC output voltage          (transformer-coupled, AC-centered)
 *   GPIO32 (ADC1_CH4) â€” AC input voltage            (transformer-coupled, AC-centered)
 *   GPIO36 (ADC1_CH0) â€” AC input CT current         (CT burden-resistor, AC-centered)
 *   GPIO39 (ADC1_CH3) â€” AC output CT current        (CT burden-resistor, AC-centered)
 *
 * Measurement methodology:
 *   - True RMS via sum-of-squares accumulation (not mean-absolute-deviation)
 *   - Real power via instantaneous VÃ—I products (samples are time-aligned per ISR tick)
 *   - Frequency via zero-crossing counting over 1-second window (~Â±0.5 Hz accuracy)
 *   - Energy via WÃ—elapsed_hours integration, persisted to NVS every 60 s
 *
 * MQTT payload fields:
 *   volt_in, volt_out, volt_dc, ct_in, ct_out     â€” V / A  (calibrated)
 *   s_in_va, s_out_va                              â€” VA     (volt_in Ã— ct_in)
 *   freq_in, freq_out                              â€” Hz     (zero-crossing, null if no waveform)
 *   p_in_w, p_out_w                                â€” W      (real power, calibrated)
 *   pf_in, pf_out                                  â€” n/a    (P/S, clamped Â±1, null if Sâ‰ˆ0)
 *   q_in_var, q_out_var                            â€” VAR    (âˆš(SÂ²-PÂ²), unsigned, null if invalid)
 *   e_in_kwh, e_out_kwh                            â€” kWh    (lifetime counters, survive reboot)
 *   device_id, rssi, seq, ip                       â€” metadata
 *
 * Limitations / known gaps (do not fake):
 *   - Phase error from sequential ADC reads: ~20â€“100 Âµs â†’ <1Â° @ 50 Hz. Negligible.
 *   - Frequency resolution: Â±0.5 Hz (zero-crossing count over 1 s window).
 *     Not suitable for precision grid measurement; adequate for UPS alarming.
 *   - Phase correction (phaseInDeg / phaseOutDeg) is stored in calibration but
 *     NOT yet applied to P calculation. This means PF accuracy depends solely on
 *     the physical alignment of V/I sensors. Document limitation clearly.
 *   - volt_dc is a DC average, not RMS. Correct for battery voltage measurement.
 *   - If RMS counts fall below MIN_VALID_RMS_COUNTS, freq/PF/Q are published as null.
 *   - Energy counters are NVS-persisted every 60 s. Up to 60 s of energy may be
 *     lost on unexpected power loss or reboot.
 */

#include <Arduino.h>
#include <driver/adc.h>
#include <esp_adc_cal.h>
#include <WiFi.h>
#include <WebServer.h>
#include <HTTPUpdateServer.h>
#include <Preferences.h>
#include <math.h>

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//  Compile-time configuration
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
#define SERIAL_BAUD         921600UL
#define SAMPLE_RATE_HZ      500UL
#define TIMER_PERIOD_US     (1000000UL / SAMPLE_RATE_HZ)

// 1-second window â†’ 25 complete 50 Hz cycles; improves power/freq accuracy.
#define SAMPLES_PER_UPDATE  500UL
#define UPDATE_INTERVAL_S   (SAMPLES_PER_UPDATE / (float)SAMPLE_RATE_HZ)   // 1.0 s
#define UPDATE_INTERVAL_H   (UPDATE_INTERVAL_S / 3600.0f)                  // 1/3600 h

#define ADC_ATTENUATION     ADC_ATTEN_DB_11
#define ADC_WIDTH           ADC_WIDTH_BIT_12

// Below this RMS count the AC channel is treated as "no signal" (null output).
#define MIN_VALID_RMS_COUNTS 8.0f
// Minimum zero-crossings per window to report a frequency (filters dead channels).
#define MIN_ZC_FOR_FREQ      4

// WiFi / network
#define DEFAULT_WIFI_SSID   ""
#define DEFAULT_WIFI_PASS   ""
#define AP_SSID             "UMS-Setup"
#define AP_PASS             "UMSSetup2026"

// Firmware version â€” included in MQTT payload and /api/info
#define FIRMWARE_VERSION    "1.0.0"

// MQTT â€” topic: ums/devices/{device_id}/data
#define MQTT_HOST_DEFAULT   "ums-server.local"
#define MQTT_PORT_DEFAULT   1883
#define MQTT_PUBLISH_MS     1000UL    // publish every 1 s (matches window)
#define WIFI_RETRY_MS       30000UL
#define ENERGY_SAVE_MS      60000UL   // write kWh to NVS every 60 s

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//  ADC channel definitions
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
#define NUM_CH   5
#define IDX_VDC   0   // GPIO34 â€” DC battery voltage
#define IDX_VOUT  1   // GPIO35 â€” AC output voltage
#define IDX_VIN   2   // GPIO32 â€” AC input voltage
#define IDX_CTIN  3   // GPIO36 â€” AC input current (CT)
#define IDX_CTOUT 4   // GPIO39 â€” AC output current (CT)

static const adc1_channel_t CH[NUM_CH] = {
    ADC1_CHANNEL_6,   // GPIO34 â€” volt_dc
    ADC1_CHANNEL_7,   // GPIO35 â€” volt_out
    ADC1_CHANNEL_4,   // GPIO32 â€” volt_in
    ADC1_CHANNEL_0,   // GPIO36 â€” ct_in
    ADC1_CHANNEL_3    // GPIO39 â€” ct_out
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//  Calibration structure
//  Stored in NVS namespace "calib".  Editable via web UI (future) or Preferences.
//
//  AC channels  â†’ realValue = sqrt(sumSq / N) * scale
//                 where sumSq accumulates (raw - offset)Â²
//
//  DC channel   â†’ realValue = (raw_average / N) * vDcScale + vDcOffset
//
//  Phase corr   â†’ placeholder; NOT yet applied to P calculation.
//                 Requires external phase reference to calibrate properly.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
struct CalibData {
    int16_t vInOffset;    // ADC counts at AC zero-crossing for input voltage
    float   vInScale;     // V per RMS ADC count (input voltage)
    int16_t vOutOffset;   // ADC counts at AC zero-crossing for output voltage
    float   vOutScale;
    int16_t ctInOffset;   // ADC counts at AC zero-crossing for input CT
    float   ctInScale;    // A per RMS ADC count (input current)
    int16_t ctOutOffset;
    float   ctOutScale;
    float   vDcScale;     // V per raw ADC count (DC average)
    float   vDcOffset;    // V additive offset on DC channel
    // Phase correction â€” placeholder, not applied. Document limitation above.
    float   phaseInDeg;
    float   phaseOutDeg;
};

// Defaults derived from legacy AC_SCALE_PER_SAMPLE=1.72 MAD approach:
//   Old MAD result â‰ˆ RMS Ã— (2âˆš2/Ï€) / 1.72 â‰ˆ RMS Ã— 0.5234
//   New:  rms_counts * vInScale  â€” set scale so output is â‰ˆ same magnitude.
//   The user adjusts these via calibration after measuring with a reference.
static const CalibData CALIB_DEFAULTS = {
    .vInOffset   = 2048,
    .vInScale    = 0.5234f,
    .vOutOffset  = 2048,
    .vOutScale   = 0.5234f,
    .ctInOffset  = 2048,
    .ctInScale   = 0.5234f,
    .ctOutOffset = 2048,
    .ctOutScale  = 0.5234f,
    .vDcScale    = 0.0442f,   // certified default: 12-bit ADC count â†’ battery volts
    .vDcOffset   = 0.0f,
    .phaseInDeg  = 0.0f,
    .phaseOutDeg = 0.0f,
};

static CalibData calib;

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//  Per-window accumulators (written from sampler task, read from main loop)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
struct Accumulators {
    // DC channel: simple sum for average
    uint64_t sumDc;

    // AC channels: sum-of-squares for true RMS
    uint64_t sumSqVin;
    uint64_t sumSqVout;
    uint64_t sumSqCtIn;
    uint64_t sumSqCtOut;

    // Real power: sum of instantaneous VÃ—I products (signed)
    int64_t  sumViIn;    // volt_in  Ã— ct_in  per sample
    int64_t  sumViOut;   // volt_out Ã— ct_out per sample

    // Frequency: count of positive-going zero crossings
    uint16_t zcVin;
    uint16_t zcVout;

    uint32_t count;      // samples accumulated this window
};

// Double-buffer: sampler fills 'acq', main loop swaps and processes 'ready'.
static Accumulators acqBuf;
static Accumulators readyBuf;
static volatile bool windowReady = false;

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//  Output values (computed from ready buffer, published to MQTT)
//  NaN = field not valid / hardware cannot determine.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
struct MeasValues {
    float volt_in;      // V rms
    float volt_out;     // V rms
    float volt_dc;      // V dc (battery)
    float ct_in;        // A rms
    float ct_out;       // A rms
    float s_in_va;      // VA
    float s_out_va;     // VA
    float freq_in;      // Hz  (NaN if no waveform)
    float freq_out;     // Hz  (NaN if no waveform)
    float p_in_w;       // W   real power in
    float p_out_w;      // W   real power out
    float pf_in;        // n/a (NaN if Sâ‰ˆ0)
    float pf_out;       // n/a (NaN if Sâ‰ˆ0)
    float q_in_var;     // VAR unsigned (NaN if S<PÂ²)
    float q_out_var;    // VAR unsigned
    float e_in_kwh;     // kWh lifetime counter
    float e_out_kwh;    // kWh lifetime counter
};

static MeasValues meas;
static uint32_t   seqNo = 0;

// Energy counters (double-precision for long-term accuracy)
static double energyInKwh  = 0.0;
static double energyOutKwh = 0.0;

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//  Zero-crossing helper state (kept between samples for edge detection)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
static int16_t prevSignedVin  = 0;
static int16_t prevSignedVout = 0;

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//  RTOS / timer state
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
static hw_timer_t*         sampleTimer  = nullptr;
static TaskHandle_t        samplerTaskH = nullptr;
static esp_adc_cal_characteristics_t adcChars;
static portMUX_TYPE        bufMux = portMUX_INITIALIZER_UNLOCKED;

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//  WiFi settings
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
struct WifiSettings {
    String    ssid;
    String    pass;
    bool      dhcp;
    IPAddress localIp;
    IPAddress gateway;
    IPAddress subnet;
    IPAddress dns1;
    IPAddress dns2;
};

static WifiSettings wifiSettings;
static Preferences  prefs;
static WebServer          webServer(80);
static HTTPUpdateServer   httpUpdater;
static String       mqttHost;
static uint16_t     mqttPort;
static String       mqttUser;   // empty = no auth
static String       mqttPass;
static String       deviceId;

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//  Timing
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
static unsigned long lastMqttPublish = 0;
static unsigned long lastWifiRetry   = 0;
static unsigned long lastEnergySave  = 0;

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  TIMER ISR â€” fires at SAMPLE_RATE_HZ; notifies sampler task
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
void IRAM_ATTR onSampleTimer()
{
    BaseType_t woken = pdFALSE;
    vTaskNotifyGiveFromISR(samplerTaskH, &woken);
    if (woken) portYIELD_FROM_ISR();
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  SAMPLER TASK â€” high-priority; runs on core 1
//  Reads all 5 ADC channels once per timer tick.
//  Accumulates sum-of-squares (RMS), sum-of-products (power), zero-crossings.
//  After SAMPLES_PER_UPDATE ticks, atomically swaps buffers and signals main.
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
void samplerTask(void* /*arg*/)
{
    for (;;) {
        ulTaskNotifyTake(pdTRUE, portMAX_DELAY);

        // â”€â”€ Read all 5 channels â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        int16_t raw[NUM_CH];
        for (uint8_t i = 0; i < NUM_CH; i++) {
            raw[i] = (int16_t)adc1_get_raw(CH[i]);
        }

        // â”€â”€ DC channel: simple accumulation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        acqBuf.sumDc += (uint32_t)raw[IDX_VDC];

        // â”€â”€ AC channels: offset-remove then accumulate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        int16_t sVin  = raw[IDX_VIN]   - calib.vInOffset;
        int16_t sVout = raw[IDX_VOUT]  - calib.vOutOffset;
        int16_t sCtin = raw[IDX_CTIN]  - calib.ctInOffset;
        int16_t sCtout= raw[IDX_CTOUT] - calib.ctOutOffset;

        // Sum of squares for RMS
        acqBuf.sumSqVin   += (int32_t)sVin   * sVin;
        acqBuf.sumSqVout  += (int32_t)sVout  * sVout;
        acqBuf.sumSqCtIn  += (int32_t)sCtin  * sCtin;
        acqBuf.sumSqCtOut += (int32_t)sCtout * sCtout;

        // Instantaneous power: V Ã— I products
        acqBuf.sumViIn  += (int32_t)sVin  * sCtin;
        acqBuf.sumViOut += (int32_t)sVout * sCtout;

        // Positive-going zero crossings (negativeâ†’positive)
        if (prevSignedVin  < 0 && sVin  >= 0) acqBuf.zcVin++;
        if (prevSignedVout < 0 && sVout >= 0) acqBuf.zcVout++;
        prevSignedVin  = sVin;
        prevSignedVout = sVout;

        acqBuf.count++;

        // â”€â”€ Window complete: swap buffers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (acqBuf.count >= SAMPLES_PER_UPDATE) {
            portENTER_CRITICAL(&bufMux);
            readyBuf   = acqBuf;
            windowReady = true;
            portEXIT_CRITICAL(&bufMux);

            // Reset acquisition buffer
            memset(&acqBuf, 0, sizeof(acqBuf));
        }
    }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  COMPUTE MEASUREMENTS from a completed window buffer
//  Called from main loop â€” no ISR constraints.
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
static void computeMeasurements(const Accumulators& buf)
{
    if (buf.count == 0) return;

    const float N = (float)buf.count;

    // â”€â”€ DC voltage (battery) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    float dcAvg = (float)buf.sumDc / N;
    meas.volt_dc = dcAvg * calib.vDcScale + calib.vDcOffset;

    // â”€â”€ True RMS counts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    float rmsVin   = sqrtf((float)buf.sumSqVin   / N);
    float rmsVout  = sqrtf((float)buf.sumSqVout  / N);
    float rmsCtIn  = sqrtf((float)buf.sumSqCtIn  / N);
    float rmsCtOut = sqrtf((float)buf.sumSqCtOut / N);

    // Mark channels with signal too small as invalid
    bool vInValid   = (rmsVin   >= MIN_VALID_RMS_COUNTS);
    bool vOutValid  = (rmsVout  >= MIN_VALID_RMS_COUNTS);
    bool ctInValid  = (rmsCtIn  >= MIN_VALID_RMS_COUNTS);
    bool ctOutValid = (rmsCtOut >= MIN_VALID_RMS_COUNTS);

    // Apply calibration scales
    meas.volt_in  = vInValid   ? (rmsVin   * calib.vInScale)  : NAN;
    meas.volt_out = vOutValid  ? (rmsVout  * calib.vOutScale) : NAN;
    meas.ct_in    = ctInValid  ? (rmsCtIn  * calib.ctInScale) : NAN;
    meas.ct_out   = ctOutValid ? (rmsCtOut * calib.ctOutScale): NAN;

    // â”€â”€ Apparent power â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    meas.s_in_va  = (vInValid  && ctInValid)  ? (meas.volt_in  * meas.ct_in)  : NAN;
    meas.s_out_va = (vOutValid && ctOutValid) ? (meas.volt_out * meas.ct_out) : NAN;

    // â”€â”€ Frequency via zero-crossing count â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // freq = crossings / window_duration_s
    // Each positive-going zero crossing = one half-period ending; so crossing
    // count â‰ˆ number of complete cycles.
    if (vInValid && buf.zcVin >= MIN_ZC_FOR_FREQ) {
        meas.freq_in  = (float)buf.zcVin / UPDATE_INTERVAL_S;
    } else {
        meas.freq_in  = NAN;  // No reliable waveform on input
    }

    if (vOutValid && buf.zcVout >= MIN_ZC_FOR_FREQ) {
        meas.freq_out = (float)buf.zcVout / UPDATE_INTERVAL_S;
    } else {
        meas.freq_out = NAN;  // No reliable waveform on output
    }

    // â”€â”€ Real power P = mean(V_inst Ã— I_inst) Ã— vScale Ã— iScale â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    //  NOTE: phaseInDeg / phaseOutDeg are stored but NOT applied here.
    //  Phase correction requires an external phase reference measurement.
    //  Current P accuracy depends on physical CT/voltage sensor alignment.
    //  If sensors are well-aligned, this gives a good approximation of true W.
    if (vInValid && ctInValid) {
        float meanViIn = (float)buf.sumViIn / N;          // countsÂ²
        meas.p_in_w    = meanViIn * calib.vInScale * calib.ctInScale;
    } else {
        meas.p_in_w    = NAN;
    }

    if (vOutValid && ctOutValid) {
        float meanViOut = (float)buf.sumViOut / N;
        meas.p_out_w    = meanViOut * calib.vOutScale * calib.ctOutScale;
    } else {
        meas.p_out_w    = NAN;
    }

    // â”€â”€ Power factor PF = P / S (clamped to [-1, +1]) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (!isnan(meas.p_in_w) && !isnan(meas.s_in_va) && meas.s_in_va > 0.001f) {
        meas.pf_in = constrain(meas.p_in_w / meas.s_in_va, -1.0f, 1.0f);
    } else {
        meas.pf_in = NAN;
    }

    if (!isnan(meas.p_out_w) && !isnan(meas.s_out_va) && meas.s_out_va > 0.001f) {
        meas.pf_out = constrain(meas.p_out_w / meas.s_out_va, -1.0f, 1.0f);
    } else {
        meas.pf_out = NAN;
    }

    // â”€â”€ Reactive power Q = sqrt(SÂ² - PÂ²) (unsigned) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    //  Sign of Q (inductive vs capacitive) would require phase direction info.
    //  Without reliable phase measurement, publish unsigned Q only.
    if (!isnan(meas.s_in_va) && !isnan(meas.p_in_w)) {
        float q2 = meas.s_in_va * meas.s_in_va - meas.p_in_w * meas.p_in_w;
        meas.q_in_var  = (q2 >= 0.0f) ? sqrtf(q2) : NAN;
    } else {
        meas.q_in_var  = NAN;
    }

    if (!isnan(meas.s_out_va) && !isnan(meas.p_out_w)) {
        float q2 = meas.s_out_va * meas.s_out_va - meas.p_out_w * meas.p_out_w;
        meas.q_out_var = (q2 >= 0.0f) ? sqrtf(q2) : NAN;
    } else {
        meas.q_out_var = NAN;
    }

    // â”€â”€ Energy integration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    //  Only integrate if P is valid and positive (consuming, not feeding back).
    //  UPS input power is always positive (drawn from grid).
    //  Output power is positive when feeding load.
    if (!isnan(meas.p_in_w)  && meas.p_in_w  > 0.0f)
        energyInKwh  += (double)meas.p_in_w  * UPDATE_INTERVAL_H / 1000.0;
    if (!isnan(meas.p_out_w) && meas.p_out_w > 0.0f)
        energyOutKwh += (double)meas.p_out_w * UPDATE_INTERVAL_H / 1000.0;

    meas.e_in_kwh  = (float)energyInKwh;
    meas.e_out_kwh = (float)energyOutKwh;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  NVS helpers
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
void loadCalib()
{
    prefs.begin("calib", true);
    calib.vInOffset   = (int16_t)prefs.getShort("vInOff",   CALIB_DEFAULTS.vInOffset);
    calib.vInScale    = prefs.getFloat("vInSc",    CALIB_DEFAULTS.vInScale);
    calib.vOutOffset  = (int16_t)prefs.getShort("vOutOff",  CALIB_DEFAULTS.vOutOffset);
    calib.vOutScale   = prefs.getFloat("vOutSc",   CALIB_DEFAULTS.vOutScale);
    calib.ctInOffset  = (int16_t)prefs.getShort("ctInOff",  CALIB_DEFAULTS.ctInOffset);
    calib.ctInScale   = prefs.getFloat("ctInSc",   CALIB_DEFAULTS.ctInScale);
    calib.ctOutOffset = (int16_t)prefs.getShort("ctOutOff", CALIB_DEFAULTS.ctOutOffset);
    calib.ctOutScale  = prefs.getFloat("ctOutSc",  CALIB_DEFAULTS.ctOutScale);
    calib.vDcScale    = prefs.getFloat("vDcSc",    CALIB_DEFAULTS.vDcScale);
    calib.vDcOffset   = prefs.getFloat("vDcOff",   CALIB_DEFAULTS.vDcOffset);
    calib.phaseInDeg  = prefs.getFloat("phIn",     CALIB_DEFAULTS.phaseInDeg);
    calib.phaseOutDeg = prefs.getFloat("phOut",    CALIB_DEFAULTS.phaseOutDeg);
    prefs.end();
}

void saveCalib()
{
    prefs.begin("calib", false);
    prefs.putShort("vInOff",   (int16_t)calib.vInOffset);
    prefs.putFloat("vInSc",    calib.vInScale);
    prefs.putShort("vOutOff",  (int16_t)calib.vOutOffset);
    prefs.putFloat("vOutSc",   calib.vOutScale);
    prefs.putShort("ctInOff",  (int16_t)calib.ctInOffset);
    prefs.putFloat("ctInSc",   calib.ctInScale);
    prefs.putShort("ctOutOff", (int16_t)calib.ctOutOffset);
    prefs.putFloat("ctOutSc",  calib.ctOutScale);
    prefs.putFloat("vDcSc",    calib.vDcScale);
    prefs.putFloat("vDcOff",   calib.vDcOffset);
    prefs.putFloat("phIn",     calib.phaseInDeg);
    prefs.putFloat("phOut",    calib.phaseOutDeg);
    prefs.end();
}

void loadEnergy()
{
    prefs.begin("energy", true);
    energyInKwh  = (double)prefs.getFloat("eIn",  0.0f);
    energyOutKwh = (double)prefs.getFloat("eOut", 0.0f);
    prefs.end();
}

void saveEnergy()
{
    prefs.begin("energy", false);
    prefs.putFloat("eIn",  (float)energyInKwh);
    prefs.putFloat("eOut", (float)energyOutKwh);
    prefs.end();
}

void loadDeviceId()
{
    prefs.begin("device", true);
    deviceId = prefs.getString("id", "");
    mqttHost = prefs.getString("mqttHost", MQTT_HOST_DEFAULT);
    mqttPort = (uint16_t)prefs.getUShort("mqttPort", MQTT_PORT_DEFAULT);
    mqttUser = prefs.getString("mqttUser", "");
    mqttPass = prefs.getString("mqttPass", "");
    prefs.end();

    if (deviceId.isEmpty()) {
        // Derive from MAC address
        uint8_t mac[6];
        WiFi.macAddress(mac);
        char buf[18];
        snprintf(buf, sizeof(buf), "%02X%02X%02X%02X%02X%02X",
                 mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
        deviceId = "UMS-" + String(buf);
    }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  WiFi helpers
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
void loadWifiSettings()
{
    prefs.begin("wifi", true);
    wifiSettings.ssid = prefs.getString("ssid", DEFAULT_WIFI_SSID);
    wifiSettings.pass = prefs.getString("pass", DEFAULT_WIFI_PASS);
    wifiSettings.dhcp = prefs.getBool("dhcp", true);
    wifiSettings.localIp.fromString(prefs.getString("ip",   "192.168.1.90"));
    wifiSettings.gateway.fromString(prefs.getString("gw",   "192.168.1.1"));
    wifiSettings.subnet.fromString(prefs.getString("sn",    "255.255.255.0"));
    wifiSettings.dns1.fromString(prefs.getString("dns1",    "8.8.8.8"));
    wifiSettings.dns2.fromString(prefs.getString("dns2",    "1.1.1.1"));
    prefs.end();
}

void saveWifiSettings()
{
    prefs.begin("wifi", false);
    prefs.putString("ssid", wifiSettings.ssid);
    prefs.putString("pass", wifiSettings.pass);
    prefs.putBool("dhcp",   wifiSettings.dhcp);
    prefs.putString("ip",   wifiSettings.localIp.toString());
    prefs.putString("gw",   wifiSettings.gateway.toString());
    prefs.putString("sn",   wifiSettings.subnet.toString());
    prefs.putString("dns1", wifiSettings.dns1.toString());
    prefs.putString("dns2", wifiSettings.dns2.toString());
    prefs.end();
}

void connectWifi()
{
    WiFi.mode(WIFI_AP_STA);
    WiFi.softAP(AP_SSID, AP_PASS);
    WiFi.disconnect(false, false);

    if (!wifiSettings.dhcp) {
        WiFi.config(wifiSettings.localIp, wifiSettings.gateway,
                    wifiSettings.subnet, wifiSettings.dns1, wifiSettings.dns2);
    } else {
        WiFi.config(INADDR_NONE, INADDR_NONE, INADDR_NONE);
    }

    Serial.print(F("WiFi â†’ "));
    Serial.println(wifiSettings.ssid);
    WiFi.begin(wifiSettings.ssid.c_str(), wifiSettings.pass.c_str());
}

void reconnectWifiIfNeeded()
{
    if (WiFi.status() == WL_CONNECTED) return;
    unsigned long now = millis();
    if (now - lastWifiRetry >= WIFI_RETRY_MS) {
        lastWifiRetry = now;
        connectWifi();
    }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  JSON builder helpers
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
static void appendFloat(String& s, const char* key, float val, uint8_t decimals = 2)
{
    s += '"'; s += key; s += '"'; s += ':';
    if (isnan(val)) {
        s += F("null");
    } else {
        s += String(val, (unsigned int)decimals);
    }
}

// Build the full MQTT/HTTP JSON payload
String buildDataJson()
{
    String j;
    j.reserve(600);
    j = '{';

    j += '"'; j += F("device_id"); j += F("\":\""); j += deviceId; j += '"';
    j += ',';

    appendFloat(j, "volt_in",    meas.volt_in,    2); j += ',';
    appendFloat(j, "volt_out",   meas.volt_out,   2); j += ',';
    appendFloat(j, "volt_dc",    meas.volt_dc,    2); j += ',';
    appendFloat(j, "ct_in",      meas.ct_in,      3); j += ',';
    appendFloat(j, "ct_out",     meas.ct_out,     3); j += ',';
    appendFloat(j, "s_in_va",    meas.s_in_va,    1); j += ',';
    appendFloat(j, "s_out_va",   meas.s_out_va,   1); j += ',';
    appendFloat(j, "freq_in",    meas.freq_in,    2); j += ',';
    appendFloat(j, "freq_out",   meas.freq_out,   2); j += ',';
    appendFloat(j, "p_in_w",     meas.p_in_w,     1); j += ',';
    appendFloat(j, "p_out_w",    meas.p_out_w,    1); j += ',';
    appendFloat(j, "pf_in",      meas.pf_in,      3); j += ',';
    appendFloat(j, "pf_out",     meas.pf_out,     3); j += ',';
    appendFloat(j, "q_in_var",   meas.q_in_var,   1); j += ',';
    appendFloat(j, "q_out_var",  meas.q_out_var,  1); j += ',';
    appendFloat(j, "e_in_kwh",   meas.e_in_kwh,   4); j += ',';
    appendFloat(j, "e_out_kwh",  meas.e_out_kwh,  4); j += ',';

    j += F("\"rssi\":"); j += WiFi.RSSI();
    j += F(",\"seq\":"); j += seqNo;
    j += F(",\"ip\":\""); j += WiFi.localIP().toString(); j += '"';
    j += F(",\"firmware\":\"" FIRMWARE_VERSION "\"");
    j += '}';

    return j;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  MQTT (bare TCP â€” no library dependency)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
static bool mqttWriteLength(WiFiClient& c, uint32_t len)
{
    do {
        uint8_t b = len % 128;
        len /= 128;
        if (len > 0) b |= 0x80;
        if (c.write(b) != 1) return false;
    } while (len > 0);
    return true;
}

static bool mqttWriteStr(WiFiClient& c, const String& s)
{
    uint16_t n = (uint16_t)s.length();
    if (c.write((uint8_t)(n >> 8)) != 1) return false;
    if (c.write((uint8_t)(n & 0xFF)) != 1) return false;
    return (size_t)c.print(s) == s.length();
}

static bool mqttConnect(WiFiClient& c, const String& clientId,
                        const String& user, const String& pass)
{
    // MQTT 3.1.1 CONNECT packet.
    // Connect flags byte:
    //   Bit 1 = Clean Session
    //   Bit 6 = Password Present (when password non-empty)
    //   Bit 7 = Username Present (when username non-empty)
    bool hasAuth = (user.length() > 0);
    uint8_t connectFlags = 0x02;  // clean session
    if (hasAuth) connectFlags |= 0x40 | 0x80;  // username + password flags

    // Remaining length = fixed header (10) + clientId + optional user/pass
    uint32_t rem = 10 + 2 + clientId.length();
    if (hasAuth) rem += 2 + user.length() + 2 + pass.length();

    if (c.write((uint8_t)0x10) != 1) return false;
    if (!mqttWriteLength(c, rem)) return false;
    if (!mqttWriteStr(c, F("MQTT"))) return false;
    if (c.write((uint8_t)0x04) != 1) return false;      // protocol level 4 (3.1.1)
    if (c.write((uint8_t)connectFlags) != 1) return false;
    if (c.write((uint8_t)0x00) != 1) return false;      // keepalive MSB
    if (c.write((uint8_t)0x3C) != 1) return false;      // keepalive 60 s
    if (!mqttWriteStr(c, clientId)) return false;
    if (hasAuth) {
        if (!mqttWriteStr(c, user)) return false;
        if (!mqttWriteStr(c, pass)) return false;
    }

    unsigned long t = millis();
    while (c.connected() && c.available() < 4 && millis() - t < 3000) delay(5);
    if (c.available() < 4) return false;
    // CONNACK: 0x20 0x02 0x00 0x00 (return code 0 = accepted)
    uint8_t b0 = c.read(), b1 = c.read(), b2 = c.read(), rc = c.read();
    if (b0 != 0x20 || b1 != 0x02 || b2 != 0x00 || rc != 0x00) {
        Serial.printf("[MQTT] CONNACK rejected, return code=%u\n", rc);
        return false;
    }
    return true;
}

static bool mqttPublish(WiFiClient& c, const String& topic, const String& payload)
{
    uint32_t rem = 2 + topic.length() + payload.length();
    if (c.write((uint8_t)0x31) != 1) return false;
    if (!mqttWriteLength(c, rem)) return false;
    if (!mqttWriteStr(c, topic)) return false;

    // Write payload in chunks â€” WiFiClient::print() puts data into TCP send buffer
    // but may return payload.length() before the bytes are actually transmitted.
    // Use write() loop to ensure all bytes are sent, then flush() before stop().
    const uint8_t* buf = (const uint8_t*)payload.c_str();
    size_t remaining = payload.length();
    while (remaining > 0) {
        int sent = c.write(buf, remaining);
        if (sent <= 0) return false;
        buf       += sent;
        remaining -= sent;
    }
    // Flush ensures the TCP stack transmits all buffered data before we close
    c.flush();
    return true;
}

void publishMqttData()
{
    if (WiFi.status() != WL_CONNECTED) return;

    String topic = "ums/devices/" + deviceId + "/data";
    String payload = buildDataJson();

    WiFiClient mc;
    mc.setTimeout(3000);
    if (!mc.connect(mqttHost.c_str(), mqttPort)) {
        Serial.printf("[MQTT] broker unreachable (%s:%u)\n", mqttHost.c_str(), mqttPort);
        return;
    }

    String clientId = "ums-" + deviceId;
    if (!mqttConnect(mc, clientId, mqttUser, mqttPass)) {
        Serial.println(F("[MQTT] CONNACK failed â€” check credentials"));
        mc.stop();
        return;
    }

    static unsigned long _lastPublishMs = 0;
    unsigned long _nowMs = millis();
    unsigned long publishIntervalMs = _lastPublishMs == 0 ? MQTT_PUBLISH_MS : (_nowMs - _lastPublishMs);
    _lastPublishMs = _nowMs;

    if (!mqttPublish(mc, topic, payload)) {
        Serial.println(F("MQTT: publish failed"));
    } else {
        Serial.printf("[MQTT] published seq=%u interval=%lums\n", seqNo, (unsigned long)publishIntervalMs);
        Serial.print(F("MQTT â†’ ")); Serial.println(topic);
        Serial.println(payload);
    }

    mc.stop();
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  Web server â€” config page + live data endpoint
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
static String htmlEscape(const String& in)
{
    String out;
    out.reserve(in.length());
    for (char c : in) {
        if      (c == '&') out += F("&amp;");
        else if (c == '<') out += F("&lt;");
        else if (c == '>') out += F("&gt;");
        else if (c == '"') out += F("&quot;");
        else out += c;
    }
    return out;
}

static bool parseIpArg(const String& name, IPAddress& ip)
{
    String v = webServer.arg(name);
    v.trim();
    return v.length() > 0 && ip.fromString(v);
}

void handleRoot()
{
    String page = F(
        "<!doctype html><html><head>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<title>UMS Device</title><style>"
        "body{font-family:Arial,sans-serif;margin:0;background:#f0f2f5;color:#1a1a2e}"
        "main{max-width:820px;margin:0 auto;padding:16px}"
        "h1{margin:0 0 16px;font-size:20px}h2{font-size:15px;margin:0 0 10px}"
        "section{background:#fff;border:1px solid #dde1e7;border-radius:8px;padding:16px;margin:12px 0}"
        ".grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}"
        ".card{border:1px solid #e0e4ea;border-radius:6px;padding:10px;background:#fafbfc}"
        ".card .lbl{font-size:11px;color:#7a8699;margin-bottom:4px}"
        ".card .val{font-size:20px;font-weight:700;color:#1a1a2e}"
        ".card .unit{font-size:11px;color:#7a8699}"
        "label{display:block;margin:8px 0 3px;font-weight:600;font-size:13px}"
        "input{width:100%;box-sizing:border-box;padding:8px;border:1px solid #b8c0cc;border-radius:5px;font-size:13px}"
        "button{background:#1565c0;color:#fff;border:0;border-radius:5px;padding:10px 18px;font-weight:700;cursor:pointer}"
        ".muted{color:#7a8699;font-size:12px}.row{display:flex;gap:16px}.row label{flex:1}"
        ".badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700}"
        ".ok{background:#e8f5e9;color:#2e7d32}.warn{background:#fff3e0;color:#e65100}"
        "</style></head><body><main>"
        "<h1>&#128268; UMS Energy Monitor</h1>"
    );

    // Live data section
    page += F("<section><h2>Live Measurements</h2><div class='grid' id='grid'>"
              "<p class='muted'>Loading...</p></div></section>");

    // WiFi section
    String wifiStatus = (WiFi.status() == WL_CONNECTED) ? F("Connected") : F("Disconnected");
    page += F("<section><h2>WiFi &amp; Network</h2>");
    page += F("<p>Status: <span class='badge ");
    page += (WiFi.status() == WL_CONNECTED) ? F("ok'>Connected") : F("warn'>Disconnected");
    page += F("</span> &nbsp; STA IP: "); page += WiFi.localIP().toString();
    page += F(" &nbsp; AP: "); page += AP_SSID;
    page += F(" "); page += WiFi.softAPIP().toString();
    page += F("</p><form method='post' action='/save'>"
              "<label>SSID</label><input name='ssid' value='"); page += htmlEscape(wifiSettings.ssid);
    page += F("'><label>Password</label>"
              "<input name='pass' type='password' placeholder='Leave blank to keep existing password'>"
              "<label>MQTT Broker</label><input name='mqttHost' value='"); page += htmlEscape(mqttHost);
    if (mqttHost == F("broker.hivemq.com")) {
        page += F("'><p class='warn'>Public test broker selected - not production safe.</p><input type='hidden' name='mqttHost' value='");
        page += htmlEscape(mqttHost);
    }
    page += F("'><div class='row'>"
              "<label>MQTT Port<input name='mqttPort' type='number' value='"); page += mqttPort;
    page += F("'></label>"
              "<label>MQTT Username<input name='mqttUser' value='"); page += htmlEscape(mqttUser);
    page += F("'></label></div>"
              "<label>MQTT Password</label>"
              "<input name='mqttPass' type='password' placeholder='Leave blank to keep existing password'>"
              "<p class='muted'>Leave username blank for anonymous brokers (e.g. HiveMQ public). "
              "For production Mosquitto, enter the device_id as username and the matching password.</p>"
              "<label>Device ID</label><input name='deviceId' value='"); page += htmlEscape(deviceId);
    page += F("'><div class='row'>"
              "<label><input type='radio' name='mode' value='dhcp' "); page += wifiSettings.dhcp ? "checked" : "";
    page += F("> Dynamic IP</label>"
              "<label><input type='radio' name='mode' value='static' "); page += wifiSettings.dhcp ? "" : "checked";
    page += F("> Static IP</label></div>"
              "<label>Static IP</label><input name='ip' value='"); page += wifiSettings.localIp.toString();
    page += F("'><label>Gateway</label><input name='gw' value='"); page += wifiSettings.gateway.toString();
    page += F("'><label>Subnet</label><input name='sn' value='"); page += wifiSettings.subnet.toString();
    page += F("'><p><button>Save &amp; Reconnect</button></p></form></section>");

    // Calibration section
    page += F("<section><h2>Calibration</h2>"
              "<form method='post' action='/calib'>"
              "<div class='row'>"
              "<label>V-in Offset<input name='vInOff' type='number' value='"); page += calib.vInOffset;
    page += F("'></label><label>V-in Scale<input name='vInSc' type='number' step='0.0001' value='"); page += String(calib.vInScale, 4);
    page += F("'></label></div><div class='row'>"
              "<label>V-out Offset<input name='vOutOff' type='number' value='"); page += calib.vOutOffset;
    page += F("'></label><label>V-out Scale<input name='vOutSc' type='number' step='0.0001' value='"); page += String(calib.vOutScale, 4);
    page += F("'></label></div><div class='row'>"
              "<label>CT-in Offset<input name='ctInOff' type='number' value='"); page += calib.ctInOffset;
    page += F("'></label><label>CT-in Scale<input name='ctInSc' type='number' step='0.0001' value='"); page += String(calib.ctInScale, 4);
    page += F("'></label></div><div class='row'>"
              "<label>CT-out Offset<input name='ctOutOff' type='number' value='"); page += calib.ctOutOffset;
    page += F("'></label><label>CT-out Scale<input name='ctOutSc' type='number' step='0.0001' value='"); page += String(calib.ctOutScale, 4);
    page += F("'></label></div><div class='row'>"
              "<label>Vdc Scale<input name='vDcSc' type='number' step='0.00001' value='"); page += String(calib.vDcScale, 5);
    page += F("'></label><label>Vdc Offset<input name='vDcOff' type='number' step='0.01' value='"); page += String(calib.vDcOffset, 2);
    page += F("'></label></div>"
              "<p class='muted'>Phase correction offsets stored but not yet applied. Requires external reference.</p>"
              "<p><button>Save Calibration</button></p></form></section>");

    // Energy reset
    page += F("<section><h2>Energy Counters</h2>"
              "<p>E-in: "); page += String((float)energyInKwh, 3); page += F(" kWh &nbsp; E-out: ");
    page += String((float)energyOutKwh, 3); page += F(" kWh</p>"
              "<form method='post' action='/resetenergy'>"
              "<button style='background:#c62828'>Reset Energy Counters</button>"
              " <span class='muted'>(irreversible)</span></form></section>");

    // JS polling for live grid
    page += F("<script>"
              "const FIELDS=["
              "{k:'volt_in',l:'V-in',u:'V'},{k:'volt_out',l:'V-out',u:'V'},{k:'volt_dc',l:'V-dc',u:'V'},"
              "{k:'ct_in',l:'I-in',u:'A'},{k:'ct_out',l:'I-out',u:'A'},"
              "{k:'s_in_va',l:'S-in',u:'VA'},{k:'s_out_va',l:'S-out',u:'VA'},"
              "{k:'freq_in',l:'Freq-in',u:'Hz'},{k:'freq_out',l:'Freq-out',u:'Hz'},"
              "{k:'p_in_w',l:'P-in',u:'W'},{k:'p_out_w',l:'P-out',u:'W'},"
              "{k:'pf_in',l:'PF-in',u:''},{k:'pf_out',l:'PF-out',u:''},"
              "{k:'q_in_var',l:'Q-in',u:'VAR'},{k:'q_out_var',l:'Q-out',u:'VAR'},"
              "{k:'e_in_kwh',l:'E-in',u:'kWh'},{k:'e_out_kwh',l:'E-out',u:'kWh'},"
              "{k:'rssi',l:'RSSI',u:'dBm'}"
              "];"
              "function draw(d){"
              "grid.innerHTML=FIELDS.map(f=>"
              "'<div class=\"card\"><div class=\"lbl\">'+f.l+'</div>"
              "<div class=\"val\">'+(d[f.k]===null||d[f.k]===undefined?'â€”':("
              "typeof d[f.k]==='number'?d[f.k].toFixed(f.u==='Hz'?2:f.u===''?3:2):d[f.k]))"
              "+'</div><div class=\"unit\">'+f.u+'</div></div>').join('')"
              "}"
              "async function poll(){"
              "try{let r=await fetch('/data');if(r.ok)draw(await r.json())}catch(e){}"
              "}poll();setInterval(poll,2000)"
              "</script></main></body></html>");

    webServer.send(200, F("text/html"), page);
}

void handleData()
{
    webServer.send(200, F("application/json"), buildDataJson());
}

void handleSave()
{
    wifiSettings.ssid = webServer.arg("ssid");
    // wifiSettings.pass handled below â€” blank means "keep existing"
    wifiSettings.dhcp = (webServer.arg("mode") != "static");

    String newMqttHost = webServer.arg("mqttHost");
    newMqttHost.trim();
    if (newMqttHost.length() > 0) mqttHost = newMqttHost;

    String newMqttPortStr = webServer.arg("mqttPort");
    newMqttPortStr.trim();
    if (newMqttPortStr.length() > 0) {
        uint16_t p = (uint16_t)newMqttPortStr.toInt();
        if (p > 0) mqttPort = p;
    }

    // Username: empty string clears auth (intentional).
    mqttUser = webServer.arg("mqttUser");
    mqttUser.trim();
    // Password: blank means "keep existing" â€” never overwrite with an empty string.
    // To clear the password, the user must explicitly set username to empty first.
    String newMqttPass = webServer.arg("mqttPass");
    if (newMqttPass.length() > 0) mqttPass = newMqttPass;
    // WiFi password: blank also means "keep existing".
    String newWifiPass = webServer.arg("pass");
    if (newWifiPass.length() > 0) wifiSettings.pass = newWifiPass;

    String newDevId = webServer.arg("deviceId");
    newDevId.trim();
    if (newDevId.length() > 0) deviceId = newDevId;

    // Save device / MQTT settings
    prefs.begin("device", false);
    prefs.putString("id",       deviceId);
    prefs.putString("mqttHost", mqttHost);
    prefs.putUShort("mqttPort", mqttPort);
    prefs.putString("mqttUser", mqttUser);
    prefs.putString("mqttPass", mqttPass);
    prefs.end();

    if (!wifiSettings.dhcp) {
        IPAddress ip, gw, sn, dns1, dns2;
        if (!parseIpArg("ip", ip) || !parseIpArg("gw", gw) || !parseIpArg("sn", sn)) {
            webServer.send(400, F("text/plain"), F("Static IP, gateway, subnet required."));
            return;
        }
        if (!parseIpArg("dns1", dns1)) dns1 = gw;
        if (!parseIpArg("dns2", dns2)) dns2 = dns1;
        wifiSettings.localIp = ip; wifiSettings.gateway = gw;
        wifiSettings.subnet  = sn; wifiSettings.dns1 = dns1; wifiSettings.dns2 = dns2;
    }

    saveWifiSettings();
    webServer.sendHeader(F("Location"), "/");
    webServer.send(303);
    connectWifi();
}

void handleCalib()
{
    calib.vInOffset   = (int16_t)webServer.arg("vInOff").toInt();
    calib.vInScale    = webServer.arg("vInSc").toFloat();
    calib.vOutOffset  = (int16_t)webServer.arg("vOutOff").toInt();
    calib.vOutScale   = webServer.arg("vOutSc").toFloat();
    calib.ctInOffset  = (int16_t)webServer.arg("ctInOff").toInt();
    calib.ctInScale   = webServer.arg("ctInSc").toFloat();
    calib.ctOutOffset = (int16_t)webServer.arg("ctOutOff").toInt();
    calib.ctOutScale  = webServer.arg("ctOutSc").toFloat();
    calib.vDcScale    = webServer.arg("vDcSc").toFloat();
    calib.vDcOffset   = webServer.arg("vDcOff").toFloat();

    // Guard against zero scales which would NaN everything
    if (calib.vInScale   == 0.0f) calib.vInScale   = CALIB_DEFAULTS.vInScale;
    if (calib.vOutScale  == 0.0f) calib.vOutScale  = CALIB_DEFAULTS.vOutScale;
    if (calib.ctInScale  == 0.0f) calib.ctInScale  = CALIB_DEFAULTS.ctInScale;
    if (calib.ctOutScale == 0.0f) calib.ctOutScale = CALIB_DEFAULTS.ctOutScale;
    if (calib.vDcScale   == 0.0f) calib.vDcScale   = CALIB_DEFAULTS.vDcScale;

    saveCalib();
    webServer.sendHeader(F("Location"), "/");
    webServer.send(303);
}

void handleResetEnergy()
{
    energyInKwh  = 0.0;
    energyOutKwh = 0.0;
    saveEnergy();
    webServer.sendHeader(F("Location"), "/");
    webServer.send(303);
}

/**
 * GET /api/info â€” machine-readable device identity.
 * Required by the LAN scanner to identify boards on the network.
 *
 * Response fields:
 *   device_id   â€” NVS-configured or MAC-derived identifier
 *   firmware    â€” FIRMWARE_VERSION constant
 *   mac         â€” full MAC address (colon-separated)
 *   ip          â€” current STA IP (or AP IP if not connected)
 *   mqtt_host   â€” configured MQTT broker hostname
 *   mqtt_port   â€” configured MQTT broker port
 *   mqtt_topic  â€” the topic this device publishes to
 *   mqtt_auth   â€” true if username/password auth is configured
 */
void handleApiInfo()
{
    uint8_t mac[6];
    WiFi.macAddress(mac);
    char macStr[18];
    snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);

    String ip = (WiFi.status() == WL_CONNECTED)
                ? WiFi.localIP().toString()
                : WiFi.softAPIP().toString();

    String topic = "ums/devices/" + deviceId + "/data";

    String j = F("{");
    j += F("\"device_id\":\"");  j += deviceId; j += F("\",");
    j += F("\"firmware\":\"" FIRMWARE_VERSION "\",");
    j += F("\"mac\":\"");        j += macStr;   j += F("\",");
    j += F("\"ip\":\"");         j += ip;       j += F("\",");
    j += F("\"mqtt_host\":\"");  j += mqttHost; j += F("\",");
    j += F("\"mqtt_port\":");    j += mqttPort; j += F(",");
    j += F("\"mqtt_topic\":\""); j += topic;    j += F("\",");
    j += F("\"mqtt_auth\":");    j += (mqttUser.length() > 0 ? F("true") : F("false"));
    j += F("}");

    webServer.send(200, F("application/json"), j);
}

void setupWebServer()
{
    webServer.on("/",             HTTP_GET,  handleRoot);
    webServer.on("/data",         HTTP_GET,  handleData);
    webServer.on("/api/info",     HTTP_GET,  handleApiInfo);
    webServer.on("/save",         HTTP_POST, handleSave);
    webServer.on("/calib",        HTTP_POST, handleCalib);
    webServer.on("/resetenergy",  HTTP_POST, handleResetEnergy);
    // OTA firmware update via HTTP â€” browse to http://<device-ip>/update
    httpUpdater.setup(&webServer, "/update");
    webServer.begin();
    Serial.println(F("[OTA] HTTP update server at /update"));
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  Serial diagnostics
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
void printDiag()
{
    Serial.println(F("â”€â”€â”€â”€â”€â”€ UMS Energy Analyzer â”€â”€â”€â”€â”€â”€"));
    Serial.print(F("Device  : ")); Serial.println(deviceId);
    Serial.print(F("WiFi    : "));
    Serial.println(WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : F("offline"));
    Serial.printf("V-in    : %.2f V\n",       isnan(meas.volt_in)    ? 0 : meas.volt_in);
    Serial.printf("V-out   : %.2f V\n",       isnan(meas.volt_out)   ? 0 : meas.volt_out);
    Serial.printf("V-dc    : %.2f V\n",       meas.volt_dc);
    Serial.printf("I-in    : %.3f A\n",       isnan(meas.ct_in)      ? 0 : meas.ct_in);
    Serial.printf("I-out   : %.3f A\n",       isnan(meas.ct_out)     ? 0 : meas.ct_out);
    Serial.printf("S-in    : %.1f VA\n",      isnan(meas.s_in_va)    ? 0 : meas.s_in_va);
    Serial.printf("S-out   : %.1f VA\n",      isnan(meas.s_out_va)   ? 0 : meas.s_out_va);
    Serial.printf("f-in    : %s Hz\n",        isnan(meas.freq_in)  ? "null" : String(meas.freq_in,  2).c_str());
    Serial.printf("f-out   : %s Hz\n",        isnan(meas.freq_out) ? "null" : String(meas.freq_out, 2).c_str());
    Serial.printf("P-in    : %.1f W\n",       isnan(meas.p_in_w)     ? 0 : meas.p_in_w);
    Serial.printf("P-out   : %.1f W\n",       isnan(meas.p_out_w)    ? 0 : meas.p_out_w);
    Serial.printf("PF-in   : %s\n",           isnan(meas.pf_in)    ? "null" : String(meas.pf_in,  3).c_str());
    Serial.printf("PF-out  : %s\n",           isnan(meas.pf_out)   ? "null" : String(meas.pf_out, 3).c_str());
    Serial.printf("Q-in    : %s VAR\n",       isnan(meas.q_in_var) ? "null" : String(meas.q_in_var,  1).c_str());
    Serial.printf("Q-out   : %s VAR\n",       isnan(meas.q_out_var)? "null" : String(meas.q_out_var, 1).c_str());
    Serial.printf("E-in    : %.4f kWh\n",     meas.e_in_kwh);
    Serial.printf("E-out   : %.4f kWh\n",     meas.e_out_kwh);
    Serial.printf("Seq#    : %u\n",           seqNo);
    Serial.println(F("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€"));
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  SETUP
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
void setup()
{
    Serial.begin(SERIAL_BAUD);
    delay(300);

    Serial.println(F("\n=== UMS Energy Analyzer Firmware ==="));
    Serial.println(F("Branch: firmware-energy-analyzer"));

    // Load persistent settings
    loadWifiSettings();
    loadCalib();
    loadEnergy();

    // WiFi must be started before reading MAC for device ID
    connectWifi();
    loadDeviceId();

    Serial.print(F("Device ID : ")); Serial.println(deviceId);
    Serial.print(F("Firmware  : " FIRMWARE_VERSION "\n"));
    Serial.printf("MQTT      : %s:%u (auth:%s)\n",
                  mqttHost.c_str(), mqttPort, mqttUser.length() > 0 ? "yes" : "no");

    setupWebServer();

    // Configure ADC
    adc1_config_width(ADC_WIDTH);
    for (uint8_t i = 0; i < NUM_CH; i++) {
        adc1_config_channel_atten(CH[i], ADC_ATTENUATION);
    }
    esp_adc_cal_characterize(ADC_UNIT_1, ADC_ATTENUATION, ADC_WIDTH, 1100, &adcChars);

    // Zero accumulators
    memset(&acqBuf,   0, sizeof(acqBuf));
    memset(&readyBuf, 0, sizeof(readyBuf));
    memset(&meas,     0, sizeof(meas));
    // Pre-set energy from NVS
    meas.e_in_kwh  = (float)energyInKwh;
    meas.e_out_kwh = (float)energyOutKwh;

    // Create high-priority sampler task on core 1
    BaseType_t ok = xTaskCreatePinnedToCore(
        samplerTask, "sampler",
        8192,          // stack â€” increased for float ops
        nullptr, 10,   // priority 10
        &samplerTaskH, 1
    );
    if (ok != pdPASS) {
        Serial.println(F("FATAL: sampler task creation failed"));
        for (;;) delay(1000);
    }

    // Start hardware timer
#if ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)
    sampleTimer = timerBegin(1000000UL);
    timerAttachInterrupt(sampleTimer, &onSampleTimer);
    timerAlarm(sampleTimer, TIMER_PERIOD_US, true, 0);
#else
    sampleTimer = timerBegin(0, 80, true);
    timerAttachInterrupt(sampleTimer, &onSampleTimer, true);
    timerAlarmWrite(sampleTimer, TIMER_PERIOD_US, true);
    timerAlarmEnable(sampleTimer);
#endif

    Serial.println(F("Sampler running at 500 Hz, 500-sample window (1 s update)"));
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  LOOP â€” non-blocking; never delays
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
void loop()
{
    webServer.handleClient();
    reconnectWifiIfNeeded();

    unsigned long now = millis();

    // â”€â”€ Process completed sample window â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    bool gotWindow = false;
    portENTER_CRITICAL(&bufMux);
    if (windowReady) {
        windowReady = false;
        gotWindow   = true;
    }
    portEXIT_CRITICAL(&bufMux);

    if (gotWindow) {
        computeMeasurements(readyBuf);
        seqNo++;
        printDiag();
    }

    // â”€â”€ MQTT publish â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (now - lastMqttPublish >= MQTT_PUBLISH_MS) {
        lastMqttPublish = now;
        publishMqttData();
    }

    // â”€â”€ Persist energy counters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (now - lastEnergySave >= ENERGY_SAVE_MS) {
        lastEnergySave = now;
        saveEnergy();
        Serial.printf("Energy saved: in=%.4f kWh  out=%.4f kWh\n",
                      (float)energyInKwh, (float)energyOutKwh);
    }
}
