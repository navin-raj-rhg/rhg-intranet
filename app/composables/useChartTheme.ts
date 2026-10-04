/**
 * Colours for the dashboard charts, read from the app's own CSS variables so
 * they follow light and dark mode (Step 19). `theme.value` changes when the
 * mode changes, so charts re-draw with the new colours.
 */
export interface ChartTheme {
  main: string
  other: string
  text: string
  grid: string
  tooltipBg: string
  tooltipText: string
}

export function useChartTheme() {
  const colorMode = useColorMode()
  return computed<ChartTheme>(() => {
    const dark = colorMode.value === 'dark'
    const css = (name: string, fallback: string) => {
      if (!import.meta.client) return fallback
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
    }
    return {
      main: css(dark ? '--ui-secondary' : '--ui-primary', dark ? '#A6E1FA' : '#FCA311'),
      other: css('--ui-text-dimmed', '#8a90a0'),
      text: css('--ui-text-muted', '#5b6478'),
      grid: css('--ui-border', '#e5e5e5'),
      tooltipBg: css('--ui-bg-inverted', '#14213D'),
      tooltipText: css('--ui-text-inverted', '#ffffff')
    }
  })
}

/** Whole dollars, for chart labels and headline figures. */
export function formatChartMoney(amount: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(amount)
}

/** Short figure for chart axes: 12.5k, 1.2M. */
export function formatChartShort(amount: number): string {
  const abs = Math.abs(amount)
  if (abs >= 1_000_000) return `${+(amount / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${+(amount / 1_000).toFixed(1)}k`
  return String(Math.round(amount))
}
