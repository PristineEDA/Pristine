import * as React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

interface TooltipIconButtonProps {
  content: React.ReactNode;
  children: React.ReactNode;
  delayDuration?: number;
  side?: React.ComponentProps<typeof TooltipContent>['side'];
  sideOffset?: number;
  wrapTrigger?: boolean;
}

export function TooltipIconButton({
  content,
  children,
  delayDuration = 0,
  side = 'top',
  sideOffset = 6,
  wrapTrigger = false,
}: TooltipIconButtonProps) {
  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip>
        <TooltipTrigger asChild>
          {wrapTrigger ? <span className="inline-flex">{children}</span> : children}
        </TooltipTrigger>
        <TooltipContent side={side} sideOffset={sideOffset}>
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
