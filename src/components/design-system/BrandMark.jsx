import React from 'react';
import logoMarkUrl from '@/assets/brand/logo-mark.svg?url';
import { cn } from '@/lib/utils';

/**
 * Símbolo oficial da marca (docs/BRANDING.md, docs/DESIGN_SYSTEM_V2.md).
 * Substitui o antigo "P" solto em <span> do AppLayout por um SVG real —
 * mesmo papel visual (selo quadrado arredondado no header), agora com a
 * identidade definitiva em vez de um placeholder de texto.
 *
 * O SVG tem <4KB, então o Vite sempre o embute em produção como
 * `data:image/svg+xml,...` direto no bundle (limite padrão de inlining) —
 * `?url` só deixa isso explícito, não muda esse comportamento. O que
 * quebrava a imagem em produção era o *conteúdo* do SVG: o comentário XML
 * continha hífen duplo (`--primary`) e acentos, e o encoder de data-URI do
 * Vite não trata nenhum dos dois corretamente, gerando uma URI corrompida
 * que falha silenciosamente no WebView2 do Tauri/Windows (o dev server
 * nunca reproduz isso, pois serve o arquivo direto por HTTP, sem inlining).
 * Mantenha src/assets/brand/*.svg em ASCII puro e sem "--" nos comentários.
 */
export function BrandMark({ size = 40, className }) {
  return (
    <img
      src={logoMarkUrl}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className={cn('shrink-0 rounded-2xl', className)}
    />
  );
}
