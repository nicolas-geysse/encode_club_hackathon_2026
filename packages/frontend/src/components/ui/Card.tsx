import { type Component, type JSX, splitProps } from 'solid-js';
import { cn } from '~/lib/cn';

const Card: Component<JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <div
      class={cn('rounded-xl border bg-card text-card-foreground shadow-sm', local.class)}
      {...rest}
    />
  );
};

const CardHeader: Component<JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
  const [local, rest] = splitProps(props, ['class']);
  return <div class={cn('flex flex-col space-y-1.5 p-6', local.class)} {...rest} />;
};

const CardTitle: Component<JSX.HTMLAttributes<HTMLHeadingElement>> = (props) => {
  const [local, rest] = splitProps(props, ['class']);
  return <h3 class={cn('font-semibold leading-none tracking-tight', local.class)} {...rest} />;
};

const CardDescription: Component<JSX.HTMLAttributes<HTMLParagraphElement>> = (props) => {
  const [local, rest] = splitProps(props, ['class']);
  return <p class={cn('text-sm text-muted-foreground', local.class)} {...rest} />;
};

const CardContent: Component<JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
  const [local, rest] = splitProps(props, ['class']);
  return <div class={cn('p-6 pt-0', local.class)} {...rest} />;
};

const CardFooter: Component<JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
  const [local, rest] = splitProps(props, ['class']);
  return <div class={cn('flex items-center p-6 pt-0', local.class)} {...rest} />;
};

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
