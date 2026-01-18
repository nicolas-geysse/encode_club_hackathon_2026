import { type Component, splitProps } from 'solid-js';
import { Progress as KobalteProgress } from '@kobalte/core';
import { cn } from '~/lib/cn';

const Progress = KobalteProgress.Root;

const ProgressLabel: Component<KobalteProgress.ProgressLabelProps & { class?: string }> = (
  props
) => {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteProgress.Label
      class={cn(
        'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        local.class
      )}
      {...rest}
    />
  );
};

const ProgressValueLabel: Component<
  KobalteProgress.ProgressValueLabelProps & { class?: string }
> = (props) => {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteProgress.ValueLabel
      class={cn(
        'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        local.class
      )}
      {...rest}
    />
  );
};

const ProgressTrack: Component<KobalteProgress.ProgressTrackProps & { class?: string }> = (
  props
) => {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteProgress.Track
      class={cn('relative h-4 w-full overflow-hidden rounded-full bg-secondary', local.class)}
      {...rest}
    />
  );
};

const ProgressFill: Component<KobalteProgress.ProgressFillProps & { class?: string }> = (props) => {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteProgress.Fill
      class={cn('h-full w-full flex-1 bg-primary transition-all', local.class)}
      {...rest}
    />
  );
};

export { Progress, ProgressLabel, ProgressValueLabel, ProgressTrack, ProgressFill };
