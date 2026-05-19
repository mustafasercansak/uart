/**
 * CAN Bus Simulation Worker
 * Runs CANSimulationEngine in an isolated thread.
 * Main thread sends commands via postMessage; worker posts events back.
 */

import { CANSimulationEngine } from '../engines/CANSimulationEngine';
import { INITIAL_CAN_STATE } from '../store/canReducer';
import type { CANNode, CANFaultType } from '../types/CANNode';
import type { CANBaudRate } from '../types/CANBusState';
import type { CANErrorInjectionConfig } from '../types/CANErrorInjection';
import type { UDSDiagnosticConfig } from '../types/UDS';

const engine = new CANSimulationEngine(structuredClone(INITIAL_CAN_STATE));

engine.onFrame = (frame) => {
  self.postMessage({ type: 'CAN_FRAME', frame });
};

engine.onArbitration = (event) => {
  self.postMessage({ type: 'CAN_ARBITRATION', event });
};

engine.onLog = (entry) => {
  self.postMessage({ type: 'CAN_LOG', entry });
};

engine.onStateUpdate = (patch) => {
  self.postMessage({ type: 'CAN_STATE_UPDATE', patch });
};

engine.onFaultEvent = (event) => {
  self.postMessage({ type: 'CAN_FAULT_EVENT', event });
};

self.onmessage = (event: MessageEvent) => {
  const msg = event.data;

  switch (msg.type) {
    case 'CAN_START':
      engine.start();
      break;

    case 'CAN_STOP':
      engine.stop();
      break;

    case 'CAN_CLEAR_FRAMES':
      engine.clearFrames();
      break;

    case 'CAN_PAUSE':
      engine.pause();
      break;

    case 'CAN_RESUME':
      engine.resume();
      break;

    case 'CAN_ADD_NODE':
      engine.addNode(msg.node as Parameters<typeof engine.addNode>[0]);
      break;

    case 'CAN_REMOVE_NODE':
      engine.removeNode(msg.nodeId as number);
      break;

    case 'CAN_UPDATE_NODE':
      engine.updateNode(msg.nodeId as number, msg.patch as Partial<CANNode>);
      break;

    case 'CAN_SET_BAUD_RATE':
      engine.setBaudRate(msg.baudRate as CANBaudRate);
      break;

    case 'CAN_GET_STATE':
      self.postMessage({ type: 'CAN_FULL_STATE', state: engine.getState() });
      break;

    case 'CAN_INJECT_FAULT':
      engine.injectFault(msg.nodeId as number, msg.fault as CANFaultType);
      break;

    case 'CAN_RECOVER_NODE':
      engine.recoverNode(msg.nodeId as number);
      break;

    case 'CAN_SEND_FRAME':
      engine.sendCustomFrame(msg.arbitrationId as number, msg.data as number[]);
      break;

    case 'CAN_SEND_UDS_REQUEST':
      engine.sendUDSRequest(msg.requestId as number, msg.payload as number[]);
      break;

    case 'CAN_SET_UDS_CONFIG':
      engine.setUDSConfig(msg.config as UDSDiagnosticConfig);
      break;

    case 'CAN_SET_ERROR_INJECTION_CONFIG':
      engine.setErrorInjectionConfig(msg.config as CANErrorInjectionConfig);
      break;

    case 'CAN_ARM_ERROR_INJECTION':
      engine.armOneTimeErrorInjection();
      break;
  }
};
