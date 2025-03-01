const storage = require("firebase-functions/v2/storage");
const sharp = require("sharp");
const {getStorage} = require("firebase-admin/storage");
const path = require("path");
const logger = require("firebase-functions/logger");
const {initializeApp} = require("firebase-admin/app");
const functions = require("firebase-functions");

// Initialize Firebase Admin
initializeApp();

exports.processImage = storage.onObjectFinalized({
  bucket: 'satlas-world.firebasestorage.app'
}, async (event) => {
  const file = event.data;
  const filePath = file.name;

  // Only process files in the "sits" folder
  if (!filePath.startsWith('sits/')) {
    return logger.log('Not in the sits folder, skipping.');
  }

  const fileType = file.contentType;
  const fileBucket = file.bucket;

  // Exit if this is not an image
  if (!fileType.startsWith('image/')) {
    return logger.log('This is not an image.');
  }

  // Get file name and extension
  const fileName = path.basename(filePath, path.extname(filePath));
  const fileExt = path.extname(filePath);

  // Skip processing if the file is already a processed version
  if (fileName.endsWith('_med') || fileName.endsWith('_thumb')) {
    return logger.log('This is already a processed image.');
  }

  try {
    // Download file into memory from bucket
    const bucket = getStorage().bucket(fileBucket);
    const downloadResponse = await bucket.file(filePath).download();
    const imageBuffer = downloadResponse[0];
    logger.log("Image downloaded! Size: " + imageBuffer.length + " bytes");

    // File paths for the different versions
    const dirName = path.dirname(filePath);
    const medFilePath = path.join(dirName, `${fileName}_med${fileExt}`);
    const thumbFilePath = path.join(dirName, `${fileName}_thumb${fileExt}`);

    // Create medium-sized compressed version
    const medBuffer = await sharp(imageBuffer)
      .resize(1000, 1000, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, progressive: true })
      .toBuffer();

    logger.log(`Medium version created: ${medBuffer.length} bytes`);

    // Create thumbnail version
    const thumbnailBuffer = await sharp(imageBuffer)
      .resize(200, 200, { fit: 'cover', withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();

    logger.log(`Thumbnail created: ${thumbnailBuffer.length} bytes`);

    // Upload the medium version
    await bucket.file(medFilePath).save(medBuffer, {
      metadata: { contentType: fileType },
    });
    logger.log("Medium version uploaded");

    // Upload the thumbnail
    await bucket.file(thumbFilePath).save(thumbnailBuffer, {
      metadata: { contentType: fileType },
    });
    logger.log("Thumbnail uploaded");

    return logger.log("Image processing complete!");
  } catch (error) {
    logger.error("Error processing image:", error);
    return logger.error("Image processing failed");
  }
});

exports.serveImages = functions.https.onRequest(async (req, res) => {
  // Extract the path from the request URL
  // e.g., /images/sits/example.jpg -> sits/example.jpg
  const imagePath = req.path.replace(/^\/images\//, '');

  // Check if we should serve original, medium, or thumbnail
  let finalPath = imagePath;
  const size = req.query.size || 'original';

  if (size === 'med' || size === 'medium') {
    // Add _med suffix before the extension
    const ext = path.extname(imagePath);
    const basePath = imagePath.slice(0, -ext.length);
    finalPath = `${basePath}_med${ext}`;
  } else if (size === 'thumb' || size === 'thumbnail') {
    // Add _thumb suffix before the extension
    const ext = path.extname(imagePath);
    const basePath = imagePath.slice(0, -ext.length);
    finalPath = `${basePath}_thumb${ext}`;
  }

  try {
    const bucket = getStorage().bucket('satlas-world.firebasestorage.app');
    const file = bucket.file(finalPath);

    // Check if file exists
    const [exists] = await file.exists();

    // If the requested size doesn't exist, fall back to the original
    if (!exists && (size === 'med' || size === 'medium' || size === 'thumb' || size === 'thumbnail')) {
      logger.log(`Requested size ${size} not found for ${imagePath}, falling back to original`);
      finalPath = imagePath;
      file = bucket.file(finalPath);

      // Check if original exists
      const [originalExists] = await file.exists();
      if (!originalExists) {
        res.status(404).send('Image not found');
        return;
      }
    } else if (!exists) {
      res.status(404).send('Image not found');
      return;
    }

    // Get file metadata
    const [metadata] = await file.getMetadata();

    // Set appropriate headers
    res.set('Content-Type', metadata.contentType);
    res.set('Cache-Control', 'public, max-age=31536000');

    // Stream the file to the response
    file.createReadStream().pipe(res);
  } catch (error) {
    console.error('Error serving image:', error);
    res.status(500).send('Error serving image');
  }
});