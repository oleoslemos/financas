/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'Segoe UI', 'Trebuchet MS', 'Verdana', 'sans-serif'],
        hub: ['Sora', 'DM Sans', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
