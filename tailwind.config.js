/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    './lib/**/*.{js,jsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // The accent is champagne gold. `brand` is remapped to it so every
        // existing bg-brand / text-brand / brand-soft usage adopts the luxe
        // accent without touching each call site.
        brand: { DEFAULT: '#b0842a', dark: '#8a6516', light: '#e6c878', soft: '#f3ecda' },
        gold: {
          DEFAULT: '#c9a24b',
          50: '#faf6ec',
          100: '#f3ecda',
          200: '#e6d3a3',
          300: '#dcc07f',
          400: '#cfa856',
          500: '#c9a24b',
          600: '#b0842a',
          700: '#8a6516',
          800: '#6d4f12',
          900: '#4b360c',
        },
        champagne: '#e6c878',
        // Warm ink + paper neutrals (light "editorial luxe").
        ink: '#201b13',
        paper: '#fffdf9',
        ivory: '#f6f3ec',
        // Warm near-black surfaces (dark "premium").
        obsidian: '#0c0b09',
        graphite: '#16130f',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['var(--font-serif)', 'Fraunces', 'Georgia', 'serif'],
        display: ['var(--font-serif)', 'Fraunces', 'Georgia', 'serif'],
      },
      boxShadow: {
        // Softer, layered shadows for a more refined, less "flat card" feel.
        card: '0 1px 2px rgba(32,27,19,.04), 0 6px 20px -8px rgba(32,27,19,.10)',
        pop: '0 24px 60px -20px rgba(32,27,19,.28), 0 8px 24px -12px rgba(32,27,19,.16)',
        gold: '0 8px 24px -6px rgba(176,132,42,.35)',
      },
      letterSpacing: {
        luxe: '-0.02em',
      },
    },
  },
  plugins: [],
};
