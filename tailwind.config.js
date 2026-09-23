/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: v('background'),
        surface: v('surface'),
        surface2: v('surface-secondary'),
        fg: v('text'),
        muted: v('text-muted'),
        line: v('border'),
        accent: v('accent'),
        'accent-fg': v('accent-fg'),
        success: v('success'),
        warning: v('warning'),
        error: v('error'),
        info: v('info'),
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Noto Sans', 'Noto Sans Devanagari', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      borderRadius: { DEFAULT: '6px' },
    },
  },
  plugins: [],
};
