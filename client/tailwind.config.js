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
        // Brand maroon, sampled from the printed lot sign so screen and print
        // match. 13.1:1 on white, so it works as body-weight link text and as a
        // filled surface with white text on it.
        maroon: {
          DEFAULT: '#680018',
          300: '#E8A3B0', // light tint — 8.5:1 on ink, for accent text on dark
          600: '#680018',
          700: '#4F0012', // hover/pressed
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
