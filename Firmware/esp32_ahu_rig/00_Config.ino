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
// see ETH_* defines in AhuRig.h.
// MAC address is read automatically from ESP32 hardware fuses by the native ETH stack — no manual definition needed.

// --- Ethernet subnet (Pi eth0 = 192.168.2.1) ---
IPAddress STATIC_IP    (192, 168, 2, 50);   // ESP32 static IP on Ethernet
IPAddress GATEWAY      (192, 168, 2, 1);    // Pi eth0
IPAddress SUBNET       (255, 255, 255, 0);
IPAddress DNS_SERVER   (192, 168, 2, 1);

// Two broker IPs — one per transport (different subnets, no bridge)
IPAddress MQTT_BROKER_ETH  (192, 168, 2, 1);  // Mosquitto via Ethernet (Pi eth0)
IPAddress MQTT_BROKER_WIFI (192, 168, 4, 1);  // Mosquitto via WiFi    (Pi wlan0 / pinetwork)
IPAddress MQTT_BROKER      (192, 168, 2, 1);  // active broker — updated at runtime by 05_Network.ino
const uint16_t MQTT_PORT = 1883;
const char* MQTT_CLIENT_ID = "esp32-ahu-rig-01";

// --- WiFi fallback — connect to the Raspberry Pi's WiFi hotspot (if it has one) ---
// If Pi is running hostapd as a WiFi AP, enter those credentials here.
// If no WiFi AP on Pi, WiFi fallback will simply fail and Ethernet stays primary.
const char* WIFI_SSID     = "pinetwork";
const char* WIFI_PASSWORD = "PI123456";

// --- Digital inputs — verify against your board, see header comment in
// esp32_ahu_rig.ino ---
const uint8_t DI_PINS[8] = { 4, 5, 6, 7, 8, 9, 10, 11 };

// --- RS485 / Modbus RTU ---
const unsigned long RS485_BAUD = 9600;  // Waveshare AI/AO modules' factory default
const unsigned long MODBUS_POLL_TIMEOUT_MS = 200;  // per-module read budget

bool MODBUS_MODULES_PRESENT = true;   // AI module addr=2, AO module addr=3 wired and ready

const char* FW_VERSION = "1.0.0-stage1";

// ---------------------------------------------------------------------
// Point list — full I/O map matched exactly to seedTestPlan.js IDs
// ---------------------------------------------------------------------
//   LOCAL_RELAY — digital output via TCA9554 I2C expander  (02_Relay.ino)
//                 { id, LOCAL_RELAY, localPin=0, relayBit, slaveAddr=0, ch=0, cache=0 }
//   LOCAL_DI    — digital input via native GPIO             (03_DigitalInputs.ino)
//                 { id, LOCAL_DI, localPin, relayBit=0, slaveAddr=0, ch=0, cache=0 }
//   MODBUS_AO   — analog stimulus  → AO module slave 3, 0-10 V, 0-10000 raw  (04_Modbus.ino)
//                 { id, MODBUS_AO, localPin=0, relayBit=0, slaveAddr, channel, cache=0 }
//   MODBUS_AI   — analog response  → AI module slave 2, 0-10 V, 0-10000 raw  (04_Modbus.ino)
//                 { id, MODBUS_AI, localPin=0, relayBit=0, slaveAddr, channel, cache=0 }
//
// RigPoint fields: { pointId, kind, localPin, relayBit, modbusSlaveAddr, modbusChannel, lastModbusValue }
RigPoint points[] = {

  // --- Analog stimulus (rig → AHU controller) — AO module slave=3 outputs 0-10V —
  { "AO-1",     MODBUS_AO, 0, 0, 3, 0, 0 },  // ch0  Differential Pressure 1     (Pa)
  { "AO-2",     MODBUS_AO, 0, 0, 3, 1, 0 },  // ch1  Differential Pressure 2     (Pa)
  { "AO-3",     MODBUS_AO, 0, 0, 3, 2, 0 },  // ch2  Differential Pressure 3     (Pa)
  { "AO-4",     MODBUS_AO, 0, 0, 3, 3, 0 },  // ch3  Room-01 Pressure Sensor     (Pa)
  { "AO-5",     MODBUS_AO, 0, 0, 3, 4, 0 },  // ch4  Room-02 Pressure Sensor     (Pa)
  { "AO-6",     MODBUS_AO, 0, 0, 3, 5, 0 },  // ch5  Return Air Temperature      (degC)
  { "A0-7",     MODBUS_AO, 0, 0, 3, 6, 0 },  // ch6  Return Air Humidity         (%)

  // --- Analog response (AHU controller → rig) — AI module slave=2 reads 0-10V —
  { "AI-1",     MODBUS_AI, 0, 0, 2, 0, 0 }, // ch0  EC Fan Control signal       (%)
  { "AI-2",     MODBUS_AI, 0, 0, 2, 1, 0 }, // ch1  CHW Valve position          (%)
  { "AI-3",     MODBUS_AI, 0, 0, 2, 2, 0 }, // ch2  Heater output signal        (%)

  // --- Digital Inputs (stimulus — rig drives these into AHU controller) ---
  // LOCAL_RELAY via TCA9554 output bits 0-7
  { "DO-1",  LOCAL_RELAY, 0, 0, 0, 0, 0 }, // relay bit 0  Auto/Manual Status
  { "DO-2", LOCAL_RELAY, 0, 1, 0, 0, 0 }, // relay bit 1  AHU On/Off Status
  { "DO-3",    LOCAL_RELAY, 0, 2, 0, 0, 0 }, // relay bit 2  Fire Damper Status
  { "DO-4",   LOCAL_RELAY, 0, 3, 0, 0, 0 }, // relay bit 3  EC Fan Trip Status
  { "DO-5", LOCAL_RELAY, 0, 4, 0, 0, 0 }, // relay bit 4  Fire Status
  { "DO-6",    LOCAL_RELAY, 0, 5, 0, 0, 0 }, // relay bit 5  Humidifier On/Off Status
  { "DO-7",    LOCAL_RELAY, 0, 6, 0, 0, 0 }, // relay bit 6  Heater On/Off Status
  { "DO-8",  LOCAL_RELAY, 0, 7, 0, 0, 0 }, // relay bit 7  Heater Trip Status

  // --- Digital Outputs (responses — AHU controller drives, rig reads via GPIO) ---
  // LOCAL_DI on GPIO pins DI_PINS[0-2]
  { "DI-1",  LOCAL_DI, 4, 0, 0, 0, 0 },   // GPIO4  Unit On/Off Command (Relay-02)
  { "DI-2", LOCAL_DI, 5, 0, 0, 0, 0 },   // GPIO5  Heater On/Off Command (Relay-03)
  { "DI-3",  LOCAL_DI, 6, 0, 0, 0, 0 },   // GPIO6  Humidifier On/Off Command (Relay-04)
};
const size_t NUM_POINTS = sizeof(points) / sizeof(points[0]);

const unsigned long TELEMETRY_INTERVAL_MS = 1000;

// ---------------------------------------------------------------------
// Global objects and runtime state, shared across every tab
// ---------------------------------------------------------------------
WiFiClient ethClient;         // native ETH stack: WiFiClient works for both Ethernet and WiFi on ESP32's unified lwIP stack
PubSubClient mqtt(ethClient);  // rebound at runtime by 05_Network.ino if transport switches

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
