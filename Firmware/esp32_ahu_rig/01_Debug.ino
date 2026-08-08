#include "AhuRig.h"

/*
  01_Debug.ino
  ------------
  Verbose logging layer. Every other module calls Debug_println()/
  Debug_printf() at each meaningful step (init started, init succeeded,
  a value was read/written, a message was sent/received) so you can watch
  the whole boot and every subsequent action scroll by in Serial Monitor.

  Toggle at runtime by typing into Serial Monitor (line ending: Newline):
    debug on       -> verbose logging on
    debug off      -> verbose logging off
    debug status   -> prints current state

  Debug_errorln()/Debug_errorf() are a SEPARATE, always-on channel — real
  failures (W5500 not found, MQTT connect failed, Modbus read/write
  failed) print regardless of the debug flag, since those matter even
  once you've quieted the routine logging down.

  Default state (see debugEnabled in 00_Config.ino) is ON, since this is
  exactly the tool you want while first bringing the board up. Turn it
  off once things are confirmed working and the telemetry-cycle chatter
  gets in the way of reading anything else on the Serial Monitor.
*/

void Debug_init() {
  Serial.println("========================================");
  Serial.printf("AHU Rig firmware v%s\n", FW_VERSION);
  Serial.print("Verbose debug logging is currently: ");
  Serial.println(debugEnabled ? "ENABLED" : "DISABLED");
  Serial.println("Type into Serial Monitor to control it:");
  Serial.println("  debug on   | debug off   | debug status");
  Serial.println("========================================");
}

void Debug_pollSerialCommand() {
  if (!Serial.available()) return;

  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  cmd.toLowerCase();
  if (cmd.length() == 0) return;

  if (cmd == "debug on") {
    debugEnabled = true;
    Serial.println("[DEBUG] Verbose logging ENABLED");
  } else if (cmd == "debug off") {
    Serial.println("[DEBUG] Verbose logging DISABLED");
    debugEnabled = false;
  } else if (cmd == "debug status") {
    Serial.print("[DEBUG] Verbose logging is currently: ");
    Serial.println(debugEnabled ? "ENABLED" : "DISABLED");
  } else {
    Serial.println("[DEBUG] Unknown command. Try: debug on | debug off | debug status");
  }
}

void Debug_println(const String& msg) {
  if (!debugEnabled) return;
  Serial.print("[DEBUG] ");
  Serial.println(msg);
}

void Debug_printf(const char* fmt, ...) {
  if (!debugEnabled) return;
  char buf[192];
  va_list args;
  va_start(args, fmt);
  vsnprintf(buf, sizeof(buf), fmt, args);
  va_end(args);
  Serial.print("[DEBUG] ");
  Serial.print(buf);
}

void Debug_errorln(const String& msg) {
  Serial.print("[ERROR] ");
  Serial.println(msg);
}

void Debug_errorf(const char* fmt, ...) {
  char buf[192];
  va_list args;
  va_start(args, fmt);
  vsnprintf(buf, sizeof(buf), fmt, args);
  va_end(args);
  Serial.print("[ERROR] ");
  Serial.print(buf);
}
