/** Byte counts in the Library: B, KB, MB or GB with as few digits as reads well. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${Number((bytes / 1024 / 1024).toFixed(1))} MB`
  return `${Number((bytes / 1024 / 1024 / 1024).toFixed(2))} GB`
}
