/**
 * Proactive Chat Message Queue (Phase 5)
 *
 * Events in the app enqueue messages that are drained and delivered
 * on the next chat load in conversation mode.
 */

import type { UIResource } from '~/types/chat';

export interface QueuedChatMessage {
  id: string;
  content: string;
  uiResource?: UIResource;
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
  ttlHours: number;
  dedupeKey: string;
}

const QUEUE_KEY = 'stride_chat_queue';

function getQueue(): QueuedChatMessage[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function enqueueMessage(msg: Omit<QueuedChatMessage, 'id' | 'createdAt'>): void {
  const queue = getQueue();
  // Dedupe — skip if a message with same dedupeKey already exists
  if (queue.some((m) => m.dedupeKey === msg.dedupeKey)) return;
  queue.push({
    ...msg,
    id: `proactive_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Drain all valid (non-expired) messages from the queue, sorted by priority.
 * Clears the queue after draining.
 */
export function drainQueue(): QueuedChatMessage[] {
  const queue = getQueue();
  if (queue.length === 0) return [];

  const now = Date.now();
  // Filter expired messages
  const valid = queue.filter((m) => {
    const ageHours = (now - new Date(m.createdAt).getTime()) / (1000 * 60 * 60);
    return ageHours < m.ttlHours;
  });

  // Clear queue
  localStorage.removeItem(QUEUE_KEY);

  // Sort by priority (high first)
  const priorityOrder = { high: 3, medium: 2, low: 1 };
  return valid.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
}
