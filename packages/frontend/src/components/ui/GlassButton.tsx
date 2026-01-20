import { JSX, splitProps } from 'solid-js';
import './GlassButton.css';

interface GlassButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: JSX.Element;
}

export function GlassButton(props: GlassButtonProps) {
  const [local, others] = splitProps(props, ['children', 'class']);

  return (
    <div class={`glass-button-wrap glass-button-root ${local.class || ''}`}>
      <button {...others} class="glass-button">
        <span class="glass-text">{local.children}</span>
      </button>
      <div class="glass-button-shadow" />
    </div>
  );
}
