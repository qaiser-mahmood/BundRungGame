/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        felt: {
          dark: '#0a2318',
          DEFAULT: '#0f3826',
          light: '#164e36',
          border: '#1b5c40',
        },
        gold: {
          light: '#fde047',
          DEFAULT: '#eab308',
          dark: '#ca8a04',
          accent: '#d97706',
        },
        wood: {
          dark: '#2c1810',
          DEFAULT: '#3d2314',
          light: '#5c3826',
        }
      },
      boxShadow: {
        'table': 'inset 0 0 100px rgba(0, 0, 0, 0.8), 0 20px 50px rgba(0, 0, 0, 0.9)',
        'card': '0 8px 16px rgba(0, 0, 0, 0.35), 0 2px 4px rgba(0, 0, 0, 0.2)',
        'glow-gold': '0 0 25px rgba(234, 179, 8, 0.45)',
        'glow-blue': '0 0 25px rgba(59, 130, 246, 0.45)',
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: 1, filter: 'drop-shadow(0 0 15px rgba(234, 179, 8, 0.6))' },
          '50%': { opacity: 0.6, filter: 'drop-shadow(0 0 5px rgba(234, 179, 8, 0.2))' },
        }
      }
    },
  },
  plugins: [],
}
