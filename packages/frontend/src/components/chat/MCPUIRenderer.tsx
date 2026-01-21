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

import { Show, createSignal, createMemo, For, Switch, Match } from 'solid-js';
import { createLogger } from '~/lib/logger';

const logger = createLogger('MCPUIRenderer');

/**
 * UI Resource type from MCP tool responses
 */
export interface UIResource {
  type: 'text' | 'form' | 'table' | 'chart' | 'metric' | 'grid' | 'link' | 'action' | 'composite';
  id?: string;
  params?: Record<string, unknown>;
  components?: UIResource[];
  metadata?: Record<string, unknown>;
}

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
      fallback={<div class="text-gray-500 text-sm">Unknown UI type: {props.resource.type}</div>}
    >
      <Match when={props.resource.type === 'text'}>
        <TextResource params={props.resource.params} />
      </Match>
      <Match when={props.resource.type === 'table'}>
        <TableResource params={props.resource.params} />
      </Match>
      <Match when={props.resource.type === 'metric'}>
        <MetricResource params={props.resource.params} />
      </Match>
      <Match when={props.resource.type === 'grid'}>
        <GridResource params={props.resource.params} onAction={props.onAction} />
      </Match>
      <Match when={props.resource.type === 'link'}>
        <LinkResource params={props.resource.params} />
      </Match>
      <Match when={props.resource.type === 'action'}>
        <ActionResource params={props.resource.params} onAction={props.onAction} />
      </Match>
      <Match when={props.resource.type === 'composite'}>
        <CompositeResource components={props.resource.components} onAction={props.onAction} />
      </Match>
      <Match when={props.resource.type === 'form'}>
        <FormResource params={props.resource.params} onAction={props.onAction} />
      </Match>
      <Match when={props.resource.type === 'chart'}>
        <ChartPlaceholder params={props.resource.params} />
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
 * Table Resource
 */
function TableResource(props: { params?: Record<string, unknown> }) {
  const title = () => (props.params?.title as string) || '';
  const columns = () => (props.params?.columns as Array<{ key: string; label: string }>) || [];
  const rows = () => (props.params?.rows as Array<Record<string, unknown>>) || [];

  return (
    <div class="table-resource">
      <Show when={title()}>
        <h4 class="font-medium text-sm mb-2">{title()}</h4>
      </Show>
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead>
            <tr class="border-b">
              <For each={columns()}>
                {(col) => (
                  <th class="px-2 py-1 text-left font-medium text-gray-600">{col.label}</th>
                )}
              </For>
            </tr>
          </thead>
          <tbody>
            <For each={rows()}>
              {(row) => (
                <tr class="border-b border-gray-100">
                  <For each={columns()}>
                    {(col) => <td class="px-2 py-1">{String(row[col.key] || '-')}</td>}
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
        : 'text-gray-500';
  });

  return (
    <div class="metric-resource bg-gray-50 rounded-lg p-3">
      <div class="text-xs text-gray-500 uppercase tracking-wide">{title()}</div>
      <div class="mt-1 flex items-baseline gap-1">
        <span class="text-2xl font-bold">{String(value())}</span>
        <Show when={unit()}>
          <span class="text-sm text-gray-500">{unit()}</span>
        </Show>
        <Show when={trend()}>
          <span class={`text-sm ${trendClass()}`}>
            {trend()!.direction === 'up' ? '↑' : trend()!.direction === 'down' ? '↓' : '→'}
          </span>
        </Show>
      </div>
      <Show when={subtitle()}>
        <div class="text-xs text-gray-500 mt-1">{subtitle()}</div>
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
        class="text-blue-600 hover:text-blue-800 underline"
      >
        {label()}
      </a>
      <Show when={description()}>
        <p class="text-xs text-gray-500 mt-1">{description()}</p>
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
        return `${base} bg-blue-600 text-white hover:bg-blue-700`;
      case 'outline':
        return `${base} border border-gray-300 hover:bg-gray-50`;
      case 'ghost':
        return `${base} hover:bg-gray-100`;
      default:
        return base;
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
  const fields = () =>
    (props.params?.fields as Array<{
      name: string;
      label: string;
      type: string;
      required?: boolean;
      value?: unknown;
    }>) || [];
  const submitLabel = () => (props.params?.submitLabel as string) || 'Submit';

  // Initialize form data with default values from fields
  const getInitialData = () => {
    const initial: Record<string, unknown> = {};
    for (const field of fields()) {
      // Initialize with field.value or empty string for required fields
      initial[field.name] = field.value !== undefined && field.value !== '' ? field.value : '';
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
 * Chart Placeholder (would integrate with chart.js)
 */
function ChartPlaceholder(props: { params?: Record<string, unknown> }) {
  const title = () => (props.params?.title as string) || 'Chart';
  const type = () => (props.params?.type as string) || 'bar';

  return (
    <div class="chart-placeholder bg-gray-50 rounded-lg p-4 text-center">
      <div class="text-sm text-gray-500">{title()}</div>
      <div class="text-xs text-gray-400 mt-1">({type()} chart)</div>
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
      .replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1 rounded text-sm">$1</code>')
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
