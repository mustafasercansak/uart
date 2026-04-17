import type { Trigger, GeneratedFrame, SimulationState, TriggerAction } from '../types';

export interface TriggerResult {
  triggered: boolean;
  action?: TriggerAction;
  payload?: string;
  triggerName: string;
}

/**
 * Trigger Engine evaluates conditions against live frames and state.
 * Uses a safe evaluation method to prevent code injection issues.
 */
export function evaluateTriggers(
  triggers: Trigger[],
  frame: GeneratedFrame,
  state: SimulationState
): TriggerResult[] {
  const results: TriggerResult[] = [];
  const now = Date.now();

  // Create a context for expression evaluation
  const context: Record<string, number> = {};
  
  // 1. Map frame fields to context
  frame.fields.forEach(f => {
    context[f.name] = f.decimal;
  });

  // 2. Map basic state values
  context['frameCount'] = frame.frameNumber;
  context['elapsedMs'] = state.elapsedMs;
  context['errorCount'] = state.errorCount;

  for (const trigger of triggers) {
    if (!trigger.enabled) continue;

    // Cooldown check
    if (trigger.cooldownMs && trigger.lastTriggeredAt && (now - trigger.lastTriggeredAt < trigger.cooldownMs)) {
      continue;
    }

    try {
      // Evaluate condition (Simple JS expression)
      // We wrap it in a function for speed and safety
      const keys = Object.keys(context);
      const vals = Object.values(context);
      const evalFn = new Function(...keys, `return ${trigger.condition};`);
      
      const isMet = evalFn(...vals);

      if (isMet) {
        results.push({
          triggered: true,
          action: trigger.action,
          payload: trigger.actionPayload,
          triggerName: trigger.name
        });
        
        // Update last triggered time internally 
        // (The caller/engine must sync this back to state)
        trigger.lastTriggeredAt = now;
      }
    } catch (err) {
      console.error(`[TRIGGER ERR] Condition "${trigger.condition}" eval failed:`, err);
    }
  }

  return results;
}
