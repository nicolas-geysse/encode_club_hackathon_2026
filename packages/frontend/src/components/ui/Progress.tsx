import { type Component, splitProps, type ComponentProps } from 'solid-js';
import { Progress as KobalteProgress } from '@kobalte/core/progress';
import { cn } from '~/lib/cn';

const Progress: Component<ComponentProps<typeof KobalteProgress> & { class?: string }> = (
  props
) => {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteProgress class={cn('w-full', local.class)} {...rest}>
      <KobalteProgress.Track class="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
        <KobalteProgress.Fill class="h-full w-full flex-1 bg-primary transition-all" />
      </KobalteProgress.Track>
    </KobalteProgress>
  );
};

export { Progress };
