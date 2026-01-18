import { type Component, type JSX, splitProps } from 'solid-js';
import { cn } from '~/lib/cn';

export type TextareaProps = JSX.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea: Component<TextareaProps> = (props) => {
  const [local, rest] = splitProps(props, ['class']);

  return (
    <textarea
      class={cn(
        'flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        local.class
      )}
      {...rest}
    />
  );
};

export { Textarea };
