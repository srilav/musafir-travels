/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#F3E9DA',
        surface: '#FFFFFF',
        primary: { DEFAULT: '#1B3A5F', hover: '#14293F' },
        text: { DEFAULT: '#22313F', muted: '#8A7862' },
        border: '#E0D0B8',
        error: '#C0392B',
      },
      fontFamily: {
        sans: ['"Fira Sans"', 'sans-serif'],
      },
    },
  },
}
