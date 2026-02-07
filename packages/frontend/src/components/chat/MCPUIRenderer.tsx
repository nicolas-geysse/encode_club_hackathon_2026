/**
 * MCP-UI Renderer Component
 *
 * Renders interactive UI resources returned by MCP tools.
 * Uses @seed-ship/mcp-ui-solid for component rendering.
 *
 * Supports:
 * - Forms (input collection)
 * - Tables (data display)
 * - Charts (visualizations)
 * - Actions (buttons, callbacks)
 */

import {
  Show,
  createSignal,
  createMemo,
  For,
  Switch,
  Match,
  onMount,
  onCleanup,
  lazy,
} from 'solid-js';
import { createLogger } from '~/lib/logger';
import OnboardingFormStep from './OnboardingFormStep';
import { OnboardingFormStepWrapper } from './OnboardingFormStepWrapper';
import {
  Chart,
  Title,
  Tooltip,
  Legend,
  Colors,
  BarElement,
  BarController,
  LineElement,
  LineController,
  PointElement,
  CategoryScale,
  LinearScale,
} from 'chart.js';
import { Bar, Line } from 'solid-chartjs';

import { UIResource } from '~/types/chat';

// Register Chart.js components - include controllers for Bar and Line charts
Chart.register(
  Title,
  Tooltip,
  Legend,
  Colors,
  BarElement,
  BarController,
  LineElement,
  LineController,
  PointElement,
  CategoryScale,
  LinearScale
);

const logger = createLogger('MCPUIRenderer');

/**
 * Action callback type
 */
export type ActionCallback = (action: string, data: unknown) => void;

interface MCPUIRendererProps {
  resource: UIResource | null;
  onAction?: ActionCallback;
}

/**
 * MCP-UI Renderer Component
 *
 * Renders UI resources from MCP tool responses in the chat interface.
 */
export function MCPUIRenderer(props: MCPUIRendererProps) {
  return (
    <Show when={props.resource}>
      <div class="mcp-ui-container my-2">
        <ResourceRenderer resource={props.resource!} onAction={props.onAction} />
      </div>
    </Show>
  );
}

/**
 * Recursive resource renderer - uses Switch/Match for SolidJS reactivity
 */
function ResourceRenderer(props: { resource: UIResource; onAction?: ActionCallback }) {
  return (
    <Switch
      fallback={
        <div class="text-muted-foreground text-sm">Unknown UI type: {props.resource.type}</div>
      }
    >
      <Match when={props.resource.type === 'text'}>
        <TextResource params={(props.resource as any).params} />
      </Match>
      <Match when={props.resource.type === 'table'}>
        <TableResource params={(props.resource as any).params} />
      </Match>
      <Match when={props.resource.type === 'metric'}>
        <MetricResource params={(props.resource as any).params} />
      </Match>
      <Match when={props.resource.type === 'grid'}>
        <GridResource params={(props.resource as any).params} onAction={props.onAction} />
      </Match>
      <Match when={props.resource.type === 'link'}>
        <LinkResource params={(props.resource as any).params} />
      </Match>
      <Match when={props.resource.type === 'action'}>
        <ActionResource params={(props.resource as any).params} onAction={props.onAction} />
      </Match>
      <Match when={props.resource.type === 'composite'}>
        <CompositeResource
          components={(props.resource as any).components}
          onAction={props.onAction}
        />
      </Match>
      {/* Handle both legacy 'form' and new 'input_form' */}
      <Match when={props.resource.type === 'form' || props.resource.type === 'input_form'}>
        <FormResource params={(props.resource as any).params} onAction={props.onAction} />
      </Match>
      <Match when={props.resource.type === 'chart'}>
        <ChartPlaceholder params={(props.resource as any).params} />
      </Match>
      <Match when={props.resource.type === 'confirmation'}>
        <ConfirmationResource params={(props.resource as any).params} onAction={props.onAction} />
      </Match>
      <Match when={props.resource.type === 'swipe_embed'}>
        <SwipeEmbedResource params={(props.resource as any).params} />
      </Match>
    </Switch>
  );
}

/**
 * Text Resource
 */
