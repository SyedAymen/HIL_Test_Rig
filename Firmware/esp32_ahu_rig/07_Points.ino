#include "AhuRig.h"

/*
  07_Points.ino
  -------------
  The RigPoint routing layer — looks up points by id and dispatches
  commands to whichever driver actually owns that point (02_Relay.ino or
  04_Modbus.ino). This is the layer that makes 06_Mqtt.ino not need to
  know anything about relays or Modbus directly.
*/

RigPoint* Points_find(const String& pointId) {
  for (size_t i = 0; i < NUM_POINTS; i++) {
    if (pointId.equals(points[i].pointId)) return &points[i];
  }
  return nullptr;
}

bool Points_isStimulusKind(IoKind k) {
  return k == LOCAL_RELAY || k == MODBUS_AO || k == CAREL_COIL || k == CAREL_HOLDING_REG;
}

void Points_applyCommand(RigPoint& pt, float value) {
  switch (pt.kind) {
    case LOCAL_RELAY:
      Debug_printf("Points: %s -> LOCAL_RELAY bit %u\n", pt.pointId, pt.relayBit);
      Relay_set(pt.relayBit, value > 0.5);
      break;
    case MODBUS_AO: {
      uint16_t regVal = (uint16_t)constrain((long)value, 0, 65535);
      Debug_printf("Points: %s -> MODBUS_AO addr %u ch %u\n", pt.pointId, pt.modbusSlaveAddr, pt.modbusChannel);
      Modbus_writeAo(pt.modbusSlaveAddr, pt.modbusChannel, regVal);
      break;
    }
    case CAREL_COIL:
      Debug_printf("Points: %s -> CAREL_COIL idx %u\n", pt.pointId, pt.modbusChannel);
      Carel_writeCoil(pt.modbusChannel, value > 0.5);
      break;
    case CAREL_HOLDING_REG: {
      // carelScale UNVERIFIED — see 08_CarelModbus.ino header
      uint16_t regVal = (uint16_t)constrain((long)(value * pt.carelScale), 0, 65535);
      Debug_printf("Points: %s -> CAREL_HOLDING_REG idx %u = %u raw\n", pt.pointId, pt.modbusChannel, regVal);
      Carel_writeHoldingRegister(pt.modbusChannel, regVal);
      break;
    }
    default:
      Debug_errorf("Points: ignoring command for '%s' — it's response-only, not a stimulus point\n", pt.pointId);
      break;
  }
}
