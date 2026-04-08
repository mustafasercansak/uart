import type {
  Scenario,
  ScenarioStep,
  SimulationState,
  RampActionConfig,
  PulseActionConfig,
  RangeActionConfig,
  SetActionConfig,
  InjectErrorConfig,
  FrameProfile,
  RangeConfig,
} from '../types';

// ─────────────────────────────────────────────
// SENARYO ENGINE
// ─────────────────────────────────────────────

export interface ScenarioEngineResult {
  newState: Partial<SimulationState>;
  executedStep?: ScenarioStep;
}

function parseTarget(target: string): { type: 'field' | 'bit'; name: string; subName?: string } {
  if (target.startsWith('field:')) {
    return { type: 'field', name: target.slice(6) };
  }
  if (target.startsWith('bit:')) {
    const parts = target.slice(4).split('.');
    return { type: 'bit', name: parts[0], subName: parts[1] };
  }
  return { type: 'field', name: target };
}

function findFieldId(profile: FrameProfile, name: string): string | null {
  const field = profile.fields.find((f) => f.name === name);
  return field ? field.id : null;
}

function findFieldCurrentValue(state: SimulationState, fieldId: string): number {
  const lastFrame = state.lastFrame;
  if (!lastFrame) return 0;
  const parsedField = lastFrame.fields.find((f) => {
    // We need to reverse-engineer fieldId from name; use override value as fallback
    return false;
  });
  return state.fieldOverrides[fieldId] ?? 0;
}

export function processScenarioStep(
  step: ScenarioStep,
  profile: FrameProfile,
  state: SimulationState,
): ScenarioEngineResult {
  const target = parseTarget(step.target);
  const updates: Partial<SimulationState> = {};

  if (target.type === 'field') {
    const fieldId = findFieldId(profile, target.name);
    if (!fieldId) return { newState: {} };

    switch (step.action) {
      case 'set': {
        const cfg = step.actionConfig as SetActionConfig;
        updates.fieldOverrides = {
          ...state.fieldOverrides,
          [fieldId]: cfg.value,
        };
        break;
      }
      case 'range': {
        const cfg = step.actionConfig as RangeActionConfig;
        // Update the field's range config via a special override mechanism
        // We'll use a fieldOverrides with a sentinel to trigger range re-config
        // For simplicity, we store range overrides in fieldOverrides as a JSON-encoded object
        updates.fieldOverrides = {
          ...state.fieldOverrides,
          [`${fieldId}__range`]: cfg.min,
          [`${fieldId}__range_max`]: cfg.max,
        };
        break;
      }
      case 'ramp': {
        const cfg = step.actionConfig as RampActionConfig;
        const currentValue = state.fieldOverrides[fieldId] ?? 0;
        updates.activeRamps = {
          ...state.activeRamps,
          [fieldId]: {
            from: cfg.from ?? currentValue,
            to: cfg.to,
            startMs: state.elapsedMs,
            durationMs: cfg.durationMs,
            curve: cfg.curve,
          },
        };
        break;
      }
      case 'pulse': {
        const cfg = step.actionConfig as PulseActionConfig;
        const originalValue = state.fieldOverrides[fieldId] ?? 0;
        updates.fieldOverrides = {
          ...state.fieldOverrides,
          [fieldId]: cfg.value,
        };
        updates.activePulses = {
          ...state.activePulses,
          [fieldId]: {
            originalValue,
            revertAtMs: state.elapsedMs + cfg.durationMs,
          },
        };
        break;
      }
      case 'inject_error': {
        const cfg = step.actionConfig as InjectErrorConfig;
        const errors = Array(cfg.count).fill(cfg.errorType);
        updates.pendingErrors = [...state.pendingErrors, ...errors];
        break;
      }
      default:
        break;
    }
  } else if (target.type === 'bit') {
    const fieldId = findFieldId(profile, target.name);
    if (!fieldId || !target.subName) return { newState: {} };

    const bitKey = `${fieldId}.${target.subName}`;

    switch (step.action) {
      case 'set': {
        const cfg = step.actionConfig as SetActionConfig;
        updates.bitOverrides = { ...state.bitOverrides, [bitKey]: cfg.value };
        break;
      }
      case 'toggle': {
        const current = state.bitOverrides[bitKey] ?? 0;
        updates.bitOverrides = { ...state.bitOverrides, [bitKey]: current ? 0 : 1 };
        break;
      }
      case 'pulse': {
        const cfg = step.actionConfig as PulseActionConfig;
        const originalValue = state.bitOverrides[bitKey] ?? 0;
        updates.bitOverrides = { ...state.bitOverrides, [bitKey]: cfg.value };
        updates.activePulses = {
          ...state.activePulses,
          [`bit:${bitKey}`]: {
            originalValue,
            revertAtMs: state.elapsedMs + cfg.durationMs,
          },
        };
        break;
      }
      default:
        break;
    }
  }

  return { newState: updates, executedStep: step };
}

