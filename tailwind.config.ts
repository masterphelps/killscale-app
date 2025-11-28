import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          dark: '#09090b',
          sidebar: '#0f0f12',
          card: '#18181b',
          hover: '#1f1f23',
        },
        border: {
          DEFAULT: '#27272a',
          light: '#3f3f46',
        },
        accent: {
          DEFAULT: '#3b82f6',
          hover: '#2563eb',
        },
        verdict: {
          scale: '#10b981',
          'scale-bg': 'rgba(16, 185, 129, 0.1)',
          watch: '#f59e0b',
          'watch-bg': 'rgba(245, 158, 11, 0.1)',
          cut: '#ef4444',
          'cut-bg': 'rgba(239, 68, 68, 0.1)',
          learn: '#6b7280',
          'learn-bg': 'rgba(107, 114, 128, 0.1)',
        },
        hierarchy: {
          campaign: '#3b82f6',
          'campaign-bg': 'rgba(59, 130, 246, 0.15)',
          adset: '#8b5cf6',
          'adset-bg': 'rgba(139, 92, 246, 0.1)',
        }
      },
      fontFamily: {
        sans: ['Outfit', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
export default config
