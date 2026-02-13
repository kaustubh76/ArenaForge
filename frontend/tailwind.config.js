/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        arcade: {
          purple: '#a855f7',
          cyan: '#06b6d4',
          pink: '#ec4899',
          green: '#22c55e',
          gold: '#eab308',
          orange: '#f97316',
          red: '#ef4444',
          blue: '#3b82f6',
        },
        surface: {
          0: '#050508',
          1: '#0a0a10',
          2: '#101018',
          3: '#161622',
          4: '#1c1c2e',
        },
        game: {
          oracle: '#f59e0b',
          strategy: '#8b5cf6',
          auction: '#06b6d4',
          quiz: '#22c55e',
        },
        elo: {
          bronze: '#cd7f32',
          silver: '#c0c0c0',
          gold: '#ffd700',
          diamond: '#b9f2ff',
          master: '#ff6b6b',
        },
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out forwards',
        'fade-in-up': 'fadeInUp 0.6s ease-out forwards',
        'fade-in-down': 'fadeInDown 0.4s ease-out forwards',
        'slide-in-right': 'slideInRight 0.4s ease-out forwards',
        'slide-in-left': 'slideInLeft 0.4s ease-out forwards',
        'scale-in': 'scaleIn 0.3s ease-out forwards',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'float': 'float 3s ease-in-out infinite',
        'float-slow': 'float 6s ease-in-out infinite',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'gradient-shift': 'gradientShift 8s ease infinite',
        'border-glow': 'borderGlow 3s ease-in-out infinite',
        'screen-shake': 'screenShake 0.3s ease-in-out',
        'neon-flicker': 'neonFlicker 3s ease-in-out infinite',
        'scanline': 'scanline 8s linear infinite',
        'crt-turn-on': 'crtTurnOn 0.5s ease-out forwards',
        'score-pop': 'scorePop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'versus-slam': 'versusSlam 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'coin-insert': 'coinInsert 0.5s ease-out forwards',
        'pixel-fade-in': 'pixelFadeIn 0.4s steps(8) forwards',
        'bar-fill': 'barFill 1s ease-out forwards',
        'pulse-neon': 'pulseNeon 2s ease-in-out infinite',
        'type-cursor': 'typeCursor 1s step-end infinite',
        'bounce-subtle': 'bounceSubtle 2s ease-in-out infinite',
        'ticker': 'ticker 40s linear infinite',
      },
      keyframes: {
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(24px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInDown: {
          from: { opacity: '0', transform: 'translateY(-12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          from: { opacity: '0', transform: 'translateX(-24px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        slideInLeft: {
          from: { opacity: '0', transform: 'translateX(24px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.92)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 8px rgba(168,85,247,0.3), 0 0 24px rgba(168,85,247,0.1)' },
          '50%': { boxShadow: '0 0 16px rgba(168,85,247,0.5), 0 0 48px rgba(168,85,247,0.2)' },
        },
        shimmer: {
          from: { backgroundPosition: '-200% center' },
          to: { backgroundPosition: '200% center' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        gradientShift: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        borderGlow: {
          '0%, 100%': { borderColor: 'rgba(168,85,247,0.3)' },
          '50%': { borderColor: 'rgba(168,85,247,0.6)' },
        },
        screenShake: {
          '0%, 100%': { transform: 'translate(0)' },
          '20%': { transform: 'translate(-3px, 2px)' },
          '40%': { transform: 'translate(3px, -2px)' },
          '60%': { transform: 'translate(-2px, -1px)' },
          '80%': { transform: 'translate(2px, 1px)' },
        },
        neonFlicker: {
          '0%, 19%, 21%, 23%, 25%, 54%, 56%, 100%': { opacity: '1' },
          '20%, 24%, 55%': { opacity: '0.6' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        crtTurnOn: {
          '0%': { opacity: '0', transform: 'scaleY(0.01) scaleX(0.8)' },
          '50%': { opacity: '0.5', transform: 'scaleY(0.6) scaleX(1.1)' },
          '100%': { opacity: '1', transform: 'scaleY(1) scaleX(1)' },
        },
        scorePop: {
          '0%': { transform: 'scale(0.5)', opacity: '0' },
          '70%': { transform: 'scale(1.15)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        versusSlam: {
          '0%': { transform: 'scale(3) rotate(15deg)', opacity: '0' },
          '60%': { transform: 'scale(0.9) rotate(-5deg)', opacity: '1' },
          '100%': { transform: 'scale(1) rotate(0)' },
        },
        coinInsert: {
          '0%': { transform: 'translateY(-20px)', opacity: '0' },
          '50%': { transform: 'translateY(4px)', opacity: '1' },
          '100%': { transform: 'translateY(0)' },
        },
        pixelFadeIn: {
          '0%': { opacity: '0', filter: 'blur(4px)' },
          '100%': { opacity: '1', filter: 'blur(0)' },
        },
        barFill: {
          '0%': { width: '0%' },
          '100%': { width: 'var(--bar-width)' },
        },
        pulseNeon: {
          '0%, 100%': { boxShadow: '0 0 5px currentColor, 0 0 20px currentColor' },
          '50%': { boxShadow: '0 0 10px currentColor, 0 0 40px currentColor, 0 0 60px currentColor' },
        },
        typeCursor: {
          '0%, 100%': { borderColor: 'currentColor' },
          '50%': { borderColor: 'transparent' },
        },
        bounceSubtle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'mesh-gradient': 'radial-gradient(at 40% 20%, rgba(168,85,247,0.12) 0px, transparent 50%), radial-gradient(at 80% 0%, rgba(6,182,212,0.08) 0px, transparent 50%), radial-gradient(at 0% 50%, rgba(236,72,153,0.06) 0px, transparent 50%)',
      },
      boxShadow: {
        'neon-purple': '0 0 8px rgba(168,85,247,0.4), 0 0 24px rgba(168,85,247,0.15)',
        'neon-cyan': '0 0 8px rgba(6,182,212,0.4), 0 0 24px rgba(6,182,212,0.15)',
        'neon-pink': '0 0 8px rgba(236,72,153,0.4), 0 0 24px rgba(236,72,153,0.15)',
        'neon-green': '0 0 8px rgba(34,197,94,0.4), 0 0 24px rgba(34,197,94,0.15)',
        'neon-gold': '0 0 8px rgba(234,179,8,0.4), 0 0 24px rgba(234,179,8,0.15)',
        'arcade-card': '0 0 1px rgba(168,85,247,0.6), 0 4px 12px rgba(0,0,0,0.6)',
        'arcade-card-hover': '0 0 2px rgba(168,85,247,0.8), 0 0 20px rgba(168,85,247,0.2), 0 8px 24px rgba(0,0,0,0.6)',
        'inner-glow': 'inset 0 1px 0 0 rgba(255,255,255,0.05)',
      },
    },
  },
  plugins: [],
};
