export interface AmpTheme {
  id: string;
  name: string;
  subtitle: string;
  logoFont: string;
}

export const THEMES: AmpTheme[] = [
  { id: `marshall`, name: `Hale MJH9000`, subtitle: `Hale Apps LLC`, logoFont: `'Kaushan Script', 'Brush Script MT', cursive` },
  { id: `orange`, name: `HalesFavoriteColor`, subtitle: `Loud & Proud`, logoFont: `'Bebas Neue', 'Arial Narrow', sans-serif` },
  { id: `mesa`, name: `Avacado`, subtitle: `Dual Rectified Tone`, logoFont: `'Kaushan Script', 'Brush Script MT', cursive` },
  { id: `vox`, name: `Sox`, subtitle: `British Chime`, logoFont: `'Libre Baskerville', Georgia, serif` },
];

const DEFAULT_THEME = `marshall`;
const STORAGE_KEY = `nashdial-theme`;

export function loadTheme(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && THEMES.some((t) => t.id === saved)) return saved;
  } catch {
    // storage unavailable
  }
  return DEFAULT_THEME;
}

export function saveTheme(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // storage unavailable
  }
}

export function getTheme(id: string): AmpTheme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