function TextResource(props: { params?: Record<string, unknown> }) {
  const content = () => (props.params?.content as string) || '';
  const isMarkdown = () => props.params?.markdown !== false;

  return (
    <div class="text-resource prose prose-sm max-w-none">
      <Show when={isMarkdown()} fallback={<p>{content()}</p>}>
        {/* eslint-disable-next-line solid/no-innerhtml -- Content is from our API, not user input */}
        <div innerHTML={simpleMarkdown(content())} />
      </Show>
    </div>
  );
}

/**
 * Cell Value Renderer - supports plain text, links, and link lists
 */
function CellValue(props: { value: unknown }) {
  // Link object: { text, href }
  const isLink = () => {
    const v = props.value;
    return v && typeof v === 'object' && 'href' in (v as Record<string, unknown>);
  };
  // Array of links: [{ text, href }, ...]
  const isLinkArray = () => {
    const v = props.value;
    return (
      Array.isArray(v) &&
      v.length > 0 &&
      typeof v[0] === 'object' &&
      v[0] !== null &&
      'href' in v[0]
    );
  };

  return (
    <Switch fallback={<>{String(props.value || '-')}</>}>
      <Match when={isLinkArray()}>
        <span class="flex flex-wrap gap-1.5">
          <For each={props.value as Array<{ text: string; href: string }>}>
            {(link, i) => (
              <>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-primary hover:text-primary/80 underline"
                >
                  {link.text}
                </a>
                <Show when={i() < (props.value as unknown[]).length - 1}>
                  <span class="text-muted-foreground">,</span>
                </Show>
              </>
            )}
          </For>
        </span>
      </Match>
      <Match when={isLink()}>
        <a
          href={(props.value as { text: string; href: string }).href}
          target="_blank"
          rel="noopener noreferrer"
          class="text-primary hover:text-primary/80 underline"
        >
          {(props.value as { text: string; href: string }).text}
        </a>
      </Match>
    </Switch>
  );
}

/**
 * Table Resource
 */
