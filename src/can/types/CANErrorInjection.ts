export type CANInjectedErrorType = 'crc-corruption' | 'form-error' | 'ack-error' | 'bit-stuffing';

export type CANInjectionTriggerMode = 'one-time' | 'periodic' | 'random';

export interface CANErrorInjectionConfig {
  enabledTypes: Record<CANInjectedErrorType, boolean>;
  triggerMode: CANInjectionTriggerMode;
  periodicEvery: number;
  randomRate: number;
}

export interface CANErrorInjectionStats {
  totalPackets: number;
  successfulPackets: number;
  errorsInjected: number;
}

export interface CANErrorInjectionState {
  config: CANErrorInjectionConfig;
  stats: CANErrorInjectionStats;
  oneTimeArmed: boolean;
}

export const CAN_INJECTED_ERROR_LABELS: Record<CANInjectedErrorType, string> = {
  'crc-corruption': 'CRC Corruption',
  'form-error': 'Form/Framing Error',
  'ack-error': 'ACK Error',
  'bit-stuffing': 'Bit Stuffing Violation',
};

export const CAN_INJECTED_ERROR_LABEL_KEYS: Record<CANInjectedErrorType, string> = {
  'crc-corruption': 'can.errorTypeCrcCorruption',
  'form-error': 'can.errorTypeFormError',
  'ack-error': 'can.errorTypeAckError',
  'bit-stuffing': 'can.errorTypeBitStuffing',
};

export const CAN_INJECTION_TRIGGER_LABEL_KEYS: Record<CANInjectionTriggerMode, string> = {
  'one-time': 'can.triggerModeOneTime',
  periodic: 'can.triggerModePeriodic',
  random: 'can.triggerModeRandom',
};

export const DEFAULT_CAN_ERROR_INJECTION_STATE: CANErrorInjectionState = {
  config: {
    enabledTypes: {
      'crc-corruption': true,
      'form-error': false,
      'ack-error': false,
      'bit-stuffing': false,
    },
    triggerMode: 'one-time',
    periodicEvery: 5,
    randomRate: 20,
  },
  stats: {
    totalPackets: 0,
    successfulPackets: 0,
    errorsInjected: 0,
  },
  oneTimeArmed: false,
};
