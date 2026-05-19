import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from '../../i18n/context';
import { useTheme } from 'next-themes';
import { Moon, Sun, RefreshCw } from 'lucide-react';

interface SidebarProps {
  onOpenSystem?: () => void;
}

import logo from '../../assets/logo.png';

export function Sidebar({ onOpenSystem }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(true);
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const UART_ITEMS = [
    { path: '/', label: t('nav.dashboard'), icon: '▶' },
    { path: '/profiles', label: t('nav.profiles'), icon: '⊞' },
    { path: '/scenarios', label: t('nav.scenarios'), icon: '⏱' },
    { path: '/designer', label: t('nav.designer'), icon: '🔌' },
    { path: '/templates', label: t('nav.templates'), icon: '📦' },
  ];

  const CAN_ITEMS = [
    { path: '/can', label: t('nav.dashboard'), icon: '🚌' },
    { path: '/can-profiles', label: t('nav.profiles'), icon: '🗂' },
  ];

  const navLinkClass = (isActive: boolean) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-mono transition-all ${
      isActive
        ? 'bg-green-900/20 text-green-400 border border-green-800/40'
        : 'text-gray-500 hover:text-gray-300 hover:bg-gray-900/50'
    } ${collapsed ? 'justify-center px-0' : ''}`;

  const canLinkClass = (isActive: boolean) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-mono transition-all ${
      isActive
        ? 'bg-orange-900/20 text-orange-400 border border-orange-800/40'
        : 'text-gray-500 hover:text-gray-300 hover:bg-gray-900/50'
    } ${collapsed ? 'justify-center px-0' : ''}`;

  return (
    <aside className={`${collapsed ? 'w-16' : 'w-56'} bg-gray-950 border-r border-gray-800 flex flex-col h-full shrink-0 transition-all duration-300 relative`}>
      <div className={`px-4 py-5 border-b border-gray-800 flex items-center justify-between transition-all ${collapsed ? 'flex-col gap-4 px-2' : ''}`}>
        <div className="flex items-center gap-3">
          <img src={logo} alt={t('nav.logoAlt')} className={`${collapsed ? 'w-8 h-8' : 'w-10 h-10'} rounded-lg shadow-lg shadow-cyan-500/20`} />
          {!collapsed && (
            <div className="flex flex-col">
              <div className="text-white font-mono font-bold text-sm tracking-widest">UART</div>
              <div className="text-cyan-500 font-mono text-[9px] mt-0.5 uppercase tracking-tighter font-black">{t('nav.subtitle')}</div>
            </div>
          )}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`text-gray-500 hover:text-green-400 p-1.5 rounded-lg hover:bg-gray-900 transition-all border border-transparent hover:border-gray-800 ${collapsed ? 'mt-1' : ''}`}
          title={collapsed ? t('nav.expand') : t('nav.collapse')}
        >
          {collapsed ? '❯' : '❮'}
        </button>
      </div>

      <nav className="flex-1 py-3 px-2 overflow-y-auto flex flex-col gap-4">
        {/* UART Grubu */}
        <div className="space-y-1">
          {!collapsed && (
            <div className="px-3 pb-1 flex items-center gap-2">
              <div className="h-px flex-1 bg-cyan-900/60" />
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-700 font-mono">UART</span>
              <div className="h-px flex-1 bg-cyan-900/60" />
            </div>
          )}
          {collapsed && <div className="h-px bg-cyan-900/40 mx-2 mb-1" />}
          {UART_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              title={collapsed ? item.label : ''}
              end={item.path === '/'}
              className={({ isActive }) => navLinkClass(isActive)}
            >
              <span className="w-4 text-center text-xs shrink-0">{item.icon}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </div>

        {/* CAN Grubu */}
        <div className="space-y-1">
          {!collapsed && (
            <div className="px-3 pb-1 flex items-center gap-2">
              <div className="h-px flex-1 bg-orange-900/60" />
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-orange-700 font-mono">{t('nav.canGroup')}</span>
              <div className="h-px flex-1 bg-orange-900/60" />
            </div>
          )}
          {collapsed && <div className="h-px bg-orange-900/40 mx-2 mb-1" />}
          {CAN_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              title={collapsed ? item.label : ''}
              className={({ isActive }) => canLinkClass(isActive)}
            >
              <span className="w-4 text-center text-xs shrink-0">{item.icon}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </div>
      </nav>

      <div className={`${collapsed ? 'px-2' : 'px-4'} py-3 border-t border-gray-800 flex flex-col items-center gap-2`}>
        {!collapsed && (
          <div className="w-full flex items-center justify-between px-1 py-1 rounded-lg bg-gray-900/50 border border-gray-800 text-[10px] font-mono text-gray-600">
            <span>{t('nav.commandPalette')}</span>
            <div className="flex items-center gap-0.5">
              <kbd className="bg-gray-800 px-1 rounded border border-gray-700">{t('common.ctrl')}</kbd>
              <kbd className="bg-gray-800 px-1 rounded border border-gray-700">K</kbd>
            </div>
          </div>
        )}
        {mounted && (
          <div className={`w-full flex items-center gap-1 ${collapsed ? 'flex-col' : ''}`}>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className={`text-gray-500 hover:text-green-400 p-1.5 rounded-lg hover:bg-gray-900 transition-all border border-transparent hover:border-gray-800 flex items-center justify-center gap-2 ${collapsed ? 'w-full' : 'flex-1'}`}
              title={theme === 'dark' ? t('nav.switchToLight') : t('nav.switchToDark')}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              {!collapsed && <span className="text-[10px] font-mono uppercase tracking-widest">{theme === 'dark' ? t('nav.light') : t('nav.dark')}</span>}
            </button>
            <a
              href="https://www.linkedin.com/in/mustafa-sercan-sak-30190684/"
              target="_blank"
              rel="noopener noreferrer"
              className={`text-gray-500 hover:text-blue-400 p-1.5 rounded-lg hover:bg-blue-900/20 transition-all border border-transparent hover:border-blue-800/50 flex items-center justify-center ${collapsed ? 'w-full' : 'w-9'}`}
              title={t('nav.developer')}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path>
                <rect x="2" y="9" width="4" height="12"></rect>
                <circle cx="4" cy="4" r="2"></circle>
              </svg>
            </a>
          </div>
        )}
        <button
          onClick={onOpenSystem}
          className={`flex items-center gap-2 text-gray-500 hover:text-cyan-400 font-mono transition-all group ${collapsed ? 'text-[8px] mt-1 justify-center' : 'text-[10px] w-full px-2 py-1.5 rounded-lg bg-gray-900/30 border border-gray-800/50 hover:bg-gray-900/80 hover:border-cyan-500/30'}`}
          title={collapsed ? `v${__APP_VERSION__} - ${t('system.checkUpdate')}` : ''}
        >
          <RefreshCw size={collapsed ? 8 : 10} className="opacity-40 group-hover:opacity-100 group-hover:animate-spin" />
          <span>{collapsed ? 'v' : `v${__APP_VERSION__}`}</span>
          {!collapsed && (
            <span className="ml-auto text-[8px] font-black opacity-30 group-hover:opacity-100 transition-opacity uppercase tracking-widest text-cyan-500">
              {t('system.checkUpdate')}
            </span>
          )}
        </button>
      </div>
    </aside>
  );
}
