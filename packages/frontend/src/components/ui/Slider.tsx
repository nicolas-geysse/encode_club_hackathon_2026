import { Slider as KobalteSlider } from '@kobalte/core/slider';
import { splitProps, type Component, type JSX } from 'solid-js';
import { cn } from '~/lib/cn';

export interface SliderProps {
  min?: number;
  max?: number;
  step?: number;
  value?: number[];
  onChange?: (value: number[]) => void;
  label?: string;
  valueDisplay?: (value: number) => string | JSX.Element;
  disabled?: boolean;
  class?: string;
  showSteps?: boolean;
}

export const Slider: Component<SliderProps> = (props) => {
  const [local, others] = splitProps(props, [
    'class',
    'label',
    'valueDisplay',
    'min',
    'max',
    'showSteps',
    'value',
  ]);

  // Display the current value
  const displayValue = () => {
    const currentValue = local.value?.[0] ?? local.min ?? 0;
    return local.valueDisplay ? local.valueDisplay(currentValue) : currentValue;
  };

  return (
    <KobalteSlider
      class={cn('relative flex flex-col w-full touch-none select-none', local.class)}
      minValue={local.min ?? 0}
      maxValue={local.max ?? 100}
      value={local.value}
      {...others}
    >
      <div class="flex items-center justify-between mb-3 text-sm">
        <KobalteSlider.Label class="font-medium text-foreground">{local.label}</KobalteSlider.Label>
        <span class="font-mono text-muted-foreground">{displayValue()}</span>
      </div>

      <KobalteSlider.Track class="relative h-2 w-full rounded-full bg-secondary">
        <KobalteSlider.Fill class="absolute h-full rounded-full bg-primary" />
        <KobalteSlider.Thumb class="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent/50 cursor-grab active:cursor-grabbing shadow-sm">
          <KobalteSlider.Input />
        </KobalteSlider.Thumb>
      </KobalteSlider.Track>

      <div class="flex justify-between mt-1 text-xs text-muted-foreground px-1">
        {local.min !== undefined && <span>{local.min}</span>}
        {local.max !== undefined && <span>{local.max}</span>}
      </div>
    </KobalteSlider>
  );
};
