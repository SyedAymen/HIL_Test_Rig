#include "AhuRig.h"

/*
  08_CarelModbus.ino
  -------------------
  Modbus RTU master driver for the Carel controller ITSELF (not the
  Waveshare simulation modules — see 04_Modbus.ino for those). Reads the
  controller's own live engineering values (DPT, temps, fan speed, etc.)
  and its writable setpoints/commands, straight off its register map, per
  the BMS Communication sheet.

  Shares the same RS485 bus/UART as the Waveshare AI/AO modules — both run
  at 19200/8N1/no-parity, matching the Carel controller's fixed BMS spec.
  Bench-confirmed working via standalone waveshare_ai_test.ino and
  carel_controller_test.ino before this integration.

  *** carelScale = 10.0 default is UNVERIFIED FOR ENGINEERING-UNIT
      CORRECTNESS — communication is confirmed working, the /10 math is
      not yet confirmed correct. ***
  The BMS sheet marks every Input/Holding Register as Data Type "Real",
  but does not state the actual wire encoding. Two things Carel commonly
  does, and this file assumes the first:
    (a) Each register is a single 16-bit signed integer, scaled by a fixed
        factor (commonly x10 for one decimal place) — what this file
        implements via RigPoint.carelScale, defaulted to 10.0 below.
    (b) Each value is a true 32-bit IEEE-754 float spanning TWO consecutive
        registers — NOT implemented here.
  The register INDEX numbering in the sheet (DPT=0, RETURN AIR TEMP=1,
  RETURN AIR HUMI=2, ... sequential single steps, no gaps for a second
  register) strongly suggests (a), not (b). CONFIRM by comparing a live
  reading here (e.g. CAREL-RAT) against the controller's own front-panel
  display — if it's off by a factor of 10/100, correct carelScale per-point
  in 00_Config.ino, or swap in float32 decoding if it turns out to be (b).
*/

// --- Input Registers (function 04) — read-only, indices 0-26 per the sheet ---
// One transaction covers the whole block; individual points below just
// pull their own index out of the response buffer.
void Carel_pollInputRegisters() {
  modbus.begin(CAREL_SLAVE_ADDR, RS485Serial);
  uint8_t result = modbus.readInputRegisters(0, 27);  // indices 0-26
  if (result != modbus.ku8MBSuccess) {
    Debug_errorf("Carel: input register read failed (Modbus status 0x%02X)\n", result);
    return;
  }
  for (size_t i = 0; i < NUM_POINTS; i++) {
    if (points[i].kind != CAREL_INPUT_REG) continue;
    points[i].lastModbusValue = modbus.getResponseBuffer(points[i].modbusChannel);
    Debug_printf("Carel: input reg %u (%s) = %u raw\n",
                 points[i].modbusChannel, points[i].pointId, points[i].lastModbusValue);
  }
}

// --- Holding Registers (function 03 read / 06 write) — read-write setpoints,
// sparse indices 2..74 per the sheet. One read transaction covers the
// whole span; offset = index - 2.
#define CAREL_HOLDING_BASE 2
#define CAREL_HOLDING_COUNT 73  // covers index 2..74 inclusive

void Carel_pollHoldingRegisters() {
  modbus.begin(CAREL_SLAVE_ADDR, RS485Serial);
  uint8_t result = modbus.readHoldingRegisters(CAREL_HOLDING_BASE, CAREL_HOLDING_COUNT);
  if (result != modbus.ku8MBSuccess) {
    Debug_errorf("Carel: holding register read failed (Modbus status 0x%02X)\n", result);
    return;
  }
  for (size_t i = 0; i < NUM_POINTS; i++) {
    if (points[i].kind != CAREL_HOLDING_REG) continue;
    uint16_t offset = points[i].modbusChannel - CAREL_HOLDING_BASE;
    points[i].lastModbusValue = modbus.getResponseBuffer(offset);
    Debug_printf("Carel: holding reg %u (%s) = %u raw\n",
                 points[i].modbusChannel, points[i].pointId, points[i].lastModbusValue);
  }
}

bool Carel_writeHoldingRegister(uint16_t regIndex, uint16_t rawValue) {
  modbus.begin(CAREL_SLAVE_ADDR, RS485Serial);
  Debug_printf("Carel: writing holding reg %u = %u...\n", regIndex, rawValue);
  uint8_t result = modbus.writeSingleRegister(regIndex, rawValue);
  if (result != modbus.ku8MBSuccess) {
    Debug_errorf("Carel: holding reg %u write failed (Modbus status 0x%02X)\n", regIndex, result);
    return false;
  }
  return true;
}

// --- Coils (function 01 read / 05 write) — read-write bools, sparse
// indices 0,7,8,9 per the sheet. One transaction covers 0-9; bits are
// packed LSB-first into the response word per standard Modbus framing.
void Carel_pollCoils() {
  modbus.begin(CAREL_SLAVE_ADDR, RS485Serial);
  uint8_t result = modbus.readCoils(0, 10);  // covers indices 0-9
  if (result != modbus.ku8MBSuccess) {
    Debug_errorf("Carel: coil read failed (Modbus status 0x%02X)\n", result);
    return;
  }
  uint16_t packed = modbus.getResponseBuffer(0);
  for (size_t i = 0; i < NUM_POINTS; i++) {
    if (points[i].kind != CAREL_COIL) continue;
    bool state = (packed >> points[i].modbusChannel) & 0x01;
    points[i].lastModbusValue = state ? 1 : 0;
    Debug_printf("Carel: coil %u (%s) = %s\n",
                 points[i].modbusChannel, points[i].pointId, state ? "ON" : "OFF");
  }
}

bool Carel_writeCoil(uint16_t coilIndex, bool state) {
  modbus.begin(CAREL_SLAVE_ADDR, RS485Serial);
  Debug_printf("Carel: writing coil %u = %s...\n", coilIndex, state ? "ON" : "OFF");
  uint8_t result = modbus.writeSingleCoil(coilIndex, state ? 0xFF00 : 0x0000);
  if (result != modbus.ku8MBSuccess) {
    Debug_errorf("Carel: coil %u write failed (Modbus status 0x%02X)\n", coilIndex, result);
    return false;
  }
  return true;
}

// --- Discrete Inputs (function 02) — read-only bools, sparse indices
// 0,1,2,4,5 per the sheet. One transaction covers 0-5.
void Carel_pollDiscreteInputs() {
  modbus.begin(CAREL_SLAVE_ADDR, RS485Serial);
  uint8_t result = modbus.readDiscreteInputs(0, 6);  // covers indices 0-5
  if (result != modbus.ku8MBSuccess) {
    Debug_errorf("Carel: discrete input read failed (Modbus status 0x%02X)\n", result);
    return;
  }
  uint16_t packed = modbus.getResponseBuffer(0);
  for (size_t i = 0; i < NUM_POINTS; i++) {
    if (points[i].kind != CAREL_DISCRETE_IN) continue;
    bool state = (packed >> points[i].modbusChannel) & 0x01;
    points[i].lastModbusValue = state ? 1 : 0;
    Debug_printf("Carel: discrete input %u (%s) = %s\n",
                 points[i].modbusChannel, points[i].pointId, state ? "ON" : "OFF");
  }
}
