#include <Arduino.h>
#include <driver/adc.h>
#include <esp_adc_cal.h>
#include <esp_system.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <Update.h>

/* ==== User Configuration ==== */
#define SERIAL_BAUD         921600UL
#define SAMPLE_RATE_HZ      500UL
#define TIMER_PERIOD_US     (1000000UL / SAMPLE_RATE_HZ)
#define SAMPLES_PER_UPDATE  250UL
#define AC_SCALE_PER_SAMPLE 1.72f

#define ADC_ATTENUATION     ADC_ATTEN_DB_11
#define ADC_WIDTH           ADC_WIDTH_BIT_12

#define FIRMWARE_VERSION    "0.4.0"
#define DEFAULT_DEVICE_ID   "UPSMON-UNASSIGNED"
#define DEFAULT_SITE_ID     "SITE-UNASSIGNED"
#define DEFAULT_UPS_ID      "UPS-UNASSIGNED"
#define DEFAULT_WIFI_SSID   ""
#define DEFAULT_WIFI_PASS   ""
#define DEFAULT_AP_PASS     "ChangeMe123"
#define DEFAULT_MQTT_SERVER ""
#define DEFAULT_MQTT_PORT   1883
#define DEFAULT_MQTT_USER   ""
#define DEFAULT_MQTT_PASS   ""
#define DEFAULT_MQTT_TOPIC  "building/site-01/ups/UPSMON-UNASSIGNED/telemetry"
#define DEFAULT_OTA_PASS    "ChangeMeOTA123"
#define MQTT_PUBLISH_MS     5000UL
#define WIFI_RETRY_MS       30000UL

/* ==== ADC Channels ==== */
#define NUM_CH 5

static const adc1_channel_t CH[NUM_CH] = {
    ADC1_CHANNEL_6,   // GPIO34 - D34 - DC Voltage
    ADC1_CHANNEL_7,   // GPIO35 - D35 - Output Voltage
    ADC1_CHANNEL_4,   // GPIO32 - D32 - Input Voltage
    ADC1_CHANNEL_0,   // GPIO36 - D36 - Input CT
    ADC1_CHANNEL_3    // GPIO39 - D39 - Output CT
};

static const char* CH_LBL[NUM_CH] = {
    "D34",
    "D35",
    "D32",
    "D36",
    "D39"
};

/* ==== Final Calculated Values ==== */
float Volt_DC  = 0;
float Volt_In  = 0;
float Volt_Out = 0;
float CT_In    = 0;
float CT_Out   = 0;
float VA_In     = 0;
float VA_Out    = 0;

static uint32_t sampleSrNo = 0;
static volatile bool valuesUpdated = false;
static uint32_t mqttSeq = 0;

static hw_timer_t* sampleTimer = nullptr;
static TaskHandle_t samplerTaskH = nullptr;

static esp_adc_cal_characteristics_t adcChars;
static portMUX_TYPE valueMux = portMUX_INITIALIZER_UNLOCKED;

struct WifiSettings {
    String ssid;
    String pass;
    bool dhcp;
    IPAddress localIp;
    IPAddress gateway;
    IPAddress subnet;
    IPAddress dns1;
    IPAddress dns2;
};

struct DeviceSettings {
    String deviceId;
    String siteId;
    String upsId;
    String apPass;
    String otaPass;
};

