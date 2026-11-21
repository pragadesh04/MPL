import { cn } from '@/lib/utils';

/**
 * The MPL brand mark (PLAN §7 visual direction): a plain geometric shield outline with a chevron,
 * drawn in `currentColor`. Replaces the cartoon mascot wherever the logo appears. Decorative by
 * default; pass `title` when it stands alone without the "MPL" wordmark.
 */
export function BrandMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <path d="M12 2.75 4.5 5.5v6.1c0 4.6 3.1 8.1 7.5 9.65 4.4-1.55 7.5-5.05 7.5-9.65V5.5L12 2.75Z" />
      <path d="m8.5 10.25 3.5 2.75 3.5-2.75" />
      <path d="m8.5 14 3.5 2.75L15.5 14" />
    </svg>
  );
}

/** Brand mark + "MPL" wordmark, used in the top bar and on the sign-in pages. */
export function BrandLockup({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span className="flex items-center gap-2 text-foreground">
      <BrandMark className={cn('text-lime', size === 'lg' ? 'size-8' : 'size-6')} />
      <span
        className={cn(
          'font-display tracking-wider',
          size === 'lg' ? 'text-2xl' : 'text-lg',
        )}
      >
        MPL
      </span>
    </span>
  );
}
