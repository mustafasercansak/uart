import { useState } from 'react';
import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: '▶' },
  { path: '/profiles', label: 'Profil Editörü', icon: '⊞' },
  { path: '/scenarios', label: 'Senaryo Editörü', icon: '⏱' },
  { path: '/templates', label: 'Şablon Kütüphanesi', icon: '📦' },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`${collapsed ? 'w-16' : 'w-56'} bg-gray-950 border-r border-gray-800 flex flex-col h-full shrink-0 transition-all duration-300 relative`}>
      <div className={`px-4 py-5 border-b border-gray-800 flex items-center justify-between transition-all ${collapsed ? 'flex-col gap-4 px-2' : ''}`}>
        <div className="flex flex-col">
          <div className={`text-green-400 font-mono font-bold text-sm tracking-widest ${collapsed ? 'text-[10px] text-center' : ''}`}>UART</div>
          {!collapsed && <div className="text-gray-600 font-mono text-[9px] mt-0.5 uppercase tracking-tighter">Sensör Simülatörü</div>}
        </div>
        <button 
          onClick={() => setCollapsed(!collapsed)}
          className={`text-gray-500 hover:text-green-400 p-1.5 rounded-lg hover:bg-gray-900 transition-all border border-transparent hover:border-gray-800 ${collapsed ? 'mt-1' : ''}`}
          title={collapsed ? 'Genişlet' : 'Daralt'}
        >
          {collapsed ? '❯' : '❮'}
        </button>
      </div>
      <nav className="flex-1 py-4 px-2 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            title={collapsed ? item.label : ''}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-mono transition-all ${
                isActive
                  ? 'bg-green-900/20 text-green-400 border border-green-800/40'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-900/50'
              } ${collapsed ? 'justify-center px-0' : ''}`
            }
          >
            <span className="w-4 text-center text-xs shrink-0">{item.icon}</span>
            {!collapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>
      
      <div className="px-4 py-3 border-t border-gray-800">
        <div className={`text-gray-700 font-mono transition-all ${collapsed ? 'text-[8px] text-center' : 'text-[10px]'}`}>
          {collapsed ? 'v1' : 'v1.0.0-STABLE'}
        </div>
      </div>
    </aside>
  );
}
