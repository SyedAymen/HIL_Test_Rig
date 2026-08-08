#include "AhuRig.h"

/*
  03_DigitalInputs.ino
  --------------------
  Native-GPIO driver for the board's 8 opto-isolated digital inputs
  (DI_PINS, defined in 00_Config.ino). Unlike the relays, these ARE on
  direct GPIO — no I2C expander involved.
*/

void DigitalInputs_init() {
  Debug_println("DigitalInputs: configuring 8 pins as INPUT: " +
                 String(DI_PINS[0]) + "," + String(DI_PINS[1]) + "," + String(DI_PINS[2]) + "," + String(DI_PINS[3]) + "," +
                 String(DI_PINS[4]) + "," + String(DI_PINS[5]) + "," + String(DI_PINS[6]) + "," + String(DI_PINS[7]));
  for (uint8_t i = 0; i < 8; i++) {
    pinMode(DI_PINS[i], INPUT);
  }
  Debug_println("DigitalInputs: init OK");
}

int DigitalInputs_read(uint8_t pin) {
  int value = digitalRead(pin);
  Debug_printf("DigitalInputs: GPIO%u = %d\n", pin, value);
  return value;
}
