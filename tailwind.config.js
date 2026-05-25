/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Bodoni Moda"', '"Bodoni Moda Variable"', 'Georgia', 'serif'],
        sans: ['"Public Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        felt: {
          deep:  'oklch(0.22 0.045 152)',
          mid:   'oklch(0.29 0.055 152)',
          light: 'oklch(0.36 0.060 150)',
        },
        wood: {
          deep:  'oklch(0.16 0.035 32)',
          mid:   'oklch(0.22 0.050 30)',
          light: 'oklch(0.30 0.055 35)',
        },
        brass: {
          hi:    'oklch(0.82 0.105 82)',
          DEFAULT:'oklch(0.68 0.110 78)',
          mid:   'oklch(0.54 0.095 72)',
          lo:    'oklch(0.38 0.070 65)',
        },
        ivory: {
          DEFAULT:'oklch(0.965 0.015 86)',
          edge:   'oklch(0.90 0.020 84)',
        },
        ink: {
          100: 'oklch(0.96 0.012 84)',
          200: 'oklch(0.86 0.018 80)',
          300: 'oklch(0.70 0.022 78)',
          400: 'oklch(0.54 0.020 75)',
          500: 'oklch(0.40 0.018 70)',
        },
        env: {
          deep: 'oklch(0.13 0.022 32)',
          mid:  'oklch(0.17 0.028 32)',
        },
      },
      boxShadow: {
        card: '0 1px 0 oklch(1 0 0 / 0.6) inset, 0 -1px 0 oklch(0 0 0 / 0.1) inset, 0 8px 18px oklch(0.10 0.02 30 / 0.55), 0 2px 4px oklch(0.10 0.02 30 / 0.35)',
        'card-sm': '0 1px 0 oklch(1 0 0 / 0.5) inset, 0 4px 10px oklch(0.10 0.02 30 / 0.5)',
        rail: '0 30px 60px -20px oklch(0 0 0 / 0.8), 0 8px 20px oklch(0 0 0 / 0.4)',
        brass: 'inset 0 1px 0 oklch(0.95 0.04 85 / 0.85), inset 0 -1px 0 oklch(0.30 0.05 65 / 0.7)',
      },
    },
  },
  plugins: [],
}
