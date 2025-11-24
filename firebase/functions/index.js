const storage = require("firebase-functions/v2/storage");
const sharp = require("sharp");
const {getStorage} = require("firebase-admin/storage");
const path = require("path");
const logger = require("firebase-functions/logger");
const {initializeApp} = require("firebase-admin/app");
const functions = require("firebase-functions");
const {getFirestore} = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");
const { getAuth } = require("firebase-admin/auth");
const pushNotifications = require("./pushNotifications");

// Initialize Firebase Admin
initializeApp();
const db = getFirestore();

exports.notifyOnNewSit = pushNotifications.notifyOnNewSit;
exports.notifyOnSitFavorited = pushNotifications.notifyOnSitFavorited;
exports.notifyOnSitVisited = pushNotifications.notifyOnSitVisited;

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
  if (!fileType.startsWith('image/') && fileType !== 'application/octet-stream') {
    return logger.log('This is not an image.');
  }

  // Get file name and extension
  const fileName = path.basename(filePath, path.extname(filePath));
  const fileExt = path.extname(filePath).toLowerCase();

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
      .rotate()
      .resize(1000, 1000, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, progressive: true })
      .toBuffer();

    logger.log(`Medium version created: ${medBuffer.length} bytes`);

    // Create thumbnail version
    const thumbnailBuffer = await sharp(imageBuffer)
      .rotate()
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
  // Allow CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).send('');
    return;
  }

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

exports.deleteImageVariations = storage.onObjectDeleted({
  bucket: 'satlas-world.firebasestorage.app'
}, async (event) => {
  const filePath = event.data.name;

  // Only process files in the "sits" folder that aren't already variations
  if (!filePath.startsWith('sits/') || filePath.includes('_med') || filePath.includes('_thumb')) {
    return logger.log('Not a main image, skipping cleanup');
  }

  logger.log(`Original image deleted: ${filePath}, cleaning up variations`);

  try {
    // Extract the base name and extension
    const fileName = path.basename(filePath);
    const extension = path.extname(fileName);
    const baseName = fileName.substring(0, fileName.length - extension.length);
    const dirName = path.dirname(filePath);

    // Paths for variations
    const medFilePath = path.join(dirName, `${baseName}_med${extension}`);
    const thumbFilePath = path.join(dirName, `${baseName}_thumb${extension}`);

    const bucket = getStorage().bucket('satlas-world.firebasestorage.app');

    // Check if medium version exists and delete it
    const [medExists] = await bucket.file(medFilePath).exists();
    if (medExists) {
      await bucket.file(medFilePath).delete();
      logger.log(`Deleted medium version: ${medFilePath}`);
    } else {
      logger.log(`Medium version not found: ${medFilePath}`);
    }

    // Check if thumbnail version exists and delete it
    const [thumbExists] = await bucket.file(thumbFilePath).exists();
    if (thumbExists) {
      await bucket.file(thumbFilePath).delete();
      logger.log(`Deleted thumbnail version: ${thumbFilePath}`);
    } else {
      logger.log(`Thumbnail version not found: ${thumbFilePath}`);
    }

    return logger.log('Cleanup complete');
  } catch (error) {
    logger.error('Error during cleanup:', error);
    return logger.error('Cleanup failed');
  }
});

exports.deleteUserAccount = functions.https.onCall(async (data, context) => {
  // 1. Check for authentication
  if (!context.auth) {
    throw new HttpsError(
      "unauthenticated",
      "The function must be called while authenticated.",
    );
  }

  const uid = context.auth.uid;
  logger.log(`Starting account deletion for user: ${uid}`);

  try {
    // 2. Delete all user-related data in Firestore
    const batch = db.batch();

    // Delete user's document
    const userDocRef = db.collection("users").doc(uid);
    batch.delete(userDocRef);
    logger.log(`Marked user document for deletion: users/${uid}`);

    // Delete sits created by the user
    const sitsQuery = db.collection("sits").where("uploadedBy", "==", uid);
    const sitsSnapshot = await sitsQuery.get();
    sitsSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
      logger.log(`Marked sit for deletion: ${doc.ref.path}`);
    });

    // Delete images uploaded by the user
    const imagesQuery = db.collection("images").where("userId", "==", uid);
    const imagesSnapshot = await imagesQuery.get();
    const imagePaths = [];
    imagesSnapshot.forEach((doc) => {
      const imageData = doc.data();
      if (imageData.photoURL) {
        // Extract the path from the URL, assuming a consistent structure
        const url = new URL(imageData.photoURL);
        // Path will be something like /images/sits/sit_12345.jpg
        // We need to remove the leading '/images/' part
        const fullPath = decodeURIComponent(url.pathname);
        const storagePath = fullPath.startsWith('/images/') ? fullPath.substring(8) : fullPath;
        imagePaths.push(storagePath);
      }
      batch.delete(doc.ref);
      logger.log(`Marked image for deletion: ${doc.ref.path}`);
    });

    // Commit all Firestore deletions
    await batch.commit();
    logger.log("Successfully deleted user data from Firestore.");

    // 3. Delete user's images from Storage
    const bucket = getStorage().bucket("satlas-world.firebasestorage.app");
    for (const imagePath of imagePaths) {
      try {
        await bucket.file(imagePath).delete();
        logger.log(`Successfully deleted from Storage: ${imagePath}`);
      } catch (storageError) {
        // Log error but continue, as Firestore data is already gone
        logger.error(`Failed to delete ${imagePath} from Storage:`, storageError);
      }
    }

    // 4. Delete user from Firebase Authentication
    await getAuth().deleteUser(uid);
    logger.log(`Successfully deleted user account: ${uid}`);

    return { success: true };
  } catch (error) {
    logger.error("Error deleting user account:", error);
    throw new HttpsError(
      "internal",
      "An error occurred while deleting the account.",
      error,
    );
  }
});