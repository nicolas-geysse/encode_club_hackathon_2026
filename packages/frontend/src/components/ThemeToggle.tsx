/**
 * Theme Toggle Component
 *
 * Button to toggle between light and dark mode with sun/moon icons.
 */

import { Show } from 'solid-js';
import { useTheme } from '~/lib/themeContext';
import { Button } from '~/components/ui/Button';
import { Sun, Moon } from 'lucide-solid';

export function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      title={isDark() ? 'Switch to light mode' : 'Switch to dark mode'}
      class="rounded-full"
    >
      <Show when={isDark()} fallback={<Moon class="h-5 w-5 text-slate-600" />}>
        <Sun class="h-5 w-5 text-yellow-400" />
      </Show>
    </Button>
  );
}

export default ThemeToggle;
