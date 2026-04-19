import type { Parity, StopBits, FrameProfile } from './protocol';
import type { Scenario } from './scenario';
import type { OutputMode, DashboardLayout } from './simulation';
import type { WidgetType } from './field';

export interface SerialConfig {
  portName: string;
  baudRate: number;
  dataBits: number;
  parity: Parity;
  stopBits: StopBits;
}

export interface TcpConfig {
  host: string;
  port: number;
}

export interface OutputConfig {
  mode: OutputMode;
  serial?: SerialConfig;
  tcp?: TcpConfig;
}

export interface SensorTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  profile: Omit<FrameProfile, 'id' | 'createdAt' | 'updatedAt'>;
  scenarios: Array<Omit<Scenario, 'id' | 'profileId' | 'createdAt' | 'updatedAt'>>;
  defaultLayout?: DashboardLayout;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'debug' | 'info' | 'warning' | 'error';
  message: string;
  data?: unknown;
}

export interface GridPanel {
  id: string;
  fieldName: string;
  fieldType: string;
  color: string;
  widgetType: WidgetType;
  config?: unknown;
}
