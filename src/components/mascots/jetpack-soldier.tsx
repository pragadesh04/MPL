import type * as React from 'react';

import { cn } from '@/lib/utils';

export type JetpackSoldierPose = 'idle' | 'flying' | 'cheer';

/** Flame length (y-scale from the nozzle) per pose. */
const flameScale: Record<JetpackSoldierPose, number> = { idle: 0.45, flying: 1.25, cheer: 0.85 };

function Flame({ x, scale }: { x: number; scale: number }): React.JSX.Element {
  return (
    <g transform={`translate(${x} 97) scale(1 ${scale}) translate(${-x} -97)`}>
      <path d={`M${x - 4} 97 Q${x} 128 ${x + 4} 97 Z`} className="fill-amber" />
      <path d={`M${x - 2} 97 Q${x} 115 ${x + 2} 97 Z`} className="fill-gold" strokeWidth={0} />
    </g>
  );
}

/**
 * MPL mascot: an original cartoon soldier with a jetpack (helmet, goggles, rifle, flame).
 * Colours come from theme tokens; the helmet stripe uses `currentColor` (defaults to lime), so
 * set a `text-*` class to tint it. Decorative unless `title` is given.
 */
export function JetpackSoldier({
  className,
  title,
  pose = 'idle',
}: {
  className?: string;
  title?: string;
  pose?: JetpackSoldierPose;
}): React.JSX.Element {
  const flame = flameScale[pose];
  const bodyTransform =
    pose === 'flying' ? 'rotate(12 56 80)' : pose === 'cheer' ? 'translate(0 -4)' : undefined;
  const armTransform = pose === 'cheer' ? 'rotate(-75 50 62)' : undefined;

  return (
    <svg
      viewBox="0 0 120 140"
      xmlns="http://www.w3.org/2000/svg"
      data-slot="jetpack-soldier"
      data-pose={pose}
      className={cn('text-lime', className)}
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
    >
      {title ? <title>{title}</title> : null}

      {/* ground shadow: shrinks while airborne */}
      <ellipse
        cx="56"
        cy="130"
        rx={pose === 'idle' ? 24 : 14}
        ry="3"
        className="fill-background"
        opacity="0.6"
      />

      <g
        transform={bodyTransform}
        className="stroke-background"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {/* jetpack + flames */}
        <g className={pose === 'idle' ? undefined : 'motion-safe:animate-pulse'}>
          <Flame x={27.5} scale={flame} />
          <Flame x={36.5} scale={flame} />
        </g>
        <rect x="23" y="89" width="9" height="9" rx="2" className="fill-muted" />
        <rect x="32" y="89" width="9" height="9" rx="2" className="fill-muted" />
        <rect x="20" y="50" width="24" height="42" rx="7" className="fill-surface-2" />
        <rect x="25" y="56" width="14" height="6" rx="3" className="fill-blood" />
        <circle cx="32" cy="72" r="3" className="fill-gold" />

        {/* legs + boots */}
        <rect x="42" y="88" width="10" height="22" rx="3" className="fill-lime-dim" />
        <rect x="56" y="88" width="10" height="22" rx="3" className="fill-lime-dim" />
        <rect x="39" y="106" width="15" height="8" rx="3" className="fill-surface-2" />
        <rect x="54" y="106" width="17" height="8" rx="3" className="fill-surface-2" />

        {/* torso, strap, belt */}
        <rect x="38" y="55" width="32" height="38" rx="9" className="fill-lime-dim" />
        <path d="M42 57 L64 84" className="stroke-surface-2" strokeWidth={4} />
        <rect x="38" y="80" width="32" height="6" rx="2" className="fill-surface-2" />
        <rect x="51" y="79.5" width="7" height="7" rx="1.5" className="fill-gold" />

        {/* head */}
        <circle cx="57" cy="42" r="14" className="fill-sand" />
        <circle cx="64" cy="45" r="1.8" className="fill-background" strokeWidth={0} />
        {pose === 'cheer' ? (
          <path d="M60 51 Q65 57 69 50 Z" className="fill-blood" strokeWidth={1.5} />
        ) : (
          <path d="M61 52 Q65 55 68 51" fill="none" strokeWidth={1.8} />
        )}

        {/* helmet with stripe and goggles */}
        <path d="M41 40 A16 16 0 0 1 73 40 Z" className="fill-lime-dim" />
        <path d="M55 25 A16 16 0 0 1 61 25.2 L60 39 L56 39 Z" fill="currentColor" strokeWidth={0} />
        <rect x="38" y="38" width="38" height="5" rx="2.5" className="fill-lime-dim" />
        <rect x="52" y="30" width="20" height="8" rx="4" className="fill-surface-2" />
        <circle cx="58" cy="34" r="2.6" className="fill-info" strokeWidth={1} />
        <circle cx="66" cy="34" r="2.6" className="fill-info" strokeWidth={1} />

        {/* arm + rifle (raised overhead when cheering) */}
        <g transform={armTransform}>
          <rect x="50" y="64" width="10" height="9" rx="2" className="fill-surface-2" />
          <rect x="58" y="63" width="40" height="6" rx="1.5" className="fill-surface-2" />
          <rect x="96" y="64.5" width="11" height="3" rx="1" className="fill-muted" />
          <rect x="74" y="68" width="5" height="9" rx="1" className="fill-surface-2" />
          <path d="M47 59 L54 57 L73 66 L69 73 Z" className="fill-lime-dim" />
          <circle cx="71" cy="70" r="4" className="fill-sand" />
        </g>
      </g>
    </svg>
  );
}
