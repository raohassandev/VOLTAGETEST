#include <Arduino.h>
#include <driver/adc.h>
#include <esp_adc_cal.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>

/* ==== User Configuration ==== */
#define SERIAL_BAUD         921600UL
#define SAMPLE_RATE_HZ      500UL
#define TIMER_PERIOD_US     (1000000UL / SAMPLE_RATE_HZ)
#define SAMPLES_PER_UPDATE  250UL
#define AC_SCALE_PER_SAMPLE 1.72f

#define ADC_ATTENUATION     ADC_ATTEN_DB_11
#define ADC_WIDTH           ADC_WIDTH_BIT_12

#define DEFAULT_WIFI_SSID   "Rao"
#define DEFAULT_WIFI_PASS   "password123"
#define AP_SSID             "VoltageTest-Setup"
#define AP_PASS             "password123"

#define MQTT_SERVER         "broker.hivemq.com"
#define MQTT_PORT           1883
#define MQTT_TOPIC          "hadi/voltagetest/data"
#define MQTT_PUBLISH_MS     500UL
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

/* ==== Buffers ==== */
uint32_t Buffer1 = 0;
uint32_t Buffer2 = 0;
uint32_t Buffer3 = 0;
uint32_t Buffer4 = 0;
uint32_t Buffer5 = 0;

/* ==== Final Calculated Values ==== */
float Volt_DC  = 0;
float Volt_In  = 0;
float Volt_Out = 0;
float CT_In    = 0;
float CT_Out   = 0;

static uint32_t sampleSrNo = 0;
static volatile bool valuesUpdated = false;

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

static WifiSettings wifiSettings;
static Preferences prefs;
static WebServer server(80);

static unsigned long lastMqttPublish = 0;
static unsigned long lastWifiRetry = 0;

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

    portENTER_CRITICAL(&valueMux);
    vIn = Volt_In;
    vOut = Volt_Out;
    vDc = Volt_DC;
    ctIn = CT_In;
    ctOut = CT_Out;
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

    Serial.print(F("MQTT      : "));
    Serial.print(MQTT_SERVER);
    Serial.print(F(":"));
    Serial.print(MQTT_PORT);
    Serial.print(F(" / "));
    Serial.println(MQTT_TOPIC);

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
    WiFi.softAP(AP_SSID, AP_PASS);
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
    Serial.println(wifiSettings.ssid);
    WiFi.begin(wifiSettings.ssid.c_str(), wifiSettings.pass.c_str());
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
    return WiFi.status() == WL_CONNECTED;
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
    uint32_t remainingLength = 10 + 2 + clientId.length();

    if (client.write((uint8_t)0x10) != 1) return false;
    if (!writeMqttRemainingLength(client, remainingLength)) return false;
    if (!writeMqttString(client, F("MQTT"))) return false;
    if (client.write((uint8_t)0x04) != 1) return false;
    if (client.write((uint8_t)0x02) != 1) return false;
    if (client.write((uint8_t)0x00) != 1) return false;
    if (client.write((uint8_t)0x3C) != 1) return false;
    if (!writeMqttString(client, clientId)) return false;

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

    portENTER_CRITICAL(&valueMux);
    vIn = Volt_In;
    vOut = Volt_Out;
    vDc = Volt_DC;
    ctIn = CT_In;
    ctOut = CT_Out;
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
    json += F(",\"ip\":\"");
    json += WiFi.localIP().toString();
    json += F("\"}");
    return json;
}

void publishMqttData()
{
    if (!connectMqtt()) {
        return;
    }

    WiFiClient mqttClient;
    mqttClient.setTimeout(3000);

    if (!mqttClient.connect(MQTT_SERVER, MQTT_PORT)) {
        Serial.println(F("MQTT: broker connection failed."));
        return;
    }

    String clientId = "voltagetest-" + WiFi.macAddress();
    clientId.replace(":", "");

    if (!mqttConnectPacket(mqttClient, clientId)) {
        Serial.println(F("MQTT: protocol connection failed."));
        mqttClient.stop();
        return;
    }

    String payload = buildDataJson();
    if (!mqttPublishPacket(mqttClient, MQTT_TOPIC, payload)) {
        Serial.println(F("MQTT: publish failed."));
    }

    mqttClient.stop();
}

void handleRoot()
{
    String checkedDhcp = wifiSettings.dhcp ? F("checked") : F("");
    String checkedStatic = wifiSettings.dhcp ? F("") : F("checked");
    String wifiStatus = WiFi.status() == WL_CONNECTED ? F("Connected") : F("Disconnected");

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
                    "</style></head><body><main><h1>ESP32 Voltage Test</h1>");

    page += F("<section><h2>Live Data</h2><div class='grid' id='data'></div><p class='muted'>MQTT topic: ");
    page += MQTT_TOPIC;
    page += F("</p></section><section><h2>WiFi</h2><p>Status: ");
    page += wifiStatus;
    page += F("<br>STA IP: ");
    page += WiFi.localIP().toString();
    page += F("<br>Setup AP: ");
    page += AP_SSID;
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
    server.on("/save", HTTP_POST, handleSave);
    server.begin();
}

/* ==== High Priority Sampling Task ==== */
void samplerTask(void* arg)
{
    for (;;) {
        ulTaskNotifyTake(pdTRUE, portMAX_DELAY);

        uint16_t v[NUM_CH];

        for (uint8_t i = 0; i < NUM_CH; i++) {
            v[i] = (uint16_t)adc1_get_raw(CH[i]);
        }

        Buffer1 += v[0];              // DC Voltage
        Buffer2 += abs(v[1] - 1995);  // Output Voltage
        Buffer3 += abs(v[2] - 1995);  // Input Voltage
        Buffer4 += abs(v[3] - 1995);  // Input CT
        Buffer5 += abs(v[4] - 1995);  // Output CT

        sampleSrNo++;

        if (sampleSrNo >= SAMPLES_PER_UPDATE) {
            float newVoltDc = (float)Buffer1 / SAMPLES_PER_UPDATE;
            float newVoltIn = (float)Buffer3 / (SAMPLES_PER_UPDATE * AC_SCALE_PER_SAMPLE);
            float newVoltOut = (float)Buffer2 / (SAMPLES_PER_UPDATE * AC_SCALE_PER_SAMPLE);
            float newCtIn = (float)Buffer4 / (SAMPLES_PER_UPDATE * AC_SCALE_PER_SAMPLE);
            float newCtOut = (float)Buffer5 / (SAMPLES_PER_UPDATE * AC_SCALE_PER_SAMPLE);

            portENTER_CRITICAL(&valueMux);
            Volt_DC  = newVoltDc;
            Volt_In  = newVoltIn;
            Volt_Out = newVoltOut;
            CT_In    = newCtIn;
            CT_Out   = newCtOut;
            valuesUpdated = true;
            portEXIT_CRITICAL(&valueMux);

            printParameters();

            sampleSrNo = 0;

            Buffer1 = 0;
            Buffer2 = 0;
            Buffer3 = 0;
            Buffer4 = 0;
            Buffer5 = 0;
        }
    }
}

/* ==== Setup ==== */
void setup()
{
    Serial.begin(SERIAL_BAUD);
    delay(500);

    printHeader();

    loadWifiSettings();
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
}
