import { createContext } from 'react';
import type { SimulationContextType } from '../types';

export const SimulationContext = createContext<SimulationContextType | undefined>(undefined);