struct MqttSettings {
    String server;
    uint16_t port;
    String username;
    String password;
    String topic;
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

static WifiSettings wifiSettings;
static DeviceSettings deviceSettings;
static MqttSettings mqttSettings;
static MeasurementCalibration calibration;
static Preferences prefs;
static WebServer server(80);

static unsigned long lastMqttPublish = 0;
static unsigned long lastWifiRetry = 0;
static bool shouldRestart = false;
static unsigned long restartAt = 0;

/* ==== Timer ISR ==== */
void IRAM_ATTR onSampleTimer()
{
    BaseType_t higherPrioTaskWoken = pdFALSE;
    vTaskNotifyGiveFromISR(samplerTaskH, &higherPrioTaskWoken);

    if (higherPrioTaskWoken) {
        portYIELD_FROM_ISR();
    }
}

/* ==== Print Header ==== */
void printHeader()
{
    Serial.println();
    Serial.println(F("=============================================="));
    Serial.println(F(" ESP32 ADC Monitor"));
    Serial.println(F(" Baudrate: 921600"));
    Serial.print(F(" Sample Rate: "));
    Serial.print(SAMPLE_RATE_HZ);
    Serial.println(F(" Hz"));
    Serial.println(F(" Output Update: 500 ms"));
    Serial.println(F("=============================================="));
    Serial.println();
}

/* ==== Print Parameters With Names ==== */
void printParameters()
{
    float vIn;
    float vOut;
    float vDc;
    float ctIn;
    float ctOut;
    float vaIn;
    float vaOut;

    portENTER_CRITICAL(&valueMux);
    vIn = Volt_In;
    vOut = Volt_Out;
    vDc = Volt_DC;
    ctIn = CT_In;
    ctOut = CT_Out;
    vaIn = VA_In;
    vaOut = VA_Out;
    portEXIT_CRITICAL(&valueMux);

    Serial.println(F("----------- Live Parameters -----------"));

    Serial.print(F("Volt_In   : "));
    Serial.println(vIn, 2);

    Serial.print(F("Volt_Out  : "));
    Serial.println(vOut, 2);

    Serial.print(F("Volt_DC   : "));
    Serial.println(vDc, 2);

    Serial.print(F("CT_In     : "));
    Serial.println(ctIn, 2);

    Serial.print(F("CT_Out    : "));
    Serial.println(ctOut, 2);

    Serial.print(F("VA_In     : "));
    Serial.println(vaIn, 2);

    Serial.print(F("VA_Out    : "));
    Serial.println(vaOut, 2);

    Serial.print(F("WiFi      : "));
    Serial.println(WiFi.status() == WL_CONNECTED ? F("Connected") : F("Disconnected"));

    Serial.print(F("SSID      : "));
    Serial.println(wifiSettings.ssid);

    Serial.print(F("STA IP    : "));
    Serial.println(WiFi.localIP());

    Serial.print(F("AP IP     : "));
    Serial.println(WiFi.softAPIP());

    Serial.print(F("IP Mode   : "));
    Serial.println(wifiSettings.dhcp ? F("Dynamic DHCP") : F("Static"));

    Serial.print(F("Device ID : "));
    Serial.println(deviceSettings.deviceId);

    Serial.print(F("Site ID   : "));
    Serial.println(deviceSettings.siteId);

    Serial.print(F("UPS ID    : "));
    Serial.println(deviceSettings.upsId);

    Serial.print(F("Firmware  : "));
    Serial.println(FIRMWARE_VERSION);

    Serial.print(F("MQTT      : "));
    Serial.print(mqttSettings.server);
    Serial.print(F(":"));
    Serial.print(mqttSettings.port);
    Serial.print(F(" / "));
    Serial.println(mqttSettings.topic);

    Serial.println(F("---------------------------------------"));
    Serial.println();
}

String htmlEscape(const String& in)
{
    String out;
    out.reserve(in.length());
    for (size_t i = 0; i < in.length(); i++) {
        char c = in[i];
        if (c == '&') out += F("&amp;");
        else if (c == '<') out += F("&lt;");
        else if (c == '>') out += F("&gt;");
        else if (c == '"') out += F("&quot;");
        else out += c;
    }
    return out;
}

bool parseIpArg(const String& name, IPAddress& ip)
{
    String value = server.arg(name);
    value.trim();
    return value.length() > 0 && ip.fromString(value);
}

void loadWifiSettings()
{
    prefs.begin("wifi", true);
    wifiSettings.ssid = prefs.getString("ssid", DEFAULT_WIFI_SSID);
    wifiSettings.pass = prefs.getString("pass", DEFAULT_WIFI_PASS);
    wifiSettings.dhcp = prefs.getBool("dhcp", true);
    wifiSettings.localIp.fromString(prefs.getString("ip", "192.168.1.90"));
    wifiSettings.gateway.fromString(prefs.getString("gw", "192.168.1.1"));
    wifiSettings.subnet.fromString(prefs.getString("sn", "255.255.255.0"));
    wifiSettings.dns1.fromString(prefs.getString("dns1", "8.8.8.8"));
    wifiSettings.dns2.fromString(prefs.getString("dns2", "1.1.1.1"));
    prefs.end();
}

void loadDeviceSettings()
{
    prefs.begin("device", true);
    deviceSettings.deviceId = prefs.getString("device_id", DEFAULT_DEVICE_ID);
    deviceSettings.siteId = prefs.getString("site_id", DEFAULT_SITE_ID);
    deviceSettings.upsId = prefs.getString("ups_id", DEFAULT_UPS_ID);
    deviceSettings.apPass = prefs.getString("ap_pass", DEFAULT_AP_PASS);
    deviceSettings.otaPass = prefs.getString("ota_pass", DEFAULT_OTA_PASS);
    prefs.end();
}

void saveDeviceSettings()
{
    prefs.begin("device", false);
    prefs.putString("device_id", deviceSettings.deviceId);
    prefs.putString("site_id", deviceSettings.siteId);
    prefs.putString("ups_id", deviceSettings.upsId);
    prefs.putString("ap_pass", deviceSettings.apPass);
    prefs.putString("ota_pass", deviceSettings.otaPass);
    prefs.end();
}

void loadMqttSettings()
{
    prefs.begin("mqtt", true);
    mqttSettings.server = prefs.getString("server", DEFAULT_MQTT_SERVER);
    mqttSettings.port = prefs.getUShort("port", DEFAULT_MQTT_PORT);
    mqttSettings.username = prefs.getString("user", DEFAULT_MQTT_USER);
    mqttSettings.password = prefs.getString("pass", DEFAULT_MQTT_PASS);
    mqttSettings.topic = prefs.getString("topic", DEFAULT_MQTT_TOPIC);
    prefs.end();
}

void saveMqttSettings()
{
    prefs.begin("mqtt", false);
    prefs.putString("server", mqttSettings.server);
    prefs.putUShort("port", mqttSettings.port);
    prefs.putString("user", mqttSettings.username);
    prefs.putString("pass", mqttSettings.password);
    prefs.putString("topic", mqttSettings.topic);
    prefs.end();
}

void loadCalibrationSettings()
{
    prefs.begin("cal", true);
    calibration.vInScale = prefs.getFloat("vin_s", 1.0f);
    calibration.vInOffset = prefs.getFloat("vin_o", 0.0f);
    calibration.vOutScale = prefs.getFloat("vout_s", 1.0f);
    calibration.vOutOffset = prefs.getFloat("vout_o", 0.0f);
    calibration.vBattScale = prefs.getFloat("vbatt_s", 1.0f);
    calibration.vBattOffset = prefs.getFloat("vbatt_o", 0.0f);
    calibration.iInScale = prefs.getFloat("iin_s", 1.0f);
    calibration.iInOffset = prefs.getFloat("iin_o", 0.0f);
    calibration.iOutScale = prefs.getFloat("iout_s", 1.0f);
    calibration.iOutOffset = prefs.getFloat("iout_o", 0.0f);
    calibration.acZero = prefs.getFloat("ac_zero", 1995.0f);
    prefs.end();
}

void saveCalibrationSettings()
{
    prefs.begin("cal", false);
    prefs.putFloat("vin_s", calibration.vInScale);
    prefs.putFloat("vin_o", calibration.vInOffset);
    prefs.putFloat("vout_s", calibration.vOutScale);
    prefs.putFloat("vout_o", calibration.vOutOffset);
    prefs.putFloat("vbatt_s", calibration.vBattScale);
    prefs.putFloat("vbatt_o", calibration.vBattOffset);
    prefs.putFloat("iin_s", calibration.iInScale);
    prefs.putFloat("iin_o", calibration.iInOffset);
    prefs.putFloat("iout_s", calibration.iOutScale);
    prefs.putFloat("iout_o", calibration.iOutOffset);
    prefs.putFloat("ac_zero", calibration.acZero);
    prefs.end();
}

void saveWifiSettings()
{
    prefs.begin("wifi", false);
    prefs.putString("ssid", wifiSettings.ssid);
    prefs.putString("pass", wifiSettings.pass);
    prefs.putBool("dhcp", wifiSettings.dhcp);
    prefs.putString("ip", wifiSettings.localIp.toString());
    prefs.putString("gw", wifiSettings.gateway.toString());
    prefs.putString("sn", wifiSettings.subnet.toString());
    prefs.putString("dns1", wifiSettings.dns1.toString());
    prefs.putString("dns2", wifiSettings.dns2.toString());
    prefs.end();
}

void connectWifi()
{
    WiFi.mode(WIFI_AP_STA);
    String apSsid = deviceSettings.deviceId;
    if (apSsid.length() == 0 || apSsid == DEFAULT_DEVICE_ID) {
        apSsid = "UPSMON-Setup-" + WiFi.macAddress();
        apSsid.replace(":", "");
    }

    WiFi.softAP(apSsid.c_str(), deviceSettings.apPass.c_str());
    WiFi.disconnect(false, false);

    if (!wifiSettings.dhcp) {
        WiFi.config(
            wifiSettings.localIp,
            wifiSettings.gateway,
            wifiSettings.subnet,
            wifiSettings.dns1,
            wifiSettings.dns2
        );
    } else {
        WiFi.config(INADDR_NONE, INADDR_NONE, INADDR_NONE);
    }

    Serial.print(F("Connecting WiFi SSID: "));
    if (wifiSettings.ssid.length() > 0) {
        Serial.println(wifiSettings.ssid);
    } else {
        Serial.println(F("(not configured)"));
    }

    if (wifiSettings.ssid.length() > 0) {
        WiFi.begin(wifiSettings.ssid.c_str(), wifiSettings.pass.c_str());
    }
}

void reconnectWifiIfNeeded()
{
    if (WiFi.status() == WL_CONNECTED) {
        return;
    }

    unsigned long now = millis();
    if (now - lastWifiRetry >= WIFI_RETRY_MS) {
        lastWifiRetry = now;
        connectWifi();
    }
}

bool connectMqtt()
{
    return WiFi.status() == WL_CONNECTED && mqttSettings.server.length() > 0 && mqttSettings.topic.length() > 0;
}

bool writeMqttRemainingLength(WiFiClient& client, uint32_t length)
{
    do {
        uint8_t encoded = length % 128;
        length /= 128;
        if (length > 0) {
            encoded |= 128;
        }
        if (client.write(encoded) != 1) {
            return false;
        }
    } while (length > 0);

    return true;
}

bool writeMqttString(WiFiClient& client, const String& value)
{
    uint16_t len = value.length();
    if (client.write((uint8_t)(len >> 8)) != 1) return false;
    if (client.write((uint8_t)(len & 0xFF)) != 1) return false;
    return client.print(value) == len;
}

bool mqttConnectPacket(WiFiClient& client, const String& clientId)
{
    uint8_t connectFlags = 0x02;
    uint32_t remainingLength = 10 + 2 + clientId.length();

    if (mqttSettings.username.length() > 0) {
        connectFlags |= 0x80;
        remainingLength += 2 + mqttSettings.username.length();
    }

    if (mqttSettings.password.length() > 0) {
        connectFlags |= 0x40;
        remainingLength += 2 + mqttSettings.password.length();
    }

    if (client.write((uint8_t)0x10) != 1) return false;
    if (!writeMqttRemainingLength(client, remainingLength)) return false;
    if (!writeMqttString(client, F("MQTT"))) return false;
    if (client.write((uint8_t)0x04) != 1) return false;
    if (client.write(connectFlags) != 1) return false;
    if (client.write((uint8_t)0x00) != 1) return false;
    if (client.write((uint8_t)0x3C) != 1) return false;
    if (!writeMqttString(client, clientId)) return false;
    if (mqttSettings.username.length() > 0 && !writeMqttString(client, mqttSettings.username)) return false;
    if (mqttSettings.password.length() > 0 && !writeMqttString(client, mqttSettings.password)) return false;

    unsigned long start = millis();
    while (client.connected() && client.available() < 4 && millis() - start < 3000) {
        delay(10);
    }

    if (client.available() < 4) return false;
    return client.read() == 0x20 && client.read() == 0x02 && client.read() == 0x00 && client.read() == 0x00;
}

bool mqttPublishPacket(WiFiClient& client, const String& topic, const String& payload)
{
    uint32_t remainingLength = 2 + topic.length() + payload.length();

    if (client.write((uint8_t)0x31) != 1) return false;
    if (!writeMqttRemainingLength(client, remainingLength)) return false;
    if (!writeMqttString(client, topic)) return false;
    return client.print(payload) == payload.length();
}

String buildDataJson()
{
    float vIn;
    float vOut;
    float vDc;
    float ctIn;
    float ctOut;
    float vaIn;
    float vaOut;

    portENTER_CRITICAL(&valueMux);
    vIn = Volt_In;
    vOut = Volt_Out;
    vDc = Volt_DC;
    ctIn = CT_In;
    ctOut = CT_Out;
    vaIn = VA_In;
    vaOut = VA_Out;
    portEXIT_CRITICAL(&valueMux);

    String json = F("{\"volt_in\":");
    json += String(vIn, 2);
    json += F(",\"volt_out\":");
    json += String(vOut, 2);
    json += F(",\"volt_dc\":");
    json += String(vDc, 2);
    json += F(",\"ct_in\":");
    json += String(ctIn, 2);
    json += F(",\"ct_out\":");
    json += String(ctOut, 2);
    json += F(",\"s_in_va\":");
    json += String(vaIn, 2);
    json += F(",\"s_out_va\":");
    json += String(vaOut, 2);
    json += F(",\"ip\":\"");
    json += WiFi.localIP().toString();
    json += F("\",\"device_id\":\"");
    json += deviceSettings.deviceId;
    json += F("\",\"site_id\":\"");
    json += deviceSettings.siteId;
    json += F("\",\"ups_id\":\"");
    json += deviceSettings.upsId;
    json += F("\",\"firmware\":\"");
    json += FIRMWARE_VERSION;
    json += F("\",\"rssi\":");
    json += WiFi.RSSI();
    json += F(",\"uptime_ms\":");
    json += millis();
    json += F(",\"seq\":");
    json += mqttSeq++;
    json += F(",\"free_heap\":");
    json += ESP.getFreeHeap();
    json += F(",\"mac\":\"");
    json += WiFi.macAddress();
    json += F("\",\"reset_reason\":");
    json += (int)esp_reset_reason();
    json += F("}");
    return json;
}

void publishMqttData()
{
    if (!connectMqtt()) {
        return;
    }

    WiFiClient mqttClient;
    mqttClient.setTimeout(3000);

    if (!mqttClient.connect(mqttSettings.server.c_str(), mqttSettings.port)) {
        Serial.println(F("MQTT: broker connection failed."));
        return;
    }

    String clientId = deviceSettings.deviceId;
    if (clientId.length() == 0 || clientId == DEFAULT_DEVICE_ID) {
        clientId = "upsmon-" + WiFi.macAddress();
        clientId.replace(":", "");
    }

    if (!mqttConnectPacket(mqttClient, clientId)) {
        Serial.println(F("MQTT: protocol connection failed."));
        mqttClient.stop();
        return;
    }

    String payload = buildDataJson();
    if (!mqttPublishPacket(mqttClient, mqttSettings.topic, payload)) {
        Serial.println(F("MQTT: publish failed."));
    }

    mqttClient.stop();
}

void handleRoot()
{
    String checkedDhcp = wifiSettings.dhcp ? F("checked") : F("");
    String checkedStatic = wifiSettings.dhcp ? F("") : F("checked");
    String wifiStatus = WiFi.status() == WL_CONNECTED ? F("Connected") : F("Disconnected");
    String apSsid = deviceSettings.deviceId;
    if (apSsid.length() == 0 || apSsid == DEFAULT_DEVICE_ID) {
        apSsid = "UPSMON-Setup-" + WiFi.macAddress();
        apSsid.replace(":", "");
    }

    String page = F("<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
                    "<title>Voltage Test</title><style>"
                    "body{font-family:Arial,sans-serif;margin:0;background:#f6f7f9;color:#17202a}"
                    "main{max-width:760px;margin:0 auto;padding:20px}"
                    "section{background:#fff;border:1px solid #dfe3e8;border-radius:8px;padding:16px;margin:14px 0}"
                    "h1,h2{margin:0 0 12px}label{display:block;margin:10px 0 4px;font-weight:600}"
                    "input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #b8c0cc;border-radius:6px}"
                    ".grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}"
                    ".metric{border:1px solid #e3e7ed;border-radius:6px;padding:12px}.metric b{display:block;font-size:24px}"
                    "button{background:#1769aa;color:#fff;border:0;border-radius:6px;padding:11px 16px;font-weight:700}"
                    ".muted{color:#5d6d7e;font-size:14px}.radio{display:flex;gap:16px}.radio label{font-weight:400}"
                    "</style></head><body><main><h1>UPS Monitor Setup</h1>");

    page += F("<section><h2>Live Data</h2><div class='grid' id='data'></div><p class='muted'>MQTT topic: ");
    page += htmlEscape(mqttSettings.topic);
    page += F("</p></section><section><h2>Device Identity</h2><form method='post' action='/save-device'>"
              "<label>Device ID</label><input name='device_id' value='");
    page += htmlEscape(deviceSettings.deviceId);
    page += F("'><label>Site ID</label><input name='site_id' value='");
    page += htmlEscape(deviceSettings.siteId);
    page += F("'><label>UPS ID</label><input name='ups_id' value='");
    page += htmlEscape(deviceSettings.upsId);
    page += F("'><label>Setup AP Password</label><input name='ap_pass' type='password' value='");
    page += htmlEscape(deviceSettings.apPass);
    page += F("'><label>OTA Password</label><input name='ota_pass' type='password' value='");
    page += htmlEscape(deviceSettings.otaPass);
    page += F("'><p class='muted'>Firmware: ");
    page += FIRMWARE_VERSION;
    page += F("<br>MAC: ");
    page += WiFi.macAddress();
    page += F("</p><p><button type='submit'>Save Device</button></p></form>"
              "<p><a href='/update'>Open OTA update</a></p></section>"
              "<section><h2>MQTT</h2><form method='post' action='/save-mqtt'>"
              "<label>Broker Host</label><input name='server' value='");
    page += htmlEscape(mqttSettings.server);
    page += F("'><label>Port</label><input name='port' type='number' min='1' max='65535' value='");
    page += String(mqttSettings.port);
    page += F("'><label>Username</label><input name='user' value='");
    page += htmlEscape(mqttSettings.username);
    page += F("'><label>Password</label><input name='mqtt_pass' type='password' value='");
    page += htmlEscape(mqttSettings.password);
    page += F("'><label>Telemetry Topic</label><input name='topic' value='");
    page += htmlEscape(mqttSettings.topic);
    page += F("'><p><button type='submit'>Save MQTT</button></p></form></section>"
              "<section><h2>Calibration</h2><form method='post' action='/save-calibration'>"
              "<label>AC Zero ADC</label><input name='ac_zero' type='number' step='0.01' value='");
    page += String(calibration.acZero, 2);
    page += F("'><label>Input Voltage Scale</label><input name='vin_s' type='number' step='0.000001' value='");
    page += String(calibration.vInScale, 6);
    page += F("'><label>Input Voltage Offset</label><input name='vin_o' type='number' step='0.01' value='");
    page += String(calibration.vInOffset, 2);
    page += F("'><label>Output Voltage Scale</label><input name='vout_s' type='number' step='0.000001' value='");
    page += String(calibration.vOutScale, 6);
    page += F("'><label>Output Voltage Offset</label><input name='vout_o' type='number' step='0.01' value='");
    page += String(calibration.vOutOffset, 2);
    page += F("'><label>Battery Voltage Scale</label><input name='vbatt_s' type='number' step='0.000001' value='");
    page += String(calibration.vBattScale, 6);
    page += F("'><label>Battery Voltage Offset</label><input name='vbatt_o' type='number' step='0.01' value='");
    page += String(calibration.vBattOffset, 2);
    page += F("'><label>Input Current Scale</label><input name='iin_s' type='number' step='0.000001' value='");
    page += String(calibration.iInScale, 6);
    page += F("'><label>Input Current Offset</label><input name='iin_o' type='number' step='0.01' value='");
    page += String(calibration.iInOffset, 2);
    page += F("'><label>Output Current Scale</label><input name='iout_s' type='number' step='0.000001' value='");
    page += String(calibration.iOutScale, 6);
    page += F("'><label>Output Current Offset</label><input name='iout_o' type='number' step='0.01' value='");
    page += String(calibration.iOutOffset, 2);
    page += F("'><p><button type='submit'>Save Calibration</button></p></form></section>"
              "<section><h2>WiFi</h2><p>Status: ");
    page += wifiStatus;
    page += F("<br>STA IP: ");
    page += WiFi.localIP().toString();
    page += F("<br>Setup AP: ");
    page += htmlEscape(apSsid);
    page += F(" / ");
    page += WiFi.softAPIP().toString();
    page += F("</p><form method='post' action='/save'><label>SSID</label><input name='ssid' value='");
    page += htmlEscape(wifiSettings.ssid);
    page += F("'><label>Password</label><input name='pass' type='password' value='");
    page += htmlEscape(wifiSettings.pass);
    page += F("'><div class='radio'><label><input type='radio' name='mode' value='dhcp' ");
    page += checkedDhcp;
    page += F("> Dynamic IP</label><label><input type='radio' name='mode' value='static' ");
    page += checkedStatic;
    page += F("> Static IP</label></div><label>Static IP</label><input name='ip' value='");
    page += wifiSettings.localIp.toString();
    page += F("'><label>Gateway</label><input name='gw' value='");
    page += wifiSettings.gateway.toString();
    page += F("'><label>Subnet</label><input name='sn' value='");
    page += wifiSettings.subnet.toString();
    page += F("'><label>DNS 1</label><input name='dns1' value='");
    page += wifiSettings.dns1.toString();
    page += F("'><label>DNS 2</label><input name='dns2' value='");
    page += wifiSettings.dns2.toString();
    page += F("'><p><button type='submit'>Save and Reconnect</button></p></form></section>"
              "<script>function draw(d){data.innerHTML=['volt_in','volt_out','volt_dc','ct_in','ct_out'].map(k=>'<div class=\"metric\">'+k+'<b>'+d[k]+'</b></div>').join('')}"
              "async function poll(){try{let r=await fetch('/data');draw(await r.json())}catch(e){}}poll();setInterval(poll,2000)</script>"
              "</main></body></html>");

    server.send(200, "text/html", page);
}

void handleData()
{
    server.send(200, "application/json", buildDataJson());
}

bool isOtaAuthorized()
{
    return server.hasArg("ota_pass") && server.arg("ota_pass") == deviceSettings.otaPass;
}

void handleUpdatePage()
{
    String page = F("<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
                    "<title>UPS Monitor OTA</title><style>"
                    "body{font-family:Arial,sans-serif;margin:0;background:#f6f7f9;color:#17202a}"
                    "main{max-width:620px;margin:0 auto;padding:20px}"
                    "section{background:#fff;border:1px solid #dfe3e8;border-radius:8px;padding:16px;margin:14px 0}"
                    "label{display:block;margin:10px 0 4px;font-weight:600}"
                    "input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #b8c0cc;border-radius:6px}"
                    "button{background:#1769aa;color:#fff;border:0;border-radius:6px;padding:11px 16px;font-weight:700}"
                    ".muted{color:#5d6d7e;font-size:14px}</style></head><body><main>"
                    "<h1>OTA Update</h1><section><p class='muted'>Device: ");
    page += htmlEscape(deviceSettings.deviceId);
    page += F("<br>Firmware: ");
    page += FIRMWARE_VERSION;
    page += F("</p><form method='post' action='/update' enctype='multipart/form-data'>"
              "<label>OTA Password</label><input name='ota_pass' type='password'>"
              "<label>Firmware .bin</label><input name='firmware' type='file' accept='.bin'>"
              "<p><button type='submit'>Upload Firmware</button></p></form>"
              "<p><a href='/'>Back to setup</a></p></section></main></body></html>");

    server.send(200, "text/html", page);
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
    restartAt = millis() + 1500;
    server.send(200, "text/plain", "OTA update successful. Device will restart.");
}

void handleUpdateUpload()
{
    HTTPUpload& upload = server.upload();

    if (!isOtaAuthorized()) {
        return;
    }

    if (upload.status == UPLOAD_FILE_START) {
        Serial.print(F("OTA: receiving "));
        Serial.println(upload.filename);

        if (!Update.begin(UPDATE_SIZE_UNKNOWN)) {
            Update.printError(Serial);
        }
    } else if (upload.status == UPLOAD_FILE_WRITE) {
        if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
            Update.printError(Serial);
        }
    } else if (upload.status == UPLOAD_FILE_END) {
        if (!Update.end(true)) {
            Update.printError(Serial);
        } else {
            Serial.print(F("OTA: update complete, bytes="));
            Serial.println(upload.totalSize);
        }
    } else if (upload.status == UPLOAD_FILE_ABORTED) {
        Update.abort();
        Serial.println(F("OTA: update aborted."));
    }
}

