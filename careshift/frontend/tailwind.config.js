/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary:         '#2563EB',
        'primary-hover': '#1D4ED8',
        success:         '#10B981',
        warning:         '#F59E0B',
        danger:          '#EF4444',
        background:      '#F8FAFC',
        card:            '#FFFFFF',
        border:          '#E2E8F0',
        text:            '#0F172A',
        subtext:         '#64748B',
      },
      borderRadius: {
        lg: '12px',
        xl: '16px',
      },
      fontSize: {
        'heading':    ['22px', { fontWeight: '700', lineHeight: '1.3' }],
        'card-title': ['18px', { fontWeight: '700', lineHeight: '1.4' }],
        'body':       ['16px', { fontWeight: '400', lineHeight: '1.6' }],
        'sub':        ['14px', { fontWeight: '400', lineHeight: '1.5' }],
        'btn':        ['16px', { fontWeight: '700', lineHeight: '1' }],
      },
      fontFamily: {
        sans: ['Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
