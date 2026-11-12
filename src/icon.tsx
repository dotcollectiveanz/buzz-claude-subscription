// A simple spark for the harness, drawn for this plugin: twelve rounded rays
// in a warm orange. Not Anthropic's logo.
import { React } from "./react";

const RAYS = Array.from({ length: 12 }, (_, index) => index * 30);

export function ClaudeIcon({
  size = "1em",
  ...props
}: { size?: number | string } & Record<string, unknown>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <g
        stroke="#D97757"
        strokeWidth={2.6}
        strokeLinecap="round"
        transform="translate(16 16)"
      >
        {RAYS.map((angle) => (
          <line
            key={angle}
            x1={0}
            y1={-4}
            x2={0}
            y2={angle % 60 ? -11 : -13}
            transform={`rotate(${angle})`}
          />
        ))}
      </g>
    </svg>
  );
}
// React is read when the component renders, after the plugin applies.
void React;