void handleSaveDevice()
{
    deviceSettings.deviceId = server.arg("device_id");
    deviceSettings.siteId = server.arg("site_id");
    deviceSettings.upsId = server.arg("ups_id");
    deviceSettings.apPass = server.arg("ap_pass");
    deviceSettings.otaPass = server.arg("ota_pass");

    deviceSettings.deviceId.trim();
    deviceSettings.siteId.trim();
    deviceSettings.upsId.trim();
    deviceSettings.apPass.trim();
    deviceSettings.otaPass.trim();

    if (deviceSettings.deviceId.length() == 0) deviceSettings.deviceId = DEFAULT_DEVICE_ID;
    if (deviceSettings.siteId.length() == 0) deviceSettings.siteId = DEFAULT_SITE_ID;
    if (deviceSettings.upsId.length() == 0) deviceSettings.upsId = DEFAULT_UPS_ID;
    if (deviceSettings.apPass.length() < 8) {
        server.send(400, "text/plain", "Setup AP password must be at least 8 characters.");
        return;
    }
    if (deviceSettings.otaPass.length() < 8) {
        server.send(400, "text/plain", "OTA password must be at least 8 characters.");
        return;
    }

    saveDeviceSettings();
    server.sendHeader("Location", "/");
    server.send(303);
}

