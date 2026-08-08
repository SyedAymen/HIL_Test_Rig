#include "AhuRig.h"

/*
  01_Watchdog.ino
  ---------------
  Hardware task watchdog. Armed first, before anything else that could
  hang (I2C/SPI/Ethernet init, WiFi connect) — turns a silent freeze
  anywhere in the sketch into a crash the bootloader's OTA rollback logic
  (09_OtaRollback.ino) can react to.

  Uses the esp_task_wdt_config_t struct API — this is what Arduino-ESP32
  core 3.x / ESP-IDF 5.x require (esp_task_wdt_init(uint32_t, bool) was
  removed). If you're on core 2.x, esp_task_wdt_init() there still wants
  the older two-argument form instead.
*/

void Watchdog_init() {
  esp_task_wdt_config_t wdtConfig;
  wdtConfig.timeout_ms = TASK_WDT_TIMEOUT_S * 1000;
  wdtConfig.idle_core_mask = 0;   // don't watch the idle tasks, just our loop task below
  wdtConfig.trigger_panic = true; // panic (and reset) on timeout, not just a warning

  esp_task_wdt_init(&wdtConfig);
  esp_task_wdt_add(NULL);  // NULL = watch the currently running task (Arduino's loopTask)
}

void Watchdog_feed() {
  esp_task_wdt_reset();
}
