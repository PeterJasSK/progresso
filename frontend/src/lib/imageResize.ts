// Downscale a picked photo in the browser before upload. Vercel Functions reject
// request bodies over 4.5 MB (413 FUNCTION_PAYLOAD_TOO_LARGE) at the edge, before
// Django runs — so a full-res phone photo (3-12 MB) never reaches the Blob upload.
// We cap the longest edge and re-encode to JPEG, keeping the multipart body well
// under the limit. The server still validates + normalizes + thumbnails, so this is
// purely a transport-size guard. Any failure falls back to the original file.
const MAX_EDGE = 1600
const JPEG_QUALITY = 0.85

export async function downscaleImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file

  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = bitmap
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height))

    // Already small enough and not needing re-encode? Still re-encode large files;
    // if within bounds AND already small on disk, keep the original.
    if (scale === 1 && file.size <= 4 * 1024 * 1024) {
      bitmap.close()
      return file
    }

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY),
    )
    if (!blob) return file

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg' })
  } catch {
    // Decode/canvas unsupported → let the original through; server still validates.
    return file
  }
}