void handleSaveMqtt()
{
    mqttSettings.server = server.arg("server");
    mqttSettings.port = (uint16_t)server.arg("port").toInt();
    mqttSettings.username = server.arg("user");
    mqttSettings.password = server.arg("mqtt_pass");
    mqttSettings.topic = server.arg("topic");

    mqttSettings.server.trim();
    mqttSettings.username.trim();
    mqttSettings.password.trim();
    mqttSettings.topic.trim();

    if (mqttSettings.port == 0) mqttSettings.port = DEFAULT_MQTT_PORT;
    if (mqttSettings.topic.length() == 0) {
        mqttSettings.topic = DEFAULT_MQTT_TOPIC;
    }

    saveMqttSettings();
    server.sendHeader("Location", "/");
    server.send(303);
}

void handleSaveCalibration()
{
    calibration.acZero = server.arg("ac_zero").toFloat();
    calibration.vInScale = server.arg("vin_s").toFloat();
    calibration.vInOffset = server.arg("vin_o").toFloat();
    calibration.vOutScale = server.arg("vout_s").toFloat();
    calibration.vOutOffset = server.arg("vout_o").toFloat();
    calibration.vBattScale = server.arg("vbatt_s").toFloat();
    calibration.vBattOffset = server.arg("vbatt_o").toFloat();
    calibration.iInScale = server.arg("iin_s").toFloat();
    calibration.iInOffset = server.arg("iin_o").toFloat();
    calibration.iOutScale = server.arg("iout_s").toFloat();
    calibration.iOutOffset = server.arg("iout_o").toFloat();

    if (calibration.acZero <= 0.0f || calibration.acZero >= 4095.0f) {
        calibration.acZero = 1995.0f;
    }
    if (calibration.vInScale == 0.0f) calibration.vInScale = 1.0f;
    if (calibration.vOutScale == 0.0f) calibration.vOutScale = 1.0f;
    if (calibration.vBattScale == 0.0f) calibration.vBattScale = 1.0f;
    if (calibration.iInScale == 0.0f) calibration.iInScale = 1.0f;
    if (calibration.iOutScale == 0.0f) calibration.iOutScale = 1.0f;

    saveCalibrationSettings();
    server.sendHeader("Location", "/");
    server.send(303);
}

