/*
 * UPS Monitor Firmware  v0.5.0
 *
 * Commissioning portal at /config (WiFi, MQTT, board identity, calibration).
 * AP fallback: UMS-SETUP-<last4MAC> / UMSSetup2026
 * Configurable MQTT publish interval stored in NVS.
 * Extended identity fields in MQTT payload.
 *
 * Routes
 *   GET  /               — status page (live data, connection info)
 *   GET  /config         — full configuration form
 *   POST /save-config    — save all configuration
 *   GET  /reboot         — schedule reboot
 *   GET  /factory-reset  — clear NVS and reboot
 *   GET  /data           — JSON live data (existing, unchanged)
 *   GET  /update         — OTA upload page (existing, unchanged)
 *   POST /update         — OTA receive handler (existing, unchanged)
 *   POST /save           — legacy WiFi save (backwards compat)
 *   POST /save-device    — legacy identity save (backwards compat)
 *   POST /save-mqtt      — legacy MQTT save (backwards compat)
 *   POST /save-calibration — legacy calibration save (backwards compat)
 */

#include <Arduino.h>
#include <driver/adc.h>
#include <esp_adc_cal.h>
#include <esp_system.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <Update.h>

/* ================================================================
 *  Firmware identity
 * ================================================================ */
#define FIRMWARE_VERSION        "0.5.0"

/* ================================================================
 *  Hardware / sampling constants  (DO NOT CHANGE)
 * ================================================================ */
#define SERIAL_BAUD             921600UL
#define SAMPLE_RATE_HZ          500UL
#define TIMER_PERIOD_US         (1000000UL / SAMPLE_RATE_HZ)
#define SAMPLES_PER_UPDATE      250UL
#define AC_SCALE_PER_SAMPLE     1.72f
#define ADC_ATTENUATION         ADC_ATTEN_DB_11
#define ADC_WIDTH               ADC_WIDTH_BIT_12

/* ================================================================
 *  Factory defaults
 * ================================================================ */
#define DEFAULT_WIFI_SSID       ""
#define DEFAULT_WIFI_PASS       ""
#define DEFAULT_DEVICE_ID       "UPSMON-UNASSIGNED"
#define DEFAULT_SITE_ID         "SITE-UNASSIGNED"
#define DEFAULT_UPS_ID          "UPS-UNASSIGNED"
#define DEFAULT_AP_PASS         "UMSSetup2026"
#define DEFAULT_OTA_PASS        "ChangeMeOTA123"
#define DEFAULT_MQTT_SERVER     ""
#define DEFAULT_MQTT_PORT       1883
#define DEFAULT_MQTT_USER       ""
#define DEFAULT_MQTT_PASS       ""
#define DEFAULT_MQTT_TOPIC      "building/site-01/ups/UPSMON-UNASSIGNED/telemetry"
#define DEFAULT_PUBLISH_SECS    5u     /* seconds between MQTT publishes */

/* ================================================================
 *  WiFi timing
 * ================================================================ */
#define WIFI_CONNECT_TIMEOUT_MS  30000UL   /* declare AP fallback after this */
#define WIFI_RETRY_MS            60000UL   /* retry STA once per minute      */

/* ================================================================
 *  ADC channels
 * ================================================================ */
#define NUM_CH 5
static const adc1_channel_t CH[NUM_CH] = {
    ADC1_CHANNEL_6,   /* GPIO34  DC Voltage          */
    ADC1_CHANNEL_7,   /* GPIO35  Output Voltage (AC) */
    ADC1_CHANNEL_4,   /* GPIO32  Input Voltage (AC)  */
    ADC1_CHANNEL_0,   /* GPIO36  Input CT            */
    ADC1_CHANNEL_3    /* GPIO39  Output CT           */
};
static const char* CH_LBL[NUM_CH] = { "D34","D35","D32","D36","D39" };

/* ================================================================
 *  Measured values  (samplerTask → main)
 * ================================================================ */
float Volt_DC  = 0;
float Volt_In  = 0;
float Volt_Out = 0;
float CT_In    = 0;
float CT_Out   = 0;
float VA_In    = 0;
float VA_Out   = 0;

static uint32_t     sampleSrNo      = 0;
static volatile bool valuesUpdated  = false;
static uint32_t     mqttSeq         = 0;
static hw_timer_t*  sampleTimer     = nullptr;
static TaskHandle_t samplerTaskH    = nullptr;
static esp_adc_cal_characteristics_t adcChars;
static portMUX_TYPE valueMux        = portMUX_INITIALIZER_UNLOCKED;

/* ================================================================
 *  Settings structs
 * ================================================================ */
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

struct DeviceSettings {
    /* Core identity */
    String deviceId;
    String upsId;
    String siteId;
    /* Location — sent in every MQTT payload */
    String building;
    String floor;
    String section;
    String workArea;
    String location;
    String installerNote;
    /* Security */
    String apPass;
    String otaPass;
};

struct MqttSettings {
    String   server;
    uint16_t port;
    String   username;
    String   password;
    String   topic;
    uint16_t publishIntervalSecs;
};

struct MeasurementCalibration {
    float vInScale;
    float vInOffset;
    float vOutScale;
    float vOutOffset;
    float vBattScale;
    float vBattOffset;
    float iInScale;
    float iInOffset;
    float iOutScale;
    float iOutOffset;
    float acZero;
};

/* ================================================================
 *  Global instances
 * ================================================================ */
static WifiSettings           wifiSettings;
static DeviceSettings         deviceSettings;
static MqttSettings           mqttSettings;
static MeasurementCalibration calibration;
static Preferences            prefs;
static WebServer              server(80);

/* ================================================================
 *  Runtime state
 * ================================================================ */
static unsigned long lastMqttPublish   = 0;
static unsigned long lastWifiRetry     = 0;
static unsigned long wifiConnectStart  = 0;
static bool          wifiConnecting    = false;
static bool          wifiApFallback    = false;  /* STA failed → AP-only */
static bool          mqttLastOk        = false;  /* last publish succeeded */
static bool          shouldRestart     = false;
static unsigned long restartAt         = 0;

/* ================================================================
 *  Timer ISR
 * ================================================================ */
void IRAM_ATTR onSampleTimer()
{
    BaseType_t higherPrioTaskWoken = pdFALSE;
    vTaskNotifyGiveFromISR(samplerTaskH, &higherPrioTaskWoken);
    if (higherPrioTaskWoken) portYIELD_FROM_ISR();
}

/* ================================================================
 *  Serial output helpers
 * ================================================================ */
void printHeader()
{
    Serial.println();
    Serial.println(F("=============================================="));
    Serial.print(F(" UPS Monitor  v")); Serial.println(F(FIRMWARE_VERSION));
    Serial.println(F(" Baudrate: 921600"));
    Serial.print(F(" Sample Rate: ")); Serial.print(SAMPLE_RATE_HZ); Serial.println(F(" Hz"));
    Serial.println(F("=============================================="));
    Serial.println();
}

void printParameters()
{
    float vIn, vOut, vDc, ctIn, ctOut, vaIn, vaOut;
    portENTER_CRITICAL(&valueMux);
    vIn=Volt_In; vOut=Volt_Out; vDc=Volt_DC;
    ctIn=CT_In; ctOut=CT_Out; vaIn=VA_In; vaOut=VA_Out;
    portEXIT_CRITICAL(&valueMux);

    Serial.println(F("----------- Live Parameters -----------"));
    Serial.print(F("Volt_In  : ")); Serial.println(vIn, 2);
    Serial.print(F("Volt_Out : ")); Serial.println(vOut, 2);
    Serial.print(F("Volt_DC  : ")); Serial.println(vDc, 2);
    Serial.print(F("CT_In    : ")); Serial.println(ctIn, 2);
    Serial.print(F("CT_Out   : ")); Serial.println(ctOut, 2);
    Serial.print(F("VA_In    : ")); Serial.println(vaIn, 2);
    Serial.print(F("VA_Out   : ")); Serial.println(vaOut, 2);
    Serial.print(F("WiFi     : "));
    if (WiFi.status() == WL_CONNECTED) { Serial.print(F("STA ")); Serial.println(WiFi.localIP()); }
    else { Serial.print(F("AP ")); Serial.println(WiFi.softAPIP()); }
    Serial.print(F("MQTT     : ")); Serial.println(mqttLastOk ? F("OK") : F("---"));
    Serial.println(F("---------------------------------------")); Serial.println();
}

