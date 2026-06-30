import React, { createContext, useContext } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { darkTheme, lightTheme, Theme } from '@/constants/theme';

const ThemeContext = createContext<Theme>(lightTheme);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? darkTheme : lightTheme;
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