void handleSave()
{
    wifiSettings.ssid = server.arg("ssid");
    wifiSettings.pass = server.arg("pass");
    wifiSettings.dhcp = server.arg("mode") != "static";

    if (!wifiSettings.dhcp) {
        IPAddress ip;
        IPAddress gw;
        IPAddress sn;
        IPAddress dns1;
        IPAddress dns2;

        if (!parseIpArg("ip", ip) || !parseIpArg("gw", gw) || !parseIpArg("sn", sn)) {
            server.send(400, "text/plain", "Static IP, gateway, and subnet are required.");
            return;
        }

        if (!parseIpArg("dns1", dns1)) dns1 = gw;
        if (!parseIpArg("dns2", dns2)) dns2 = dns1;

        wifiSettings.localIp = ip;
        wifiSettings.gateway = gw;
        wifiSettings.subnet = sn;
        wifiSettings.dns1 = dns1;
        wifiSettings.dns2 = dns2;
    }

    saveWifiSettings();
    server.sendHeader("Location", "/");
    server.send(303);
    connectWifi();
}

void setupWebServer()
{
    server.on("/", HTTP_GET, handleRoot);
    server.on("/data", HTTP_GET, handleData);
    server.on("/update", HTTP_GET, handleUpdatePage);
    server.on("/update", HTTP_POST, handleUpdateFinished, handleUpdateUpload);
    server.on("/save-device", HTTP_POST, handleSaveDevice);
    server.on("/save-mqtt", HTTP_POST, handleSaveMqtt);
    server.on("/save-calibration", HTTP_POST, handleSaveCalibration);
    server.on("/save", HTTP_POST, handleSave);
    server.begin();
}

