import type { CANBusState, CANLogEntry, CANFaultEvent } from '../types/CANBusState';
import type { CANFrame, CANArbitrationEvent } from '../types/CANFrame';
import type { CANNode } from '../types/CANNode';
import { DEFAULT_CAN_ERROR_INJECTION_STATE } from '../types/CANErrorInjection';

const MAX_RECENT_FRAMES = 200;
const MAX_LOG_ENTRIES = 500;
const MAX_ARBITRATION_EVENTS = 100;

export const INITIAL_CAN_STATE: CANBusState = {
  status: 'stopped',
  outputMode: 'log',
  serialConnected: false,
  networkConnected: false,
  isRecording: false,
  recordedFrames: [],
  baudRate: 500,
  nodes: [],
  recentFrames: [],
  busLoadPercent: 0,
  frameCount: 0,
  errorCount: 0,
  framesPerSecond: 0,
  arbitrationEvents: [],
  startedAt: null,
  elapsedMs: 0,
  logEntries: [],
  faultEvents: [],
  selectedNodeId: null,
  selectedFrameUid: null,
  displayFilter: '',
  showArbitrationEvents: true,
  showErrorFrames: true,
  errorInjection: DEFAULT_CAN_ERROR_INJECTION_STATE,
};

export type CANAction =
  | { type: 'CAN_SET_STATUS'; status: CANBusState['status'] }
  | { type: 'CAN_ADD_FRAME'; frame: CANFrame }
  | { type: 'CAN_ADD_ARBITRATION'; event: CANArbitrationEvent }
  | { type: 'CAN_ADD_LOG'; entry: CANLogEntry }
  | { type: 'CAN_ADD_FAULT_EVENT'; event: CANFaultEvent }
  | { type: 'CAN_SET_NODES'; nodes: CANNode[] }
  | { type: 'CAN_PATCH_STATE'; patch: Partial<CANBusState> }
  | { type: 'CAN_SELECT_NODE'; nodeId: number | null }
  | { type: 'CAN_SELECT_FRAME'; uid: string | null }
  | { type: 'CAN_SET_FILTER'; filter: string }
  | { type: 'CAN_TOGGLE_ARBITRATION_DISPLAY' }
  | { type: 'CAN_TOGGLE_ERROR_DISPLAY' }
  | { type: 'CAN_CLEAR_FRAMES' }
  | { type: 'CAN_SET_BAUD_RATE'; baudRate: CANBusState['baudRate'] }
  | { type: 'CAN_SET_OUTPUT_MODE'; mode: CANBusState['outputMode'] }
  | { type: 'CAN_SET_SERIAL_CONNECTED'; connected: boolean }
  | { type: 'CAN_SET_NETWORK_CONNECTED'; connected: boolean }
  | { type: 'CAN_SET_RECORDING'; isRecording: boolean }
  | { type: 'CAN_CLEAR_RECORDING' };

export function canReducer(state: CANBusState, action: CANAction): CANBusState {
  switch (action.type) {
    case 'CAN_SET_STATUS':
      return { ...state, status: action.status };

    case 'CAN_ADD_FRAME':
      return {
        ...state,
        recentFrames: [action.frame, ...state.recentFrames].slice(0, MAX_RECENT_FRAMES),
        frameCount: state.frameCount + 1,
        errorCount: action.frame.errors.length > 0 ? state.errorCount + 1 : state.errorCount,
        recordedFrames: state.isRecording ? [...state.recordedFrames, action.frame] : state.recordedFrames,
      };

    case 'CAN_ADD_ARBITRATION':
      return {
        ...state,
        arbitrationEvents: [...state.arbitrationEvents, action.event].slice(-MAX_ARBITRATION_EVENTS),
      };

    case 'CAN_ADD_LOG':
      return {
        ...state,
        logEntries: [...state.logEntries, action.entry].slice(-MAX_LOG_ENTRIES),
      };

    case 'CAN_ADD_FAULT_EVENT':
      return {
        ...state,
        faultEvents: [...state.faultEvents, action.event].slice(-200),
      };

    case 'CAN_SET_NODES':
      return { ...state, nodes: action.nodes };

    case 'CAN_PATCH_STATE':
      return { ...state, ...action.patch };

    case 'CAN_SELECT_NODE':
      return { ...state, selectedNodeId: action.nodeId };

    case 'CAN_SELECT_FRAME':
      return { ...state, selectedFrameUid: action.uid };

    case 'CAN_SET_FILTER':
      return { ...state, displayFilter: action.filter };

    case 'CAN_TOGGLE_ARBITRATION_DISPLAY':
      return { ...state, showArbitrationEvents: !state.showArbitrationEvents };

    case 'CAN_TOGGLE_ERROR_DISPLAY':
      return { ...state, showErrorFrames: !state.showErrorFrames };

    case 'CAN_CLEAR_FRAMES':
      return { ...state, recentFrames: [], frameCount: 0, errorCount: 0, arbitrationEvents: [] };

    case 'CAN_SET_BAUD_RATE':
      return { ...state, baudRate: action.baudRate };

    case 'CAN_SET_OUTPUT_MODE':
      return { ...state, outputMode: action.mode };

    case 'CAN_SET_SERIAL_CONNECTED':
      return { ...state, serialConnected: action.connected };

    case 'CAN_SET_NETWORK_CONNECTED':
      return { ...state, networkConnected: action.connected };

    case 'CAN_SET_RECORDING':
      return { ...state, isRecording: action.isRecording };

    case 'CAN_CLEAR_RECORDING':
      return { ...state, recordedFrames: [] };

    default:
      return state;
  }
}
