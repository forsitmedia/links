/** Resizes an image in the browser and returns it as a data URL, so it travels inside the page file. */
async function embedImage(file: File, max: number): Promise<string> {
  const bmp = await createImageBitmap(file);
  // PNG logos can have transparency: keep it with WebP (or PNG where WebP encoding is unsupported).
  const type = file.type === 'image/png' ? 'image/webp' : 'image/jpeg';
  for (let size = max, tries = 0; tries < 5; tries++, size = Math.round(size * 0.75)) {
    const scale = Math.min(1, size / Math.max(bmp.width, bmp.height));
    const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * scale), height: Math.round(bmp.height * scale) });
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), type, 0.82));
    if (blob.size > 350_000) continue; // every image is downloaded by each visitor, so keep them small
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Could not read the image'));
      reader.readAsDataURL(blob);
    });
  }
  throw new Error('Image is too large');
}

/** Opens the file picker. Resolves to the image as a data URL, or null if the user cancels. */
export function pickImage(max = 1200): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });
    input.onchange = () => (input.files?.[0] ? embedImage(input.files[0], max).then(resolve, reject) : resolve(null));
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}