/* ================================================================
 *  Utility helpers
 * ================================================================ */
String htmlEscape(const String& in)
{
    String out; out.reserve(in.length());
    for (size_t i = 0; i < in.length(); i++) {
        char c = in[i];
        if      (c == '&') out += F("&amp;");
        else if (c == '<') out += F("&lt;");
        else if (c == '>') out += F("&gt;");
        else if (c == '"') out += F("&quot;");
        else out += c;
    }
    return out;
}

/* Last 4 hex chars of MAC address, no colons (e.g. "3A4F") */
String getMacLast4()
{
    String mac = WiFi.macAddress();
    mac.replace(":", "");
    return mac.substring(mac.length() - 4);
}

/* AP SSID format: UMS-SETUP-<last4MAC> */
String getApSsid()
{
    return "UMS-SETUP-" + getMacLast4();
}

bool parseIpArg(const String& name, IPAddress& ip)
{
    String v = server.arg(name); v.trim();
    return v.length() > 0 && ip.fromString(v);
}

/* ================================================================
 *  NVS  — load / save / factory reset
 * ================================================================ */

/* NVS namespace "wifi"
 *   ssid, pass, dhcp (bool), ip, gw, sn, dns1, dns2
 */
void loadWifiSettings()
{
    prefs.begin("wifi", true);
    wifiSettings.ssid = prefs.getString("ssid", DEFAULT_WIFI_SSID);
    wifiSettings.pass = prefs.getString("pass", DEFAULT_WIFI_PASS);
    wifiSettings.dhcp = prefs.getBool(  "dhcp", true);
    wifiSettings.localIp.fromString(prefs.getString("ip",   "192.168.1.90"));
    wifiSettings.gateway.fromString(prefs.getString("gw",   "192.168.1.1"));
    wifiSettings.subnet.fromString( prefs.getString("sn",   "255.255.255.0"));
    wifiSettings.dns1.fromString(   prefs.getString("dns1", "8.8.8.8"));
    wifiSettings.dns2.fromString(   prefs.getString("dns2", "1.1.1.1"));
    prefs.end();
}

void saveWifiSettings()
{
    prefs.begin("wifi", false);
    prefs.putString("ssid", wifiSettings.ssid);
    prefs.putString("pass", wifiSettings.pass);
    prefs.putBool(  "dhcp", wifiSettings.dhcp);
    prefs.putString("ip",   wifiSettings.localIp.toString());
    prefs.putString("gw",   wifiSettings.gateway.toString());
    prefs.putString("sn",   wifiSettings.subnet.toString());
    prefs.putString("dns1", wifiSettings.dns1.toString());
    prefs.putString("dns2", wifiSettings.dns2.toString());
    prefs.end();
}

/* NVS namespace "device"
 *   device_id, ups_id, site_id,
 *   building, floor, section, work_area, location, note,
 *   ap_pass, ota_pass
 */
void loadDeviceSettings()
{
    prefs.begin("device", true);
    deviceSettings.deviceId      = prefs.getString("device_id", DEFAULT_DEVICE_ID);
    deviceSettings.upsId         = prefs.getString("ups_id",    DEFAULT_UPS_ID);
    deviceSettings.siteId        = prefs.getString("site_id",   DEFAULT_SITE_ID);
    deviceSettings.building      = prefs.getString("building",  "");
    deviceSettings.floor         = prefs.getString("floor",     "");
    deviceSettings.section       = prefs.getString("section",   "");
    deviceSettings.workArea      = prefs.getString("work_area", "");
    deviceSettings.location      = prefs.getString("location",  "");
    deviceSettings.installerNote = prefs.getString("note",      "");
    deviceSettings.apPass        = prefs.getString("ap_pass",   DEFAULT_AP_PASS);
    deviceSettings.otaPass       = prefs.getString("ota_pass",  DEFAULT_OTA_PASS);
    prefs.end();
}

void saveDeviceSettings()
{
    prefs.begin("device", false);
    prefs.putString("device_id", deviceSettings.deviceId);
    prefs.putString("ups_id",    deviceSettings.upsId);
    prefs.putString("site_id",   deviceSettings.siteId);
    prefs.putString("building",  deviceSettings.building);
    prefs.putString("floor",     deviceSettings.floor);
    prefs.putString("section",   deviceSettings.section);
    prefs.putString("work_area", deviceSettings.workArea);
    prefs.putString("location",  deviceSettings.location);
    prefs.putString("note",      deviceSettings.installerNote);
    prefs.putString("ap_pass",   deviceSettings.apPass);
    prefs.putString("ota_pass",  deviceSettings.otaPass);
    prefs.end();
}

/* NVS namespace "mqtt"
 *   server, port (ushort), user, pass, topic, pub_int (ushort, seconds)
 */
void loadMqttSettings()
{
    prefs.begin("mqtt", true);
    mqttSettings.server               = prefs.getString("server",  DEFAULT_MQTT_SERVER);
    mqttSettings.port                 = prefs.getUShort("port",    DEFAULT_MQTT_PORT);
    mqttSettings.username             = prefs.getString("user",    DEFAULT_MQTT_USER);
    mqttSettings.password             = prefs.getString("pass",    DEFAULT_MQTT_PASS);
    mqttSettings.topic                = prefs.getString("topic",   DEFAULT_MQTT_TOPIC);
    mqttSettings.publishIntervalSecs  = prefs.getUShort("pub_int", DEFAULT_PUBLISH_SECS);
    prefs.end();
}

void saveMqttSettings()
{
    prefs.begin("mqtt", false);
    prefs.putString("server",  mqttSettings.server);
    prefs.putUShort("port",    mqttSettings.port);
    prefs.putString("user",    mqttSettings.username);
    prefs.putString("pass",    mqttSettings.password);
    prefs.putString("topic",   mqttSettings.topic);
    prefs.putUShort("pub_int", mqttSettings.publishIntervalSecs);
    prefs.end();
}

/* NVS namespace "cal"
 *   vin_s, vin_o, vout_s, vout_o, vbatt_s, vbatt_o,
 *   iin_s, iin_o, iout_s, iout_o, ac_zero
 */
void loadCalibrationSettings()
{
    prefs.begin("cal", true);
    calibration.vInScale    = prefs.getFloat("vin_s",   1.0f);
    calibration.vInOffset   = prefs.getFloat("vin_o",   0.0f);
    calibration.vOutScale   = prefs.getFloat("vout_s",  1.0f);
    calibration.vOutOffset  = prefs.getFloat("vout_o",  0.0f);
    calibration.vBattScale  = prefs.getFloat("vbatt_s", 1.0f);
    calibration.vBattOffset = prefs.getFloat("vbatt_o", 0.0f);
    calibration.iInScale    = prefs.getFloat("iin_s",   1.0f);
    calibration.iInOffset   = prefs.getFloat("iin_o",   0.0f);
    calibration.iOutScale   = prefs.getFloat("iout_s",  1.0f);
    calibration.iOutOffset  = prefs.getFloat("iout_o",  0.0f);
    calibration.acZero      = prefs.getFloat("ac_zero", 1995.0f);
    prefs.end();
}

void saveCalibrationSettings()
{
    prefs.begin("cal", false);
    prefs.putFloat("vin_s",   calibration.vInScale);
    prefs.putFloat("vin_o",   calibration.vInOffset);
    prefs.putFloat("vout_s",  calibration.vOutScale);
    prefs.putFloat("vout_o",  calibration.vOutOffset);
    prefs.putFloat("vbatt_s", calibration.vBattScale);
    prefs.putFloat("vbatt_o", calibration.vBattOffset);
    prefs.putFloat("iin_s",   calibration.iInScale);
    prefs.putFloat("iin_o",   calibration.iInOffset);
    prefs.putFloat("iout_s",  calibration.iOutScale);
    prefs.putFloat("iout_o",  calibration.iOutOffset);
    prefs.putFloat("ac_zero", calibration.acZero);
    prefs.end();
}