export function tickScenarioEngine(
  scenario: Scenario,
  profile: FrameProfile,
  state: SimulationState,
): { updates: Partial<SimulationState>; executedSteps: ScenarioStep[] } {
  const elapsedMs = state.elapsedMs;
  const updates: Partial<SimulationState> = {};
  const executedSteps: ScenarioStep[] = [];

  // Find steps that should fire at this elapsed time
  for (const step of scenario.steps) {
    const stepMs = step.atMs;
    // Fire step if we just crossed its timestamp
    const prevElapsed = elapsedMs - 50; // approximate previous tick
    if (stepMs >= prevElapsed && stepMs <= elapsedMs) {
      // Check condition if any
      if (step.condition) {
        if (!evaluateCondition(step.condition, state)) continue;
      }
      const result = processScenarioStep(step, profile, state);
      Object.assign(updates, result.newState);
      if (result.executedStep) executedSteps.push(result.executedStep);
    }
  }

  // Process expired pulses
  const updatedPulses = { ...state.activePulses };
  const updatedOverrides = { ...(updates.fieldOverrides ?? state.fieldOverrides) };
  const updatedBitOverrides = { ...(updates.bitOverrides ?? state.bitOverrides) };
  let pulsesChanged = false;

  for (const [key, pulse] of Object.entries(updatedPulses)) {
    if (elapsedMs >= pulse.revertAtMs) {
      if (key.startsWith('bit:')) {
        const bitKey = key.slice(4);
        updatedBitOverrides[bitKey] = pulse.originalValue;
      } else {
        updatedOverrides[key] = pulse.originalValue;
      }
      delete updatedPulses[key];
      pulsesChanged = true;
    }
  }

  if (pulsesChanged) {
    updates.activePulses = updatedPulses;
    updates.fieldOverrides = updatedOverrides;
    updates.bitOverrides = updatedBitOverrides;
  }

  // Clean up completed ramps
  const updatedRamps = { ...(updates.activeRamps ?? state.activeRamps) };
  let rampsChanged = false;
  for (const [fieldId, ramp] of Object.entries(updatedRamps)) {
    if (elapsedMs >= ramp.startMs + ramp.durationMs) {
      // Ramp complete: set final value as override
      updatedOverrides[fieldId] = ramp.to;
      delete updatedRamps[fieldId];
      rampsChanged = true;
    }
  }
  if (rampsChanged) {
    updates.activeRamps = updatedRamps;
    updates.fieldOverrides = updatedOverrides;
  }

  return { updates, executedSteps };
}

function evaluateCondition(
  condition: NonNullable<ScenarioStep['condition']>,
  state: SimulationState,
): boolean {
  if (condition.type === 'random') {
    return Math.random() < (condition.value ?? 0.5);
  }
  if (condition.type === 'elapsed_time') {
    const op = condition.operator ?? '>';
    const val = condition.value ?? 0;
    return compareValues(state.elapsedMs, op, val);
  }
  if (condition.type === 'field_value' && condition.field && state.lastFrame) {
    const field = state.lastFrame.fields.find((f) => f.name === condition.field);
    if (!field) return false;
    const op = condition.operator ?? '==';
    const val = condition.value ?? 0;
    return compareValues(field.decimal, op, val);
  }
  return true;
}

function compareValues(a: number, op: string, b: number): boolean {
  switch (op) {
    case '<': return a < b;
    case '>': return a > b;
    case '==': return a === b;
    case '!=': return a !== b;
    default: return false;
  }
}
