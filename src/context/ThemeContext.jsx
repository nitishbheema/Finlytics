import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [isLight, setIsLight] = useState(() => {
    return localStorage.getItem('lightMode') === 'true';
  });

  useEffect(() => {
    if (isLight) {
      document.body.classList.add('light');
      document.documentElement.classList.add('light');
      localStorage.setItem('lightMode', 'true');
    } else {
      document.body.classList.remove('light');
      document.documentElement.classList.remove('light');
      localStorage.setItem('lightMode', 'false');
    }
  }, [isLight]);

  const toggleTheme = () => {
    setIsLight(prev => !prev);
  };

  return (
    <ThemeContext.Provider value={{ isLight, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
