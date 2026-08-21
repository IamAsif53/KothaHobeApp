/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eefcf5',
          100: '#d7f7e6',
          200: '#b2efd1',
          300: '#7be1b4',
          400: '#3ecc91',
          500: '#14b174', // WhatsApp / Emerald identity
          600: '#0b8f5d',
          700: '#0c724c',
          800: '#0f5a3e',
          900: '#0f4a34',
          950: '#05291d',
        },
        chat: {
          bg: '#0b141a', // WhatsApp Dark Mode background
          panel: '#111b21',
          card: '#202c33',
          input: '#2a3942',
          bubbleOut: '#005c4b', // Sent message bubble
          bubbleIn: '#202c33', // Received message bubble
          accent: '#00a884',
          textMuted: '#8696a0',
          textPrimary: '#e9edef',
        }
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.18s ease-out forwards',
        'slide-up': 'slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'message-enter': 'messageEnter 0.14s ease-out forwards',
        'page-enter': 'pageEnter 0.18s ease-out forwards',
        'modal-enter': 'modalEnter 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'sheet-up': 'sheetUp 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'shimmer': 'shimmer 1.6s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        messageEnter: {
          '0%': { transform: 'translateY(5px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        pageEnter: {
          '0%': { transform: 'translateY(6px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        modalEnter: {
          '0%': { transform: 'scale(0.96)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        sheetUp: {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
    },
  },
  plugins: [],
};
