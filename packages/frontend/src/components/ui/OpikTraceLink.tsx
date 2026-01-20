/**
 * OpikTraceLink Component
 *
 * "Explain This" button that links to Opik dashboard for trace transparency.
 * Shows users why a recommendation was made (wow factor for hackathon demo).
 *
 * @see sprint-10-5.md TIER 1.4
 */

import { Show } from 'solid-js';
import { ExternalLink, Sparkles } from 'lucide-solid';

interface OpikTraceLinkProps {
  /** Trace URL from the API response (or generated from traceId) */
  traceUrl?: string;
  /** Trace ID to generate URL if traceUrl not provided */
  traceId?: string;
  /** Label text (default: "Why this?") */
  label?: string;
  /** Optional class for styling */
  class?: string;
  /** Compact mode (icon only) */
  compact?: boolean;
}

/**
 * Generate Opik trace URL from traceId
 * Format: https://www.comet.com/opik/{workspace}/projects/{projectId}/traces?trace={traceId}
 */
function getOpikTraceUrl(traceId: string): string {
  const baseUrl = import.meta.env.VITE_OPIK_BASE_URL || 'https://www.comet.com/opik';
  const workspace = import.meta.env.VITE_OPIK_WORKSPACE || 'default';
  const projectId = import.meta.env.VITE_OPIK_PROJECT_ID;

  // Need project ID (UUID) for proper dashboard URLs
  if (!projectId) {
    // Fallback: return project list URL if no project ID configured
    return `${baseUrl}/${workspace}/projects`;
  }

  return `${baseUrl}/${workspace}/projects/${projectId}/traces?trace=${traceId}`;
}

export function OpikTraceLink(props: OpikTraceLinkProps) {
  const url = () => props.traceUrl || (props.traceId ? getOpikTraceUrl(props.traceId) : null);

  return (
    <Show when={url()}>
      <a
        href={url()!}
        target="_blank"
        rel="noopener noreferrer"
        class={`inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors ${props.class || ''}`}
        title="See the AI reasoning behind this recommendation in Opik"
      >
        <Show when={!props.compact} fallback={<Sparkles class="w-3 h-3" />}>
          <Sparkles class="w-3 h-3" />
          <span>{props.label || 'Why this?'}</span>
          <ExternalLink class="w-3 h-3" />
        </Show>
      </a>
    </Show>
  );
}

/**
 * Inline variant for use in chat messages
 */
export function OpikTraceLinkInline(props: Omit<OpikTraceLinkProps, 'compact'>) {
  return <OpikTraceLink {...props} class={`opacity-60 hover:opacity-100 ${props.class || ''}`} />;
}

export default OpikTraceLink;
