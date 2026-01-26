'use client';

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { signOut } from '@/app/login/actions';
import { User, LogOut, KeyRound } from 'lucide-react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { Profile } from '@/lib/types';
import { useState } from 'react';
import { ChangePasswordSheet } from '@/app/(app)/profile/change-password-sheet';

type UserNavProps = {
  user: SupabaseUser;
  profile: Profile | null;
};

export function UserNav({ user, profile }: UserNavProps) {
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  const getInitials = (email: string) => {
    return email ? email.charAt(0).toUpperCase() : '?';
  };
  
  const displayName = profile?.name || user.email;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-8 w-8 rounded-full">
            <Avatar className="h-9 w-9">
              <AvatarImage 
                  src={user?.user_metadata?.avatar_url || "https://picsum.photos/seed/100/100/100"} 
                  alt="User avatar" 
                  data-ai-hint="person face" 
              />
              <AvatarFallback>{getInitials(user.email || '')}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">
                {displayName}
              </p>
              <p className="text-xs leading-none text-muted-foreground">
                {user.email}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setIsChangePasswordOpen(true)}>
                <KeyRound className="mr-2 h-4 w-4" />
                <span>Alterar Senha</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => signOut()}>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Sair</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordSheet
        isOpen={isChangePasswordOpen}
        setIsOpen={setIsChangePasswordOpen}
      />
    </>
  );
}
