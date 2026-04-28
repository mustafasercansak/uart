import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  Terminal, 
  Layout, 
  Settings, 
  HelpCircle, 
  Zap, 
  Activity,
  Play,
  Pause,
  Square,
  AlertOctagon,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { useSimulation } from '../../hooks/useSimulation';

interface Command {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: string;
  action: () => void;
  shortcut?: string;
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const { 
    state, 
    start, stop, pause, resume, 
    injectError, setAnalyzerMode
  } = useSimulation();

  const commands: Command[] = [
    // Navigation
    { id: 'nav-dash', name: 'Dashboard', description: 'Go to simulation dashboard', category: 'Navigation', icon: <Layout size={16} />, action: () => navigate('/') },
    { id: 'nav-profiles', name: 'Profile Editor', description: 'Manage frame structures', category: 'Navigation', icon: <Settings size={16} />, action: () => navigate('/profiles') },
    { id: 'nav-scenarios', name: 'Scenario Editor', description: 'Manage simulation scenarios', category: 'Navigation', icon: <Activity size={16} />, action: () => navigate('/scenarios') },
    { id: 'nav-help', name: 'Documentation', description: 'View help and guides', category: 'Navigation', icon: <HelpCircle size={16} />, action: () => navigate('/help') },
    
    // Actions
    { id: 'act-start', name: 'Start Simulation', description: 'Broadcast UART data', category: 'Simulation', icon: <Play size={16} className="text-emerald-400" />, action: () => {
        const stored = localStorage.getItem('uart_profiles');
        let profiles = [];
        if (stored) { try { profiles = JSON.parse(stored); } catch(_e) { /* Ignore parse errors */ } }
        const profile = profiles.find((p: { id: string }) => p.id === state.profileId) || profiles[0];
        if (profile) start(profile, null, state.outputMode);
    }, shortcut: 'S' },
    { id: 'act-pause', name: 'Pause Simulation', description: 'Freeze all data streams', category: 'Simulation', icon: <Pause size={16} className="text-amber-400" />, action: () => pause(), shortcut: 'P' },
    { id: 'act-resume', name: 'Resume Simulation', description: 'Continue transmission', category: 'Simulation', icon: <Play size={16} className="text-emerald-400" />, action: () => {
        const stored = localStorage.getItem('uart_profiles');
        let profiles = [];
        if (stored) { try { profiles = JSON.parse(stored); } catch(_e) { /* Ignore parse errors */ } }
        const profile = profiles.find((p: { id: string }) => p.id === state.profileId);
        if (profile) resume(profile, null);
    } },
    { id: 'act-stop', name: 'Stop Simulation', description: 'Cease all transmission', category: 'Simulation', icon: <Square size={16} className="text-rose-400" />, action: () => stop(), shortcut: 'Esc' },
    
    // Config
    { id: 'cfg-pro', name: 'Toggle Pro Mode', description: 'Switch between Standard and Diagnostic mode', category: 'Configuration', icon: <Terminal size={16} />, action: () => setAnalyzerMode(!state.analyzerMode) },

    // Faults
    { id: 'flt-checksum', name: 'Inject Checksum Error', description: 'Corrupt the next packet CRC', category: 'Fault Injection', icon: <Zap size={16} className="text-rose-500" />, action: () => injectError('corrupt_checksum') },
    { id: 'flt-sync', name: 'Inject Sync Break', description: 'Corrupt start/stop bytes', category: 'Fault Injection', icon: <AlertOctagon size={16} className="text-orange-500" />, action: () => injectError('wrong_sync') },
  ];

  const filteredCommands = commands.filter(cmd => 
    cmd.name.toLowerCase().includes(query.toLowerCase()) ||
    cmd.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => {
          if (!prev) {
            setQuery('');
            setSelectedIndex(0);
          }
          return !prev;
        });
      }
      if (e.key === 'Escape') setIsOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
        setIsOpen(false);
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998]"
          />
          <div className="fixed inset-0 flex items-start justify-center pt-[15vh] z-[9999] pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              className="w-full max-w-2xl glass-panel rounded-2xl shadow-2xl overflow-hidden pointer-events-auto border border-white/10"
              onKeyDown={handleKeyDown}
            >
              <div className="flex items-center px-4 py-3 border-b border-white/5 bg-white/5">
                <Search size={20} className="text-gray-400 mr-3" />
                <input 
                  autoFocus
                  className="bg-transparent border-none outline-none text-white w-full font-mono text-sm placeholder:text-gray-500"
                  placeholder="Seach commands, tools or diagnostics..."
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
                <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded border border-white/10 bg-white/5 text-[10px] font-mono text-gray-500">
                  ESC
                </kbd>
              </div>

              <div className="max-h-[60vh] overflow-y-auto custom-scrollbar p-2">
                {filteredCommands.length === 0 ? (
                  <div className="px-4 py-12 text-center text-gray-500">
                    <Terminal size={32} className="mx-auto mb-3 opacity-20" />
                    <p className="text-sm">No commands found for "{query}"</p>
                  </div>
                ) : (
                  <div className="space-y-4 pb-2">
                    {/* Groups by category would be better but let's keep it simple for now */}
                    {filteredCommands.map((cmd, index) => (
                      <div 
                        key={cmd.id}
                        onMouseEnter={() => setSelectedIndex(index)}
                        onClick={() => {
                          cmd.action();
                          setIsOpen(false);
                        }}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                          index === selectedIndex ? 'bg-brand/20 border border-brand/30' : 'border border-transparent hover:bg-white/5'
                        }`}
                      >
                        <div className={`p-2 rounded-md ${index === selectedIndex ? 'bg-brand/20 text-brand' : 'bg-gray-800 text-gray-400'}`}>
                          {cmd.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-white">{cmd.name}</span>
                            {cmd.shortcut && (
                                <span className="text-[10px] font-mono text-gray-500 bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                                    {cmd.shortcut}
                                </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 truncate">{cmd.description}</p>
                        </div>
                        {index === selectedIndex && (
                          <ChevronRight size={14} className="text-brand animate-pulse" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-4 py-2 bg-white/[0.02] border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-gray-500">
                <div className="flex gap-4">
                  <span className="flex items-center gap-1"><kbd className="bg-white/5 px-1 rounded border border-white/10">↑↓</kbd> Navigate</span>
                  <span className="flex items-center gap-1"><kbd className="bg-white/5 px-1 rounded border border-white/10">↵</kbd> Select</span>
                </div>
                <div>Pro Suite v1.0.0-STABLE</div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
