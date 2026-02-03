import { Component, splitProps, type ComponentProps } from 'solid-js';
import { cn } from '~/lib/cn';

const Skeleton: Component<ComponentProps<'div'>> = (props) => {
  const [local, rest] = splitProps(props, ['class']);
  return <div class={cn('animate-pulse rounded-md bg-muted', local.class)} {...rest} />;
};

export { Skeleton };
