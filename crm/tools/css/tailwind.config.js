// Configuração do Tailwind que gera crm/public/assets/tailwind.css.
// É o mesmo tema que estava embutido no index.html (cores e fontes da ZX LAB).
// Rode a partir da pasta crm/ (veja crm/tools/css/README.md).
module.exports = {
  content: ['./public/index.html'],
  theme: {
    extend: {
      colors: {
        bg:        { DEFAULT: '#0D0D0D', alt: '#0A0A0A' },
        surface:   { DEFAULT: '#1A1A1A', 2: '#222222' },
        line:      '#2A2A2A',
        ink:       { DEFAULT: '#E2E8F0', dim: '#9CA3AF', mute: '#6B7280' },
        accent:    { DEFAULT: '#D97706', light: '#F59E0B', bright: '#FCD34D' },
        ok:        '#4ADE80',
        bad:       '#EF4444',
        warn:      '#FBBF24',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'], mono: ['"JetBrains Mono"', 'Menlo', 'monospace'] },
    },
  },
};
