/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Foliate / GNOME Adwaita light palette
        app: {
          bg:      '#f6f5f4', // warm off-white window background (Adwaita @window-bg-color)
          surface: '#ffffff', // headerbar, pure white
          card:    '#ffffff', // book cards
          hover:   '#f0eeec', // subtle warm hover
          border:  '#deddda', // Adwaita separator / divider
        },
        fg: {
          primary:   '#1c1c1c', // near-black text
          secondary: '#5c5c5c', // dim text
          muted:     '#9a9a9a', // placeholder / hint text
        },
        accent: {
          DEFAULT: '#3584e4', // Adwaita primary blue (light mode)
          hover:   '#2269c4',
          muted:   'rgba(53,132,228,0.12)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Cantarell', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        card: '10px',
      },
    },
  },
  plugins: [],
};
