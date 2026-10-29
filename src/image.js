// 업로드 전에 사진을 줄여서(긴 변 1600px) JPEG 로 바꾸고, 5MB 이하로 맞춥니다.
export const MAX_SIDE = 1600
export const MAX_BYTES = 5 * 1024 * 1024
export const MAX_ORIGINAL = 40 * 1024 * 1024

function toBlob(canvas, quality) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('변환 실패'))), 'image/jpeg', quality)
  )
}

export async function prepareImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('사진 파일이 아니에요.')
  if (file.size > MAX_ORIGINAL) throw new Error('파일이 너무 커요 (40MB 이하).')

  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('이 사진 형식은 읽을 수 없어요. JPG/PNG/WebP 를 써 주세요.')
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()

  let quality = 0.86
  let blob = await toBlob(canvas, quality)
  while (blob.size > MAX_BYTES && quality > 0.4) {
    quality -= 0.1
    blob = await toBlob(canvas, quality)
  }
  if (blob.size > MAX_BYTES) throw new Error('줄여도 5MB 가 넘어요.')
  return blob
}
