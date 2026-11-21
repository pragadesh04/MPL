'use client';

import { List, Network } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { MatchesList } from './matches-list';
import { NowPlayingBanner } from './now-playing';
import { TreeView } from './tree-view';

type Mode = 'list' | 'tree';
const KEY = 'mpl:matches-view';
const listeners = new Set<() => void>();

function readMode(): Mode {
  try {
    return window.localStorage.getItem(KEY) === 'tree' ? 'tree' : 'list';
  } catch {
    return 'list';
  }
}
function writeMode(mode: Mode): void {
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    // storage blocked: the choice just isn't remembered
  }
  listeners.forEach((l) => l());
}
function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Matches hub (§7.10a): a List | Tree toggle remembered per device, under a "Now playing" banner. */
export function MatchesHub({ fileName }: { fileName: string }) {
  const mode = useSyncExternalStore(subscribe, readMode, () => 'list' as const);
  return (
    <div className="space-y-4">
      <NowPlayingBanner />
      <ToggleGroup
        type="single"
        value={mode}
        aria-label="View"
        onValueChange={(v) => {
          if (v === 'list' || v === 'tree') writeMode(v);
        }}
      >
        <ToggleGroupItem value="list">
          <List aria-hidden /> List
        </ToggleGroupItem>
        <ToggleGroupItem value="tree">
          <Network aria-hidden /> Tree
        </ToggleGroupItem>
      </ToggleGroup>
      {mode === 'list' ? <MatchesList /> : <TreeView fileName={fileName} />}
    </div>
  );
}
