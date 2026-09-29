import React, { createContext, useContext, useState, useEffect } from 'react';

export type AppTheme = 'light' | 'dark' | 'midnight' | 'emerald' | 'navy' | 'charcoal';
export type AppFontSize = 'compact' | 'normal' | 'large';
export type AppFontWeight = 'regular' | 'medium' | 'semibold' | 'bold';

export interface ThemeConfig {
  bg: string;
  panel: string;
  card: string;
  surfaceSecondary: string;
  surfaceTertiary: string;
  input: string;
  bubbleIn: string;
  bubbleInBorder: string;
  bubbleInText: string;
  bubbleOut: string;
  bubbleOutText: string;
  accent: string;
  accentDark: string;
  accentSoft: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textMuted: string;
  textDisabled: string;
  border: string;
  divider: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  info: string;
  infoSoft: string;
  navBg: string;
  navBorder: string;
  navActiveIcon: string;
  navActiveText: string;
  navActiveBg: string;
  navInactive: string;
  isLight: boolean;
}

interface ThemeContextType {
  theme: AppTheme;
  fontSize: AppFontSize;
  fontWeight: AppFontWeight;
  setTheme: (theme: AppTheme) => void;
  setFontSize: (size: AppFontSize) => void;
  setFontWeight: (weight: AppFontWeight) => void;
  themeConfig: ThemeConfig;
}

