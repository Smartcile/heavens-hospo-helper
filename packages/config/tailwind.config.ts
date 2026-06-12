import type { Config } from 'tailwindcss'

export const tailwindConfig: Config = {
  content: [],
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
        mono: ['JetBrains Mono', 'IBM Plex Mono', 'Courier New', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0px',
        none: '0px',
        sm: '0px',
        md: '0px',
        lg: '0px',
        xl: '0px',
        full: '0px',
      },
      boxShadow: {
        DEFAULT: 'none',
        sm: 'none',
        md: 'none',
        lg: 'none',
        xl: 'none',
      },
    },
  },
  plugins: [],
}

export default tailwindConfig
