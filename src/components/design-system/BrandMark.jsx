import React from 'react';
import officialLogoUrl from '@/assets/brand/app-icon-master.png?url';
import { cn } from '@/lib/utils';

/**
 * The shared in-app mark renders the canonical official raster asset.
 * Do not replace it with a vector redraw or a small-size reinterpretation.
 */
export function BrandMark({ size = 40, className }) {
  return (
    <img
      src={officialLogoUrl}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className={cn('shrink-0 rounded-2xl', className)}
    />
  );
}
