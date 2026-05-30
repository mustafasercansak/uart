export type UDSResponseEncoding = 'ascii' | 'hex' | 'vitals';

export interface UDSDidResponse {
  id: string;
  did: number;
  label: string;
  encoding: UDSResponseEncoding;
  value: string;
  enabled: boolean;
}

export interface UDSDiagnosticConfig {
  testerRequestId: number;
  ecuResponseId: number;
  targetNodeId: number | null;
  autoRespond: boolean;
  blockSize: number;
  stMinMs: number;
  didResponses: UDSDidResponse[];
  dtcCodes: number[];
}

export interface UDSSendRequest {
  requestId: number;
  payload: number[];
}

export const DEFAULT_UDS_DIAGNOSTIC_CONFIG: UDSDiagnosticConfig = {
  testerRequestId: 0x7e0,
  ecuResponseId: 0x7e8,
  targetNodeId: null,
  autoRespond: true,
  blockSize: 0,
  stMinMs: 12,
  didResponses: [
    {
      id: 'vin',
      did: 0xf190,
      label: 'Vehicle Identification Number',
      encoding: 'ascii',
      value: 'MOCKVIN1234567890',
      enabled: true,
    },
    {
      id: 'system-name',
      did: 0xf197,
      label: 'System Name',
      encoding: 'ascii',
      value: 'Symphony ECU',
      enabled: true,
    },
    {
      id: 'heart-rate',
      did: 0xf120,
      label: 'Mock Heart Rate',
      encoding: 'vitals',
      value: 'heartRate',
      enabled: true,
    },
    {
      id: 'spo2',
      did: 0xf121,
      label: 'Mock SpO2',
      encoding: 'vitals',
      value: 'spO2',
      enabled: true,
    },
  ],
  dtcCodes: [0x0a1200, 0x0b0100],
};
