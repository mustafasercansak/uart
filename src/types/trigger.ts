export type TriggerAction =
  | 'stop_simulation'
  | 'start_recording'
  | 'log_warning'
  | 'inject_error'
  | 'set_field';

export interface Trigger {
  id: string;
  name: string;
  enabled: boolean;
  condition: string;
  action: TriggerAction;
  actionPayload?: string;
  cooldownMs?: number;
  lastTriggeredAt?: number;
}