function TableResource(props: { params?: Record<string, unknown> }) {
  const title = () => (props.params?.title as string) || '';
  const columns = () => (props.params?.columns as Array<{ key: string; label: string }>) || [];
  const rows = () => (props.params?.rows as Array<Record<string, unknown>>) || [];

  return (
    <div class="table-resource bg-card rounded-lg border border-border overflow-hidden">
      <Show when={title()}>
        <h4 class="font-medium text-sm text-foreground px-3 py-2 border-b border-border">
          {title()}
        </h4>
      </Show>
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead>
            <tr class="border-b border-border bg-muted/50">
              <For each={columns()}>
                {(col) => (
                  <th class="px-3 py-2 text-left font-medium text-muted-foreground">{col.label}</th>
                )}
              </For>
            </tr>
          </thead>
          <tbody>
            <For each={rows()}>
              {(row) => (
                <tr class="border-b border-border last:border-b-0">
                  <For each={columns()}>
                    {(col) => (
                      <td class="px-3 py-2 text-foreground">
                        <CellValue value={row[col.key]} />
                      </td>
                    )}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Metric Resource
 */
function MetricResource(props: { params?: Record<string, unknown> }) {
  const title = () => (props.params?.title as string) || '';
  const value = () => props.params?.value;
  const unit = () => (props.params?.unit as string) || '';
  const subtitle = () => (props.params?.subtitle as string) || '';
  const trend = () => props.params?.trend as { direction?: string; value?: number } | undefined;

  const trendClass = createMemo(() => {
    const t = trend();
    if (!t) return '';
    return t.direction === 'up'
      ? 'text-green-500'
      : t.direction === 'down'
        ? 'text-red-500'
        : 'text-muted-foreground';
  });

  return (
    <div class="metric-resource bg-card rounded-lg p-3 border border-border">
      <div class="text-xs text-muted-foreground uppercase tracking-wide">{title()}</div>
      <div class="mt-1 flex items-baseline gap-1">
        <span class="text-2xl font-bold text-foreground">{String(value())}</span>
        <Show when={unit()}>
          <span class="text-sm text-muted-foreground">{unit()}</span>
        </Show>
        <Show when={trend()}>
          <span class={`text-sm ${trendClass()}`}>
            {trend()!.direction === 'up' ? '↑' : trend()!.direction === 'down' ? '↓' : '→'}
          </span>
        </Show>
      </div>
      <Show when={subtitle()}>
        <div class="text-xs text-muted-foreground mt-1">{subtitle()}</div>
      </Show>
    </div>
  );
}

/**
 * Grid Resource
 */
function GridResource(props: { params?: Record<string, unknown>; onAction?: ActionCallback }) {
  const columns = () => (props.params?.columns as number) || 2;
  const children = () => (props.params?.children as UIResource[]) || [];

  return (
    <div
      class="grid gap-3"
      style={{ 'grid-template-columns': `repeat(${columns()}, minmax(0, 1fr))` }}
    >
      <For each={children()}>
        {(child) => <ResourceRenderer resource={child} onAction={props.onAction} />}
      </For>
    </div>
  );
}

/**
 * Link Resource
 */
function LinkResource(props: { params?: Record<string, unknown> }) {
  const label = () => (props.params?.label as string) || 'Link';
  const url = () => (props.params?.url as string) || '#';
  const description = () => (props.params?.description as string) || '';

  return (
    <div class="link-resource">
      <a
        href={url()}
        target="_blank"
        rel="noopener noreferrer"
        class="text-primary hover:text-primary/80 underline"
      >
        {label()}
      </a>
      <Show when={description()}>
        <p class="text-xs text-muted-foreground mt-1">{description()}</p>
      </Show>
    </div>
  );
}

/**
 * Action Resource (Button)
 */
function ActionResource(props: { params?: Record<string, unknown>; onAction?: ActionCallback }) {
  const type = () => (props.params?.type as string) || 'button';
  const label = () => (props.params?.label as string) || 'Action';
  const variant = () => (props.params?.variant as string) || 'primary';
  const action = () => (props.params?.action as string) || '';
  const actionParams = () => props.params?.params as unknown;

  const handleClick = () => {
    if (props.onAction) {
      props.onAction(action(), actionParams());
    }
  };

  const buttonClass = createMemo(() => {
    const base = 'px-3 py-1.5 text-sm rounded-md transition-colors';
    switch (variant()) {
      case 'primary':
        return `${base} bg-primary text-primary-foreground hover:bg-primary/90`;
      case 'outline':
        return `${base} border border-border text-foreground hover:bg-muted`;
      case 'ghost':
        return `${base} text-foreground hover:bg-muted`;
      default:
        return `${base} text-foreground`;
    }
  });

  return (
    <Show when={type() === 'button'}>
      <button class={buttonClass()} onClick={handleClick}>
        {label()}
      </button>
    </Show>
  );
}

/**
 * Composite Resource (multiple components)
 */
function CompositeResource(props: { components?: UIResource[]; onAction?: ActionCallback }) {
  return (
    <div class="composite-resource space-y-3">
      <For each={props.components || []}>
        {(component) => <ResourceRenderer resource={component} onAction={props.onAction} />}
      </For>
    </div>
  );
}

/**
 * Form Resource
 */
function FormResource(props: { params?: Record<string, unknown>; onAction?: ActionCallback }) {
  const title = () => (props.params?.title as string) || '';
  const uiComponent = () => (props.params?.uiComponent as string) || '';

  // Special handling for GoalForm using the Onboarding component
  if (uiComponent() === 'GoalForm') {
    // Import dynamically or use closure if available.
    // Since we are in MCPUIRenderer which is inside OnboardingChat likely, we might have access or need to import.
    // However, OnboardingFormStep is a default export. MCPUIRenderer is invalid if it imports a component that imports it (cycle).
    // OnboardingFormStep imports stepForms, not MCPUIRenderer. Safe.

    // We need to verify if we can use OnboardingFormStep here.
    // It requires 'step', 'onSubmit', etc.
    // We'll wrap it.

    return (
      <div class="bg-card border border-border rounded-lg p-4 max-w-sm">
        <h4 class="font-medium text-sm text-foreground mb-3">Update Goal</h4>
        {/* We need to lazy load or pass OnboardingFormStep from parent to avoid circular deps if any. 
            MCPUIRenderer is imported by OnboardingChat. OnboardingFormStep is imported by OnboardingChat.
            MCPUIRenderer -> OnboardingFormStep is fine.
        */}
        <OnboardingFormStepWrapper
          step="goal"
          initialData={
            props.params?.fields
              ? (props.params.fields as any[]).reduce(
                  (acc, f) => ({ ...acc, [f.name]: f.currentValue ?? f.value }),
                  {}
                )
              : {}
          }
          onAction={props.onAction}
          submitLabel="Save Goal"
        />
      </div>
    );
  }

  const fields = () =>
    (props.params?.fields as Array<{
      name: string;
      label: string;
      type: string;
      required?: boolean;
      value?: unknown;
      options?: string[];
      max?: number;
    }>) || [];
  const submitLabel = () => (props.params?.submitLabel as string) || 'Submit';

  // Initialize form data with default values from fields
  const getInitialData = () => {
    const initial: Record<string, unknown> = {};
    for (const field of fields()) {
      // Initialize with field.value, currentValue (from ActionDispatcher), or empty string
      const prefill = (field as Record<string, unknown>).currentValue ?? field.value;
      initial[field.name] = prefill !== undefined && prefill !== '' ? prefill : '';
    }
    return initial;
  };

  const [formData, setFormData] = createSignal<Record<string, unknown>>(getInitialData());
  const [submitted, setSubmitted] = createSignal(false);
  const [errors, setErrors] = createSignal<Record<string, string>>({});

  // Validate form before submit
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    for (const field of fields()) {
      const value = formData()[field.name];
      if (field.required && (value === undefined || value === '' || value === null)) {
        newErrors[field.name] = `${field.label} is required`;
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    setSubmitted(true);

    if (!validateForm()) {
      logger.warn('Form validation failed', { errors: errors() });
      return;
    }

    // Convert number fields to actual numbers
    const processedData: Record<string, unknown> = {};
    for (const field of fields()) {
      const value = formData()[field.name];
      if (field.type === 'number' && value !== '' && value !== undefined) {
        processedData[field.name] = Number(value);
      } else {
        processedData[field.name] = value;
      }
    }

    // Include actionType from params so handlers can route by action
    if (props.params?.actionType) {
      processedData.actionType = props.params.actionType;
    }

    logger.info('Form submit', { data: processedData });
    if (props.onAction) {
      props.onAction('form-submit', processedData);
    }
  };

  const handleChange = (name: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors()[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  // Get current value for a field (controlled input)
  const getFieldValue = (fieldName: string): string => {
    const value = formData()[fieldName];
    return value !== undefined && value !== null ? String(value) : '';
  };

  return (
    <form
      class="form-resource space-y-3 max-w-sm bg-card border border-border rounded-lg p-4"
      onSubmit={handleSubmit}
    >
      <Show when={title()}>
        <h4 class="font-medium text-sm text-foreground">{title()}</h4>
      </Show>
      <For each={fields()}>
        {(field) => (
          <div class="field">
            <label class="block text-sm text-muted-foreground mb-1">
              {field.label}
              {field.required && <span class="text-red-500 ml-0.5">*</span>}
            </label>

            <Switch
              fallback={
                <input
                  type={field.type || 'text'}
                  name={field.name}
                  required={field.required}
                  value={getFieldValue(field.name)}
                  class="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  classList={{
                    'border-red-500 focus:ring-red-500': !!errors()[field.name],
                  }}
                  onInput={(e) => handleChange(field.name, e.currentTarget.value)}
                />
              }
            >
              <Match when={field.type === 'select'}>
                <select
                  name={field.name}
                  required={field.required}
                  value={getFieldValue(field.name)}
                  class="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
                  classList={{
                    'border-red-500 focus:ring-red-500': !!errors()[field.name],
                  }}
                  onInput={(e) => handleChange(field.name, e.currentTarget.value)}
                >
                  <option value="" disabled>
                    Select an option
                  </option>
                  <For each={field.options || []}>
                    {(option) => <option value={option}>{option}</option>}
                  </For>
                </select>
              </Match>
              <Match when={field.type === 'duration'}>
                <div class="flex items-center gap-3">
                  <input
                    type="range"
                    min="1"
                    max={field.max || 12}
                    step="1"
                    name={field.name}
                    value={getFieldValue(field.name) || '1'}
                    class="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer"
                    onInput={(e) => handleChange(field.name, e.currentTarget.value)}
                  />
                  <span class="w-16 text-center text-sm font-medium border border-border rounded px-2 py-1 bg-muted/50">
                    {getFieldValue(field.name) || '1'} mo
                  </span>
                </div>
              </Match>
            </Switch>

            <Show when={submitted() && errors()[field.name]}>
              <p class="text-red-500 text-xs mt-1">{errors()[field.name]}</p>
            </Show>
          </div>
        )}
      </For>
      <button
        type="submit"
        class="w-full px-4 py-2 bg-primary text-primary-foreground text-sm rounded-md hover:bg-primary/90 transition-colors"
      >
        {submitLabel()}
      </button>
    </form>
  );
}

/**
 * Chart Resource - Real Chart.js integration
 */
interface ChartParams {
  type?: 'bar' | 'line' | 'comparison';
  title?: string;
  data?: {
    labels: string[];
    datasets: Array<{
      label: string;
      data: number[];
      backgroundColor?: string | string[];
      borderColor?: string | string[];
    }>;
  };
  summary?: {
    currentWeeks: number | null;
    scenarioWeeks: number | null;
    weeksSaved: number;
  };
}

function ChartResource(props: { params?: ChartParams }) {
  const chartType = () => props.params?.type || 'bar';
  const title = () => props.params?.title || 'Chart';
  const data = () => props.params?.data || { labels: [], datasets: [] };
  const summary = () => props.params?.summary;

  // Chart.js options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(255, 255, 255, 0.1)',
        },
        ticks: {
          color: 'rgba(255, 255, 255, 0.7)',
        },
      },
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: 'rgba(255, 255, 255, 0.7)',
        },
      },
    },
  };

  // Format chart data for Chart.js
  const chartData = createMemo(() => {
    const d = data();
    return {
      labels: d.labels || [],
      datasets: (d.datasets || []).map((ds) => ({
        label: ds.label || '',
        data: ds.data || [],
        backgroundColor: ds.backgroundColor || 'rgba(59, 130, 246, 0.5)',
        borderColor: ds.borderColor || 'rgb(59, 130, 246)',
        borderWidth: 2,
        borderRadius: 4,
      })),
    };
  });

  return (
    <div class="chart-resource bg-card rounded-lg p-4 border border-border">
      <Show when={title()}>
        <h4 class="font-medium text-sm text-foreground mb-3">{title()}</h4>
      </Show>

      {/* Chart container */}
      <div class="h-48 w-full">
        <Switch fallback={<Bar data={chartData()} options={chartOptions} />}>
          <Match when={chartType() === 'line'}>
            <Line data={chartData()} options={chartOptions} />
          </Match>
          <Match when={chartType() === 'bar' || chartType() === 'comparison'}>
            <Bar data={chartData()} options={chartOptions} />
          </Match>
        </Switch>
      </div>

      {/* Summary for comparison charts */}
      <Show when={summary() && chartType() === 'comparison'}>
        <div class="mt-3 pt-3 border-t border-border">
          <div class="flex justify-between text-xs text-muted-foreground">
            <Show when={summary()!.weeksSaved > 0}>
              <span class="text-green-500 font-medium">{summary()!.weeksSaved} weeks faster</span>
            </Show>
            <Show when={summary()!.currentWeeks !== null}>
              <span>Current: {summary()!.currentWeeks} weeks</span>
            </Show>
            <Show when={summary()!.scenarioWeeks !== null}>
              <span>With change: {summary()!.scenarioWeeks} weeks</span>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}

