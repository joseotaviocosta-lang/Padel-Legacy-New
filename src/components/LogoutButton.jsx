import React from 'react';
import { LogOut } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function LogoutButton({ variant = 'sidebar' }) {
  const handleLogout = async () => {
    await base44.auth.logout(window.location.origin + '/login');
  };

  if (variant === 'sidebar') {
    return (
      <button
        onClick={handleLogout}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all font-medium text-sm"
      >
        <LogOut className="h-5 w-5" strokeWidth={2} />
        Sair da conta
      </button>
    );
  }

  return (
    <button
      onClick={handleLogout}
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-destructive/10 text-destructive font-semibold text-sm hover:bg-destructive/20 transition-colors"
    >
      <LogOut className="h-4 w-4" /> Sair da conta
    </button>
  );
}