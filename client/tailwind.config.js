/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#0F1B2D',
          600: '#1B2A40',
          700: '#16243A',
        },
        terracotta: {
          DEFAULT: '#C65D3E',
          600: '#B14E31',
          700: '#974227',
        },
        warm: '#FBF8F3',
        sand: '#E8DDD0',
        'slate-warm': '#4A5568',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"IBM Plex Serif"', 'ui-serif', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
