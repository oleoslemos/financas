/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      /** Escala global −2px vs defaults Tailwind (padronização do projeto). */
      fontSize: {
        xs: ['10px', { lineHeight: '14px' }],
        sm: ['12px', { lineHeight: '16px' }],
        base: ['14px', { lineHeight: '20px' }],
        lg: ['16px', { lineHeight: '24px' }],
        xl: ['18px', { lineHeight: '28px' }],
        '2xl': ['22px', { lineHeight: '28px' }],
        '3xl': ['28px', { lineHeight: '32px' }],
        '4xl': ['34px', { lineHeight: '40px' }],
        '5xl': ['46px', { lineHeight: '1' }],
        '6xl': ['58px', { lineHeight: '1' }],
        '7xl': ['70px', { lineHeight: '1' }],
        '8xl': ['94px', { lineHeight: '1' }],
        '9xl': ['126px', { lineHeight: '1' }],
        /** Menu lateral (valores finos fora da escala padrão). */
        'sidebar-section': ['11px', { lineHeight: '14px' }],
        'sidebar-item': ['9px', { lineHeight: '13px' }],
      },
      fontFamily: {
        sans: ['DM Sans', 'Segoe UI', 'Trebuchet MS', 'Verdana', 'sans-serif'],
        hub: ['Sora', 'DM Sans', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
