import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: '▶' },
  { path: '/profiles', label: 'Profil Editörü', icon: '⊞' },
  { path: '/scenarios', label: 'Senaryo Editörü', icon: '⏱' },
  { path: '/templates', label: 'Şablon Kütüphanesi', icon: '📦' },
];

export function Sidebar() {
  return (
    <aside className="w-56 bg-gray-950 border-r border-gray-800 flex flex-col h-full shrink-0">
      <div className="px-4 py-5 border-b border-gray-800">
        <div className="text-green-400 font-mono font-bold text-sm tracking-widest">UART</div>
        <div className="text-gray-500 font-mono text-xs mt-0.5">SENSÖR SİMÜLATÖRÜ</div>
      </div>
      <nav className="flex-1 py-4 px-2 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-mono transition-all ${
                isActive
                  ? 'bg-green-900/30 text-green-400 border border-green-800/50'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
              }`
            }
          >
            <span className="w-4 text-center text-xs">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="px-4 py-3 border-t border-gray-800">
        <div className="text-gray-600 text-xs font-mono">v1.0.0</div>
      </div>
    </aside>
  );
}
