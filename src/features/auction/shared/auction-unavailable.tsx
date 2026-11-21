import { StateIcon } from '@/components/ui/state-icon';
import { Gavel } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isAppError } from '@/server/errors';

/** Shown instead of an auction screen when the auction hasn't started (Start not pressed yet). */
export function AuctionNotStarted() {
  return (
    <Card className="mx-auto max-w-lg text-center">
      <CardHeader className="items-center">
        <StateIcon icon={Gavel} size="lg" className="mx-auto" />
        <CardTitle className="font-display text-2xl">Auction starts soon</CardTitle>
        <CardDescription>The organisers haven&apos;t started the tournament yet.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted">
        Stay on this page or check back later.
      </CardContent>
    </Card>
  );
}

/** True for the service error that means "no auction_state yet". */
export function isAuctionNotStarted(err: unknown): boolean {
  return isAppError(err) && err.details?.reason === 'AUCTION_NOT_STARTED';
}

export function isNotFound(err: unknown): boolean {
  return isAppError(err) && (err.code === 'NOT_FOUND' || err.code === 'FORBIDDEN');
}
