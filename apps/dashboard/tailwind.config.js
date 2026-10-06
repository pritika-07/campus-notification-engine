/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          indigo: {
            50: '#eef2ff',
            100: '#e0e7ff',
            500: '#6366f1',
            600: '#4f46e5',
            700: '#4338ca',
          },
          emerald: {
            500: '#10b981',
            600: '#059669',
          },
          rose: {
            500: '#f43f5e',
            600: '#e11d48',
          },
        },
      },
    },
  },
  plugins: [],
};
