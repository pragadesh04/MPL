import type * as React from 'react';

import { cn } from '@/lib/utils';

export function Table({ className, ...props }: React.ComponentProps<'table'>): React.JSX.Element {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn('w-full caption-bottom text-sm', className)}
        {...props}
      />
    </div>
  );
}

export function TableHeader({
  className,
  ...props
}: React.ComponentProps<'thead'>): React.JSX.Element {
  return <thead data-slot="table-header" className={cn('[&_tr]:border-b', className)} {...props} />;
}

export function TableBody({
  className,
  ...props
}: React.ComponentProps<'tbody'>): React.JSX.Element {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  );
}

export function TableFooter({
  className,
  ...props
}: React.ComponentProps<'tfoot'>): React.JSX.Element {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        'border-t border-border bg-surface-2 font-semibold [&>tr]:last:border-b-0',
        className,
      )}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: React.ComponentProps<'tr'>): React.JSX.Element {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-b border-border transition-colors hover:bg-surface-2/60 data-[state=selected]:bg-surface-2',
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: React.ComponentProps<'th'>): React.JSX.Element {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-10 px-2 text-left align-middle text-xs font-semibold tracking-widest whitespace-nowrap text-muted uppercase [&:has([role=checkbox])]:pr-0',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: React.ComponentProps<'td'>): React.JSX.Element {
  return (
    <td
      data-slot="table-cell"
      className={cn('p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0', className)}
      {...props}
    />
  );
}

export function TableCaption({
  className,
  ...props
}: React.ComponentProps<'caption'>): React.JSX.Element {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mt-4 text-sm text-muted', className)}
      {...props}
    />
  );
}
