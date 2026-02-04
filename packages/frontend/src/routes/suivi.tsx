/**
 * Redirect: /suivi → /progress
 *
 * Preserves backward compatibility for bookmarks and external links.
 */

import { Navigate } from '@solidjs/router';

export default function SuiviRedirect() {
  return <Navigate href="/progress" />;
}
