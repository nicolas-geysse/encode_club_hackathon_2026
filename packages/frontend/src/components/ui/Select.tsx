import { type Component, type JSX, splitProps, For } from 'solid-js';
import { cn } from '~/lib/cn';
import { ChevronDown } from 'lucide-solid';

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<JSX.SelectHTMLAttributes<HTMLSelectElement>, 'value'> {
  value?: string | number | string[];
  options: SelectOption[];
}

const Select: Component<SelectProps> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'options', 'value']);

  return (
    <div class="relative">
      <select
        class={cn(
          'flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 pr-8',
          local.class
        )}
        value={local.value}
        {...rest}
      >
        <For each={local.options}>
          {(option) => (
            <option value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          )}
        </For>
      </select>
      <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground">
        <ChevronDown class="h-4 w-4 opacity-50" />
      </div>
    </div>
  );
};

export { Select };
