export interface ResponderAction {
  type: 'send_raw' | 'set_field' | 'inject_error' | 'pause' | 'stop';
  payload: string;
  delayMs?: number;
}

export interface ResponderRule {
  id: string;
  name: string;
  enabled: boolean;
  pattern: string;
  patternType: 'hex' | 'ascii';
  actions: ResponderAction[];
  cooldownMs?: number;
  script?: string;
}

export interface ConversationEntry {
  id: string;
  timestamp: number;
  type: 'rx' | 'tx' | 'match' | 'error';
  rawHex: string;
  details?: string;
  linkedId?: string;
  latencyMs?: number;
  status?: 'success' | 'fail' | 'warning';
  fields?: import('./field').ParsedField[];
}

export interface Exchange {
  id: string;
  startTime: number;
  tx?: ConversationEntry;
  rx?: ConversationEntry;
  match?: ConversationEntry;
  latencyMs?: number;
  isLoopbackMatch?: boolean;
  status?: 'pending' | 'done';
}
