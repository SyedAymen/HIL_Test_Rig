#include "AhuRig.h"

/*
  09_OtaRollback.ino
  -------------------
  The ESP-IDF bootloader tracks each OTA slot's state. Right after
  ArduinoOTA (08_WifiOta.ino) flips the boot partition to a new image and
  reboots, that slot is ESP_OTA_IMG_PENDING_VERIFY — "untested, revert me
  if this next boot doesn't explicitly confirm itself". If the app never
  calls esp_ota_mark_app_valid_cancel_rollback() and the chip resets again
  (crash, panic, watchdog timeout, brownout) while still pending-verify,
  the bootloader automatically reboots into the PREVIOUS slot instead —
  no application code needs to run correctly for that layer to work.

  That only catches "new firmware crashes/hangs". It does NOT catch "new
  firmware boots fine but is subtly broken" — wrong broker IP baked in,
  a bug that silently drops MQTT, wiring/pin mapping mismatch, etc. That
  case needs an explicit health check, which is what OtaRollback_
  checkTimeout() and OtaRollback_noteHealthySample() add on top: the new
  image must actually get Ethernet + MQTT + a few real telemetry
  publishes working within OTA_VALIDATION_TIMEOUT_MS, or we deliberately
  force the same rollback via esp_ota_mark_app_invalid_rollback_and_reboot().

  Called from esp32_ahu_rig.ino: OtaRollback_init() once at the end of
  setup(), OtaRollback_checkTimeout() every loop() iteration,
  OtaRollback_noteHealthySample() once per successful telemetry cycle.
*/

void OtaRollback_init() {
  const esp_partition_t* running = esp_ota_get_running_partition();
  esp_ota_img_states_t otaState;
  if (esp_ota_get_state_partition(running, &otaState) == ESP_OK &&
      otaState == ESP_OTA_IMG_PENDING_VERIFY) {
    Serial.println("OTA: booted a freshly-flashed image — must prove itself healthy within "
                    + String(OTA_VALIDATION_TIMEOUT_MS / 1000) + "s or it will auto roll back.");
    otaValidationPending = true;
    otaBootTime = millis();
  }
  // If otaState is ESP_OTA_IMG_VALID (or the API isn't applicable — e.g.
  // very first flash via USB before any OTA has happened), there's
  // nothing pending; the board just runs normally.
}

void OtaRollback_noteHealthySample() {
  if (!otaValidationPending || !mqtt.connected()) return;

  otaHealthySampleCount++;
  if (otaHealthySampleCount >= OTA_VALIDATION_SAMPLE_COUNT) {
    Serial.println("OTA: new firmware confirmed healthy — cancelling rollback, this image is now permanent until the next update.");
    esp_ota_mark_app_valid_cancel_rollback();
    otaValidationPending = false;
    mqtt.publish("ahu-rig/ota/status", "{\"state\":\"validated\"}", true);
  }
}

void OtaRollback_checkTimeout() {
  if (!otaValidationPending) return;

  if (millis() - otaBootTime > OTA_VALIDATION_TIMEOUT_MS) {
    Serial.println("OTA: new firmware failed to prove itself healthy in time — rolling back to previous firmware now.");
    if (mqtt.connected()) {
      mqtt.publish("ahu-rig/ota/status", "{\"state\":\"rolling_back\",\"reason\":\"validation_timeout\"}", false);
      delay(200);  // best-effort flush before the reboot below
    }
    esp_ota_mark_app_invalid_rollback_and_reboot();
    // Does not return — reboots straight into the previous (good) image.
  }
}
