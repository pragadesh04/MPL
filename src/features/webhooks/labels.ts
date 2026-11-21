import type { WebhookDeliveryStatus, WebhookKind } from '@/lib/schemas/enums';
import type { WebhookEvent } from '@/lib/schemas/realtime';
import type { StatusPillTone } from '@/components/ui/status-pill';

export const EVENT_LABELS: Record<WebhookEvent, { label: string; hint?: string }> = {
  'lot.opened': { label: 'Lot opened', hint: 'A soldier goes on the block' },
  'lot.sold': { label: 'Sold', hint: 'Soldier, team, price and MP left' },
  'lot.unsold': { label: 'Unsold' },
  'bid.placed': { label: 'Every bid', hint: 'Noisy: off by default' },
  'auction.started': { label: 'Auction started' },
  'auction.paused': { label: 'Auction paused' },
  'auction.resumed': { label: 'Auction resumed' },
  'auction.completed': { label: 'Auction complete' },
  'allocation.completed': { label: 'Leftovers allocated' },
  'groups.drawn': { label: 'Groups drawn' },
  'match.result': { label: 'Match results' },
  'tournament.completed': { label: 'Champion crowned' },
};

export const KIND_LABELS: Record<WebhookKind, string> = {
  DISCORD: 'Discord',
  GENERIC: 'Generic (signed JSON)',
};

export const STATUS_TONES: Record<WebhookDeliveryStatus, StatusPillTone> = {
  SUCCEEDED: 'success',
  FAILED: 'blood',
  PENDING: 'amber',
};

export const STATUS_LABELS: Record<WebhookDeliveryStatus, string> = {
  SUCCEEDED: 'Delivered',
  FAILED: 'Failed',
  PENDING: 'Pending',
};
