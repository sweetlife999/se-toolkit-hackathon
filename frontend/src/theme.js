export const THEME_STORAGE_KEY = "viberrands_theme";
export const LIGHT_THEME = "light";
export const DARK_THEME = "dark";

function isValidTheme(value) {
  return value === LIGHT_THEME || value === DARK_THEME;
}

export function getInitialTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (isValidTheme(stored)) {
    return stored;
  }

  return LIGHT_THEME;
}

export function applyTheme(theme) {
  const nextTheme = isValidTheme(theme) ? theme : LIGHT_THEME;
  document.documentElement.setAttribute("data-theme", nextTheme);
  return nextTheme;
}

export function persistTheme(theme) {
  const nextTheme = isValidTheme(theme) ? theme : LIGHT_THEME;
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  return nextTheme;
}

