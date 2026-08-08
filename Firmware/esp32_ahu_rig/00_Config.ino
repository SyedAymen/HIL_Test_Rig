#include "AhuRig.h"

/*
  00_Config.ino
  -------------
  DEV-STAGE VALUES — you're running Mosquitto + Node-RED on your PC, not
  a Pi yet. Two things you MUST edit before this connects to anything:

  1. MQTT_BROKER below — set to your PC's actual IP (run `ipconfig` on
     Windows and find the adapter that's actually on the same network as
     the ESP32).
  2. STATIC_IP / GATEWAY / SUBNET — must be on the SAME SUBNET as your
     PC's real network, not the placeholder 192.168.1.x here. If your
     router hands out 192.168.0.x, for example, change all three to match
     (e.g. STATIC_IP 192.168.0.177, GATEWAY 192.168.0.1, SUBNET unchanged).

  WiFi (WIFI_SSID/WIFI_PASSWORD below) is a FALLBACK transport — see
  05_Network.ino. If Ethernet isn't plugged in or the W5500 isn't
  detected at boot (or later, if the cable gets pulled), the sketch
  automatically brings up WiFi and routes MQTT over that instead. Fill in
  real credentials even though your primary plan is Ethernet, so the
  fallback actually works when you need it.
*/

// --- Ethernet (primary transport) — CONFIRMED pins for this board,
// see ETH_* defines in AhuRig.h. IP values: see note above, must match
// your actual PC/router subnet. ---
byte MAC[]            = { 0xDE, 0xAD, 0xBE, 0xEF, 0xFE, 0x01 };

// --- Windows Mobile Hotspot subnet — PC is always 192.168.137.1, never changes ---
IPAddress STATIC_IP    (192, 168, 137, 200);  // ESP32 static IP on the hotspot network
IPAddress GATEWAY      (192, 168, 137, 1);    // PC's hotspot IP (always fixed)
IPAddress SUBNET       (255, 255, 255, 0);
IPAddress DNS_SERVER   (192, 168, 137, 1);

IPAddress MQTT_BROKER  (192, 168, 137, 1);    // PC's hotspot IP — FIXED, never changes again
const uint16_t MQTT_PORT = 1883;
const char* MQTT_CLIENT_ID = "esp32-ahu-rig-01";

// --- WiFi — connect ESP32 to the Windows Mobile Hotspot on this PC ---
// To find name+password: Settings -> Network & Internet -> Mobile Hotspot
const char* WIFI_SSID     = "My-Network";           // EDIT: your Windows hotspot name
const char* WIFI_PASSWORD = "syed1234";  // EDIT: your Windows hotspot password

// --- Digital inputs — verify against your board, see header comment in
// esp32_ahu_rig.ino ---
const uint8_t DI_PINS[8] = { 4, 5, 6, 7, 8, 9, 10, 11 };

// --- RS485 / Modbus RTU ---
const unsigned long RS485_BAUD = 9600;  // Waveshare AI/AO modules' factory default
const unsigned long MODBUS_POLL_TIMEOUT_MS = 200;  // per-module read budget

// No analog expansion modules wired up yet — 04_Modbus.ino skips AI/AO
// bus transactions entirely while this is false (one log line at boot
// instead of a timeout every telemetry cycle). Flip to true once your
// modules arrive and are wired to the RS485 bus.
bool MODBUS_MODULES_PRESENT = false;

const char* FW_VERSION = "1.0.0-stage1";

// ---------------------------------------------------------------------
// Point list — this is your I/O map
// ---------------------------------------------------------------------
// IMPORTANT: pointId here MUST exactly match the `id` field in the
// dashboard's testPlan.sections[].points[] (seedTestPlan.js).
//
//   LOCAL_RELAY — digital stimulus, driven via the onboard TCA9554
//                 (relayBit = 0-7)                       -> 02_Relay.ino
//   LOCAL_DI    — digital response, native GPIO           -> 03_DigitalInputs.ino
//                 (localPin = one of DI_PINS)
//   MODBUS_AO   — analog stimulus, external RS485 output module (not
//                 wired up yet — see MODBUS_MODULES_PRESENT above)
//   MODBUS_AI   — analog response, external RS485 input module (not
//                 wired up yet)
//
// Digital-IO-only test set for now — multimeter-verify these two, then
// expand to your full ~31-point list once the flow's confirmed end to
// end and your analog modules arrive.
RigPoint points[] = {
  { "AUTO-MAN",  LOCAL_RELAY, 0,  0, 0, 0, 0 },   // digital stimulus -> relay bit 0. Multimeter across the relay's NO/COM terminals.
  { "CONTACTOR", LOCAL_DI,    4,  0, 0, 0, 0 },   // digital response -> DI_PINS[0] = GPIO4. Multimeter/jumper at the DI input terminal.

  // Uncomment once your Modbus AI/AO expansion modules arrive and
  // MODBUS_MODULES_PRESENT is set to true above:
  // { "DPT-1",  MODBUS_AO, 0, 0, 1, 0, 0 },   // analog stimulus  -> AO module addr 1, ch 0
  // { "EC-FAN", MODBUS_AI, 0, 0, 2, 0, 0 },   // analog response  -> AI module addr 2, ch 0
};
const size_t NUM_POINTS = sizeof(points) / sizeof(points[0]);

const unsigned long TELEMETRY_INTERVAL_MS = 500;

// ---------------------------------------------------------------------
// Global objects and runtime state, shared across every tab
// ---------------------------------------------------------------------
EthernetClient ethClient;
PubSubClient mqtt(ethClient);  // rebound to a WiFiClient at runtime by 05_Network.ino if Ethernet isn't usable

HardwareSerial RS485Serial(1);  // UART1, remapped to RS485_TX_PIN/RS485_RX_PIN in 04_Modbus.ino
ModbusMaster modbus;

unsigned long lastTelemetry = 0;
bool simEnabled = false;
uint8_t relayShadow = 0x00;  // local copy of the TCA9554 output register

char topicBuf[96];  // scratch buffer reused by Mqtt_buildTopic()

// Verbose logging default — ON, since Stage 1 is exactly the bring-up
// phase you want this for. Type "debug off" in Serial Monitor once
// things are confirmed working. See 01_Debug.ino.
bool debugEnabled = true;
