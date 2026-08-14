import React from 'react';
import logoAppMarkUrl from '@/assets/brand/logo-app-mark.svg?url';
import { cn } from '@/lib/utils';

/**
 * Compact racket-and-ball brand mark for shared in-app surfaces.
 *
 * Keep brand SVG comments ASCII-only and free of double hyphens. The Vite
 * data URI must remain valid in the packaged Tauri WebView2 runtime.
 */
export function BrandMark({ size = 40, className }) {
  return (
    <img
      src={logoAppMarkUrl}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className={cn('shrink-0 rounded-2xl', className)}
    />
  );
}
