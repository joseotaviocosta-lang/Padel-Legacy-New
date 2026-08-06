import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

function SkeletonCard({ compact = false }) {
  return (
    <div className={cn('rounded-2xl border border-border/55 bg-card/45', compact ? 'p-3' : 'p-4')}>
      <div className="flex items-start gap-3">
        <Skeleton className={cn('shrink-0 rounded-xl', compact ? 'h-9 w-9' : 'h-11 w-11')} />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-4/5" />
          {!compact && <Skeleton className="h-3 w-3/5" />}
        </div>
      </div>
    </div>
  );
}

export function PageSkeleton({ variant = 'list', rows = 4, className }) {
  return (
    <div className={cn('space-y-4 p-3 sm:p-5', className)} aria-label="Carregando página" aria-busy="true">
      <div className="space-y-3 rounded-3xl border border-border/55 bg-card/40 p-5">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-[34rem] max-w-full" />
      </div>
      {variant === 'stats' || variant === 'dashboard' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => <SkeletonCard key={index} compact />)}
        </div>
      ) : null}
      {variant === 'grid' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: rows }, (_, index) => <SkeletonCard key={index} />)}
        </div>
      ) : (
        <div className="space-y-3">
          {Array.from({ length: rows }, (_, index) => <SkeletonCard key={index} />)}
        </div>
      )}
    </div>
  );
}
