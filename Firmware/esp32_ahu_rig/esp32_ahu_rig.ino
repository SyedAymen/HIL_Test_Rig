#include "AhuRig.h"

/*
  AHU Rig — Waveshare ESP32-S3-ETH-8DI-8RO-C node
  ----------------------------------------------------------------
  STAGE 1, DEV CONFIG: Mosquitto + Node-RED are running on your PC (via
  Docker), not a Pi yet, and only Digital IO is being tested (Relay + DI)
  since the analog RS485 expansion modules haven't arrived — see
  MODBUS_MODULES_PRESENT in 00_Config.ino. Ethernet is the intended
  primary transport, but 05_Network.ino automatically falls back to WiFi
  if the cable isn't plugged in or the W5500 isn't detected, so you're
  not blocked by bench wiring while developing. No watchdog, no OTA yet;
  those live in stage2/ ready to be re-wired in once this core is proven
  solid. See stage2/README.md for exactly how to bring them back.

  BEFORE FLASHING: edit MQTT_BROKER, STATIC_IP/GATEWAY/SUBNET, and
  WIFI_SSID/WIFI_PASSWORD in 00_Config.ino to match your actual PC/router
  network — the values there are placeholders.

  Split across tabs, numbered 00-07 so Arduino's alphabetical tab
  ordering matches the actual init sequence. IMPORTANT: Arduino always
  concatenates THIS file (the main sketch, matching the folder name)
  first, before every other tab, regardless of their numbering — that's
  why every type/global/prototype this file and the others need lives in
  AhuRig.h, included as the very first line of every tab. See AhuRig.h's
  own header comment for why.

  setup()/loop() below call every module strictly in 00->07 order — line
  the calls up against the filenames and it reads top to bottom exactly
  as written.

  DEBUG LOGGING: verbose Serial prints are on by default (see
  debugEnabled in 00_Config.ino). Toggle any time from Serial Monitor
  (Newline line ending):
    debug on   | debug off   | debug status
  Real errors (hardware not found, MQTT connect failed, Modbus
  read/write failed) always print regardless of this setting — see
  01_Debug.ino.

  HARDWARE: this board is ESP32-S3-based, with:
    - Ethernet via onboard W5500 on FIXED pins (see AhuRig.h's ETH_* defines)
    - 8 relay outputs driven through an onboard TCA9554 I2C IO expander,
      NOT direct GPIO (02_Relay.ino)
    - 8 digital inputs on direct GPIO (03_DigitalInputs.ino)
    - CAN on GPIO17/18 (this is the "-C" CAN variant, no onboard RS485;
      unused by this sketch)
    - Critically: ESP32-S3 has NO built-in DAC peripheral at all (unlike
      classic ESP32), and its ADC isn't suited to precision instrumentation.
      That's WHY this rig needs external analog I/O — the onboard MCU
      structurally can't do it. All analog stimulus/response points are
      handled via Modbus RTU over RS485 to Waveshare's external 8-channel
      analog expansion modules (04_Modbus.ino) instead of dacWrite()/
      analogRead().

  WIRING THIS ADDS ON TOP OF ETHERNET/RELAYS/DI:
    ESP32 UART1 (GPIO43 TX, GPIO44 RX — free pins per Waveshare's official
    pin table, not used by any onboard peripheral)
      -> Waveshare TTL to RS485 (C) converter (auto direction-sensing,
         no DE/RE control pin needed — just VCC/GND/TXD/RXD on the TTL
         side, A/B on the RS485 side)
      -> RS485 bus (A-A, B-B, shared ground) daisy-chained to:
           - Waveshare "Modbus RTU Analog Input 8CH" module(s) — analog
             RESPONSE points (rig reads the UUT's analog outputs)
           - Waveshare "Modbus RTU Analog Output 8CH" module(s) — analog
             STIMULUS points (rig injects simulated sensor signals into
             the UUT)
    Each expansion module needs a unique Modbus slave address (factory
    default is usually 1 — if you have more than one module, address them
    differently first via Waveshare's SSCOM tool over a USB-RS485 adapter,
    one module at a time, before wiring them onto the same bus).

  CONFIRMED PIN TABLE (Waveshare's ESP32-S3-ETH-8DI-8RO-C wiki page):
    W5500 (Ethernet):  INT=12  MOSI=13  MISO=14  SCLK=15  CS=16
    CAN:               TX=17  RX=18            (unused by this sketch)
    I2C (RTC + relay IO expander, shared bus): SCL=41  SDA=42
    RGB LED: GPIO38   Buzzer: GPIO46   BOOT button: GPIO0
    TF card (separate SPI bus, unused here): MISO=45 MOSI=47 SCLK=48
    GPIO33-37: internally used by octal PSRAM — DO NOT use for anything

  NOT OFFICIALLY DOCUMENTED FOR THIS EXACT "-C" VARIANT, INFERRED FROM
  THE SIBLING RS485 BOARD (same relay/DI subcircuit, community-documented)
  — VERIFY AGAINST YOUR BOARD'S SILKSCREEN BEFORE TRUSTING IN PRODUCTION:
    Digital inputs (8ch, opto-isolated): GPIO 4,5,6,7,8,9,10,11
    TCA9554 I2C address: 0x20

  Open the esp32_ahu_rig FOLDER in Arduino IDE, not an individual file —
  AhuRig.h plus all 00-07 tabs plus this main file must sit flat in that
  one folder (stage2/ is fine as a subfolder — Arduino ignores it).

  Libraries needed (Library Manager):
    - PubSubClient (knolleary/pubsubclient)
    - ArduinoJson (bblanchon/ArduinoJson)
    - ModbusMaster (4-20ma/ModbusMaster)
  Ethernet: use the built-in "Ethernet" library that ships with the ESP32
  board package for W5500 support (handles ESP32's custom-pin SPI init
  correctly). Wire.h and WiFi.h both ship with the ESP32 board package —
  nothing extra to install for either.
*/