void factoryResetAll()
{
    prefs.begin("wifi",   false); prefs.clear(); prefs.end();
    prefs.begin("device", false); prefs.clear(); prefs.end();
    prefs.begin("mqtt",   false); prefs.clear(); prefs.end();
    prefs.begin("cal",    false); prefs.clear(); prefs.end();
}

/* ================================================================
 *  WiFi management
 * ================================================================ */
void connectWifi()
{
    WiFi.mode(WIFI_AP_STA);

    /* AP: always starts as UMS-SETUP-<last4MAC> */
    String apSsid = getApSsid();
    WiFi.softAP(apSsid.c_str(), deviceSettings.apPass.c_str());
    Serial.print(F("AP started: ")); Serial.println(apSsid);
    Serial.print(F("AP IP: ")); Serial.println(WiFi.softAPIP());

    WiFi.disconnect(false, false);

    /* STA: apply static/DHCP config before connecting */
    if (!wifiSettings.dhcp) {
        WiFi.config(wifiSettings.localIp, wifiSettings.gateway,
                    wifiSettings.subnet, wifiSettings.dns1, wifiSettings.dns2);
    } else {
        WiFi.config(INADDR_NONE, INADDR_NONE, INADDR_NONE);
    }

    if (wifiSettings.ssid.length() > 0) {
        Serial.print(F("STA: connecting to ")); Serial.println(wifiSettings.ssid);
        WiFi.begin(wifiSettings.ssid.c_str(), wifiSettings.pass.c_str());
        wifiConnecting   = true;
        wifiConnectStart = millis();
        wifiApFallback   = false;
    } else {
        Serial.println(F("STA: no SSID configured — AP-only mode"));
        wifiConnecting = false;
        wifiApFallback = true;
    }
}

void reconnectWifiIfNeeded()
{
    if (WiFi.status() == WL_CONNECTED) {
        if (wifiConnecting) {
            wifiConnecting = false;
            wifiApFallback = false;
            Serial.print(F("WiFi connected: ")); Serial.println(WiFi.localIP());
        }
        return;
    }

    unsigned long now = millis();

    /* Declare AP fallback once the connect attempt has timed out */
    if (wifiConnecting && (now - wifiConnectStart >= WIFI_CONNECT_TIMEOUT_MS)) {
        wifiConnecting = false;
        wifiApFallback = true;
        Serial.println(F("WiFi: connect timeout — AP fallback active"));
    }

    /* Periodic retry: attempt STA reconnect even while in fallback */
    if (!wifiConnecting && (now - lastWifiRetry >= WIFI_RETRY_MS)) {
        lastWifiRetry = now;
        if (wifiSettings.ssid.length() > 0) {
            Serial.println(F("WiFi: retrying STA..."));
            WiFi.begin(wifiSettings.ssid.c_str(), wifiSettings.pass.c_str());
            wifiConnecting   = true;
            wifiConnectStart = now;
        }
    }
}

/* ================================================================
 *  MQTT (raw TCP, no external library — unchanged protocol)
 * ================================================================ */
bool writeMqttRemainingLength(WiFiClient& client, uint32_t length)
{
    do {
        uint8_t encoded = length % 128;
        length /= 128;
        if (length > 0) encoded |= 128;
        if (client.write(encoded) != 1) return false;
    } while (length > 0);
    return true;
}

bool writeMqttString(WiFiClient& client, const String& value)
{
    uint16_t len = value.length();
    if (client.write((uint8_t)(len >> 8))   != 1) return false;
    if (client.write((uint8_t)(len & 0xFF)) != 1) return false;
    return client.print(value) == (int)len;
}

bool mqttConnectPacket(WiFiClient& client, const String& clientId)
{
    uint8_t  connectFlags    = 0x02;
    uint32_t remainingLength = 10 + 2 + clientId.length();
    if (mqttSettings.username.length() > 0) { connectFlags |= 0x80; remainingLength += 2 + mqttSettings.username.length(); }
    if (mqttSettings.password.length() > 0) { connectFlags |= 0x40; remainingLength += 2 + mqttSettings.password.length(); }

    if (client.write((uint8_t)0x10) != 1) return false;
    if (!writeMqttRemainingLength(client, remainingLength)) return false;
    if (!writeMqttString(client, F("MQTT"))) return false;
    if (client.write((uint8_t)0x04) != 1) return false;
    if (client.write(connectFlags)  != 1) return false;
    if (client.write((uint8_t)0x00) != 1) return false;
    if (client.write((uint8_t)0x3C) != 1) return false;
    if (!writeMqttString(client, clientId)) return false;
    if (mqttSettings.username.length() > 0 && !writeMqttString(client, mqttSettings.username)) return false;
    if (mqttSettings.password.length() > 0 && !writeMqttString(client, mqttSettings.password)) return false;

    unsigned long start = millis();
    while (client.connected() && client.available() < 4 && millis() - start < 3000) delay(10);
    if (client.available() < 4) return false;
    return client.read() == 0x20 && client.read() == 0x02 && client.read() == 0x00 && client.read() == 0x00;
}

bool mqttPublishPacket(WiFiClient& client, const String& topic, const String& payload)
{
    uint32_t remainingLength = 2 + topic.length() + payload.length();
    if (client.write((uint8_t)0x31) != 1) return false;
    if (!writeMqttRemainingLength(client, remainingLength)) return false;
    if (!writeMqttString(client, topic)) return false;
    return client.print(payload) == (int)payload.length();
}

/* ================================================================
 *  JSON builder
 *  Backward-compatible: all v0.4.0 keys unchanged.
 *  Added: building, floor, section, work_area, location,
 *         config_mode, wifi_mode, mqtt_connected
 * ================================================================ */
String buildDataJson()
{
    float vIn, vOut, vDc, ctIn, ctOut, vaIn, vaOut;
    portENTER_CRITICAL(&valueMux);
    vIn=Volt_In; vOut=Volt_Out; vDc=Volt_DC;
    ctIn=CT_In; ctOut=CT_Out; vaIn=VA_In; vaOut=VA_Out;
    portEXIT_CRITICAL(&valueMux);

    String json;
    json.reserve(640);

    /* --- Measurements (unchanged keys from v0.4.0) --- */
    json  = F("{\"volt_in\":");         json += String(vIn, 2);
    json += F(",\"volt_out\":");        json += String(vOut, 2);
    json += F(",\"volt_dc\":");         json += String(vDc, 2);
    json += F(",\"ct_in\":");           json += String(ctIn, 2);
    json += F(",\"ct_out\":");          json += String(ctOut, 2);
    json += F(",\"s_in_va\":");         json += String(vaIn, 2);
    json += F(",\"s_out_va\":");        json += String(vaOut, 2);

    /* --- Core identity --- */
    json += F(",\"device_id\":\"");     json += deviceSettings.deviceId;    json += F("\"");
    json += F(",\"ups_id\":\"");        json += deviceSettings.upsId;       json += F("\"");
    json += F(",\"site_id\":\"");       json += deviceSettings.siteId;      json += F("\"");

    /* --- Extended location identity (NEW in v0.5.0) --- */
    json += F(",\"building\":\"");      json += deviceSettings.building;    json += F("\"");
    json += F(",\"floor\":\"");         json += deviceSettings.floor;       json += F("\"");
    json += F(",\"section\":\"");       json += deviceSettings.section;     json += F("\"");
    json += F(",\"work_area\":\"");     json += deviceSettings.workArea;    json += F("\"");
    json += F(",\"location\":\"");      json += deviceSettings.location;    json += F("\"");

    /* --- Network --- */
    json += F(",\"ip\":\"");            json += WiFi.localIP().toString();  json += F("\"");
    json += F(",\"mac\":\"");           json += WiFi.macAddress();          json += F("\"");
    json += F(",\"rssi\":");            json += WiFi.RSSI();

    /* --- Firmware / system --- */
    json += F(",\"firmware\":\"");      json += FIRMWARE_VERSION;           json += F("\"");
    json += F(",\"uptime_ms\":");       json += millis();
    json += F(",\"seq\":");             json += mqttSeq++;
    json += F(",\"free_heap\":");       json += ESP.getFreeHeap();
    json += F(",\"reset_reason\":");    json += (int)esp_reset_reason();

    /* --- Status flags (NEW in v0.5.0) --- */
    json += F(",\"config_mode\":");
    json += wifiApFallback ? F("true") : F("false");

    json += F(",\"wifi_mode\":\"");
    json += (WiFi.status() == WL_CONNECTED) ? F("STA") : F("AP");
    json += F("\"");

    json += F(",\"mqtt_connected\":");
    json += mqttLastOk ? F("true") : F("false");

    json += F("}");
    return json;
}

