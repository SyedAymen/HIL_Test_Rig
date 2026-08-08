#include "AhuRig.h"

/*
  05_Network.ino
  --------------
  Ethernet is the intended production transport (see the board header
  comment), but during bench bring-up you don't always have it plugged
  in. This module tries Ethernet first; if the W5500 isn't detected, or
  the link is down (no cable), it automatically brings up WiFi instead
  and rebinds the shared PubSubClient to a WiFiClient so MQTT keeps
  working over whichever transport is actually available.

  Network_selectTransport() is called from Mqtt_maintainConnection()
  every time a reconnect is about to be attempted (throttled to once per
  2s while disconnected — see 06_Mqtt.ino), so this also acts as ongoing
  failover: pull the Ethernet cable mid-run, and the next reconnect
  attempt after MQTT notices the connection died will pick up WiFi
  automatically. Plug Ethernet back in, and it switches back the same way
  (Ethernet is always preferred when its link is up).
*/

enum NetworkTransport { TRANSPORT_NONE, TRANSPORT_ETHERNET, TRANSPORT_WIFI };
NetworkTransport activeTransport = TRANSPORT_NONE;
WiFiClient wifiClientObj;

bool Network_ethernetLinkUp() {
  if (Ethernet.hardwareStatus() == EthernetNoHardware) return false;
  // W5500 supports real link detection (cable plugged in AND link
  // negotiated), so LinkOFF here is trustworthy, not just "unsupported".
  return Ethernet.linkStatus() != LinkOFF;
}

void Network_useEthernet() {
  if (activeTransport == TRANSPORT_ETHERNET) return;
  Debug_println("Network: switching MQTT transport -> ETHERNET");
  mqtt.disconnect();
  mqtt.setClient(ethClient);
  activeTransport = TRANSPORT_ETHERNET;
}

void Network_useWifi() {
  if (activeTransport == TRANSPORT_WIFI && WiFi.status() == WL_CONNECTED) return;

  if (WiFi.status() != WL_CONNECTED) {
    Debug_println("Network: Ethernet unavailable — connecting WiFi fallback...");
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) {
      delay(250);
    }
    if (WiFi.status() != WL_CONNECTED) {
      Debug_errorln("Network: WiFi fallback failed to connect within 10s — check WIFI_SSID/WIFI_PASSWORD in 00_Config.ino");
      return;  // leaves activeTransport as-is; caller's mqtt.connect() will just fail and retry in 2s
    }
    Serial.print("Network: WiFi connected, IP = ");
    Serial.println(WiFi.localIP());
  }

  Debug_println("Network: switching MQTT transport -> WIFI");
  mqtt.disconnect();
  mqtt.setClient(wifiClientObj);
  activeTransport = TRANSPORT_WIFI;
}

// Re-evaluated before every MQTT reconnect attempt — Ethernet is always
// preferred when its link is up, WiFi is the fallback otherwise.
void Network_selectTransport() {
  if (Network_ethernetLinkUp()) {
    Network_useEthernet();
  } else {
    Network_useWifi();
  }
}

void Network_init() {
  Debug_printf("Network: starting SPI (SCLK=%d MISO=%d MOSI=%d CS=%d)...\n",
               ETH_SCLK_PIN, ETH_MISO_PIN, ETH_MOSI_PIN, ETH_CS_PIN);
  SPI.begin(ETH_SCLK_PIN, ETH_MISO_PIN, ETH_MOSI_PIN, ETH_CS_PIN);
  Ethernet.init(ETH_CS_PIN);

  Debug_println("Network: starting W5500 (Ethernet.begin)...");
  Ethernet.begin(MAC, STATIC_IP, DNS_SERVER, GATEWAY, SUBNET);
  delay(1000);

  if (Ethernet.hardwareStatus() == EthernetNoHardware) {
    Debug_errorln("Network: W5500 not found (check wiring/SPI pins) — will use WiFi fallback for MQTT");
  } else {
    Debug_println("Network: W5500 hardware detected OK");
    Serial.print("Network: Ethernet IP = ");
    Serial.println(Ethernet.localIP());
  }

  Network_selectTransport();  // picks Ethernet now if the link's up, otherwise brings up WiFi immediately
  Debug_println(activeTransport == TRANSPORT_ETHERNET ? "Network: active transport = ETHERNET" :
                activeTransport == TRANSPORT_WIFI      ? "Network: active transport = WIFI" :
                                                          "Network: no transport available yet");
}

void Network_maintain() {
  if (Ethernet.hardwareStatus() != EthernetNoHardware) {
    Ethernet.maintain();
  }
}
