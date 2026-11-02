module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--bg-canvas)',
        page: 'var(--bg-canvas)',
        surface: 'var(--bg-surface)',
        'surface-subtle': 'var(--bg-surface-subtle)',
        'surface-alt': 'var(--bg-surface-subtle)',
        nav: 'var(--bg-nav)',
        sidebar: 'var(--bg-nav)',
        input: 'var(--bg-surface-subtle)',
        control: 'var(--bg-surface-subtle)',
        border: {
          DEFAULT: 'var(--border-subtle)',
          subtle: 'var(--border-subtle)',
          card: 'var(--border-card)',
          dashed: 'var(--border-subtle)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          tertiary: 'var(--text-muted)',
        },
        accent: {
          DEFAULT: 'var(--accent-primary)',
          primary: 'var(--accent-primary)',
          hover: 'var(--accent-primary-hover)',
          soft: 'var(--accent-soft)',
          border: 'var(--accent-border)',
          text: '#FFFFFF',
        },
        success: 'var(--accent-primary)',
        danger: '#EF4444',
      },
      fontFamily: {
        heading: ['var(--font-heading)', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Instrument Serif', 'Georgia', 'serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        nav: 'var(--radius-nav)',
        card: 'var(--radius-card)',
        btn: 'var(--radius-btn)',
        badge: 'var(--radius-badge)',
      },
      boxShadow: {
        nav: 'var(--shadow-nav)',
        card: 'var(--shadow-card)',
        btn: 'var(--shadow-btn)',
      },
      animation: {
        'fade-in': 'fadeIn 0.35s ease-out forwards',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};