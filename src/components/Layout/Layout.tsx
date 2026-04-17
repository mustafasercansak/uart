import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { CommandPalette } from '../CommandPalette/CommandPalette';

export function Layout() {
  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto relative">
        <Outlet />
        <CommandPalette />
      </main>
    </div>
  );
}
