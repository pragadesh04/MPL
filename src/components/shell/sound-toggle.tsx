'use client';

import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { setSoundEnabled, useSoundEnabled } from '@/lib/sound';

export function SoundToggle() {
  const enabled = useSoundEnabled();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={enabled ? 'Mute sounds' : 'Turn sounds on'}
      aria-pressed={enabled}
      onClick={() => setSoundEnabled(!enabled)}
    >
      {enabled ? <Volume2 className="size-5" /> : <VolumeX className="size-5 text-muted" />}
    </Button>
  );
}
