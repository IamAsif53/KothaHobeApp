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
          500: 'var(--color-brand-primary, #14b174)',
          600: 'var(--color-brand-dark, #0b8f5d)',
          700: '#0c724c',
          800: '#0f5a3e',
          900: '#0f4a34',
          950: '#05291d',
          soft: 'var(--color-brand-soft, rgba(20, 177, 116, 0.15))',
        },
        chat: {
          bg: 'var(--color-chat-bg, #0b141a)',
          panel: 'var(--color-chat-panel, #111b21)',
          card: 'var(--color-chat-card, #202c33)',
          surfaceSecondary: 'var(--color-chat-surfaceSecondary, #182229)',
          surfaceTertiary: 'var(--color-chat-surfaceTertiary, #233138)',
          input: 'var(--color-chat-input, #2a3942)',
          bubbleOut: 'var(--color-chat-bubbleOut, #005c4b)',
          bubbleOutText: 'var(--color-chat-bubbleOutText, #ffffff)',
          bubbleIn: 'var(--color-chat-bubbleIn, #202c33)',
          bubbleInBorder: 'var(--color-chat-bubbleInBorder, rgba(255, 255, 255, 0.05))',
          bubbleInText: 'var(--color-chat-bubbleInText, #e9edef)',
          accent: 'var(--color-brand-primary, #00a884)',
          accentDark: 'var(--color-brand-dark, #008f6f)',
          accentSoft: 'var(--color-brand-soft, rgba(0, 168, 132, 0.15))',
          textMuted: 'var(--color-chat-textMuted, #8696a0)',
          textSecondary: 'var(--color-chat-textSecondary, #94a3b8)',
          textTertiary: 'var(--color-chat-textTertiary, #64748b)',
          textPrimary: 'var(--color-chat-textPrimary, #e9edef)',
          textDisabled: 'var(--color-chat-textDisabled, #475569)',
          border: 'var(--color-chat-border, rgba(255, 255, 255, 0.1))',
          divider: 'var(--color-chat-divider, rgba(255, 255, 255, 0.06))',
          navBg: 'var(--color-chat-navBg, #111b21)',
          navBorder: 'var(--color-chat-navBorder, rgba(255, 255, 255, 0.1))',
          navActiveIcon: 'var(--color-chat-navActiveIcon, #00a884)',
          navActiveText: 'var(--color-chat-navActiveText, #00a884)',
          navActiveBg: 'var(--color-chat-navActiveBg, rgba(0, 168, 132, 0.12))',
          navInactive: 'var(--color-chat-navInactive, #8696a0)',
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
