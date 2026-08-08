#include "AhuRig.h"

/*
  02_Relay.ino
  ------------
  Driver for the onboard TCA9554 I2C IO expander that this board's 8 relay
  outputs are actually wired through (NOT direct GPIO — see the hardware
  note in esp32_ahu_rig.ino's header comment).
*/

bool Relay_writeReg(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(TCA9554_ADDR);
  Wire.write(reg);
  Wire.write(val);
  bool ok = (Wire.endTransmission() == 0);
  if (!ok) {
    Debug_errorf("Relay: I2C write to TCA9554 reg 0x%02X failed (addr 0x%02X — check wiring/address)\n", reg, TCA9554_ADDR);
  }
  return ok;
}

void Relay_init() {
  Debug_println("Relay: starting TCA9554 init (I2C SDA=" + String(I2C_SDA_PIN) + " SCL=" + String(I2C_SCL_PIN) + ")...");
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  bool cfgOk = Relay_writeReg(TCA9554_REG_CONFIG, 0x00);   // all 8 bits = output (relay control)
  bool outOk = Relay_writeReg(TCA9554_REG_OUTPUT, relayShadow);  // all relays off at boot
  if (cfgOk && outOk) {
    Debug_println("Relay: TCA9554 init OK, all 8 relays OFF");
  } else {
    Debug_errorln("Relay: TCA9554 init FAILED — relays will not respond. Check I2C wiring and TCA9554_ADDR.");
  }
}

void Relay_set(uint8_t bit, bool on) {
  if (bit > 7) {
    Debug_errorf("Relay: ignoring Relay_set() with out-of-range bit %u (must be 0-7)\n", bit);
    return;
  }
  if (on) relayShadow |= (1 << bit);
  else    relayShadow &= ~(1 << bit);
  bool ok = Relay_writeReg(TCA9554_REG_OUTPUT, relayShadow);
  Debug_printf("Relay: bit %u -> %s (%s)\n", bit, on ? "ON" : "OFF", ok ? "written" : "WRITE FAILED");
}