/* ==== High Priority Sampling Task ==== */
void samplerTask(void* arg)
{
    uint64_t dcSum = 0;
    double vOutSqSum = 0;
    double vInSqSum = 0;
    double iInSqSum = 0;
    double iOutSqSum = 0;

    for (;;) {
        ulTaskNotifyTake(pdTRUE, portMAX_DELAY);

        uint16_t v[NUM_CH];

        for (uint8_t i = 0; i < NUM_CH; i++) {
            v[i] = (uint16_t)adc1_get_raw(CH[i]);
        }

        float acZero = calibration.acZero;
        float vOutSample = (float)v[1] - acZero;
        float vInSample = (float)v[2] - acZero;
        float iInSample = (float)v[3] - acZero;
        float iOutSample = (float)v[4] - acZero;

        dcSum += v[0];
        vOutSqSum += (double)vOutSample * (double)vOutSample;
        vInSqSum += (double)vInSample * (double)vInSample;
        iInSqSum += (double)iInSample * (double)iInSample;
        iOutSqSum += (double)iOutSample * (double)iOutSample;

        sampleSrNo++;

        if (sampleSrNo >= SAMPLES_PER_UPDATE) {
            float rawVoltDc = (float)dcSum / SAMPLES_PER_UPDATE;
            float rawVoltInRms = sqrt(vInSqSum / SAMPLES_PER_UPDATE) / AC_SCALE_PER_SAMPLE;
            float rawVoltOutRms = sqrt(vOutSqSum / SAMPLES_PER_UPDATE) / AC_SCALE_PER_SAMPLE;
            float rawCtInRms = sqrt(iInSqSum / SAMPLES_PER_UPDATE) / AC_SCALE_PER_SAMPLE;
            float rawCtOutRms = sqrt(iOutSqSum / SAMPLES_PER_UPDATE) / AC_SCALE_PER_SAMPLE;

            float newVoltDc = rawVoltDc * calibration.vBattScale + calibration.vBattOffset;
            float newVoltIn = rawVoltInRms * calibration.vInScale + calibration.vInOffset;
            float newVoltOut = rawVoltOutRms * calibration.vOutScale + calibration.vOutOffset;
            float newCtIn = rawCtInRms * calibration.iInScale + calibration.iInOffset;
            float newCtOut = rawCtOutRms * calibration.iOutScale + calibration.iOutOffset;
            float newVaIn = newVoltIn * newCtIn;
            float newVaOut = newVoltOut * newCtOut;

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

            dcSum = 0;
            vOutSqSum = 0;
            vInSqSum = 0;
            iInSqSum = 0;
            iOutSqSum = 0;
        }
    }
}

/* ==== Setup ==== */
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

    for (uint8_t i = 0; i < NUM_CH; i++) {
        adc1_config_channel_atten(CH[i], ADC_ATTENUATION);
    }

    esp_adc_cal_characterize(
        ADC_UNIT_1,
        ADC_ATTENUATION,
        ADC_WIDTH,
        1100,
        &adcChars
    );

    BaseType_t ok = xTaskCreatePinnedToCore(
        samplerTask,
        "sampler",
        4096,
        nullptr,
        10,
        &samplerTaskH,
        1
    );

    if (ok != pdPASS) {
        Serial.println(F("FATAL: Could not create sampler task."));
        while (true) {
            delay(1000);
        }
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
}

/* ==== Main Loop ==== */
void loop()
{
    server.handleClient();
    reconnectWifiIfNeeded();

    unsigned long now = millis();
    bool shouldPublish = false;

    portENTER_CRITICAL(&valueMux);
    if (valuesUpdated && now - lastMqttPublish >= MQTT_PUBLISH_MS) {
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
