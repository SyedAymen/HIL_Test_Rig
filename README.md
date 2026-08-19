# AHU IoT Test Rig (HIL Test System)

An integrated Hardware-In-the-Loop (HIL) automated testing framework for Air Handling Unit (AHU) controllers. This system combines physical hardware control (ESP32-S3 + Modbus RTU I/O), MQTT telemetry, a Node-RED orchestration backend, and a Vue 3 touchscreen frontend dashboard.

---

## 🏗 System Architecture

```
┌───────────────────────────┐         WebSocket        ┌───────────────────────────┐
│     Frontend (Vue 3)      │ <──────────────────────> │    Node-RED Orchestrator  │
│   7" Touchscreen HMI      │                          │    (flows.json)           │
└───────────────────────────┘                          └─────────────┬─────────────┘
                                                                     │ MQTT
                                                                     ▼
┌───────────────────────────┐          MQTT            ┌───────────────────────────┐
│  ESP32-S3 Rig Firmware    │ <──────────────────────> │     Aedes MQTT Broker     │
│  Relays, DI, Modbus AI/AO │                          │     (Node.js)             │
└───────────────────────────┘                          └───────────────────────────┘
```

---

## 📁 Repository Structure

```
HIL_Test_Rig/
├── Firmware/
│   └── esp32_ahu_rig/        # Arduino/C++ firmware for ESP32-S3 test rig hardware
│       ├── AhuRig.h           # Hardware definitions & pin mappings
│       ├── esp32_ahu_rig.ino  # Core setup and telemetry loop
│       └── stage2/            # Advanced Watchdog & OTA features
├── Frontend/                 # Vue 3 + Vite touchscreen dashboard UI
│   ├── src/                   # Components, Pinia store, WebSocket integration & simulator
│   └── package.json
├── node-red/                 # Node-RED flows and static settings
│   ├── flows.json             # Orchestration flows for MQTT/WS routing
│   └── settings-static-snippet.js
└── aedes-broker/             # Lightweight Node.js Aedes MQTT broker
    ├── broker.js
    └── package.json
```

---

## 🚀 Quick Start Overview

### 1. MQTT Broker (`aedes-broker`)
- Install dependencies and start the Node.js process inside `aedes-broker`.
- Runs a local MQTT broker on port `1883`.

### 2. Frontend Dashboard (`Frontend`)
- Install Node dependencies inside `Frontend`.
- Set up local environment variables (pointing `VITE_WS_URL` to your Node-RED WebSocket endpoint).
- Launch the Vite development server or build for production.

### 3. ESP32 Firmware (`Firmware/esp32_ahu_rig`)
1. Open `Firmware/esp32_ahu_rig` directory in Arduino IDE.
2. Edit network and MQTT parameters in `00_Config.ino` (`WIFI_SSID`, `WIFI_PASSWORD`, `MQTT_BROKER`, static IP setup).
3. Install required Arduino libraries (`PubSubClient`, `ArduinoJson`, `ModbusMaster`).
4. Select board **ESP32S3 Dev Module** and flash via USB-C.

### 4. Node-RED (`node-red`)
Import `node-red/flows.json` into your Node-RED instance to handle communication between the ESP32 hardware node, MQTT broker, and Frontend WebSocket.

---

## 🔌 Hardware Overview

- **Controller Board:** Waveshare ESP32-S3-ETH-8DI-8RO-C (W5500 Ethernet, 8 Digital Inputs, 8 Relay Outputs via TCA9554).
- **Analog I/O Modules:** External 8-Channel Modbus RTU Analog Input/Output modules over RS485 (UART1 on GPIO43/44).
- **Primary Connectivity:** W5500 Ethernet with automatic Wi-Fi fallback.

---

## 🛠 Tech Stack

- **Firmware:** ESP32 C++ / Arduino Framework, Modbus RTU, PubSubClient, ArduinoJson
- **Backend Orchestration:** Node-RED, Node.js, Aedes MQTT Broker
- **Frontend UI:** Vue 3, Pinia, Tailwind CSS, Vite