void publishMqttData()
{
    if (WiFi.status() != WL_CONNECTED) return;
    if (mqttSettings.server.length() == 0 || mqttSettings.topic.length() == 0) return;

    WiFiClient mqttClient;
    mqttClient.setTimeout(3000);

    if (!mqttClient.connect(mqttSettings.server.c_str(), mqttSettings.port)) {
        Serial.println(F("MQTT: broker connect failed"));
        mqttLastOk = false;
        return;
    }

    String clientId = deviceSettings.deviceId;
    if (clientId.length() == 0 || clientId == DEFAULT_DEVICE_ID) {
        clientId = "upsmon-" + getMacLast4();
    }

    if (!mqttConnectPacket(mqttClient, clientId)) {
        Serial.println(F("MQTT: protocol connect failed"));
        mqttClient.stop();
        mqttLastOk = false;
        return;
    }

    String payload = buildDataJson();
    bool ok = mqttPublishPacket(mqttClient, mqttSettings.topic, payload);
    mqttClient.stop();
    mqttLastOk = ok;
    if (!ok) Serial.println(F("MQTT: publish failed"));
}

/* ================================================================
 *  Shared page CSS  (PROGMEM — stored in flash)
 * ================================================================ */
static const char PAGE_CSS[] PROGMEM =
    "body{font-family:Arial,sans-serif;margin:0;background:#f4f6f8;color:#17202a}"
    "main{max-width:800px;margin:0 auto;padding:18px}"
    "h1{margin:0 0 4px}h2{margin:0 0 10px;font-size:15px;color:#34495e}"
    "section{background:#fff;border:1px solid #dfe3e8;border-radius:8px;"
             "padding:16px 18px;margin:12px 0}"
    "label{display:block;margin:9px 0 3px;font-weight:600;font-size:13px}"
    "input,select{width:100%;box-sizing:border-box;padding:8px 10px;"
                 "border:1px solid #b8c0cc;border-radius:5px;font-size:14px}"
    "input[type=radio]{width:auto}"
    ".row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}"
    ".row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}"
    "button,.btn{background:#1769aa;color:#fff;border:0;border-radius:6px;"
                "padding:9px 18px;font-weight:700;cursor:pointer;"
                "text-decoration:none;display:inline-block;font-size:14px}"
    ".btn-red{background:#c0392b}"
    ".btn-sm{padding:6px 12px;font-size:13px}"
    ".muted{color:#5d6d7e;font-size:13px}"
    ".badge{display:inline-block;border-radius:4px;padding:2px 9px;"
           "font-size:12px;font-weight:700}"
    ".ok{background:#d5f5e3;color:#1e8449}"
    ".err{background:#fadbd8;color:#c0392b}"
    ".warn{background:#fef9e7;color:#b7950b}"
    ".metric{border:1px solid #e3e7ed;border-radius:6px;padding:10px 12px;text-align:center}"
    ".metric b{display:block;font-size:20px;margin:3px 0}"
    ".metric small{font-size:11px;color:#5d6d7e}"
    ".mgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px}"
    ".radio-row{display:flex;gap:24px;align-items:center;margin:6px 0}"
    ".radio-row label{font-weight:400;display:flex;align-items:center;gap:5px}"
    "details>summary{cursor:pointer;font-weight:700;color:#1769aa;padding:3px 0}"
    "a{color:#1769aa}hr{border:0;border-top:1px solid #eaeaea;margin:12px 0}";

String htmlHead(const String& title)
{
    String h;
    h.reserve(500);
    h  = F("<!doctype html><html><head>");
    h += F("<meta name='viewport' content='width=device-width,initial-scale=1'>");
    h += F("<meta charset='utf-8'><title>"); h += htmlEscape(title); h += F("</title>");
    h += F("<style>"); h += FPSTR(PAGE_CSS); h += F("</style>");
    h += F("</head><body><main>");
    return h;
}

String htmlFoot()
{
    return F("</main></body></html>");
}

/* ================================================================
 *  Web handlers
 * ================================================================ */

/* ---- GET /  — Status page ---------------------------------------- */
void handleRoot()
{
    String wifiBadge, wifiDetail, ipStr;
    if (WiFi.status() == WL_CONNECTED) {
        wifiBadge  = F("<span class='badge ok'>Connected</span>");
        wifiDetail = "STA &mdash; SSID: " + htmlEscape(wifiSettings.ssid)
                   + "  RSSI: " + String(WiFi.RSSI()) + " dBm";
        ipStr      = WiFi.localIP().toString();
    } else if (wifiApFallback) {
        wifiBadge  = F("<span class='badge warn'>AP Fallback</span>");
        wifiDetail = F("STA unreachable &mdash; serving AP only");
        ipStr      = WiFi.softAPIP().toString();
    } else {
        wifiBadge  = F("<span class='badge warn'>Connecting&#8230;</span>");
        wifiDetail = F("AP+STA");
        ipStr      = WiFi.softAPIP().toString();
    }
    String mqttBadge = mqttLastOk
        ? F("<span class='badge ok'>Last publish OK</span>")
        : F("<span class='badge err'>No publish yet</span>");

    String p = htmlHead("UPS Monitor");
    p.reserve(3200);

    p += F("<h1>UPS Monitor</h1>");
    p += F("<p class='muted'>v"); p += FIRMWARE_VERSION;
    p += F("&nbsp;&middot;&nbsp;MAC: "); p += WiFi.macAddress();
    p += F("&nbsp;&middot;&nbsp;<a href='/config'>Configure</a>");
    p += F("&nbsp;&middot;&nbsp;<a href='/update'>OTA Update</a>");
    p += F("&nbsp;&middot;&nbsp;<a href='/reboot' onclick=\"return confirm('Reboot now?')\">Reboot</a></p>");

    /* Setup-mode banner */
    if (wifiApFallback) {
        p += F("<section><p class='badge warn' style='font-size:13px;padding:8px 14px;display:block'>"
               "&#9888; Setup mode active &mdash; connect to AP: <b>");
        p += htmlEscape(getApSsid());
        p += F("</b>&nbsp; Password: <b>"); p += htmlEscape(deviceSettings.apPass);
        p += F("</b><br>Then open <b>http://192.168.4.1/config</b> to configure WiFi.</p></section>");
    }

    /* Live data */
    p += F("<section><h2>Live Data</h2>"
           "<div class='mgrid' id='metrics'><p class='muted'>Loading&#8230;</p></div>"
           "<p class='muted' id='ts'></p></section>");

    /* Identity */
    p += F("<section><h2>Board Identity</h2><div class='row2'>");
    p += F("<div><label>Device ID</label><p>"); p += htmlEscape(deviceSettings.deviceId); p += F("</p></div>");
    p += F("<div><label>UPS ID</label><p>"); p += htmlEscape(deviceSettings.upsId); p += F("</p></div>");
    p += F("<div><label>Site ID</label><p>"); p += htmlEscape(deviceSettings.siteId.length() ? deviceSettings.siteId : String("—")); p += F("</p></div>");
    p += F("<div><label>Location</label><p>");
    if (deviceSettings.building.length() || deviceSettings.floor.length() || deviceSettings.location.length()) {
        if (deviceSettings.building.length()) { p += htmlEscape(deviceSettings.building); p += F(" "); }
        if (deviceSettings.floor.length())    { p += htmlEscape(deviceSettings.floor);    p += F(" "); }
        if (deviceSettings.location.length()) p += htmlEscape(deviceSettings.location);
    } else {
        p += F("&mdash;");
    }
    p += F("</p></div></div></section>");

    /* Network */
    p += F("<section><h2>Network</h2>");
    p += F("<p>WiFi: "); p += wifiBadge; p += F(" "); p += wifiDetail; p += F("</p>");
    p += F("<p>STA IP: "); p += ipStr;
    p += F("&nbsp;&nbsp; AP IP: "); p += WiFi.softAPIP().toString(); p += F("</p></section>");

    /* MQTT */
    p += F("<section><h2>MQTT</h2>");
    p += F("<p>Broker: <b>");
    p += htmlEscape(mqttSettings.server.length() ? mqttSettings.server : String("(not set)"));
    p += F(":</b>"); p += mqttSettings.port;
    p += F(" &nbsp; Status: "); p += mqttBadge; p += F("</p>");
    p += F("<p class='muted'>Topic: "); p += htmlEscape(mqttSettings.topic);
    p += F(" &nbsp; Interval: "); p += mqttSettings.publishIntervalSecs; p += F("s</p></section>");

    /* Auto-refresh JS */
    p += F("<script>"
           "var KEYS=['volt_in','volt_out','volt_dc','ct_in','ct_out','s_in_va','s_out_va'];"
           "var LBL={'volt_in':'V In','volt_out':'V Out','volt_dc':'V Batt',"
                    "'ct_in':'A In','ct_out':'A Out','s_in_va':'VA In','s_out_va':'VA Out'};"
           "var UNT={'volt_in':'V','volt_out':'V','volt_dc':'V','ct_in':'A','ct_out':'A','s_in_va':'VA','s_out_va':'VA'};"
           "async function poll(){"
           "try{var d=await(await fetch('/data')).json();"
           "document.getElementById('metrics').innerHTML=KEYS.map(function(k){"
           "return '<div class=\"metric\"><small>'+LBL[k]+'</small><b>'+d[k]+'</b><small>'+UNT[k]+'</small></div>';"
           "}).join('');"
           "document.getElementById('ts').textContent='Last update: '+new Date().toLocaleTimeString();"
           "}catch(e){}}"
           "poll();setInterval(poll,2000);</script>");

    p += htmlFoot();
    server.send(200, "text/html", p);
}

