/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./dist/**/*.{html,js}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"SF Pro Display"', '"Segoe UI"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"SF Mono"', '"JetBrains Mono"', 'monospace'],
      },
      colors: {
        primary: {
          DEFAULT: '#0066cc',
          dark: '#0053a3',
          50: '#e6f0ff',
          500: '#0066cc',
          600: '#0053a3',
        },
        success: '#1d9b6c',
        error: '#d64545',
        warning: '#e08b2e',
      },
      boxShadow: {
        'sm': '0 2px 8px rgba(0, 0, 0, 0.05)',
        'md': '0 12px 32px rgba(0, 0, 0, 0.12)',
      },
      borderRadius: {
        'sm': '6px',
        'md': '10px',
        'lg': '16px',
        'xl': '20px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
