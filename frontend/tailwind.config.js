/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        '3xl': '1920px',
        '4k': '2560px',
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top, 0px)',
        'safe-bottom': 'env(safe-area-inset-bottom, 0px)',
        'safe-left': 'env(safe-area-inset-left, 0px)',
        'safe-right': 'env(safe-area-inset-right, 0px)',
        'touch': '48px',
      },
      minHeight: {
        'touch': '48px',
        'dvh': '100dvh',
      },
      minWidth: {
        'touch': '48px',
      },
      colors: {
        feud: {
          blue: {
            DEFAULT: '#0d2568',
            dark: '#081742',
            light: '#1e3a8a',
            glow: '#3b82f6'
          },
          gold: {
            DEFAULT: '#f59e0b',
            light: '#fbbf24',
            dark: '#b45309',
            glow: '#fef08a'
          },
          red: {
            DEFAULT: '#dc2626',
            dark: '#991b1b',
            glow: '#f87171'
          },
          slate: {
            DEFAULT: '#0f172a',
            card: '#1e293b',
            border: '#334155'
          }
        }
      },
      fontFamily: {
        game: ['Impact', 'Arial Black', 'sans-serif'],
      },
      animation: {
        'card-flip': 'cardFlip 0.6s ease-in-out forwards',
        'buzzer-pulse': 'buzzerPulse 1s infinite',
        'strike-shake': 'strikeShake 0.5s ease-in-out',
      },
      keyframes: {
        cardFlip: {
          '0%': { transform: 'rotateX(0deg)' },
          '100%': { transform: 'rotateX(180deg)' },
        },
        buzzerPulse: {
          '0%, 100%': { transform: 'scale(1)', boxShadow: '0 0 20px rgba(239, 68, 68, 0.7)' },
          '50%': { transform: 'scale(1.05)', boxShadow: '0 0 40px rgba(239, 68, 68, 1)' },
        },
        strikeShake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-10px)' },
          '40%, 80%': { transform: 'translateX(10px)' },
        }
      }
    },
  },
  plugins: [
    function safeAreaAndErgonomicsPlugin({ addUtilities }) {
      addUtilities({
        '.pt-safe': { paddingTop: 'env(safe-area-inset-top, 0px)' },
        '.pb-safe': { paddingBottom: 'env(safe-area-inset-bottom, 0px)' },
        '.pl-safe': { paddingLeft: 'env(safe-area-inset-left, 0px)' },
        '.pr-safe': { paddingRight: 'env(safe-area-inset-right, 0px)' },
        '.px-safe': {
          paddingLeft: 'env(safe-area-inset-left, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
        },
        '.py-safe': {
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        },
        '.min-h-dvh-safe': {
          minHeight: ['100vh', '100dvh'],
        },
        '.touch-target': {
          minHeight: '48px',
          minWidth: '48px',
          touchAction: 'manipulation',
        },
      });
    },
  ],
};
