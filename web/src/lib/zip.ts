import JSZip from 'jszip'

export interface ZipItem {
  name: string
  blob: Blob
}

export async function createZip(items: ZipItem[], archiveName = 'steam-artwork-output.zip'): Promise<{ blob: Blob; name: string }> {
  const zip = new JSZip()
  for (const item of items) {
    zip.file(item.name, item.blob)
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  return {
    blob,
    name: archiveName,
  }
}
