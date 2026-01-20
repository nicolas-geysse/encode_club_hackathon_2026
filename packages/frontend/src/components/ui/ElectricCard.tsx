import { Component, JSX, children } from 'solid-js';
import './ElectricCard.css';

interface ElectricCardProps {
  children: JSX.Element;
  class?: string;
}

export const ElectricCard: Component<ElectricCardProps> = (props) => {
  const resolvedChildren = children(() => props.children);

  return (
    <div class={`electric-card-root ${props.class || ''}`}>
      {/* SVG Filters Definition */}
      <svg class="electric-svg-defs">
        <defs>
          <filter
            id="turbulent-displace"
            color-interpolation-filters="sRGB"
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
          >
            <feTurbulence
              type="turbulence"
              baseFrequency="0.02"
              numOctaves="3"
              result="noise1"
              seed="1"
            />
            <feOffset in="noise1" dx="0" dy="0" result="offsetNoise1">
              <animate
                attributeName="dy"
                values="300; 0"
                dur="6s"
                repeatCount="indefinite"
                calcMode="linear"
              />
            </feOffset>

            <feTurbulence
              type="turbulence"
              baseFrequency="0.02"
              numOctaves="3"
              result="noise2"
              seed="2"
            />
            <feOffset in="noise2" dx="0" dy="0" result="offsetNoise2">
              <animate
                attributeName="dy"
                values="0; -300"
                dur="6s"
                repeatCount="indefinite"
                calcMode="linear"
              />
            </feOffset>

            <feComposite
              in="offsetNoise1"
              in2="offsetNoise2"
              result="part1"
              operator="arithmetic"
              k1="0"
              k2="1"
              k3="1"
              k4="0"
            />

            <feDisplacementMap
              in="SourceGraphic"
              in2="part1"
              scale="10"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      <div class="electric-card-wrapper">
        <div class="ec-background-glow" />

        <div class="ec-inner-container">
          {/* Animated Electric Border */}
          <div class="ec-main-card-border" />

          {/* Glow Layers */}
          <div class="ec-glow-layer-1" />
          <div class="ec-glow-layer-2" />

          {/* Content */}
          <div class="ec-content">{resolvedChildren()}</div>
        </div>
      </div>
    </div>
  );
};