const THEME_CONFIGS: Record<AppTheme, ThemeConfig> = {
  light: {
    bg: '#F5F7F6',
    panel: '#FFFFFF',
    card: '#FFFFFF',
    surfaceSecondary: '#F0F3F1',
    surfaceTertiary: '#E8EDEB',
    input: '#EDF2F0',
    bubbleIn: '#FFFFFF',
    bubbleInBorder: '#E0E6E3',
    bubbleInText: '#18211E',
    bubbleOut: '#DDF5EB',
    bubbleOutText: '#183B2F',
    accent: '#18B77A',
    accentDark: '#0F9C67',
    accentSoft: '#DDF5EB',
    textPrimary: '#18211E',
    textSecondary: '#5E6A65',
    textTertiary: '#7F8A86',
    textMuted: '#69756F',
    textDisabled: '#A4AEAA',
    border: '#D9E2DE',
    divider: '#E1E7E4',
    danger: '#E85D67',
    dangerSoft: '#FCEAEC',
    warning: '#E9A23B',
    warningSoft: '#FFF4DE',
    info: '#1488CC',
    infoSoft: '#E6F4FB',
    navBg: '#FFFFFF',
    navBorder: '#E1E7E4',
    navActiveIcon: '#0F9C67',
    navActiveText: '#0F9C67',
    navActiveBg: '#DDF5EB',
    navInactive: '#5E6A65',
    isLight: true,
  },
  dark: {
    bg: '#0b141a',
    panel: '#111b21',
    card: '#202c33',
    surfaceSecondary: '#182229',
    surfaceTertiary: '#233138',
    input: '#2a3942',
    bubbleIn: '#202c33',
    bubbleInBorder: 'rgba(255, 255, 255, 0.05)',
    bubbleInText: '#e9edef',
    bubbleOut: '#005c4b',
    bubbleOutText: '#ffffff',
    accent: '#00a884',
    accentDark: '#008f6f',
    accentSoft: 'rgba(0, 168, 132, 0.15)',
    textPrimary: '#ffffff',
    textSecondary: '#94a3b8',
    textTertiary: '#64748b',
    textMuted: '#8696a0',
    textDisabled: '#475569',
    border: 'rgba(255, 255, 255, 0.1)',
    divider: 'rgba(255, 255, 255, 0.06)',
    danger: '#ef4444',
    dangerSoft: 'rgba(239, 68, 68, 0.15)',
    warning: '#f59e0b',
    warningSoft: 'rgba(245, 158, 11, 0.15)',
    info: '#38bdf8',
    infoSoft: 'rgba(56, 189, 248, 0.15)',
    navBg: '#111b21',
    navBorder: 'rgba(255, 255, 255, 0.1)',
    navActiveIcon: '#00a884',
    navActiveText: '#00a884',
    navActiveBg: 'rgba(0, 168, 132, 0.12)',
    navInactive: '#8696a0',
    isLight: false,
  },
  midnight: {
    bg: '#0f172a',
    panel: '#1e293b',
    card: '#334155',
    surfaceSecondary: '#1e293b',
    surfaceTertiary: '#283548',
    input: '#1e293b',
    bubbleIn: '#334155',
    bubbleInBorder: 'rgba(255, 255, 255, 0.05)',
    bubbleInText: '#f8fafc',
    bubbleOut: '#2563eb',
    bubbleOutText: '#ffffff',
    accent: '#38bdf8',
    accentDark: '#0284c7',
    accentSoft: 'rgba(56, 189, 248, 0.15)',
    textPrimary: '#ffffff',
    textSecondary: '#94a3b8',
    textTertiary: '#64748b',
    textMuted: '#94a3b8',
    textDisabled: '#475569',
    border: 'rgba(255, 255, 255, 0.1)',
    divider: 'rgba(255, 255, 255, 0.06)',
    danger: '#ef4444',
    dangerSoft: 'rgba(239, 68, 68, 0.15)',
    warning: '#f59e0b',
    warningSoft: 'rgba(245, 158, 11, 0.15)',
    info: '#38bdf8',
    infoSoft: 'rgba(56, 189, 248, 0.15)',
    navBg: '#1e293b',
    navBorder: 'rgba(255, 255, 255, 0.1)',
    navActiveIcon: '#38bdf8',
    navActiveText: '#38bdf8',
    navActiveBg: 'rgba(56, 189, 248, 0.12)',
    navInactive: '#94a3b8',
    isLight: false,
  },
  emerald: {
    bg: '#06281e',
    panel: '#0a3d2e',
    card: '#11523f',
    surfaceSecondary: '#0a3d2e',
    surfaceTertiary: '#0e4635',
    input: '#0a3d2e',
    bubbleIn: '#11523f',
    bubbleInBorder: 'rgba(255, 255, 255, 0.05)',
    bubbleInText: '#f0fdf4',
    bubbleOut: '#059669',
    bubbleOutText: '#ffffff',
    accent: '#10b981',
    accentDark: '#047857',
    accentSoft: 'rgba(16, 185, 129, 0.15)',
    textPrimary: '#ffffff',
    textSecondary: '#94a3b8',
    textTertiary: '#64748b',
    textMuted: '#94a3b8',
    textDisabled: '#475569',
    border: 'rgba(255, 255, 255, 0.1)',
    divider: 'rgba(255, 255, 255, 0.06)',
    danger: '#ef4444',
    dangerSoft: 'rgba(239, 68, 68, 0.15)',
    warning: '#f59e0b',
    warningSoft: 'rgba(245, 158, 11, 0.15)',
    info: '#10b981',
    infoSoft: 'rgba(16, 185, 129, 0.15)',
    navBg: '#0a3d2e',
    navBorder: 'rgba(255, 255, 255, 0.1)',
    navActiveIcon: '#10b981',
    navActiveText: '#10b981',
    navActiveBg: 'rgba(16, 185, 129, 0.12)',
    navInactive: '#94a3b8',
    isLight: false,
  },
  navy: {
    bg: '#0a192f',
    panel: '#112240',
    card: '#233554',
    surfaceSecondary: '#112240',
    surfaceTertiary: '#1b2d4f',
    input: '#112240',
    bubbleIn: '#233554',
    bubbleInBorder: 'rgba(255, 255, 255, 0.05)',
    bubbleInText: '#f1f5f9',
    bubbleOut: '#1d4ed8',
    bubbleOutText: '#ffffff',
    accent: '#60a5fa',
    accentDark: '#2563eb',
    accentSoft: 'rgba(96, 165, 250, 0.15)',
    textPrimary: '#ffffff',
    textSecondary: '#94a3b8',
    textTertiary: '#64748b',
    textMuted: '#94a3b8',
    textDisabled: '#475569',
    border: 'rgba(255, 255, 255, 0.1)',
    divider: 'rgba(255, 255, 255, 0.06)',
    danger: '#ef4444',
    dangerSoft: 'rgba(239, 68, 68, 0.15)',
    warning: '#f59e0b',
    warningSoft: 'rgba(245, 158, 11, 0.15)',
    info: '#60a5fa',
    infoSoft: 'rgba(96, 165, 250, 0.15)',
    navBg: '#112240',
    navBorder: 'rgba(255, 255, 255, 0.1)',
    navActiveIcon: '#60a5fa',
    navActiveText: '#60a5fa',
    navActiveBg: 'rgba(96, 165, 250, 0.12)',
    navInactive: '#94a3b8',
    isLight: false,
  },
  charcoal: {
    bg: '#18181b',
    panel: '#27272a',
    card: '#3f3f46',
    surfaceSecondary: '#27272a',
    surfaceTertiary: '#343438',
    input: '#27272a',
    bubbleIn: '#3f3f46',
    bubbleInBorder: 'rgba(255, 255, 255, 0.05)',
    bubbleInText: '#fafafa',
    bubbleOut: '#4f46e5',
    bubbleOutText: '#ffffff',
    accent: '#818cf8',
    accentDark: '#4338ca',
    accentSoft: 'rgba(129, 140, 248, 0.15)',
    textPrimary: '#ffffff',
    textSecondary: '#94a3b8',
    textTertiary: '#64748b',
    textMuted: '#94a3b8',
    textDisabled: '#475569',
    border: 'rgba(255, 255, 255, 0.1)',
    divider: 'rgba(255, 255, 255, 0.06)',
    danger: '#ef4444',
    dangerSoft: 'rgba(239, 68, 68, 0.15)',
    warning: '#f59e0b',
    warningSoft: 'rgba(245, 158, 11, 0.15)',
    info: '#818cf8',
    infoSoft: 'rgba(129, 140, 248, 0.15)',
    navBg: '#27272a',
    navBorder: 'rgba(255, 255, 255, 0.1)',
    navActiveIcon: '#818cf8',
    navActiveText: '#818cf8',
    navActiveBg: 'rgba(129, 140, 248, 0.12)',
    navInactive: '#94a3b8',
    isLight: false,
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

  const [fontWeight, setFontWeightState] = useState<AppFontWeight>(() => {
    const saved = localStorage.getItem('kotha_hobe_font_weight') as AppFontWeight;
    return saved && ['regular', 'medium', 'semibold', 'bold'].includes(saved) ? saved : 'regular';
  });

  const setTheme = (newTheme: AppTheme) => {
    setThemeState(newTheme);
    localStorage.setItem('kotha_hobe_chat_theme', newTheme);
  };

  const setFontSize = (newSize: AppFontSize) => {
    setFontSizeState(newSize);
    localStorage.setItem('kotha_hobe_font_size', newSize);
  };

  const setFontWeight = (newWeight: AppFontWeight) => {
    setFontWeightState(newWeight);
    localStorage.setItem('kotha_hobe_font_weight', newWeight);
  };

  // Sync active CSS variables to root
  useEffect(() => {
    const config = THEME_CONFIGS[theme] || THEME_CONFIGS.dark;
    const root = document.documentElement;

    root.style.setProperty('--color-chat-bg', config.bg);
    root.style.setProperty('--color-chat-panel', config.panel);
    root.style.setProperty('--color-chat-card', config.card);
    root.style.setProperty('--color-chat-surfaceSecondary', config.surfaceSecondary);
    root.style.setProperty('--color-chat-surfaceTertiary', config.surfaceTertiary);
    root.style.setProperty('--color-chat-input', config.input);
    root.style.setProperty('--color-chat-bubbleIn', config.bubbleIn);
    root.style.setProperty('--color-chat-bubbleInBorder', config.bubbleInBorder);
    root.style.setProperty('--color-chat-bubbleInText', config.bubbleInText);
    root.style.setProperty('--color-chat-bubbleOut', config.bubbleOut);
    root.style.setProperty('--color-chat-bubbleOutText', config.bubbleOutText);
    root.style.setProperty('--color-brand-primary', config.accent);
    root.style.setProperty('--color-brand-dark', config.accentDark);
    root.style.setProperty('--color-brand-soft', config.accentSoft);
    root.style.setProperty('--color-chat-textPrimary', config.textPrimary);
    root.style.setProperty('--color-chat-textSecondary', config.textSecondary);
    root.style.setProperty('--color-chat-textTertiary', config.textTertiary);
    root.style.setProperty('--color-chat-textMuted', config.textMuted);
    root.style.setProperty('--color-chat-textDisabled', config.textDisabled);
    root.style.setProperty('--color-chat-border', config.border);
    root.style.setProperty('--color-chat-divider', config.divider);
    root.style.setProperty('--color-chat-danger', config.danger);
    root.style.setProperty('--color-chat-dangerSoft', config.dangerSoft);
    root.style.setProperty('--color-chat-warning', config.warning);
    root.style.setProperty('--color-chat-warningSoft', config.warningSoft);
    root.style.setProperty('--color-chat-info', config.info);
    root.style.setProperty('--color-chat-infoSoft', config.infoSoft);
    root.style.setProperty('--color-chat-navBg', config.navBg);
    root.style.setProperty('--color-chat-navBorder', config.navBorder);
    root.style.setProperty('--color-chat-navActiveIcon', config.navActiveIcon);
    root.style.setProperty('--color-chat-navActiveText', config.navActiveText);
    root.style.setProperty('--color-chat-navActiveBg', config.navActiveBg);
    root.style.setProperty('--color-chat-navInactive', config.navInactive);

    if (config.isLight) {
      root.classList.add('light-theme');
      root.classList.remove('dark-theme', 'dark');
    } else {
      root.classList.add('dark-theme', 'dark');
      root.classList.remove('light-theme');
    }

    // Font size scaling
    if (fontSize === 'compact') {
      root.style.fontSize = '14px';
    } else if (fontSize === 'large') {
      root.style.fontSize = '17px';
    } else {
      root.style.fontSize = '15px';
    }

    // Chat Message font weight scaling (only affects chat messages)
    const weightMap: Record<AppFontWeight, string> = {
      regular: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
    };
    root.style.setProperty('--chat-message-font-weight', weightMap[fontWeight] || '400');
  }, [theme, fontSize, fontWeight]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        fontSize,
        fontWeight,
        setTheme,
        setFontSize,
        setFontWeight,
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

