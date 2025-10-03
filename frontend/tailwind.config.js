module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "Helvetica", "Arial"] },
      colors: {
        'bw-primary': { 50:'#eef8ff',100:'#d9efff',200:'#b8e1ff',300:'#86ccff',400:'#4fb1ff',500:'#1E88E5',600:'#176fbe',700:'#135a9a',800:'#104a7f',900:'#0d3f6b' },
        'bw-secondary': { 50:'#ecfdf5',100:'#d1fae5',200:'#a7f3d0',300:'#6ee7b7',400:'#34d399',500:'#10B981',600:'#059669',700:'#047857',800:'#065f46',900:'#064e3b' },
        'bw-accent': '#8B5CF6',
      },
      boxShadow: { 'soft':'0 6px 30px rgba(2,12,27,0.06)','elev':'0 12px 40px rgba(2,12,27,0.10)' },
      borderRadius: { '2xl': '1rem', '3xl': '1.25rem' },
      backgroundImage: {
        'bw-gradient': 'linear-gradient(135deg, #1E88E5 0%, #10B981 100%)',
        'bw-card': 'linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.75) 100%)',
      },
    },
  },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/typography')],
};