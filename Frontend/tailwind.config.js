/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts}'],
  theme: {
    extend: {
      colors: {
        bg: '#F3F4F8',
        surface: '#FFFFFF',
        surfacealt: '#F9FAFC',
        sunken: '#ECEEF4',
        border: '#E5E7F0',
        borderstrong: '#D6D9E5',
        ink: '#0C0D14',
        primary: { DEFAULT: '#4A5CFA', dark: '#3846D6', soft: '#EAECFF' },
        warning: { DEFAULT: '#FF5A3C', soft: '#FFE8E2' },
        caution: { DEFAULT: '#EEC13B', soft: '#FBF1D2' },
        success: { DEFAULT: '#1FB871', soft: '#DFF6EA' },
        critical: { DEFAULT: '#E23838', soft: '#FCE1E1' },
        copper: { DEFAULT: '#C97C4B', soft: '#F4E4D7' },
        ttext: { primary: '#14161F', secondary: '#878C9F', tertiary: '#BBBFCF' }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace']
      },
      boxShadow: {
        card: '0 1px 2px rgba(20,22,31,0.05), 0 10px 24px -10px rgba(20,22,31,0.10)'
      }
    }
  },
  plugins: []
}
