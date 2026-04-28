export type AutomationStepType = 'send' | 'wait' | 'expect';

export interface AutomationStep {
  id: string;
  type: AutomationStepType;
  payload: string;
  status: 'idle' | 'running' | 'success' | 'fail';
  result?: string;
}

export interface AutomationSequence {
  id: string;
  name: string;
  description?: string;
  steps: AutomationStep[];
  createdAt: string;
  updatedAt: string;
}