// Keep placeholder for backward compatibility (alias)
function ChartPlaceholder(props: { params?: Record<string, unknown> }) {
  return <ChartResource params={props.params as ChartParams} />;
}

/**
 * Confirmation Resource (HITL)
 */
function ConfirmationResource(props: {
  params?: Record<string, unknown>;
  onAction?: ActionCallback;
}) {
  const message = () => (props.params?.message as string) || 'Are you sure?';
  const confirmLabel = () => (props.params?.confirmLabel as string) || 'Yes';
  const cancelLabel = () => (props.params?.cancelLabel as string) || 'No';
  const data = () => props.params?.data as unknown;

  const handleConfirm = () => {
    if (props.onAction) {
      props.onAction('confirm', data());
    }
  };

  const handleCancel = () => {
    if (props.onAction) {
      props.onAction('cancel', null);
    }
  };

  return (
    <div class="confirmation-resource bg-card border border-border rounded-lg p-4 max-w-sm shadow-sm animate-in fade-in slide-in-from-bottom-2">
      <p class="text-sm font-medium text-foreground mb-4">{message()}</p>
      <div class="flex gap-2 justify-end">
        <button
          onClick={handleCancel}
          class="px-3 py-1.5 text-sm rounded-md border border-border text-muted-foreground hover:bg-muted transition-colors"
        >
          {cancelLabel()}
        </button>
        <button
          onClick={handleConfirm}
          class="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
        >
          {confirmLabel()}
        </button>
      </div>
    </div>
  );
}