/* ---- GET /config  — Full configuration form ---------------------- */
void handleConfig()
{
    String checkedDhcp   = wifiSettings.dhcp ? F("checked") : F("");
    String checkedStatic = wifiSettings.dhcp ? F("") : F("checked");

    String p = htmlHead("UPS Monitor — Configuration");
    p.reserve(6000);

    p += F("<h1>Configuration</h1>");
    p += F("<p class='muted'>Device: "); p += htmlEscape(deviceSettings.deviceId);
    p += F("&nbsp;&middot;&nbsp;v"); p += FIRMWARE_VERSION;
    p += F("&nbsp;&middot;&nbsp;MAC: "); p += WiFi.macAddress();
    p += F("&nbsp;&middot;&nbsp;<a href='/'>Back to Status</a></p>");

    p += F("<form method='post' action='/save-config'>");

    /* --- Section: Board Identity --- */
    p += F("<section><h2>Board Identity</h2>");
    p += F("<div class='row2'>");
    p += F("<div><label>Device ID *</label>"
           "<input name='device_id' value='"); p += htmlEscape(deviceSettings.deviceId); p += F("' required></div>");
    p += F("<div><label>UPS ID *</label>"
           "<input name='ups_id' value='"); p += htmlEscape(deviceSettings.upsId); p += F("' required></div>");
    p += F("<div><label>Site ID</label>"
           "<input name='site_id' value='"); p += htmlEscape(deviceSettings.siteId); p += F("'></div>");
    p += F("<div><label>Building</label>"
           "<input name='building' value='"); p += htmlEscape(deviceSettings.building); p += F("'></div>");
    p += F("<div><label>Floor</label>"
           "<input name='floor' value='"); p += htmlEscape(deviceSettings.floor); p += F("'></div>");
    p += F("<div><label>Section</label>"
           "<input name='section' value='"); p += htmlEscape(deviceSettings.section); p += F("'></div>");
    p += F("<div><label>Work Area / Room</label>"
           "<input name='work_area' value='"); p += htmlEscape(deviceSettings.workArea); p += F("'></div>");
    p += F("<div><label>Location Label</label>"
           "<input name='location' value='"); p += htmlEscape(deviceSettings.location); p += F("'></div>");
    p += F("</div>");
    p += F("<label>Installer Note <span class='muted'>(optional)</span></label>"
           "<input name='note' value='"); p += htmlEscape(deviceSettings.installerNote); p += F("'>");
    p += F("</section>");

    /* --- Section: Network / WiFi --- */
    p += F("<section><h2>Network (WiFi)</h2>");
    p += F("<div class='row2'>");
    p += F("<div><label>SSID</label>"
           "<input name='ssid' value='"); p += htmlEscape(wifiSettings.ssid); p += F("'></div>");
    p += F("<div><label>Password <span class='muted'>(leave blank to keep current)</span></label>"
           "<input name='pass' type='password' value='' autocomplete='new-password'></div>");
    p += F("</div>");
    p += F("<label>IP Mode</label>");
    p += F("<div class='radio-row'>");
    p += F("<label><input type='radio' name='mode' value='dhcp' "); p += checkedDhcp;
    p += F("> DHCP (automatic)</label>");
    p += F("<label><input type='radio' name='mode' value='static' "); p += checkedStatic;
    p += F("> Static IP</label>");
    p += F("</div>");
    p += F("<div class='row2' id='static_fields'>");
    p += F("<div><label>Static IP</label>"
           "<input name='ip' value='"); p += wifiSettings.localIp.toString(); p += F("'></div>");
    p += F("<div><label>Gateway</label>"
           "<input name='gw' value='"); p += wifiSettings.gateway.toString(); p += F("'></div>");
    p += F("<div><label>Subnet Mask</label>"
           "<input name='sn' value='"); p += wifiSettings.subnet.toString(); p += F("'></div>");
    p += F("<div><label>DNS 1</label>"
           "<input name='dns1' value='"); p += wifiSettings.dns1.toString(); p += F("'></div>");
    p += F("<div><label>DNS 2 <span class='muted'>(optional)</span></label>"
           "<input name='dns2' value='"); p += wifiSettings.dns2.toString(); p += F("'></div>");
    p += F("</div></section>");

    /* --- Section: MQTT --- */
    p += F("<section><h2>MQTT</h2>");
    p += F("<div class='row2'>");
    p += F("<div><label>Broker Host / IP</label>"
           "<input name='mqtt_server' value='"); p += htmlEscape(mqttSettings.server); p += F("'></div>");
    p += F("<div><label>Port</label>"
           "<input name='mqtt_port' type='number' min='1' max='65535' value='");
    p += mqttSettings.port; p += F("'></div>");
    p += F("<div><label>Username <span class='muted'>(optional)</span></label>"
           "<input name='mqtt_user' value='"); p += htmlEscape(mqttSettings.username); p += F("'></div>");
    p += F("<div><label>Password <span class='muted'>(leave blank to keep)</span></label>"
           "<input name='mqtt_pass' type='password' value='' autocomplete='new-password'></div>");
    p += F("</div>");
    p += F("<label>Telemetry Topic *</label>"
           "<input name='mqtt_topic' value='"); p += htmlEscape(mqttSettings.topic); p += F("' required>");
    p += F("<label>Publish Interval (seconds, 1–300)</label>"
           "<input name='mqtt_interval' type='number' min='1' max='300' value='");
    p += mqttSettings.publishIntervalSecs; p += F("'>");
    p += F("</section>");

    /* --- Section: Security --- */
    p += F("<section><h2>Security</h2>");
    p += F("<div class='row2'>");
    p += F("<div><label>Setup AP Password <span class='muted'>(min 8 chars, leave blank to keep)</span></label>"
           "<input name='ap_pass' type='password' value='' autocomplete='new-password' "
           "placeholder='Leave blank to keep'></div>");
    p += F("<div><label>OTA Update Password <span class='muted'>(min 8 chars, leave blank to keep)</span></label>"
           "<input name='ota_pass' type='password' value='' autocomplete='new-password' "
           "placeholder='Leave blank to keep'></div>");
    p += F("</div>");
    p += F("<p class='muted'>Current AP SSID: <b>"); p += htmlEscape(getApSsid()); p += F("</b></p>");
    p += F("</section>");

    /* --- Save + quick actions --- */
    p += F("<section>");
    p += F("<button type='submit'>&#10003; Save Configuration</button>&nbsp;&nbsp;");
    p += F("<a class='btn btn-sm' href='/update'>OTA Update</a>&nbsp;&nbsp;");
    p += F("<a class='btn btn-sm' href='/reboot'"
           " onclick=\"return confirm('Reboot now?')\">Reboot</a>&nbsp;&nbsp;");
    p += F("<a class='btn btn-sm btn-red' href='/factory-reset'"
           " onclick=\"return confirm('Factory reset? All settings will be lost!')\">Factory Reset</a>");
    p += F("</section>");

    /* --- Advanced: Calibration --- */
    p += F("<section><details><summary>&#9881; Advanced: Calibration</summary><br>");
    p += F("<p class='muted'>Default scale=1, offset=0. Adjust only after comparison "
           "to a calibrated reference instrument. Do not change AC Zero without scope.</p>");
    p += F("<div class='row3'>");
    p += F("<div><label>AC Zero ADC</label><input name='ac_zero' type='number' step='0.01' value='");
    p += String(calibration.acZero, 2); p += F("'></div>");
    p += F("<div><label>V-In Scale</label><input name='vin_s' type='number' step='0.000001' value='");
    p += String(calibration.vInScale, 6); p += F("'></div>");
    p += F("<div><label>V-In Offset</label><input name='vin_o' type='number' step='0.01' value='");
    p += String(calibration.vInOffset, 2); p += F("'></div>");
    p += F("<div><label>V-Out Scale</label><input name='vout_s' type='number' step='0.000001' value='");
    p += String(calibration.vOutScale, 6); p += F("'></div>");
    p += F("<div><label>V-Out Offset</label><input name='vout_o' type='number' step='0.01' value='");
    p += String(calibration.vOutOffset, 2); p += F("'></div>");
    p += F("<div><label>V-Batt Scale</label><input name='vbatt_s' type='number' step='0.000001' value='");
    p += String(calibration.vBattScale, 6); p += F("'></div>");
    p += F("<div><label>V-Batt Offset</label><input name='vbatt_o' type='number' step='0.01' value='");
    p += String(calibration.vBattOffset, 2); p += F("'></div>");
    p += F("<div><label>I-In Scale</label><input name='iin_s' type='number' step='0.000001' value='");
    p += String(calibration.iInScale, 6); p += F("'></div>");
    p += F("<div><label>I-In Offset</label><input name='iin_o' type='number' step='0.01' value='");
    p += String(calibration.iInOffset, 2); p += F("'></div>");
    p += F("<div><label>I-Out Scale</label><input name='iout_s' type='number' step='0.000001' value='");
    p += String(calibration.iOutScale, 6); p += F("'></div>");
    p += F("<div><label>I-Out Offset</label><input name='iout_o' type='number' step='0.01' value='");
    p += String(calibration.iOutOffset, 2); p += F("'></div>");
    p += F("</div></details></section>");

    p += F("</form>");

    /* JS: show/hide static IP fields based on radio selection */
    p += F("<script>"
           "(function(){"
           "var sf=document.getElementById('static_fields');"
           "function tog(){"
           "var v=document.querySelector('input[name=mode]:checked');"
           "sf.style.display=(v&&v.value==='static')?'grid':'none';}"
           "tog();"
           "document.querySelectorAll('input[name=mode]').forEach(function(r){"
           "r.addEventListener('change',tog);});"
           "})();"
           "</script>");

    p += htmlFoot();
    server.send(200, "text/html", p);
}

