export function hexWithAlpha(color: string, alpha: number): string {
  if (color.startsWith("rgba") || color.startsWith("rgb")) return color
  if (!color.startsWith("#")) return color
  const hex = color.replace("#", "")
  if (hex.length !== 6) return color
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
