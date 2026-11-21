'use client';

import { Download, Maximize, Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';

const MIN = 0.25;
const MAX = 2.5;
const clamp = (v: number): number => Math.min(MAX, Math.max(MIN, v));

interface View {
  scale: number;
  x: number;
  y: number;
}

/**
 * Zoom and pan for a fixed-size canvas (§7.10a, §7.12): drag to pan, pinch (two pointers) or
 * Ctrl/⌘ + wheel to zoom, buttons for zoom, "Fit to screen" and "Export as PNG". A drag never
 * counts as a click on the content underneath.
 */
export function ZoomPan({
  width,
  height,
  children,
  fileName,
  className,
  toolbarExtra,
}: {
  width: number;
  height: number;
  children: ReactNode;
  /** PNG file name for the export button. */
  fileName: string;
  className?: string;
  toolbarExtra?: ReactNode;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  /** Frame height in px: the fitted content's height, between 320 px and 75% of the viewport. */
  const [frameH, setFrameH] = useState<number | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(0);
  const pinch = useRef<{ dist: number; scale: number } | null>(null);

  const fit = useCallback((): void => {
    const el = frame.current;
    if (!el) return;
    const maxH = window.innerHeight * 0.75;
    const scale = clamp(Math.min(el.clientWidth / width, maxH / height, 1));
    setFrameH(Math.min(maxH, Math.max(320, height * scale + 8)));
    setView({ scale, x: Math.max(0, (el.clientWidth - width * scale) / 2), y: 4 });
  }, [width, height]);

  // Fit once on mount and when the canvas size changes.
  useEffect(() => {
    fit();
  }, [fit]);

  const zoomAt = (factor: number, cx: number, cy: number): void =>
    setView((v) => {
      const scale = clamp(v.scale * factor);
      const k = scale / v.scale;
      return { scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  const zoomCentre = (factor: number): void => {
    const el = frame.current;
    if (el) zoomAt(factor, el.clientWidth / 2, el.clientHeight / 2);
  };

  // Ctrl/⌘ + wheel (and trackpad pinch, which sends ctrlKey) zooms; plain wheel scrolls the page.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  async function exportPng(): Promise<void> {
    const node = content.current;
    if (!node) return;
    try {
      const { toPng } = await import('html-to-image');
      const bg = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-background')
        .trim();
      const url = await toPng(node, {
        width,
        height,
        pixelRatio: 2,
        backgroundColor: bg || undefined,
        style: { transform: 'none' },
      });
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
    } catch {
      toast.error('Couldn’t export the image on this device.');
    }
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Zoom out"
          onClick={() => zoomCentre(1 / 1.25)}
        >
          <Minus aria-hidden />
        </Button>
        <span className="tabular w-12 text-center font-numeric text-sm">
          {Math.round(view.scale * 100)}%
        </span>
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Zoom in"
          onClick={() => zoomCentre(1.25)}
        >
          <Plus aria-hidden />
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={fit}>
          <Maximize aria-hidden /> Fit to screen
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={exportPng}>
          <Download aria-hidden /> Export PNG
        </Button>
        {toolbarExtra}
      </div>
      <div
        ref={frame}
        style={{ height: frameH ?? undefined }}
        className="relative h-[70dvh] min-h-80 touch-none overflow-hidden rounded-lg border border-border bg-background/60 select-none"
        onPointerDown={(e) => {
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          moved.current = 0;
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            pinch.current = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), scale: view.scale };
          }
        }}
        onPointerMove={(e) => {
          const prev = pointers.current.get(e.pointerId);
          if (!prev) return;
          const next = { x: e.clientX, y: e.clientY };
          pointers.current.set(e.pointerId, next);
          if (pointers.current.size === 2 && pinch.current) {
            const [a, b] = [...pointers.current.values()];
            const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
            const r = frame.current!.getBoundingClientRect();
            const target = clamp((pinch.current.scale * dist) / pinch.current.dist);
            zoomAt(target / view.scale, (a!.x + b!.x) / 2 - r.left, (a!.y + b!.y) / 2 - r.top);
            moved.current += 10;
            return;
          }
          const dx = next.x - prev.x;
          const dy = next.y - prev.y;
          moved.current += Math.abs(dx) + Math.abs(dy);
          // Only start panning (and capture the pointer) after a real drag, so taps still click.
          if (moved.current > 6) {
            if (!frame.current!.hasPointerCapture(e.pointerId))
              frame.current!.setPointerCapture(e.pointerId);
            setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
          }
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId);
          if (pointers.current.size < 2) pinch.current = null;
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          pinch.current = null;
        }}
        onClickCapture={(e) => {
          if (moved.current > 6) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
      >
        <div
          ref={content}
          className="absolute top-0 left-0 origin-top-left"
          style={{
            width,
            height,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          }}
        >
          {children}
        </div>
      </div>
      <p className="text-xs text-muted">
        Drag to move · pinch or Ctrl + scroll to zoom · tap a match for details.
      </p>
    </div>
  );
}