/* ---- POST /save-config  — unified save all settings -------------- */
void handleSaveConfig()
{
    /* ---- Identity validation ---- */
    String newDeviceId = server.arg("device_id"); newDeviceId.trim();
    String newUpsId    = server.arg("ups_id");    newUpsId.trim();
    if (newDeviceId.length() == 0) {
        server.send(400, "text/plain", "Device ID is required.");
        return;
    }
    if (newUpsId.length() == 0) {
        server.send(400, "text/plain", "UPS ID is required.");
        return;
    }

    deviceSettings.deviceId      = newDeviceId;
    deviceSettings.upsId         = newUpsId;
    String newSite = server.arg("site_id"); newSite.trim();
    deviceSettings.siteId        = newSite.length() > 0 ? newSite : String(DEFAULT_SITE_ID);
    deviceSettings.building      = server.arg("building");  deviceSettings.building.trim();
    deviceSettings.floor         = server.arg("floor");     deviceSettings.floor.trim();
    deviceSettings.section       = server.arg("section");   deviceSettings.section.trim();
    deviceSettings.workArea      = server.arg("work_area"); deviceSettings.workArea.trim();
    deviceSettings.location      = server.arg("location");  deviceSettings.location.trim();
    deviceSettings.installerNote = server.arg("note");      deviceSettings.installerNote.trim();

    /* AP password: keep existing if blank */
    String newApPass = server.arg("ap_pass"); newApPass.trim();
    if (newApPass.length() > 0) {
        if (newApPass.length() < 8) {
            server.send(400, "text/plain", "AP password must be at least 8 characters.");
            return;
        }
        deviceSettings.apPass = newApPass;
    }
    /* OTA password: keep existing if blank */
    String newOtaPass = server.arg("ota_pass"); newOtaPass.trim();
    if (newOtaPass.length() > 0) {
        if (newOtaPass.length() < 8) {
            server.send(400, "text/plain", "OTA password must be at least 8 characters.");
            return;
        }
        deviceSettings.otaPass = newOtaPass;
    }
    saveDeviceSettings();

    /* ---- WiFi ---- */
    String newSsid = server.arg("ssid"); newSsid.trim();
    String newPass = server.arg("pass");  /* empty = keep existing */
    wifiSettings.ssid = newSsid;
    if (newPass.length() > 0) wifiSettings.pass = newPass;
    wifiSettings.dhcp = server.arg("mode") != "static";
    if (!wifiSettings.dhcp) {
        IPAddress ip, gw, sn, dns1, dns2;
        if (!parseIpArg("ip", ip) || !parseIpArg("gw", gw) || !parseIpArg("sn", sn)) {
            server.send(400, "text/plain",
                "Static IP: 'ip', 'gw', and 'sn' are required and must be valid IPv4 addresses.");
            return;
        }
        if (!parseIpArg("dns1", dns1)) dns1 = gw;
        if (!parseIpArg("dns2", dns2)) dns2 = dns1;
        wifiSettings.localIp = ip;
        wifiSettings.gateway = gw;
        wifiSettings.subnet  = sn;
        wifiSettings.dns1    = dns1;
        wifiSettings.dns2    = dns2;
    }
    saveWifiSettings();

    /* ---- MQTT ---- */
    String newServer = server.arg("mqtt_server"); newServer.trim();
    uint16_t newPort = (uint16_t)server.arg("mqtt_port").toInt();
    String newUser   = server.arg("mqtt_user"); newUser.trim();
    String newMqttPw = server.arg("mqtt_pass"); /* empty = keep */
    String newTopic  = server.arg("mqtt_topic"); newTopic.trim();
    uint16_t newInterval = (uint16_t)server.arg("mqtt_interval").toInt();

    mqttSettings.server   = newServer;
    if (newPort > 0) mqttSettings.port = newPort;
    mqttSettings.username = newUser;
    if (newMqttPw.length() > 0) mqttSettings.password = newMqttPw;
    if (newTopic.length() > 0)  mqttSettings.topic    = newTopic;
    if (newInterval >= 1 && newInterval <= 300) mqttSettings.publishIntervalSecs = newInterval;
    saveMqttSettings();

    /* ---- Calibration ---- */
    float cv;
    cv = server.arg("ac_zero").toFloat();
    if (cv > 0.0f && cv < 4095.0f) calibration.acZero = cv;
    cv = server.arg("vin_s").toFloat();   if (cv != 0.0f) calibration.vInScale   = cv;
    calibration.vInOffset  = server.arg("vin_o").toFloat();
    cv = server.arg("vout_s").toFloat();  if (cv != 0.0f) calibration.vOutScale  = cv;
    calibration.vOutOffset = server.arg("vout_o").toFloat();
    cv = server.arg("vbatt_s").toFloat(); if (cv != 0.0f) calibration.vBattScale = cv;
    calibration.vBattOffset= server.arg("vbatt_o").toFloat();
    cv = server.arg("iin_s").toFloat();   if (cv != 0.0f) calibration.iInScale   = cv;
    calibration.iInOffset  = server.arg("iin_o").toFloat();
    cv = server.arg("iout_s").toFloat();  if (cv != 0.0f) calibration.iOutScale  = cv;
    calibration.iOutOffset = server.arg("iout_o").toFloat();
    saveCalibrationSettings();

    /* Respond — do NOT auto-reboot; user must click Reboot explicitly */
    String resp = htmlHead("Configuration Saved");
    resp += F("<h1>Configuration Saved</h1>");
    resp += F("<section>");
    resp += F("<p style='color:#1e8449;font-size:16px;font-weight:700'>"
              "&#10003; Configuration saved successfully.</p>");
    resp += F("<p>Network and identity changes will take effect after a reboot.</p>");
    resp += F("<hr>");
    resp += F("<a class='btn' href='/reboot'"
              " onclick=\"return confirm('Reboot now?')\">Reboot Now</a>&nbsp;&nbsp;");
    resp += F("<a class='btn btn-sm' href='/config'>Back to Configuration</a>&nbsp;&nbsp;");
    resp += F("<a class='btn btn-sm' href='/'>Status Page</a>");
    resp += F("</section>");
    resp += htmlFoot();
    server.send(200, "text/html", resp);
}

