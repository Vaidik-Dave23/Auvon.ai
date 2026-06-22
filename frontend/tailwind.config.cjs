module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        page:        'var(--bg-page)',
        surface:     'var(--bg-surface)',
        'surface-alt': 'var(--bg-surface-alt)',
        sidebar:     'var(--bg-sidebar)',
        input:       'var(--bg-input)',
        control:     'var(--bg-control)',
        border: {
          DEFAULT: 'var(--border-default)',
          subtle:  'var(--border-subtle)',
          dashed:  'var(--border-dashed)',
        },
        text: {
          primary:   'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary:  'var(--text-tertiary)',
        },
        accent:  'var(--accent)',
        success: 'var(--success)',
        danger:  'var(--danger)',
      },
      fontFamily: {
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        sans:  ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out forwards',
        'slide-up': 'slideUp 0.5s ease-out forwards',
        'pulse-glow': 'pulseGlow 2s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(15px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 15px rgba(59, 47, 227, 0.4)' },
          '50%': { boxShadow: '0 0 25px rgba(59, 47, 227, 0.7)' },
        }
      }
    },
  },
  plugins: [],
};