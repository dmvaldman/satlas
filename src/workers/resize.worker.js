// public/resize.worker.js

// Helper function to convert Base64 to Blob
function base64ToBlob(base64, mimeType) {
  try {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  } catch (e) {
    console.error("Error in base64ToBlob:", e);
    return null;
  }
}

// Helper function to convert Blob to Base64
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (reader.result) {
        // Remove the prefix 'data:*/*;base64,'
        resolve(reader.result.toString().split(',')[1]);
      } else {
        reject(new Error("FileReader did not return a result."));
      }
    };
    reader.onerror = (error) => {
        reject(error);
    };
    reader.readAsDataURL(blob);
  });
}


self.onmessage = async (event) => {
  const { base64Data, maxWidth, quality, id } = event.data;
  console.log('[Worker] Received job:', id);

  try {
    // 1. Create an ImageBitmap from Base64
    const imageBlob = base64ToBlob(base64Data, 'image/jpeg');
    if (!imageBlob) throw new Error('Failed to convert base64 to blob.');
    const imageBitmap = await createImageBitmap(imageBlob);

    // 2. Calculate new dimensions
    const originalWidth = imageBitmap.width;
    const originalHeight = imageBitmap.height;
    let targetWidth = originalWidth;
    let targetHeight = originalHeight;

    if (targetWidth > maxWidth) {
      targetWidth = maxWidth;
      targetHeight = Math.round((targetWidth / originalWidth) * originalHeight);
    }

    if (targetWidth <= 0 || targetHeight <= 0) {
        throw new Error(`Worker calculated invalid dimensions: ${targetWidth}x${targetHeight}`);
    }

    // 3. Use OffscreenCanvas
    if (typeof OffscreenCanvas === 'undefined') {
        throw new Error('OffscreenCanvas is not supported in this worker environment.');
    }
    const canvas = new OffscreenCanvas(targetWidth, targetHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get OffscreenCanvas context');

    // 4. Draw resized image
    ctx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);

    // 5. Convert canvas back to Blob
    const blob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality: quality / 100
    });

    // 6. Convert Blob to Base64 for sending back
     const finalBase64 = await blobToBase64(blob);

    console.log('[Worker] Resizing complete for job:', id);
    // 7. Post result back to main thread
    self.postMessage({ success: true, base64Result: finalBase64, id });

    // Close the bitmap to free memory
    imageBitmap.close();

  } catch (error) {
    console.error('[Worker] Error processing image:', error);
    self.postMessage({ success: false, error: error.message || 'Unknown worker error', id });
  }
};

// Keep a log to confirm loading
console.log('[Worker] Resize worker script loaded and ready.');