'use client';

import { useCallback, useRef, useState } from 'react';
import { toast } from '@/components/ui/sonner';
import type { AuctionWriteResponse } from '@/lib/schemas/auction';
import type { ApiResult } from '../realtime/api';

export interface ConsoleActions {
  /** Key of the request in flight (null when idle). Buttons disable while it is set. */
  pending: string | null;
  /**
   * Run one write. A second call while one is in flight is dropped (double press / key repeat).
   * Errors show `error.message` in a toast; resolves true on success.
   */
  run: (key: string, write: () => Promise<ApiResult<AuctionWriteResponse>>) => Promise<boolean>;
}

export function useConsoleActions(): ConsoleActions {
  const [pending, setPending] = useState<string | null>(null);
  const busy = useRef(false);

  const run = useCallback<ConsoleActions['run']>(async (key, write) => {
    if (busy.current) return false;
    busy.current = true;
    setPending(key);
    try {
      const res = await write();
      if (!res.ok) toast.error(res.error.message);
      return res.ok;
    } finally {
      busy.current = false;
      setPending(null);
    }
  }, []);

  return { pending, run };
}
