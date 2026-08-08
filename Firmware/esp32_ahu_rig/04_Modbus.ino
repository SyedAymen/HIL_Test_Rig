#include "AhuRig.h"

/*
  04_Modbus.ino
  -------------
  RS485 / Modbus RTU driver for Waveshare's analog expansion modules —
  this is what stands in for a DAC/ADC the ESP32-S3 doesn't have.

  Register maps confirmed from Waveshare's wiki (Development Protocol V2):
    AI module: function 04 (read input registers), 0x0000-0x0007 = ch 1-8,
               value is raw uint16 in uA or mV depending on configured range.
    AO module: function 06/16 (write single/multiple holding registers),
               0x0000-0x0007 = ch 1-8, value written is uA (current-output
               version) or mV (voltage "(B)" version), 0-20000 or 0-10000.

  The Waveshare TTL-to-RS485 (C) converter is auto direction-sensing — no
  DE/RE GPIO to toggle, so no preTransmission/postTransmission callbacks
  are needed here. If you swap in a manual-DE/RE RS485 module instead,
  you'll need to add those callbacks toggling a DE pin.
*/

void Modbus_init() {
  Debug_printf("Modbus: starting RS485 UART1 (TX=%d RX=%d, %lu baud)...\n", RS485_TX_PIN, RS485_RX_PIN, RS485_BAUD);
  RS485Serial.begin(RS485_BAUD, SERIAL_8N1, RS485_RX_PIN, RS485_TX_PIN);
  if (MODBUS_MODULES_PRESENT) {
    Debug_println("Modbus: RS485 UART1 started, analog expansion modules ENABLED");
  } else {
    Debug_println("Modbus: RS485 UART1 started, but MODBUS_MODULES_PRESENT=false — "
                   "AI/AO points will be skipped (no timeouts) until you set it true in 00_Config.ino");
  }
}

// Reads all 8 input registers from one AI module in a single transaction
// (much less RS485 bus time than one transaction per point) and fans the
// results out to every point configured on that slave address.
void Modbus_pollAiModule(uint8_t slaveAddr) {
  Debug_printf("Modbus: polling AI module addr %u (8 registers)...\n", slaveAddr);
  modbus.begin(slaveAddr, RS485Serial);
  uint8_t result = modbus.readInputRegisters(0x0000, 8);
  if (result != modbus.ku8MBSuccess) {
    Debug_errorf("Modbus AI addr %u: read failed (Modbus status 0x%02X)\n", slaveAddr, result);
    return;
  }
  for (size_t i = 0; i < NUM_POINTS; i++) {
    if (points[i].kind == MODBUS_AI && points[i].modbusSlaveAddr == slaveAddr) {
      points[i].lastModbusValue = modbus.getResponseBuffer(points[i].modbusChannel);
      Debug_printf("Modbus: AI addr %u ch %u (%s) = %u\n",
                    slaveAddr, points[i].modbusChannel, points[i].pointId, points[i].lastModbusValue);
    }
  }
}

// Called once per telemetry cycle — polls each unique AI module exactly
// once, regardless of how many points live on it. No-ops entirely (no
// bus traffic, no timeouts) until MODBUS_MODULES_PRESENT is true.
void Modbus_pollAiModules() {
  if (!MODBUS_MODULES_PRESENT) return;

  uint8_t polledAddrs[8];
  int polledCount = 0;

  for (size_t i = 0; i < NUM_POINTS; i++) {
    if (points[i].kind != MODBUS_AI) continue;
    uint8_t addr = points[i].modbusSlaveAddr;

    bool already = false;
    for (int j = 0; j < polledCount; j++) {
      if (polledAddrs[j] == addr) { already = true; break; }
    }
    if (already) continue;

    Modbus_pollAiModule(addr);
    if (polledCount < 8) polledAddrs[polledCount++] = addr;
  }
}

// Writes one channel on an AO module. value is the raw register value the
// module expects — uA for current-output modules, mV for voltage "(B)"
// modules (see your rig.js unit conventions for which is which).
bool Modbus_writeAo(uint8_t slaveAddr, uint8_t channel, uint16_t value) {
  if (!MODBUS_MODULES_PRESENT) {
    Debug_errorln("Modbus: AO write requested but MODBUS_MODULES_PRESENT=false — ignoring (set it true in 00_Config.ino once your module is wired up)");
    return false;
  }
  Debug_printf("Modbus: writing AO addr %u ch %u = %u...\n", slaveAddr, channel, value);
  modbus.begin(slaveAddr, RS485Serial);
  uint8_t result = modbus.writeSingleRegister(channel, value);
  if (result != modbus.ku8MBSuccess) {
    Debug_errorf("Modbus AO addr %u ch %u: write failed (Modbus status 0x%02X)\n", slaveAddr, channel, result);
    return false;
  }
  Debug_println("Modbus: AO write OK");
  return true;
}
