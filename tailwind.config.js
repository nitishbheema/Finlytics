/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#cc7a3e',
          soft: 'rgba(204,122,62,0.15)',
          glow: 'rgba(204,122,62,0.25)',
          hover: '#b56832',
        },
        dark: {
          bg: '#0e0e0f',
          surface: '#161618',
          surface2: '#1e1e21',
          surface3: '#26262a',
          border: 'rgba(255,255,255,0.07)',
          border2: 'rgba(255,255,255,0.12)',
        },
        light: {
          bg: '#f5f5f3',
          surface: '#ffffff',
          surface2: '#f0f0ee',
          surface3: '#e8e8e5',
          border: 'rgba(0,0,0,0.07)',
          border2: 'rgba(0,0,0,0.12)',
        },
        status: {
          success: '#5cb98a',
          warning: '#d4a84b',
          danger: '#e0655a',
          blue: '#6b9cf7',
        }
      },
      fontFamily: {
        display: ['Sora', 'sans-serif'],
        body: ['IBM Plex Sans', 'sans-serif'],
      },
      boxShadow: {
        card: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
        floating: '0 12px 40px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.4)',
        glow: '0 8px 32px rgba(204,122,62,0.22)',
      }
    },
  },
  plugins: [],
};