/**
 * Swipe Embed Resource - Responsive iframe/button for Swipe strategies
 * Desktop: renders iframe with /embed/swipe
 * Mobile: renders navigation button to /swipe
 */
interface SwipeEmbedParams {
  embedUrl: string;
  fallbackUrl: string;
  height: number;
  title?: string;
}

function SwipeEmbedResource(props: { params?: SwipeEmbedParams }) {
  const embedUrl = () => props.params?.embedUrl || '/embed/swipe';
  const fallbackUrl = () => props.params?.fallbackUrl || '/swipe';
  const height = () => props.params?.height || 945;

  // Viewport detection with reactive signal
  const [isDesktop, setIsDesktop] = createSignal(
    typeof window !== 'undefined' ? window.innerWidth > 768 : true
  );

  // Loading and error state for iframe
  const [iframeLoaded, setIframeLoaded] = createSignal(false);
  const [iframeError, setIframeError] = createSignal(false);

  // Handle viewport resize with proper cleanup
  onMount(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      setIsDesktop(window.innerWidth > 768);
    };

    window.addEventListener('resize', handleResize);

    onCleanup(() => {
      window.removeEventListener('resize', handleResize);
    });
  });

  // Handle iframe load
  const handleIframeLoad = () => {
    setIframeLoaded(true);
  };

  // Handle iframe error - show fallback button
  const handleIframeError = () => {
    setIframeError(true);
  };

  // If iframe failed, show fallback button regardless of viewport
  const showButton = () => !isDesktop() || iframeError();

  return (
    <div class="swipe-embed-resource">
      <Show
        when={!showButton()}
        fallback={
          <a
            href={fallbackUrl()}
            class="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium text-sm"
          >
            Swipe to plan ! →
          </a>
        }
      >
        {/* Desktop: iframe */}
        <div class="relative w-full rounded-lg overflow-hidden" style={{ height: `${height()}px` }}>
          {/* Loading spinner while iframe loads */}
          <Show when={!iframeLoaded()}>
            <div class="absolute inset-0 flex items-center justify-center bg-muted/50">
              <div class="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          </Show>
          <iframe
            src={embedUrl()}
            class="w-full h-full border-0"
            classList={{ 'opacity-0': !iframeLoaded(), 'opacity-100': iframeLoaded() }}
            style={{ transition: 'opacity 0.2s ease-in-out' }}
            onLoad={handleIframeLoad}
            onError={handleIframeError}
            title="Swipe Strategies"
          />
        </div>
      </Show>
    </div>
  );
}

/**
 * Simple markdown to HTML converter
 * For production, use a proper markdown library
 */
function simpleMarkdown(text: string): string {
  return (
    text
      // Headers
      .replace(/^### (.*$)/gm, '<h3 class="text-base font-semibold mt-3 mb-1">$1</h3>')
      .replace(/^## (.*$)/gm, '<h2 class="text-lg font-semibold mt-4 mb-2">$1</h2>')
      .replace(/^# (.*$)/gm, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>')
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // Code
      .replace(/`(.*?)`/g, '<code class="bg-muted px-1 rounded text-sm">$1</code>')
      // Lists
      .replace(/^- (.*$)/gm, '<li class="ml-4">$1</li>')
      .replace(/(<li.*<\/li>\n)+/g, '<ul class="list-disc mb-2">$&</ul>')
      // Numbered lists
      .replace(/^\d+\. (.*$)/gm, '<li class="ml-4">$1</li>')
      // Links
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" class="text-blue-600 hover:underline">$1</a>'
      )
      // Paragraphs
      .replace(/\n\n/g, '</p><p class="mb-2">')
      // Line breaks
      .replace(/\n/g, '<br />')
  );
}

export default MCPUIRenderer;
