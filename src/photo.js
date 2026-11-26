import { CLIENT_MAX_IMAGE_BASE64_CHARS } from '../shared/limits.js';

function sourceSize(source) {
  const width = source.videoWidth || source.width;
  const height = source.videoHeight || source.height;
  return { width, height };
}

function frameToCanvas(source, maxEdge) {
  const { width, height } = sourceSize(source);
  if (!width || !height) return null;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToJpeg(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? '');
      const comma = value.indexOf(',');
      resolve(comma === -1 ? value : value.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error('Could not read the photo. Try again.'));
    reader.readAsDataURL(blob);
  });
}

// Start at 1280px and a moderate JPEG quality so the upload is small.
// The loop only shrinks further if the photo would exceed the Hobby body cap.
async function compressedJpegBase64(source) {
  let maxEdge = 1280;
  let quality = 0.62;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const canvas = frameToCanvas(source, maxEdge);
    if (!canvas) throw new Error('Could not read the photo. Try again.');
    const blob = await canvasToJpeg(canvas, quality);
    if (!blob) throw new Error('Could not read the photo. Try again.');
    const base64 = await blobToBase64(blob);
    if (base64.length <= CLIENT_MAX_IMAGE_BASE64_CHARS) return base64;
    if (quality > 0.45) {
      quality = Math.round((quality - 0.08) * 100) / 100;
    } else if (maxEdge > 720) {
      maxEdge = Math.round(maxEdge * 0.75);
    } else {
      break;
    }
  }
  throw new Error('That photo is too large to scan. Move closer and try again.');
}

async function fileToBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      throw new Error('Could not read the photo. Try again.');
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Could not read the photo. Try again.'));
      element.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export { compressedJpegBase64, fileToBitmap };