void setup() {
  Serial.begin(115200);
  delay(500);  // give Serial Monitor a moment to attach after USB enumerates

  Debug_init();                  // 01 — boot banner + Serial command instructions

  Relay_init();                  // 02 — TCA9554 relay outputs, all off
  DigitalInputs_init();          // 03 — DI pin modes

  Modbus_init();                 // 04 — RS485 UART for the analog expansion modules

  Network_init();                 // 05 — Ethernet primary, automatic WiFi fallback if not usable

  Mqtt_init();                   // 06 — configure server/callback (connects lazily in loop)

  // 07_Points.ino has no init step — it's pure lookup/dispatch logic used
  // by Mqtt_onMessage() and the telemetry loop below.

  Debug_println("setup() complete — entering loop()");
}

void loop() {
  Debug_pollSerialCommand();  // checks for "debug on"/"debug off"/"debug status" typed into Serial Monitor

  Network_maintain();
  Mqtt_maintainConnection();

  unsigned long now = millis();
  if (now - lastTelemetry >= TELEMETRY_INTERVAL_MS) {
    lastTelemetry = now;

    // One batched read per AI module (not per point) — see Modbus_pollAiModule().
    Modbus_pollAiModules();

    for (size_t i = 0; i < NUM_POINTS; i++) {
      float hmiValue;
      switch (points[i].kind) {
        case LOCAL_DI:
          hmiValue = DigitalInputs_read(points[i].localPin);
          break;
        case MODBUS_AI:
          hmiValue = points[i].lastModbusValue;  // filled by Modbus_pollAiModules() just above
          break;
        default:
          continue;  // LOCAL_RELAY / MODBUS_AO are stimulus-only; the cmd/ack in Mqtt_onMessage covers confirmation
      }
      Mqtt_publishTelemetry(points[i], hmiValue);
    }
  }
}
