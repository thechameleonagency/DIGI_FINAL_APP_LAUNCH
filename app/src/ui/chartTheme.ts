/** Read design-token colors for Recharts (follows light/dark theme). */
export function chartColors() {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    primary: read('--accent', '#4A7399'),
    secondary: read('--success', '#16a34a'),
    grid: read('--border', '#e2e8f0'),
  };
}
