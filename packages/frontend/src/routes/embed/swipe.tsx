/**
 * Embed Swipe Route (/embed/swipe)
 *
 * Standalone route for embedding SwipeTab in an iframe.
 * No header, sidebar, or navigation - just the swipe component.
 */

import { SwipeTab } from '~/components/tabs/SwipeTab';
import { useProfile } from '~/lib/profileContext';

export default function EmbedSwipePage() {
  const { profile } = useProfile();

  return (
    <div class="h-screen overflow-auto bg-background">
      <SwipeTab embedMode={true} currency={profile()?.currency} profileId={profile()?.id} />
    </div>
  );
}
