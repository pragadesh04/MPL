import { IdCard } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatKey } from '@/lib/rules/keys';
import { CopyButton, NativeShareButton } from './share';

/** Player ID card at the top of the player dashboard (§7.1). */
export function PlayerIdCard({ playerCode }: { playerCode: string }) {
  const display = formatKey(playerCode, 'PLAYER_CODE');
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IdCard aria-hidden className="size-5 text-lime" /> My Player ID
        </CardTitle>
        <CardDescription>Send this to an organiser so they can invite you.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <span className="font-display text-4xl tracking-[0.2em] text-lime">{display}</span>
        <div className="flex gap-2">
          <CopyButton text={display} toastLabel="Player ID copied" />
          <NativeShareButton
            title="My MPL Player ID"
            text={`My MPL Player ID is ${display}. Invite me to your tournament!`}
          />
        </div>
      </CardContent>
    </Card>
  );
}
