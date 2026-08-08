#include "AhuRig.h"

/*
  08_WifiOta.ino
  --------------
  WiFi connect + ArduinoOTA setup — dev-only network flashing. Ethernet/
  MQTT keep running independently; we only pause them for the few seconds
  an actual transfer is in progress (see onStart/onEnd below), since CPU
  time spent writing flash can make the SPI-polled Ethernet library miss
  packets.
*/

void WifiOta_init() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting to WiFi for OTA");
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    // Not fatal — the rig's actual job (Ethernet/MQTT) doesn't depend on
    // WiFi at all. Just means no OTA available until WiFi comes up.
    Serial.println("WiFi not connected — OTA unavailable, continuing on Ethernet only");
    return;
  }
  Serial.print("WiFi connected, IP: ");
  Serial.println(WiFi.localIP());

  ArduinoOTA.setHostname(OTA_HOSTNAME);
  ArduinoOTA.setPassword(OTA_PASSWORD);

  ArduinoOTA
    .onStart([]() {
      otaInProgress = true;
      String type = (ArduinoOTA.getCommand() == U_FLASH) ? "sketch" : "filesystem";
      Serial.println("OTA: start updating " + type);
      if (mqtt.connected()) {
        mqtt.publish("ahu-rig/ota/status", "{\"state\":\"updating\"}", false);
        mqtt.disconnect();
      }
    })
    .onEnd([]() {
      Serial.println("\nOTA: end, rebooting");
      otaInProgress = false;
    })
    .onProgress([](unsigned int progress, unsigned int total) {
      Serial.printf("OTA progress: %u%%\r", (progress * 100) / total);
    })
    .onError([](ota_error_t error) {
      otaInProgress = false;
      Serial.printf("OTA error[%u]: ", error);
      if (error == OTA_AUTH_ERROR) Serial.println("Auth failed");
      else if (error == OTA_BEGIN_ERROR) Serial.println("Begin failed");
      else if (error == OTA_CONNECT_ERROR) Serial.println("Connect failed");
      else if (error == OTA_RECEIVE_ERROR) Serial.println("Receive failed");
      else if (error == OTA_END_ERROR) Serial.println("End failed");
    });

  ArduinoOTA.begin();
  Serial.println("ArduinoOTA ready");
}

void WifiOta_handle() {
  ArduinoOTA.handle();
}
