import type { CANNode, CANNodeState } from '../types/CANNode';

/**
 * ISO 11898-1 error state machine thresholds.
 * Error Active  → Error Passive when TEC > 127 or REC > 127
 * Error Passive → Bus-Off       when TEC > 255
 * Bus-Off       → Error Active  after 128 × 11 recessive bits (simulated as a timer)
 */
const TEC_ERROR_PASSIVE_THRESHOLD = 128;
const TEC_BUS_OFF_THRESHOLD = 256;
const REC_ERROR_PASSIVE_THRESHOLD = 128;

export interface ErrorCounterDelta {
  tecDelta: number;
  recDelta: number;
}

/** Determine the new node state based on updated error counters. */
export function computeNodeState(tec: number, rec: number): CANNodeState {
  if (tec >= TEC_BUS_OFF_THRESHOLD) return 'bus-off';
  if (tec >= TEC_ERROR_PASSIVE_THRESHOLD || rec >= REC_ERROR_PASSIVE_THRESHOLD) return 'error-passive';
  return 'error-active';
}

/** Apply a transmit error to a node and return the updated node. */
export function applyTransmitError(node: CANNode): CANNode {
  // ISO 11898-1 §6.12: transmit error increments TEC by 8
  const tec = Math.min(node.txErrorCounter + 8, 255);
  const state = computeNodeState(tec, node.rxErrorCounter);
  return { ...node, txErrorCounter: tec, state };
}

/** Apply a receive error to a node and return the updated node. */
export function applyReceiveError(node: CANNode): CANNode {
  // ISO 11898-1: receive error increments REC by 1
  const rec = Math.min(node.rxErrorCounter + 1, 127);
  const state = computeNodeState(node.txErrorCounter, rec);
  return { ...node, rxErrorCounter: rec, state };
}

/** Apply successful transmission — decrement TEC by 1 (min 0). */
export function applySuccessfulTx(node: CANNode): CANNode {
  const tec = Math.max(node.txErrorCounter - 1, 0);
  const state = computeNodeState(tec, node.rxErrorCounter);
  return { ...node, txErrorCounter: tec, state };
}

/** Apply successful reception — decrement REC by 1 (min 0). */
export function applySuccessfulRx(node: CANNode): CANNode {
  const rec = Math.max(node.rxErrorCounter - 1, 0);
  const state = computeNodeState(node.txErrorCounter, rec);
  return { ...node, rxErrorCounter: rec, state };
}

/** Attempt Bus-Off recovery. Node re-enters initializing after 128×11 recessive bits. */
export function recoverBusOff(node: CANNode): CANNode {
  if (node.state !== 'bus-off') return node;
  return {
    ...node,
    txErrorCounter: 0,
    rxErrorCounter: 0,
    state: 'error-active',
    nmtState: 'initializing',
  };
}
