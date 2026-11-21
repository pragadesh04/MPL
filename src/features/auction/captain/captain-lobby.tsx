'use client';

import { useState } from 'react';
import { ActivityIcon } from 'lucide-react';
import { JetpackSoldier } from '@/components/mascots/jetpack-soldier';
import { Button } from '@/components/ui/button';
import { TeamChip } from '@/components/ui/team-chip';
import type { AuctionSnapshot } from '@/lib/schemas/auction';
import { cn } from '@/lib/utils';
import { OnlineDot } from '../shared/display';

/** Pre-auction lobby (§7.8): who's connected, plus a connection test against /api/health. */

type TestResult =
  | { state: 'idle' }
  | { state: 'running' }
  | { state: 'ok'; ms: number }
  | {
      state: 'failed';
    };

export interface CaptainLobbyProps {
  snapshot: AuctionSnapshot;
  captainUserIds: Record<string, string | null>;
  online: ReadonlySet<string>;
  presenceAvailable: boolean;
  myTeamId: string;
}

export function CaptainLobby({
  snapshot,
  captainUserIds,
  online,
  presenceAvailable,
  myTeamId,
}: CaptainLobbyProps) {
  const [test, setTest] = useState<TestResult>({ state: 'idle' });

  const runTest = async (): Promise<void> => {
    setTest({ state: 'running' });
    const started = performance.now();
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      const ms = Math.round(performance.now() - started);
      setTest(res.ok ? { state: 'ok', ms } : { state: 'failed' });
    } catch {
      setTest({ state: 'failed' });
    }
  };

  const connectedCount = presenceAvailable
    ? snapshot.teams.filter((t) => {
        const uid = captainUserIds[t.id];
        return uid ? online.has(uid) : false;
      }).length
    : null;

  return (
    <section aria-labelledby="lobby-title" className="space-y-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <JetpackSoldier pose="idle" className="h-28 w-auto" />
        <h2 id="lobby-title" className="font-display text-2xl tracking-wide uppercase">
          Waiting for the auction to start
        </h2>
        <p className="text-sm text-muted">
          Keep this screen open. The first soldier opens here as soon as the organisers start.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold tracking-widest text-muted uppercase">Captains</h3>
          {connectedCount !== null ? (
            <span className="tabular font-numeric text-xs text-muted">
              {connectedCount}/{snapshot.teams.length} connected
            </span>
          ) : null}
        </div>
        <ul className="space-y-2">
          {snapshot.teams.map((t) => {
            const uid = captainUserIds[t.id];
            const isOnline = uid ? online.has(uid) : false;
            return (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <OnlineDot online={isOnline || t.id === myTeamId} available={presenceAvailable} />
                <TeamChip name={t.name} shortName={t.shortName} color={t.color} size="sm" />
                <span className="ml-auto truncate text-xs text-muted">{t.captainName}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void runTest()}
          disabled={test.state === 'running'}
        >
          <ActivityIcon aria-hidden="true" />
          Test connection
        </Button>
        <p
          role="status"
          className={cn(
            'text-sm',
            test.state === 'failed'
              ? 'text-blood'
              : test.state === 'ok'
                ? 'text-lime'
                : 'text-muted',
          )}
        >
          {test.state === 'idle' && 'Check your connection before bidding starts.'}
          {test.state === 'running' && 'Testing…'}
          {test.state === 'ok' && `Latency ${test.ms} ms`}
          {test.state === 'failed' && 'Could not reach the server. Check your network.'}
        </p>
      </div>
    </section>
  );
}