/* ---- GET /reboot -------------------------------------------------- */
void handleReboot()
{
    String p = htmlHead("Rebooting");
    p += F("<h1>Rebooting&#8230;</h1><section>");
    p += F("<p>Device will restart in 2 seconds.</p>");
    p += F("<p class='muted'>The page will become unavailable briefly. "
           "Reconnect to the same IP (or AP) after restart.</p>");
    p += F("</section>"); p += htmlFoot();
    server.send(200, "text/html", p);
    shouldRestart = true;
    restartAt     = millis() + 2000;
}

/* ---- GET /factory-reset ------------------------------------------- */
void handleFactoryReset()
{
    factoryResetAll();
    String p = htmlHead("Factory Reset");
    p += F("<h1>Factory Reset Complete</h1><section>");
    p += F("<p>All settings cleared. Device will restart in 3 seconds.</p>");
    p += F("<p class='muted'>After restart, connect to AP:<br>"
           "<b>SSID:</b> UMS-SETUP-xxxx &nbsp; "
           "<b>Password:</b> ");
    p += htmlEscape(DEFAULT_AP_PASS);
    p += F("<br>Then open <b>http://192.168.4.1/config</b> to reconfigure.</p>");
    p += F("</section>"); p += htmlFoot();
    server.send(200, "text/html", p);
    shouldRestart = true;
    restartAt     = millis() + 3000;
}

/* ---- GET /data  — JSON live data (unchanged from v0.4.0) ---------- */
void handleData()
{
    server.send(200, "application/json", buildDataJson());
}

/* ---- OTA handlers (unchanged from v0.4.0) ------------------------- */
bool isOtaAuthorized()
{
    return server.hasArg("ota_pass") && server.arg("ota_pass") == deviceSettings.otaPass;
}

void handleUpdatePage()
{
    String p = htmlHead("OTA Firmware Update");
    p += F("<h1>OTA Firmware Update</h1>");
    p += F("<section><p class='muted'>Device: "); p += htmlEscape(deviceSettings.deviceId);
    p += F("<br>Current firmware: v"); p += FIRMWARE_VERSION;
    p += F("</p><form method='post' action='/update' enctype='multipart/form-data'>");
    p += F("<label>OTA Password</label><input name='ota_pass' type='password'>");
    p += F("<label>Firmware .bin</label><input name='firmware' type='file' accept='.bin'>");
    p += F("<p><button type='submit'>Upload Firmware</button></p></form>");
    p += F("<p><a href='/'>Back to Status</a></p></section>");
    p += htmlFoot();
    server.send(200, "text/html", p);
}

void handleUpdateFinished()
{
    if (!isOtaAuthorized()) {
        server.send(403, "text/plain", "Invalid OTA password.");
        return;
    }
    if (Update.hasError()) {
        server.send(500, "text/plain", "OTA update failed.");
        return;
    }
    shouldRestart = true;
    restartAt     = millis() + 1500;
    server.send(200, "text/plain", "OTA update successful. Device will restart.");
}

void handleUpdateUpload()
{
    HTTPUpload& upload = server.upload();
    if (!isOtaAuthorized()) return;

    if (upload.status == UPLOAD_FILE_START) {
        Serial.print(F("OTA: receiving ")); Serial.println(upload.filename);
        if (!Update.begin(UPDATE_SIZE_UNKNOWN)) Update.printError(Serial);
    } else if (upload.status == UPLOAD_FILE_WRITE) {
        if (Update.write(upload.buf, upload.currentSize) != upload.currentSize)
            Update.printError(Serial);
    } else if (upload.status == UPLOAD_FILE_END) {
        if (!Update.end(true)) Update.printError(Serial);
        else { Serial.print(F("OTA: done, bytes=")); Serial.println(upload.totalSize); }
    } else if (upload.status == UPLOAD_FILE_ABORTED) {
        Update.abort();
        Serial.println(F("OTA: aborted."));
    }
}

/* ---- Legacy save handlers (backwards compat — keep existing URLs) - */
void handleSaveDevice()
{
    String id  = server.arg("device_id"); id.trim();
    String sid = server.arg("site_id");   sid.trim();
    String uid = server.arg("ups_id");    uid.trim();
    String ap  = server.arg("ap_pass");   ap.trim();
    String ota = server.arg("ota_pass");  ota.trim();

    if (id.length()  == 0) id  = DEFAULT_DEVICE_ID;
    if (sid.length() == 0) sid = DEFAULT_SITE_ID;
    if (uid.length() == 0) uid = DEFAULT_UPS_ID;
    if (ap.length()  > 0 && ap.length()  < 8) { server.send(400, "text/plain", "AP password must be >= 8 chars."); return; }
    if (ota.length() > 0 && ota.length() < 8) { server.send(400, "text/plain", "OTA password must be >= 8 chars."); return; }

    deviceSettings.deviceId = id;
    deviceSettings.siteId   = sid;
    deviceSettings.upsId    = uid;
    if (ap.length()  >= 8) deviceSettings.apPass  = ap;
    if (ota.length() >= 8) deviceSettings.otaPass = ota;
    saveDeviceSettings();
    server.sendHeader("Location", "/"); server.send(303);
}

void handleSaveMqtt()
{
    String s = server.arg("server"); s.trim();
    mqttSettings.server = s;
    uint16_t p = (uint16_t)server.arg("port").toInt();
    if (p > 0) mqttSettings.port = p;
    mqttSettings.username = server.arg("user"); mqttSettings.username.trim();
    String pw = server.arg("mqtt_pass");
    if (pw.length() > 0) mqttSettings.password = pw;
    String t = server.arg("topic"); t.trim();
    if (t.length() > 0) mqttSettings.topic = t;
    if (mqttSettings.topic.length() == 0) mqttSettings.topic = DEFAULT_MQTT_TOPIC;
    saveMqttSettings();
    server.sendHeader("Location", "/"); server.send(303);
}

void handleSaveCalibration()
{
    float v;
    v = server.arg("ac_zero").toFloat(); if (v > 0.0f && v < 4095.0f) calibration.acZero = v;
    v = server.arg("vin_s").toFloat();   if (v != 0.0f) calibration.vInScale   = v;
    calibration.vInOffset  = server.arg("vin_o").toFloat();
    v = server.arg("vout_s").toFloat();  if (v != 0.0f) calibration.vOutScale  = v;
    calibration.vOutOffset = server.arg("vout_o").toFloat();
    v = server.arg("vbatt_s").toFloat(); if (v != 0.0f) calibration.vBattScale = v;
    calibration.vBattOffset= server.arg("vbatt_o").toFloat();
    v = server.arg("iin_s").toFloat();   if (v != 0.0f) calibration.iInScale   = v;
    calibration.iInOffset  = server.arg("iin_o").toFloat();
    v = server.arg("iout_s").toFloat();  if (v != 0.0f) calibration.iOutScale  = v;
    calibration.iOutOffset = server.arg("iout_o").toFloat();
    saveCalibrationSettings();
    server.sendHeader("Location", "/"); server.send(303);
}

