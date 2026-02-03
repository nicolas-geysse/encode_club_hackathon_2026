import { splitProps, type JSX, type ValidComponent } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { cn } from '~/lib/cn';

export interface ButtonProps<
  T extends ValidComponent = 'button',
> extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | 'none';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  as?: T;
}

export const Button = <T extends ValidComponent = 'button'>(
  props: ButtonProps<T> & { href?: string }
) => {
  const [local, rest] = splitProps(props, ['class', 'variant', 'size', 'children', 'as']);

  const baseStyles =
    'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';

  const variants = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90',
    destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    link: 'text-primary underline-offset-4 hover:underline',
    none: '', // No default styles - use custom classes only
  };

  const sizes = {
    default: 'h-10 px-4 py-2',
    sm: 'h-9 rounded-md px-3',
    lg: 'h-11 rounded-md px-8',
    icon: 'h-10 w-10',
  };

  return (
    <Dynamic
      component={local.as || 'button'}
      class={cn(
        baseStyles,
        variants[local.variant || 'default'],
        sizes[local.size || 'default'],
        local.class
      )}
      {...rest}
    >
      {local.children}
    </Dynamic>
  );
};
