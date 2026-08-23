#include "AhuRig.h"

/*
  00_Config.ino
  -------------

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
// Bus shared with the Carel controller. Waveshare AI/AO modules
// reconfigured to 19200/8N1/no-parity (via SSCOM) to match Carel's fixed
// BMS spec, since Modbus RTU requires one baud/framing per physical bus.
// Bench-confirmed working: both the AI module (standalone test) and the
// Carel controller (standalone test) communicate cleanly at this baud.
const unsigned long RS485_BAUD = 19200;
const unsigned long MODBUS_POLL_TIMEOUT_MS = 500;  // per-module read budget

bool MODBUS_MODULES_PRESENT = true;   // AI module addr=2, AO module addr=3 wired and ready

// Carel controller's own Modbus device address (BMS Communication sheet,
// "Device Address fill as below" — set via its front panel: Main Page <
// Main Menu < Enter Password < Settings < Serial Port < Address).
// CONFIRM this matches exactly what you set when bench-testing
// carel_controller_test.ino before trusting telemetry from this address.
const uint8_t CAREL_SLAVE_ADDR = 1;

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

  // --- Carel controller — direct Modbus RTU read (see 08_CarelModbus.ino) ---
  // Bench-confirmed communicating via carel_controller_test.ino.
  // carelScale default 10.0 is UNVERIFIED for engineering-unit correctness
  // (confirmed communication works, not yet confirmed the /10 math is right)
  // — cross-check a live reading against the controller's own display before
  // trusting these numbers, adjust per-point if any are off by 10x/100x.
  // Fields: { pointId, kind, localPin=0, relayBit=0, CAREL_SLAVE_ADDR, regIndex, cache=0, carelScale }
  { "CAREL-DPT",         CAREL_INPUT_REG, 0, 0, CAREL_SLAVE_ADDR, 0,  0, 10.0 },  // Input Reg 0  DPT
  { "CAREL-RAT",         CAREL_INPUT_REG, 0, 0, CAREL_SLAVE_ADDR, 1,  0, 10.0 },  // Input Reg 1  Return Air Temp
  { "CAREL-RAH",         CAREL_INPUT_REG, 0, 0, CAREL_SLAVE_ADDR, 2,  0, 10.0 },  // Input Reg 2  Return Air Humi
  { "CAREL-FAN-OUT",     CAREL_INPUT_REG, 0, 0, CAREL_SLAVE_ADDR, 3,  0, 10.0 },  // Input Reg 3  Fan Output %
  { "CAREL-CWV-OUT",     CAREL_INPUT_REG, 0, 0, CAREL_SLAVE_ADDR, 4,  0, 10.0 },  // Input Reg 4  CW Valve Output %
  { "CAREL-FAD-OUT",     CAREL_INPUT_REG, 0, 0, CAREL_SLAVE_ADDR, 5,  0, 10.0 },  // Input Reg 5  FAD Output %
  { "CAREL-CW-IN-TEMP",  CAREL_INPUT_REG, 0, 0, CAREL_SLAVE_ADDR, 6,  0, 10.0 },  // Input Reg 6  CW In Temp
  { "CAREL-CW-OUT-TEMP", CAREL_INPUT_REG, 0, 0, CAREL_SLAVE_ADDR, 7,  0, 10.0 },  // Input Reg 7  CW Out Temp
  { "CAREL-CO2",         CAREL_INPUT_REG, 0, 0, CAREL_SLAVE_ADDR, 8,  0, 10.0 },  // Input Reg 8  CO2
  { "CAREL-VELOCITY",    CAREL_INPUT_REG, 0, 0, CAREL_SLAVE_ADDR, 9,  0, 10.0 },  // Input Reg 9  Velocity
  { "CAREL-SPEED-01",    CAREL_INPUT_REG, 0, 0, CAREL_SLAVE_ADDR, 10, 0, 10.0 },  // Input Reg 10 Speed Fan-01
  { "CAREL-SPEED-02",    CAREL_INPUT_REG, 0, 0, CAREL_SLAVE_ADDR, 11, 0, 10.0 },  // Input Reg 11 Speed Fan-02
  { "CAREL-SPEED-03",    CAREL_INPUT_REG, 0, 0, CAREL_SLAVE_ADDR, 12, 0, 10.0 },  // Input Reg 12 Speed Fan-03
  { "CAREL-SPEED-04",    CAREL_INPUT_REG, 0, 0, CAREL_SLAVE_ADDR, 13, 0, 10.0 },  // Input Reg 13 Speed Fan-04
  { "CAREL-CURR-01",     CAREL_INPUT_REG, 0, 0, CAREL_SLAVE_ADDR, 14, 0, 10.0 },  // Input Reg 14 Current Fan-01
  { "CAREL-CURR-02",     CAREL_INPUT_REG, 0, 0, CAREL_SLAVE_ADDR, 15, 0, 10.0 },  // Input Reg 15 Current Fan-02
  { "CAREL-CURR-03",     CAREL_INPUT_REG, 0, 0, CAREL_SLAVE_ADDR, 16, 0, 10.0 },  // Input Reg 16 Current Fan-03
  { "CAREL-CURR-04",     CAREL_INPUT_REG, 0, 0, CAREL_SLAVE_ADDR, 17, 0, 10.0 },  // Input Reg 17 Current Fan-04
  { "CAREL-VOLT-02",     CAREL_INPUT_REG, 0, 0, CAREL_SLAVE_ADDR, 18, 0, 10.0 },  // Input Reg 18 Voltage Fan-02 (sheet scan looked transposed 18/19 — verify against controller)
  { "CAREL-VOLT-01",     CAREL_INPUT_REG, 0, 0, CAREL_SLAVE_ADDR, 19, 0, 10.0 },  // Input Reg 19 Voltage Fan-01
  { "CAREL-VOLT-03",     CAREL_INPUT_REG, 0, 0, CAREL_SLAVE_ADDR, 20, 0, 10.0 },  // Input Reg 20 Voltage Fan-03
  { "CAREL-VOLT-04",     CAREL_INPUT_REG, 0, 0, CAREL_SLAVE_ADDR, 21, 0, 10.0 },  // Input Reg 21 Voltage Fan-04
  { "CAREL-PWR-01",      CAREL_INPUT_REG, 0, 0, CAREL_SLAVE_ADDR, 22, 0, 10.0 },  // Input Reg 22 Power Fan-01
  { "CAREL-PWR-02",      CAREL_INPUT_REG, 0, 0, CAREL_SLAVE_ADDR, 23, 0, 10.0 },  // Input Reg 23 Power Fan-02
  { "CAREL-PWR-03",      CAREL_INPUT_REG, 0, 0, CAREL_SLAVE_ADDR, 24, 0, 10.0 },  // Input Reg 24 Power Fan-03
  { "CAREL-PWR-04",      CAREL_INPUT_REG, 0, 0, CAREL_SLAVE_ADDR, 25, 0, 10.0 },  // Input Reg 25 Power Fan-04
  { "CAREL-FAD-FBK",     CAREL_INPUT_REG, 0, 0, CAREL_SLAVE_ADDR, 26, 0, 10.0 },  // Input Reg 26 FAD Feedback

  { "CAREL-ON-OFF-CMD",     CAREL_COIL, 0, 0, CAREL_SLAVE_ADDR, 0, 0, 1.0 },  // Coil 0  ON/OFF Command (R/W)
  { "CAREL-MAN-FAN-EN",     CAREL_COIL, 0, 0, CAREL_SLAVE_ADDR, 7, 0, 1.0 },  // Coil 7  Man Fan Enable (R/W)
  { "CAREL-MAN-CWV-EN",     CAREL_COIL, 0, 0, CAREL_SLAVE_ADDR, 8, 0, 1.0 },  // Coil 8  Man CWV Enable (R/W)
  { "CAREL-MAN-FAD-EN",     CAREL_COIL, 0, 0, CAREL_SLAVE_ADDR, 9, 0, 1.0 },  // Coil 9  Man FAD Enable (R/W)

  { "CAREL-AUTO-MAN",       CAREL_DISCRETE_IN, 0, 0, CAREL_SLAVE_ADDR, 0, 0, 1.0 },  // DI 0  Auto/Manual Status
  { "CAREL-PRE-FILTER",     CAREL_DISCRETE_IN, 0, 0, CAREL_SLAVE_ADDR, 1, 0, 1.0 },  // DI 1  Pre Filter Status
  { "CAREL-FINE-FILTER",    CAREL_DISCRETE_IN, 0, 0, CAREL_SLAVE_ADDR, 2, 0, 1.0 },  // DI 2  Fine Filter Status
  { "CAREL-FIRE-STATUS",    CAREL_DISCRETE_IN, 0, 0, CAREL_SLAVE_ADDR, 4, 0, 1.0 },  // DI 4  Fire Status
  { "CAREL-EC-FAN-TRIP",    CAREL_DISCRETE_IN, 0, 0, CAREL_SLAVE_ADDR, 5, 0, 1.0 },  // DI 5  EC Fan Trip Status

  { "CAREL-SETPOINT-DPT",   CAREL_HOLDING_REG, 0, 0, CAREL_SLAVE_ADDR, 2,  0, 10.0 },  // HR 2  Set Point DPT (R/W)
  { "CAREL-SETPOINT-RAT",   CAREL_HOLDING_REG, 0, 0, CAREL_SLAVE_ADDR, 8,  0, 10.0 },  // HR 8  Set Point RAT (R/W)
  { "CAREL-SETPOINT-CO2",   CAREL_HOLDING_REG, 0, 0, CAREL_SLAVE_ADDR, 10, 0, 10.0 },  // HR 10 Set Point CO2 (R/W)
  { "CAREL-MAN-FAN-SPEED",  CAREL_HOLDING_REG, 0, 0, CAREL_SLAVE_ADDR, 58, 0, 10.0 },  // HR 58 Manual Fan Speed (R/W)
  { "CAREL-MAX-FAN-SPEED",  CAREL_HOLDING_REG, 0, 0, CAREL_SLAVE_ADDR, 60, 0, 10.0 },  // HR 60 Max Fan Speed (R/W)
  { "CAREL-MIN-FAN-SPEED",  CAREL_HOLDING_REG, 0, 0, CAREL_SLAVE_ADDR, 62, 0, 10.0 },  // HR 62 Min Fan Speed (R/W)
  { "CAREL-MAN-CWV-MOD",    CAREL_HOLDING_REG, 0, 0, CAREL_SLAVE_ADDR, 64, 0, 10.0 },  // HR 64 Man CWV Modulation (R/W)
  { "CAREL-MAX-CWV",        CAREL_HOLDING_REG, 0, 0, CAREL_SLAVE_ADDR, 66, 0, 10.0 },  // HR 66 Max CWV (R/W)
  { "CAREL-MIN-CWV",        CAREL_HOLDING_REG, 0, 0, CAREL_SLAVE_ADDR, 68, 0, 10.0 },  // HR 68 Min CWV (R/W)
  { "CAREL-MAN-FAD-MOD",    CAREL_HOLDING_REG, 0, 0, CAREL_SLAVE_ADDR, 70, 0, 10.0 },  // HR 70 Man FAD Modulation (R/W)
  { "CAREL-MAX-FAD",        CAREL_HOLDING_REG, 0, 0, CAREL_SLAVE_ADDR, 72, 0, 10.0 },  // HR 72 Max FAD (R/W)
  { "CAREL-MIN-FAD",        CAREL_HOLDING_REG, 0, 0, CAREL_SLAVE_ADDR, 74, 0, 10.0 },  // HR 74 Min FAD (R/W)
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
