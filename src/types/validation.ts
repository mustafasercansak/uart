export interface ValidationTarget {
  id: string;
  fieldName: string;
  expectedMin: number;
  expectedMax: number;
  unit: string;
  description?: string;
}

export interface ValidationEvent {
  id: string;
  timestamp: number;
  type: 'compliance_success' | 'compliance_failure' | 'session_start' | 'session_stop';
  message: string;
  fieldName?: string;
  value?: number;
  targetRange?: [number, number];
}

export interface ValidationSession {
  id: string;
  name: string;
  deviceId: string;
  operator: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: number;
  endTime?: number;
  targets: ValidationTarget[];
  events: ValidationEvent[];
  dataHistory: Array<{ timestamp: number; fields: Record<string, number> }>;
  complianceScore: number;
}
