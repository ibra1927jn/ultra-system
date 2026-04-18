import type { Config } from 'tailwindcss';

// Tokens según brief §R8: fondo negro, texto gris, acento cyan-green,
// rojo SOLO ≤7d accionable, ámbar ≤30d.
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#000000',
          panel: '#0a0a0a',
          elev: '#141414',
        },
        fg: {
          DEFAULT: '#d4d4d8',
          muted: '#9ca3af',
          dim: '#6b7280',
        },
        accent: {
          DEFAULT: '#22d3ae',
          hover: '#34e5c0',
          dim: '#0f766e',
        },
        critical: '#ef4444',
        attention: '#f59e0b',
        ok: '#22c55e',
        border: {
          DEFAULT: '#1f2937',
          strong: '#374151',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'kpi': ['2.25rem', { lineHeight: '1', fontWeight: '600' }],
        'kpi-lg': ['2.5rem', { lineHeight: '1', fontWeight: '600' }],
        'section': ['1.5rem', { lineHeight: '1.2', fontWeight: '600' }],
        'card-title': ['1rem', { lineHeight: '1.3', fontWeight: '600' }],
        'meta': ['0.8125rem', { lineHeight: '1.4' }],
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
    },
  },
  plugins: [],
};

export default config;
