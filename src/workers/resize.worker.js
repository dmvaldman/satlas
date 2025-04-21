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
  // CORRECT: Receive ArrayBuffer
  const { imageBuffer, maxWidth, quality, id } = event.data;
  console.log('[Worker] Received job:', id);

  try {
    // CORRECT: Create Blob directly from ArrayBuffer
    if (!imageBuffer || !(imageBuffer instanceof ArrayBuffer)) {
        throw new Error('Invalid imageBuffer received in worker.');
    }
    const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' }); // Create Blob from buffer

    // 1. Create an ImageBitmap from the Blob
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

    // 5. Create ImageBitmap from the canvas (Transferable)
    const finalImageBitmap = canvas.transferToImageBitmap();

    // 6. Post transferable ImageBitmap result back to main thread
    self.postMessage({
        success: true,
        imageBitmapResult: finalImageBitmap,
        id: id
    }, [finalImageBitmap]);

    // Close the original bitmap
    imageBitmap.close();

  } catch (error) {
    console.error('[Worker] Error processing image:', error);
    self.postMessage({ success: false, error: error.message || 'Unknown worker error', id });
  }
};

// Keep a log to confirm loading
console.log('[Worker] Resize worker script loaded and ready.');