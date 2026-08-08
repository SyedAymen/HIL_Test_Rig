#include "AhuRig.h"

/*
  06_Mqtt.ino
  -----------
  MQTT transport layer over the Ethernet link brought up in
  05_Ethernet.ino: connect/reconnect, the incoming-message callback that
  routes commands to Points_applyCommand() (07_Points.ino), and the
  telemetry publisher.
*/

const char* Mqtt_buildTopic(const char* pointId, const char* suffix) {
  snprintf(topicBuf, sizeof(topicBuf), "ahu-rig/%s/%s", pointId, suffix);
  return topicBuf;
}

void Mqtt_publishTelemetry(const RigPoint& pt, float hmiValue) {
  // Payload matches rig.js's telemetry handler: Object.assign(point, payload)
  // then recordSample() — field name must be exactly hmiValue.
  StaticJsonDocument<128> doc;
  doc["hmiValue"] = hmiValue;
  char payload[128];
  size_t n = serializeJson(doc, payload);
  const char* topic = Mqtt_buildTopic(pt.pointId, "telemetry");
  bool ok = mqtt.publish(topic, (const uint8_t*)payload, n, false);
  Debug_printf("Mqtt: publish %s = %s (%s)\n", topic, payload, ok ? "OK" : "FAILED, not connected?");
}

void Mqtt_onMessage(char* topic, byte* payload, unsigned int length) {
  String t(topic);
  String body;
  body.reserve(length);
  for (unsigned int i = 0; i < length; i++) body += (char)payload[i];

  Debug_println("Mqtt: received on " + t + ": " + body);

  StaticJsonDocument<128> doc;
  if (deserializeJson(doc, body)) {
    Debug_errorln("Mqtt: bad JSON on " + t + ": " + body);
    return;
  }

  if (t == "ahu-rig/sim") {
    simEnabled = doc["on"] | false;
    Debug_println(String("Mqtt: SIM ") + (simEnabled ? "ON" : "OFF"));
    return;
  }

  if (t == "ahu-rig/release") {
    Debug_println("Mqtt: RELEASE ALL — zeroing every stimulus point");
    for (size_t i = 0; i < NUM_POINTS; i++) {
      if (Points_isStimulusKind(points[i].kind)) Points_applyCommand(points[i], 0);
    }
    return;
  }

  // ahu-rig/<id>/cmd
  int firstSlash = t.indexOf('/');
  int secondSlash = t.indexOf('/', firstSlash + 1);
  if (secondSlash < 0) return;
  String pointId = t.substring(firstSlash + 1, secondSlash);

  RigPoint* pt = Points_find(pointId);
  if (!pt) {
    Debug_errorln("Mqtt: cmd for unknown pointId '" + pointId + "' — check it matches points[] in 00_Config.ino");
    return;
  }
  if (!Points_isStimulusKind(pt->kind)) {
    Debug_errorln("Mqtt: cmd for '" + pointId + "' rejected — it's a response point, not a stimulus point");
    return;
  }

  float value = doc["value"] | 0.0f;
  Debug_printf("Mqtt: applying command %s = %.2f\n", pointId.c_str(), value);
  Points_applyCommand(*pt, value);

  // Hardware ack -> Node-RED's "AHU Rig - Persistence & Storage Stats" tab
  // forwards this as {type:'io.commanded'} so the dashboard knows the
  // stimulus was actually written, not just optimistically assumed.
  StaticJsonDocument<64> ackDoc;
  ackDoc["value"] = value;
  char ackPayload[64];
  size_t ackLen = serializeJson(ackDoc, ackPayload);
  mqtt.publish(Mqtt_buildTopic(pt->pointId, "cmd/ack"), (const uint8_t*)ackPayload, ackLen, false);
}

void Mqtt_reconnect() {
  Debug_printf("Mqtt: connecting to broker %s:%u as '%s'...\n",
               MQTT_BROKER.toString().c_str(), MQTT_PORT, MQTT_CLIENT_ID);
  // LWT: retained "offline" on ahu-rig/status, cleared to "online" on connect
  if (mqtt.connect(MQTT_CLIENT_ID, "ahu-rig/status", 1, true, "offline")) {
    Debug_println("Mqtt: connected");
    mqtt.publish("ahu-rig/status", "online", true);
    mqtt.publish("ahu-rig/fw-version", FW_VERSION, true);
    mqtt.subscribe("ahu-rig/sim");
    mqtt.subscribe("ahu-rig/release");
    mqtt.subscribe("ahu-rig/+/cmd");
    Debug_println("Mqtt: subscribed to ahu-rig/sim, ahu-rig/release, ahu-rig/+/cmd");
  } else {
    Debug_errorf("Mqtt: connect failed, PubSubClient rc=%d (see PubSubClient.h for the meaning of each code)\n", mqtt.state());
  }
}

void Mqtt_init() {
  Debug_println("Mqtt: configuring broker " + MQTT_BROKER.toString() + ":" + String(MQTT_PORT));
  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  mqtt.setCallback(Mqtt_onMessage);
  mqtt.setBufferSize(512);      // default 256 is tight; 512 gives headroom for large CONNACK/PUBLISH frames
  mqtt.setKeepAlive(60);        // 60 s keepalive — broker won't drop a slow-to-respond client prematurely
  mqtt.setSocketTimeout(15);    // wait up to 15 s for CONNACK before declaring timeout (fixes rc=-4 on WiFi)
}

// Throttled reconnect (once every 5s while disconnected) + the regular
// PubSubClient housekeeping call — one call from loop() covers both.
// 5s gap (up from 2s) ensures the broker has fully cleaned up a stale
// socket from the previous failed attempt before we open a new one.
void Mqtt_maintainConnection() {
  if (!mqtt.connected()) {
    static unsigned long lastAttempt = 0;
    if (millis() - lastAttempt > 5000) {
      lastAttempt = millis();
      Network_selectTransport();  // Ethernet if the link's up, WiFi fallback otherwise — see 05_Network.ino
      Mqtt_reconnect();
    }
  }
  mqtt.loop();
}
