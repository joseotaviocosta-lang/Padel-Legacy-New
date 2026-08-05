import React from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

export function LoadingState({ rows = 3, className }) {
  return <div className={cn('space-y-3', className)} aria-label="Carregando conteúdo" aria-busy="true">{Array.from({ length: rows }, (_, index) => <div key={index} className="rounded-2xl border border-border/55 bg-card/45 p-4"><div className="flex gap-3"><Skeleton className="h-10 w-10 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/5" /><Skeleton className="h-3 w-4/5" /></div></div></div>)}</div>;
}
