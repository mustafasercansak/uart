import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ScriptablePeripheral } from '../types';
import { v4 as uuidv4 } from 'uuid';

export interface PeripheralState {
  peripherals: ScriptablePeripheral[];
  activePeripheralId: string | null;
  
  // Actions
  addPeripheral: (peripheral: Omit<ScriptablePeripheral, 'id' | 'isActive'>) => void;
  updatePeripheral: (id: string, updates: Partial<ScriptablePeripheral>) => void;
  deletePeripheral: (id: string) => void;
  togglePeripheral: (id: string) => void;
  setActivePeripheral: (id: string | null) => void;
  logExecution: (id: string, execution: NonNullable<ScriptablePeripheral['lastExecution']>) => void;
}

export const usePeripheralStore = create<PeripheralState>()(
  persist(
    (set) => ({
      peripherals: [],
      activePeripheralId: null,

      addPeripheral: (p) => set((state) => ({
        peripherals: [
          ...state.peripherals,
          { ...p, id: uuidv4(), isActive: true }
        ]
      })),

      updatePeripheral: (id, updates) => set((state) => ({
        peripherals: state.peripherals.map((p) => 
          p.id === id ? { ...p, ...updates } : p
        )
      })),

      deletePeripheral: (id) => set((state) => ({
        peripherals: state.peripherals.filter((p) => p.id !== id),
        activePeripheralId: state.activePeripheralId === id ? null : state.activePeripheralId
      })),

      togglePeripheral: (id) => set((state) => ({
        peripherals: state.peripherals.map((p) => 
          p.id === id ? { ...p, isActive: !p.isActive } : p
        )
      })),

      setActivePeripheral: (id) => set({ activePeripheralId: id }),

      logExecution: (id, execution) => set((state) => ({
        peripherals: state.peripherals.map((p) => 
          p.id === id ? { ...p, lastExecution: execution } : p
        )
      })),
    }),
    {
      name: 'uart_peripherals_storage',
    }
  )
);
