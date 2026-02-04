/**
 * Redirect: /plan → /me
 *
 * Preserves backward compatibility for bookmarks and external links.
 * Handles tab parameter mapping (prospection → jobs, swipe → /swipe).
 */

import { Navigate, useSearchParams } from '@solidjs/router';

export default function PlanRedirect() {
  const [searchParams] = useSearchParams();
  const tab = Array.isArray(searchParams.tab) ? searchParams.tab[0] : searchParams.tab;
  const action = Array.isArray(searchParams.action) ? searchParams.action[0] : searchParams.action;

  // Special case: swipe tab goes to standalone page
  if (tab === 'swipe') {
    return <Navigate href="/swipe" />;
  }

  // Map old tab names to new
  const tabMapping: Record<string, string> = {
    prospection: 'jobs',
  };

  const newTab = tab ? tabMapping[tab] || tab : undefined;

  // Build new URL
  let newUrl = '/me';
  const params = new URLSearchParams();
  if (newTab) params.set('tab', newTab);
  if (action) params.set('action', action);

  const queryString = params.toString();
  if (queryString) {
    newUrl += `?${queryString}`;
  }

  return <Navigate href={newUrl} />;
}
