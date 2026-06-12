import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        black: '#0A0A0A',
        white: '#F5F5F5',
        'grey-dark': '#1A1A1A',
        'grey-mid': '#2E2E2E',
        'grey-light': '#6B6B6B',
        accent: '#E8E8E8',
        success: '#4ADE80',
        danger: '#F87171',
        warning: '#FACC15',
      },
      fontFamily: {
        mono: ['var(--font-mono)', 'JetBrains Mono', 'IBM Plex Mono', 'monospace'],
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0',
        none: '0',
        sm: '0',
        md: '0',
        lg: '0',
        xl: '0',
        '2xl': '0',
        full: '9999px',
      },
      boxShadow: {
        DEFAULT: 'none',
        sm: 'none',
        md: 'none',
        lg: 'none',
        xl: 'none',
      },
      keyframes: {
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
      animation: {
        blink: 'blink 1s step-end infinite',
      },
    },
  },
  plugins: [],
}

export default config
