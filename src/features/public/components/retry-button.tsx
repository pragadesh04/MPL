'use client';

import { RefreshCw } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

/** "Try again" on the offline page; also reloads by itself when the browser comes back online. */
export function RetryButton() {
  useEffect(() => {
    const back = (): void => window.location.reload();
    window.addEventListener('online', back);
    return () => window.removeEventListener('online', back);
  }, []);
  return (
    <Button type="button" onClick={() => window.location.reload()}>
      <RefreshCw aria-hidden /> Try again
    </Button>
  );
}
