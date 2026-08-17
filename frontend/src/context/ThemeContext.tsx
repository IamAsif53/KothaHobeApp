import React, { createContext, useContext, useState, useEffect } from 'react';

export type AppTheme = 'dark' | 'midnight' | 'emerald' | 'navy' | 'charcoal';
export type AppFontSize = 'compact' | 'normal' | 'large';

interface ThemeContextType {
  theme: AppTheme;
  fontSize: AppFontSize;
  setTheme: (theme: AppTheme) => void;
  setFontSize: (size: AppFontSize) => void;
  themeConfig: {
    bg: string;
    panel: string;
    card: string;
    input: string;
    bubbleIn: string;
    bubbleOut: string;
    accent: string;
  };
}

const THEME_CONFIGS: Record<AppTheme, {
  bg: string;
  panel: string;
  card: string;
  input: string;
  bubbleIn: string;
  bubbleOut: string;
  accent: string;
}> = {
  dark: {
    bg: '#0b141a',
    panel: '#111b21',
    card: '#202c33',
    input: '#2a3942',
    bubbleIn: '#202c33',
    bubbleOut: '#005c4b',
    accent: '#00a884',
  },
  midnight: {
    bg: '#0f172a',
    panel: '#1e293b',
    card: '#334155',
    input: '#1e293b',
    bubbleIn: '#334155',
    bubbleOut: '#2563eb',
    accent: '#38bdf8',
  },
  emerald: {
    bg: '#06281e',
    panel: '#0a3d2e',
    card: '#11523f',
    input: '#0a3d2e',
    bubbleIn: '#11523f',
    bubbleOut: '#059669',
    accent: '#10b981',
  },
  navy: {
    bg: '#0a192f',
    panel: '#112240',
    card: '#233554',
    input: '#112240',
    bubbleIn: '#233554',
    bubbleOut: '#1d4ed8',
    accent: '#60a5fa',
  },
  charcoal: {
    bg: '#18181b',
    panel: '#27272a',
    card: '#3f3f46',
    input: '#27272a',
    bubbleIn: '#3f3f46',
    bubbleOut: '#4f46e5',
    accent: '#818cf8',
  },
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<AppTheme>(() => {
    const saved = localStorage.getItem('kotha_hobe_chat_theme') as AppTheme;
    return saved && THEME_CONFIGS[saved] ? saved : 'dark';
  });

  const [fontSize, setFontSizeState] = useState<AppFontSize>(() => {
    const saved = localStorage.getItem('kotha_hobe_font_size') as AppFontSize;
    return saved && ['compact', 'normal', 'large'].includes(saved) ? saved : 'normal';
  });

  const setTheme = (newTheme: AppTheme) => {
    setThemeState(newTheme);
    localStorage.setItem('kotha_hobe_chat_theme', newTheme);
  };

  const setFontSize = (newSize: AppFontSize) => {
    setFontSizeState(newSize);
    localStorage.setItem('kotha_hobe_font_size', newSize);
  };

  // Sync active CSS variables to root
  useEffect(() => {
    const config = THEME_CONFIGS[theme] || THEME_CONFIGS.dark;
    const root = document.documentElement;

    root.style.setProperty('--color-chat-bg', config.bg);
    root.style.setProperty('--color-chat-panel', config.panel);
    root.style.setProperty('--color-chat-card', config.card);
    root.style.setProperty('--color-chat-input', config.input);
    root.style.setProperty('--color-chat-bubbleIn', config.bubbleIn);
    root.style.setProperty('--color-chat-bubbleOut', config.bubbleOut);
    root.style.setProperty('--color-brand-primary', config.accent);

    // Font size scaling
    if (fontSize === 'compact') {
      root.style.fontSize = '14px';
    } else if (fontSize === 'large') {
      root.style.fontSize = '17px';
    } else {
      root.style.fontSize = '15px';
    }
  }, [theme, fontSize]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        fontSize,
        setTheme,
        setFontSize,
        themeConfig: THEME_CONFIGS[theme] || THEME_CONFIGS.dark,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};
