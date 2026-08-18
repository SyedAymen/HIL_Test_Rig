/*
  AhuRig.h
  --------
  STAGE 1 scope: Ethernet, MQTT, onboard Relay/DI, and RS485/Modbus
  analog I/O — plus a Serial-toggleable debug logging layer so you can
  watch each piece come up on the bench. Watchdog and OTA are deliberately
  NOT here — see stage2/README.md for how to bring them back once this
  core is proven working.

  Arduino always concatenates the MAIN sketch file (esp32_ahu_rig.ino)
  FIRST, before every other tab, regardless of the other tabs' numeric
  prefixes — so every type/global/prototype needed anywhere lives here,
  and every .ino file #includes "AhuRig.h" as its very first line.
  Definitions (the actual `RigPoint points[] = {...}`, function bodies,
  etc.) stay in their respective module files exactly as before — only
  declarations live here.
*/

#ifndef AHU_RIG_H
#define AHU_RIG_H

#include <Arduino.h>
#include <stdarg.h>
#include <SPI.h>
#include <ETH.h>
#include <Wire.h>
#include <WiFi.h>
#include <HardwareSerial.h>
#include <ModbusMaster.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ---------------------------------------------------------------------
// Pin/config macros
// ---------------------------------------------------------------------
#define ETH_INT_PIN   12
#define ETH_MOSI_PIN  13
#define ETH_MISO_PIN  14
#define ETH_SCLK_PIN  15
#define ETH_CS_PIN    16

#define I2C_SDA_PIN   42
#define I2C_SCL_PIN   41
#define TCA9554_ADDR  0x20   // verify — see esp32_ahu_rig.ino header comment
#define TCA9554_REG_INPUT     0x00
#define TCA9554_REG_OUTPUT    0x01
#define TCA9554_REG_POLARITY  0x02
#define TCA9554_REG_CONFIG    0x03

#define RS485_TX_PIN  43
#define RS485_RX_PIN  44

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------
enum IoKind { LOCAL_RELAY, LOCAL_DI, MODBUS_AI, MODBUS_AO };

struct RigPoint {
  const char* pointId;      // matches testPlan point.id, e.g. "DPT-1", "EC-FAN"
  IoKind kind;
  uint8_t localPin;         // used only for LOCAL_DI
  uint8_t relayBit;         // used only for LOCAL_RELAY (TCA9554 output bit 0-7)
  uint8_t modbusSlaveAddr;  // used only for MODBUS_AI / MODBUS_AO
  uint8_t modbusChannel;    // used only for MODBUS_AI / MODBUS_AO (0-7)
  uint16_t lastModbusValue; // runtime cache for MODBUS_AI, filled by Modbus_pollAiModules()
};

// ---------------------------------------------------------------------
// Global objects and constants — actual definitions live in 00_Config.ino
// ---------------------------------------------------------------------
extern IPAddress STATIC_IP;
extern IPAddress GATEWAY;
extern IPAddress SUBNET;
extern IPAddress DNS_SERVER;
extern IPAddress MQTT_BROKER;
extern IPAddress MQTT_BROKER_ETH;
extern IPAddress MQTT_BROKER_WIFI;
extern const uint16_t MQTT_PORT;
extern const char* MQTT_CLIENT_ID;

extern const uint8_t DI_PINS[8];

extern const unsigned long RS485_BAUD;
extern const unsigned long MODBUS_POLL_TIMEOUT_MS;
extern bool MODBUS_MODULES_PRESENT;  // set true once your AI/AO expansion modules are wired up

// WiFi is the FALLBACK transport for MQTT if Ethernet isn't usable (no
// cable, no W5500 detected) — see 05_Network.ino. Not used for OTA in
// Stage 1 (that's stage2/).
extern const char* WIFI_SSID;
extern const char* WIFI_PASSWORD;

extern const char* FW_VERSION;

extern RigPoint points[];
extern const size_t NUM_POINTS;
extern const unsigned long TELEMETRY_INTERVAL_MS;

extern WiFiClient ethClient;  // native ETH stack uses WiFiClient for both Ethernet and WiFi transports
extern PubSubClient mqtt;
extern HardwareSerial RS485Serial;
extern ModbusMaster modbus;

extern unsigned long lastTelemetry;
extern bool simEnabled;
extern uint8_t relayShadow;  // local copy of the TCA9554 output register
extern char topicBuf[96];

extern bool debugEnabled;    // 01_Debug.ino — gates Debug_print*(), default set in 00_Config.ino

// ---------------------------------------------------------------------
// Function prototypes — one block per module, in the same 00->07 order
// they're called in from setup()/loop()
// ---------------------------------------------------------------------
void Debug_init();
void Debug_pollSerialCommand();
void Debug_println(const String& msg);
void Debug_printf(const char* fmt, ...);
void Debug_errorln(const String& msg);
void Debug_errorf(const char* fmt, ...);

bool Relay_writeReg(uint8_t reg, uint8_t val);
void Relay_init();
void Relay_set(uint8_t bit, bool on);

void DigitalInputs_init();
int DigitalInputs_read(uint8_t pin);

void Modbus_init();
void Modbus_pollAiModule(uint8_t slaveAddr);
void Modbus_pollAiModules();
bool Modbus_writeAo(uint8_t slaveAddr, uint8_t channel, uint16_t value);

void Network_init();
void Network_maintain();
void Network_selectTransport();

const char* Mqtt_buildTopic(const char* pointId, const char* suffix);
void Mqtt_publishTelemetry(const RigPoint& pt, float hmiValue);
void Mqtt_onMessage(char* topic, byte* payload, unsigned int length);
void Mqtt_reconnect();
void Mqtt_init();
void Mqtt_maintainConnection();

RigPoint* Points_find(const String& pointId);
bool Points_isStimulusKind(IoKind k);
void Points_applyCommand(RigPoint& pt, float value);

#endif  // AHU_RIG_H
