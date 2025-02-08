export const colors = {
  // Warm, cozy colors inspired by roadtrips
  primary: {
    50: '#fff7ed',  // Soft cream
    100: '#ffedd5', // Warm sand
    200: '#fed7aa', // Light terracotta
    300: '#fdba74', // Sunset orange
    400: '#fb923c', // Vibrant orange
    500: '#f97316', // Primary orange
    600: '#ea580c', // Deep orange
    700: '#c2410c', // Rustic brown
    800: '#9a3412', // Earth brown
    900: '#7c2d12', // Deep brown
  },
  // Neutral colors for text and backgrounds
  neutral: {
    50: '#fafaf9',  // Off white
    100: '#f5f5f4', // Light gray
    200: '#e7e5e4', // Lighter gray
    300: '#d6d3d1', // Light medium gray
    400: '#a8a29e', // Medium gray
    500: '#78716c', // Gray
    600: '#57534e', // Dark gray
    700: '#44403c', // Darker gray
    800: '#292524', // Very dark gray
    900: '#1c1917', // Almost black
  },
  // Accent colors for special elements
  accent: {
    blue: '#3b82f6',   // Sky blue for water features
    green: '#22c55e',  // Forest green for nature elements
    purple: '#8b5cf6', // Twilight purple for night mode
    red: '#ef4444',    // Warning red
  }
};

export const spacing = {
  xs: '0.25rem',   // 4px
  sm: '0.5rem',    // 8px
  md: '1rem',      // 16px
  lg: '1.5rem',    // 24px
  xl: '2rem',      // 32px
  '2xl': '2.5rem', // 40px
  '3xl': '3rem',   // 48px
};

export const borderRadius = {
  sm: '0.25rem',    // 4px
  md: '0.5rem',     // 8px
  lg: '0.75rem',    // 12px
  xl: '1rem',       // 16px
  full: '9999px',   // Circular
};

export const fontSize = {
  xs: '0.75rem',    // 12px
  sm: '0.875rem',   // 14px
  base: '1rem',     // 16px
  lg: '1.125rem',   // 18px
  xl: '1.25rem',    // 20px
  '2xl': '1.5rem',  // 24px
  '3xl': '1.875rem',// 30px
};

export const shadows = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
};

export const transitions = {
  fast: '150ms ease',
  normal: '250ms ease',
  slow: '350ms ease',
};

// Z-index scale
export const zIndex = {
  behind: -1,
  default: 0,
  above: 1,
  header: 10,
  modal: 100,
  toast: 1000,
}; 