'use client';

import { LogOut, UserRound } from 'lucide-react';
import { InitialsAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface UserMenuProps {
  displayName: string;
  username: string;
}

/** User menu (§7 App shell). Profile / change password pages and the logout API are Lane A. */
export function UserMenu({ displayName, username }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account menu" className="rounded-full">
          <InitialsAvatar name={displayName} size="sm" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <span className="block truncate">{displayName}</span>
          <span className="block truncate text-xs font-normal text-muted">@{username}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <UserRound aria-hidden className="size-4" /> Profile
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <form action="/api/auth/logout" method="post" className="w-full">
            <button type="submit" className="flex w-full items-center gap-2">
              <LogOut aria-hidden className="size-4" /> Log out
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
