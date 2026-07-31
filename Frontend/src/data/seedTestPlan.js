// This is what an uploaded test plan looks like once parsed from the FAT
// spreadsheet. Nothing downstream (graph, spotlight, tabs, pass %) assumes
// AI has 19 points or that there are exactly 4 sections — change this file
// and the whole dashboard reflows. min/max come straight from the sheet's
// "Sensor/Sw Min/Max" columns and bound the injection slider for stimulus points.

function ai(id, terminal, label, unit, min, max, acceptableValue, status = {}) {
  return {
    id, terminal, label,
    role: 'stimulus', kind: 'analog',
    unit, min, max,
    acceptableValue, tolerancePercent: 5,
    commandedValue: null, controllerValue: null, hmiValue: null,
    source: 'manual', relatedPoints: [],
    ...status
  }
}

function ao(id, terminal, label, unit, min, max, acceptableValue, status = {}) {
  return {
    id, terminal, label,
    role: 'response', kind: 'analog',
    unit, min, max,
    acceptableValue, tolerancePercent: 5,
    commandedValue: null, controllerValue: null, hmiValue: null,
    source: null, relatedPoints: [],
    ...status
  }
}

function di(id, terminal, label, status = {}) {
  return {
    id, terminal, label, role: 'stimulus', kind: 'digital',
    unit: null, acceptableValue: null, commandedValue: null,
    hmiValue: null, controllerValue: null, source: 'manual',
    relatedPoints: [], ...status
  }
}

function doPoint(id, terminal, label, status = {}) {
  return {
    id, terminal, label, role: 'response', kind: 'digital',
    unit: null, acceptableValue: null, commandedValue: null,
    hmiValue: null, confirmed: null, source: null,
    relatedPoints: [], ...status
  }
}

export function seedTestPlan() {
  return {
    job: {
      name: 'Controller with Three Module',
      drawingNo: '-',
      ahuSlNo: '-',
      panel: 'CONTROLLER WITH EXPANSION MODULE'
    },
    sections: [
      {
        id: 'AI',
        label: 'Analog Inputs',
        points: [
          ai('DPT-1', 'U1', 'DPT-1', 'Pa', 0, 1000, 100, { hmiValue: 101, controllerValue: 100 }),
          ai('DPT-2', 'U2', 'DPT-2', 'Pa', 0, 1000, 100, {
            commandedValue: 480, hmiValue: 478, controllerValue: null, source: 'sequence:filtration-qa#2',
            relatedPoints: ['EC-FAN']
          }),
          ai('DPT-3', 'U3', 'DPT-3', 'Pa', 0, 1000, 100, { hmiValue: 101, controllerValue: 100 }),
          ai('RM1-PRESS', 'E1U4', 'Room-01 Pressure Sensor', 'Pa', 0, 1000, 100, { hmiValue: 99, controllerValue: 100 }),
          ai('RM2-PRESS', 'E1U5', 'Room-02 Pressure Sensor', 'Pa', 0, 1000, 100, { hmiValue: 100, controllerValue: 100 }),
          ai('RM3-PRESS', 'E2U5', 'Room-03 Pressure Sensor', 'Pa', 0, 1000, 100, {
            commandedValue: 100, hmiValue: 61, controllerValue: 60
          }),
          ai('RM4-PRESS', 'E2U6', 'Room-04 Pressure Sensor', 'Pa', 0, 1000, 100, { hmiValue: 100, controllerValue: 100 }),
          ai('RM1-TEMP', 'U8', 'Master Room-01 Temperature', '°C', 0, 50, 5, { hmiValue: 5.1, controllerValue: 5.0 }),
          ai('RM2-TEMP', 'E1U2', 'Master Room-02 Temperature', '°C', 0, 50, 5, { hmiValue: 4.9, controllerValue: 5.0 }),
          ai('RM3-TEMP', 'E2U1', 'Master Room-03 Temperature', '°C', 0, 50, 5, { hmiValue: 5.0, controllerValue: 5.0 }),
          ai('RM4-TEMP', 'E2U3', 'Master Room-04 Temperature', '°C', 0, 50, 5, { hmiValue: 5.0, controllerValue: null }),
          ai('CLG-TEMP', 'U9', 'After Cooling Coil Temperature', '°C', 0, 50, 5, { hmiValue: 5.0, controllerValue: 5.0 }),
          ai('HTR-TEMP-SNS', 'E1U6', 'After Heater Temperature Sensor', '°C', 0, 50, 5, { hmiValue: 5.1, controllerValue: 5.0 }),
          ai('RAT', 'U4', 'RAT', '°C', 0, 50, 5, { hmiValue: 5.0, controllerValue: 5.0 }),
          ai('RAH', 'U5', 'RAH', '%', 0, 100, 10, {}),
          ai('RM1-HUM', 'E1U1', 'Master Room-01 Humidity', '%', 0, 100, 10, { hmiValue: 10, controllerValue: 10 }),
          ai('RM2-HUM', 'E1U3', 'Master Room-02 Humidity', '%', 0, 100, 10, { hmiValue: 10, controllerValue: 10 }),
          ai('RM3-HUM', 'E2U2', 'Master Room-03 Humidity', '%', 0, 100, 10, { hmiValue: 10, controllerValue: 10 }),
          ai('RM4-HUM', 'E2U4', 'Master Room-04 Humidity', '%', 0, 100, 10, {})
        ]
      },
      {
        id: 'AO',
        label: 'Analog Outputs',
        points: [
          ao('EC-FAN', 'Y1', 'EC Fan Control', '%', 0, 100, 100, { hmiValue: 62 }),
          ao('CHW-VALVE', 'Y2', 'CHW Valve Control', '%', 0, 100, 100, {}),
          ao('HEATER-OUT', 'E1U7', 'Heater Control', '%', 0, 100, 100, { hmiValue: 100 })
        ]
      },
      {
        id: 'DI',
        label: 'Digital Inputs',
        points: [
          di('AUTO-MAN', 'ID1', 'Auto/Manual Status', { hmiValue: true }),
          di('FIRE-TRIP', 'U10', 'Fire Trip', { commandedValue: false, hmiValue: false }),
          di('DAMPER', 'U6', 'Fire Damper Status', { commandedValue: true, hmiValue: null }),
          di('AHU-START', 'ID2', 'AHU Start/Stop Status', { commandedValue: true, hmiValue: true }),
          di('EC-TRIP', 'U7', 'EC Fan Trip Status', { commandedValue: false, hmiValue: false }),
          di('HTR-ON', 'E1,U9', 'Heater ON/OFF Status', { commandedValue: true, hmiValue: true }),
          di('HUM-ON', 'E1,U8', 'Humidifier ON/OFF Status', { commandedValue: false, hmiValue: true }),
          di('HTR-TRIP', 'E1,U10', 'Heater Trip Status', { commandedValue: false, hmiValue: false })
        ]
      },
      {
        id: 'DO',
        label: 'Digital Outputs / Interlocks',
        points: [
          doPoint('CONTACTOR', 'NO1,C1/2', 'Contactor ON/OFF Command — Relay-02', { confirmed: true }),
          doPoint('HEATER-CMD', 'NO2,C1/2', 'Heater ON/OFF Command — Relay-03', { confirmed: null }),
          doPoint('HUMID-CMD', 'NO3,C2/3/4', 'Humidifier ON/OFF Command — Relay-04', { confirmed: null })
        ]
      }
    ]
  }
}