void handleSave()
{
    String ssid = server.arg("ssid"); ssid.trim();
    String pass = server.arg("pass");
    wifiSettings.ssid = ssid;
    if (pass.length() > 0) wifiSettings.pass = pass;
    wifiSettings.dhcp = server.arg("mode") != "static";
    if (!wifiSettings.dhcp) {
        IPAddress ip, gw, sn, dns1, dns2;
        if (!parseIpArg("ip", ip) || !parseIpArg("gw", gw) || !parseIpArg("sn", sn)) {
            server.send(400, "text/plain", "Static IP, gateway, and subnet are required.");
            return;
        }
        if (!parseIpArg("dns1", dns1)) dns1 = gw;
        if (!parseIpArg("dns2", dns2)) dns2 = dns1;
        wifiSettings.localIp = ip;
        wifiSettings.gateway = gw;
        wifiSettings.subnet  = sn;
        wifiSettings.dns1    = dns1;
        wifiSettings.dns2    = dns2;
    }
    saveWifiSettings();
    server.sendHeader("Location", "/"); server.send(303);
    connectWifi();
}

/* ================================================================
 *  Web server route registration
 * ================================================================ */
void setupWebServer()
{
    /* Primary commissioning routes */
    server.on("/",              HTTP_GET,  handleRoot);
    server.on("/config",        HTTP_GET,  handleConfig);
    server.on("/save-config",   HTTP_POST, handleSaveConfig);
    server.on("/reboot",        HTTP_GET,  handleReboot);
    server.on("/factory-reset", HTTP_GET,  handleFactoryReset);
    /* Data / OTA */
    server.on("/data",          HTTP_GET,  handleData);
    server.on("/update",        HTTP_GET,  handleUpdatePage);
    server.on("/update",        HTTP_POST, handleUpdateFinished, handleUpdateUpload);
    /* Legacy routes (backwards compatible with v0.4.0 tools) */
    server.on("/save",             HTTP_POST, handleSave);
    server.on("/save-device",      HTTP_POST, handleSaveDevice);
    server.on("/save-mqtt",        HTTP_POST, handleSaveMqtt);
    server.on("/save-calibration", HTTP_POST, handleSaveCalibration);
    server.begin();
}

/* ================================================================
 *  High-priority sampling task  (ADC + RMS calculation — UNCHANGED)
 * ================================================================ */
void samplerTask(void* arg)
{
    uint64_t dcSum    = 0;
    double vOutSqSum  = 0;
    double vInSqSum   = 0;
    double iInSqSum   = 0;
    double iOutSqSum  = 0;

    for (;;) {
        ulTaskNotifyTake(pdTRUE, portMAX_DELAY);

        uint16_t v[NUM_CH];
        for (uint8_t i = 0; i < NUM_CH; i++) v[i] = (uint16_t)adc1_get_raw(CH[i]);

        float acZero     = calibration.acZero;
        float vOutSample = (float)v[1] - acZero;
        float vInSample  = (float)v[2] - acZero;
        float iInSample  = (float)v[3] - acZero;
        float iOutSample = (float)v[4] - acZero;

        dcSum     += v[0];
        vOutSqSum += (double)vOutSample * (double)vOutSample;
        vInSqSum  += (double)vInSample  * (double)vInSample;
        iInSqSum  += (double)iInSample  * (double)iInSample;
        iOutSqSum += (double)iOutSample * (double)iOutSample;

        sampleSrNo++;

        if (sampleSrNo >= SAMPLES_PER_UPDATE) {
            float rawVoltDc     = (float)dcSum / SAMPLES_PER_UPDATE;
            float rawVoltInRms  = sqrt(vInSqSum  / SAMPLES_PER_UPDATE) / AC_SCALE_PER_SAMPLE;
            float rawVoltOutRms = sqrt(vOutSqSum / SAMPLES_PER_UPDATE) / AC_SCALE_PER_SAMPLE;
            float rawCtInRms    = sqrt(iInSqSum  / SAMPLES_PER_UPDATE) / AC_SCALE_PER_SAMPLE;
            float rawCtOutRms   = sqrt(iOutSqSum / SAMPLES_PER_UPDATE) / AC_SCALE_PER_SAMPLE;

            float newVoltDc  = rawVoltDc     * calibration.vBattScale + calibration.vBattOffset;
            float newVoltIn  = rawVoltInRms  * calibration.vInScale   + calibration.vInOffset;
            float newVoltOut = rawVoltOutRms * calibration.vOutScale   + calibration.vOutOffset;
            float newCtIn    = rawCtInRms    * calibration.iInScale   + calibration.iInOffset;
            float newCtOut   = rawCtOutRms   * calibration.iOutScale  + calibration.iOutOffset;
            float newVaIn    = newVoltIn     * newCtIn;
            float newVaOut   = newVoltOut    * newCtOut;

            portENTER_CRITICAL(&valueMux);
            Volt_DC  = newVoltDc;
            Volt_In  = newVoltIn;
            Volt_Out = newVoltOut;
            CT_In    = newCtIn;
            CT_Out   = newCtOut;
            VA_In    = newVaIn;
            VA_Out   = newVaOut;
            valuesUpdated = true;
            portEXIT_CRITICAL(&valueMux);

            printParameters();

            sampleSrNo = 0;
            dcSum = 0; vOutSqSum = 0; vInSqSum = 0; iInSqSum = 0; iOutSqSum = 0;
        }
    }
}

/* ================================================================
 *  Setup
 * ================================================================ */
void setup()
{
    Serial.begin(SERIAL_BAUD);
    delay(500);
    printHeader();

    loadDeviceSettings();
    loadWifiSettings();
    loadMqttSettings();
    loadCalibrationSettings();
    connectWifi();
    setupWebServer();

    adc1_config_width(ADC_WIDTH);
    for (uint8_t i = 0; i < NUM_CH; i++) adc1_config_channel_atten(CH[i], ADC_ATTENUATION);
    esp_adc_cal_characterize(ADC_UNIT_1, ADC_ATTENUATION, ADC_WIDTH, 1100, &adcChars);

    BaseType_t ok = xTaskCreatePinnedToCore(
        samplerTask, "sampler", 4096, nullptr, 10, &samplerTaskH, 1);

    if (ok != pdPASS) {
        Serial.println(F("FATAL: Could not create sampler task."));
        while (true) delay(1000);
    }

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

    Serial.print(F("AP SSID   : ")); Serial.println(getApSsid());
    Serial.print(F("Device ID : ")); Serial.println(deviceSettings.deviceId);
    Serial.print(F("MQTT      : ")); Serial.print(mqttSettings.server);
    Serial.print(':'); Serial.println(mqttSettings.port);
    Serial.print(F("Pub every : ")); Serial.print(mqttSettings.publishIntervalSecs); Serial.println(F("s"));
}

/* ================================================================
 *  Main loop
 * ================================================================ */
void loop()
{
    server.handleClient();
    reconnectWifiIfNeeded();

    unsigned long now = millis();
    bool shouldPublish = false;

    /* Publish interval is configurable (stored in NVS, min 1s) */
    unsigned long pubIntervalMs = (unsigned long)mqttSettings.publishIntervalSecs * 1000UL;
    if (pubIntervalMs < 1000UL) pubIntervalMs = 1000UL;

    portENTER_CRITICAL(&valueMux);
    if (valuesUpdated && (now - lastMqttPublish >= pubIntervalMs)) {
        valuesUpdated = false;
        shouldPublish = true;
    }
    portEXIT_CRITICAL(&valueMux);

    if (shouldPublish) {
        lastMqttPublish = now;
        publishMqttData();
    }

    if (shouldRestart && millis() >= restartAt) {
        ESP.restart();
    }
}
