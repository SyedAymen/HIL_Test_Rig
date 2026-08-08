# Stage 2 — Watchdog & OTA (parked, not part of the active build)

These three files are the exact Watchdog + OTA rollback/validation code
from before Stage 1 stripped it back down to core I/O. Arduino ignores
files inside a subfolder, so they're inert here — nothing to do until
you're ready to bring them back.

- `01_Watchdog.ino` — task watchdog (uses the `esp_task_wdt_config_t`
  struct API for ESP32 core 3.x/IDF5)
- `08_WifiOta.ino` — WiFi + ArduinoOTA setup/callbacks
- `09_OtaRollback.ino` — bootloader-level + application-level rollback
  if a pushed update turns out broken

## When to bring them back
Once Relay/DI/Modbus/Ethernet/MQTT are all confirmed solid on the bench
with Stage 1 (i.e. you've watched real telemetry flow and real commands
land, ideally with `debug on` for a while and nothing alarming in the
log), it's a good time to layer OTA back on top.

## How to bring them back
1. **Move these 3 files** out of `stage2/` into the main sketch folder
   (alongside `00_Config.ino`, `01_Debug.ino`, etc.). `01_Watchdog.ino`'s
   number will collide with nothing since `01_Debug.ino` is a different
   file — Arduino tabs don't need unique number prefixes, just unique
   filenames, so having two files both touch "early" concerns
   (`01_Debug.ino` and `01_Watchdog.ino`) is fine. If you want strict
   numeric uniqueness for readability, renumber `01_Watchdog.ino` to
   `01b_Watchdog.ino` or shift everything below it up by one — either
   works, since only the *call order in setup()/loop()* actually matters,
   not the exact numbers (see AhuRig.h's own comment on this).

2. **Restore the removed declarations to `AhuRig.h`** — these were in
   the pre-Stage-1 version and need to go back:
   ```cpp
   #include <WiFi.h>
   #include <ESPmDNS.h>
   #include <ArduinoOTA.h>
   #include "esp_ota_ops.h"
   #include "esp_task_wdt.h"
   ```
   plus these extern/consts:
   ```cpp
   extern const char* WIFI_SSID;
   extern const char* WIFI_PASSWORD;
   extern const char* OTA_HOSTNAME;
   extern const char* OTA_PASSWORD;
   extern const unsigned long OTA_VALIDATION_TIMEOUT_MS;
   extern const int OTA_VALIDATION_SAMPLE_COUNT;
   extern const uint32_t TASK_WDT_TIMEOUT_S;
   extern volatile bool otaInProgress;
   extern bool otaValidationPending;
   extern unsigned long otaBootTime;
   extern int otaHealthySampleCount;
   ```
   plus these function prototypes:
   ```cpp
   void Watchdog_init();
   void Watchdog_feed();
   void WifiOta_init();
   void WifiOta_handle();
   void OtaRollback_init();
   void OtaRollback_noteHealthySample();
   void OtaRollback_checkTimeout();
   ```

3. **Restore the constant definitions to `00_Config.ino`** — matching
   values for everything in the extern list above (WiFi credentials, OTA
   password, the two validation constants, the watchdog timeout).

4. **Restore the calls in `esp32_ahu_rig.ino`'s `setup()`/`loop()`**:
   - `setup()`: `Watchdog_init()` first (before anything else), then
     `WifiOta_init()` after `Mqtt_init()`, then `OtaRollback_init()` as
     the very last line.
   - `loop()`: `Watchdog_feed()` first line, `WifiOta_handle()` right
     after (with the `if (otaInProgress) return;` guard restored),
     `OtaRollback_checkTimeout()` after `Mqtt_maintainConnection()`, and
     `OtaRollback_noteHealthySample()` at the end of the telemetry block.

5. Set `OTA_PASSWORD` to something real before flashing (still `"change-me-please"`
   in these parked files).

If any of this is fiddly when the time comes, just ask — I can redo the
merge directly against whatever Stage 1 looks like by then.
