import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { CommandPalette } from '../CommandPalette/CommandPalette';
import { SystemModal } from './SystemModal';

export function Layout() {
  const [isSystemModalOpen, setIsSystemModalOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 overflow-hidden">
      <Sidebar onOpenSystem={() => setIsSystemModalOpen(true)} />
      <main className="flex-1 overflow-auto relative">
        <Outlet />
        <CommandPalette />
        <SystemModal isOpen={isSystemModalOpen} onClose={() => setIsSystemModalOpen(false)} />
      </main>
    </div>
  );
}
