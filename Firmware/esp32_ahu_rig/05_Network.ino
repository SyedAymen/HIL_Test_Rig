#include "AhuRig.h"

/*
  05_Network.ino
  --------------
  Uses the NATIVE ESP32 ETH stack (ETH.h + W5500) instead of the
  third-party Ethernet.h library. The native stack is event-driven:
  WiFi.onEvent() / NetworkEvent() below handles all link and IP
  state changes asynchronously.

  Key differences from the old Ethernet.h approach:
    - No MAC[] byte array — the native stack reads the ESP32's
      hardware-fused OTP MAC automatically.
    - SPIClass ethSPI(FSPI) is used instead of the default SPI object
      so the W5500 SPI bus is explicitly controlled.
    - ETH.begin() replaces Ethernet.begin().
    - ETH.config() replaces Ethernet.begin(mac, ip, dns, gw, subnet).
    - Link/IP status is tracked via the eth_connected flag set by
      NetworkEvent(), not by polling Ethernet.hardwareStatus() /
      Ethernet.linkStatus().
    - Both Ethernet and WiFi transports use WiFiClient (ethClient)
      because the native stack unifies all sockets under lwIP.

  WiFi fallback behaviour is unchanged: if ETH link is not up when
  Network_selectTransport() is called, WiFi is brought up and MQTT
  runs over that instead. Ethernet is always preferred when its link
  is up.
*/

// ---------------------------------------------------------------------------
// Module-private state
// ---------------------------------------------------------------------------
static bool eth_connected = false;
SPIClass ethSPI(FSPI);

enum NetworkTransport { TRANSPORT_NONE, TRANSPORT_ETHERNET, TRANSPORT_WIFI };
static NetworkTransport activeTransport = TRANSPORT_NONE;

// ---------------------------------------------------------------------------
// Native ETH event handler
// ---------------------------------------------------------------------------
void NetworkEvent(WiFiEvent_t event) {
  switch (event) {
    case ARDUINO_EVENT_ETH_START:
      Debug_println("Network: ETH stack started");
      ETH.setHostname("esp32-ahu-rig");
      break;

    case ARDUINO_EVENT_ETH_CONNECTED:
      Debug_println("Network: Ethernet cable linked — waiting for IP...");
      break;

    case ARDUINO_EVENT_ETH_GOT_IP:
      Serial.print("Network: Ethernet MAC : ");
      Serial.println(ETH.macAddress());
      Serial.print("Network: Ethernet IP  : ");
      Serial.println(ETH.localIP());
      eth_connected = true;
      break;

    case ARDUINO_EVENT_ETH_DISCONNECTED:
      Debug_println("Network: Ethernet link disconnected");
      eth_connected = false;
      break;

    case ARDUINO_EVENT_ETH_STOP:
      Debug_println("Network: ETH driver stopped");
      eth_connected = false;
      break;

    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Transport helpers — called by Network_selectTransport()
// ---------------------------------------------------------------------------
bool Network_ethernetLinkUp() {
  return eth_connected;
}

void Network_useEthernet() {
  if (activeTransport == TRANSPORT_ETHERNET) return;
  Debug_println("Network: switching MQTT transport -> ETHERNET (broker 192.168.2.1)");
  mqtt.disconnect();
  MQTT_BROKER = MQTT_BROKER_ETH;   // Pi eth0 subnet
  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
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
      return;
    }
    Serial.print("Network: WiFi connected, IP = ");
    Serial.println(WiFi.localIP());
  }

  Debug_println("Network: switching MQTT transport -> WIFI (broker 192.168.4.1)");
  mqtt.disconnect();
  MQTT_BROKER = MQTT_BROKER_WIFI;  // Pi wlan0 subnet
  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  mqtt.setClient(ethClient);   // same WiFiClient object works for WiFi too
  activeTransport = TRANSPORT_WIFI;
}

// Re-evaluated before every MQTT reconnect attempt.
// Ethernet is always preferred; WiFi is the automatic fallback.
void Network_selectTransport() {
  if (Network_ethernetLinkUp()) {
    Network_useEthernet();
  } else {
    Network_useWifi();
  }
}

// ---------------------------------------------------------------------------
// Network_init  — called once from setup()
// ---------------------------------------------------------------------------
void Network_init() {
  Debug_printf("Network: registering ETH events, SPI pins SCLK=%d MISO=%d MOSI=%d CS=%d INT=%d\n",
               ETH_SCLK_PIN, ETH_MISO_PIN, ETH_MOSI_PIN, ETH_CS_PIN, ETH_INT_PIN);

  // Register event handler BEFORE ETH.begin() so we don't miss any events
  WiFi.onEvent(NetworkEvent);

  // Initialise the FSPI bus on the board's confirmed W5500 pins
  ethSPI.begin(ETH_SCLK_PIN, ETH_MISO_PIN, ETH_MOSI_PIN, ETH_CS_PIN);

  // Start the native W5500 driver
  if (!ETH.begin(ETH_PHY_W5500, 1, ETH_CS_PIN, ETH_INT_PIN, -1, ethSPI)) {
    Debug_errorln("Network: native W5500 init FAILED (check SPI wiring) — will use WiFi fallback");
  } else {
    Debug_println("Network: W5500 hardware init OK — applying static IP config...");
    // Apply static IP — must be called after ETH.begin(), before the stack
    // issues a DHCP request (config() with no DHCP server arg disables DHCP).
    ETH.config(STATIC_IP, GATEWAY, SUBNET, DNS_SERVER);
  }

  // Wait up to 5 s for ARDUINO_EVENT_ETH_GOT_IP before falling back to WiFi.
  // NetworkEvent() sets eth_connected when the IP is confirmed.
  Debug_println("Network: waiting up to 5 s for ETH link + IP...");
  unsigned long wait_start = millis();
  while (!eth_connected && millis() - wait_start < 5000) {
    delay(100);
  }

  Network_selectTransport();
  Debug_println(activeTransport == TRANSPORT_ETHERNET ? "Network: active transport = ETHERNET" :
                activeTransport == TRANSPORT_WIFI      ? "Network: active transport = WIFI"     :
                                                          "Network: no transport available yet");
}

// ---------------------------------------------------------------------------
// Network_maintain  — called every loop()
// ---------------------------------------------------------------------------
void Network_maintain() {
  // The native ETH stack is fully event-driven; no explicit polling is needed.
  // This function is kept for API compatibility with esp32_ahu_rig.ino loop().
}
