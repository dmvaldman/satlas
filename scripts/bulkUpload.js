import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, getDocs } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import fs from 'fs';
import path from 'path';
import ExifParser from 'exif-parser';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { join } from 'path';
import dotenv from 'dotenv';
import sizeOf from 'buffer-image-size';

// Load environment variables
dotenv.config();

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Read the shared Firebase config
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

/**
 * Extract GPS coordinates from EXIF data
 * @param {string} filePath Path to the image file
 * @returns {Promise<{latitude: number, longitude: number} | null>} Location coordinates or null if not found
 */
async function extractLocationFromExif(filePath) {
  try {
    // Read the file as buffer
    const buffer = fs.readFileSync(filePath);

    // Parse EXIF data
    const parser = ExifParser.create(buffer);
    const result = parser.parse();

    if (!result.tags.GPSLatitude || !result.tags.GPSLongitude) {
      return null;
    }

    // Get GPS coordinates
    let latitude = result.tags.GPSLatitude;
    let longitude = result.tags.GPSLongitude;

    console.log('Extracted coordinates:', {
      latitude, longitude,
      latRef: result.tags.GPSLatitudeRef,
      lngRef: result.tags.GPSLongitudeRef
    });

    return { latitude, longitude };
  } catch (error) {
    console.warn(`Could not extract EXIF data from ${path.basename(filePath)}:`, error);
    return null;
  }
}

/**
 * Calculate distance between two coordinates in feet
 */
function getDistanceInFeet(coord1, coord2) {
  const R = 20902231; // Earth radius in feet
  const dLat = (coord2.latitude - coord1.latitude) * Math.PI / 180;
  const dLon = (coord2.longitude - coord1.longitude) * Math.PI / 180;

  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(coord1.latitude * Math.PI / 180) * Math.cos(coord2.latitude * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Fetch all existing sits from the database
 * @returns {Promise<Array<{latitude: number, longitude: number}>>} Array of sit locations
 */
async function fetchExistingSits() {
  console.log('Fetching existing sits from database...');
  const sitsRef = collection(db, 'sits');
  const querySnapshot = await getDocs(sitsRef);

  const existingSits = querySnapshot.docs.map(doc => {
    const data = doc.data();
    return {
      latitude: data.location.latitude,
      longitude: data.location.longitude
    };
  });

  console.log(`Found ${existingSits.length} existing sits in database`);
  return existingSits;
}

/**
 * Check if a location is near any existing sit
 * @param {Object} location Location to check
 * @param {Array} existingSits Array of existing sit locations
 * @param {number} maxDistanceFeet Maximum distance in feet to consider "nearby"
 * @returns {boolean} True if the location is near an existing sit
 */
function isNearExistingSit(location, existingSits, maxDistanceFeet = 100) {
  for (const existingSit of existingSits) {
    const distance = getDistanceInFeet(location, existingSit);
    if (distance < maxDistanceFeet) {
      return true;
    }
  }
  return false;
}

/**
 * Uploads all images in a directory and creates sits for them
 * @param {string} directoryPath Path to directory containing images
 * @param {string} userId User ID to associate with the uploads
 * @param {string} userName User name to associate with the uploads
 * @returns {Promise<Array>} Array of upload results
 */
async function bulkUploadImages(directoryPath, userId, userName) {
  // Fetch all existing sits first
  const existingSits = await fetchExistingSits();

  // Read all files in the directory
  const files = fs.readdirSync(directoryPath);
  const imageFiles = files.filter(file => {
    const ext = path.extname(file).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.gif'].includes(ext);
  });

  console.log(`Found ${imageFiles.length} images to upload`);

  const results = [];

  // Process each image
  for (const [index, filename] of imageFiles.entries()) {
    try {
      console.log(`Processing ${index + 1}/${imageFiles.length}: ${filename}`);

      // Read the file
      const filePath = path.join(directoryPath, filename);

      // Try to extract location from EXIF
      let location = await extractLocationFromExif(filePath);

      // If no location found, use base coordinates with random offset
      if (!location) {
        console.log(`Skipping ${filename} - no EXIF location data found`);
        continue;
      } else {
        console.log(`Found EXIF location for ${filename}: ${location.latitude}, ${location.longitude}`);
      }

      // Check if this location is near an existing sit
      if (isNearExistingSit(location, existingSits, 100)) {
        console.log(`Skipping ${filename} - location is near an existing sit`);
        continue;
      }

      // Read the file
      const fileBuffer = fs.readFileSync(filePath);

      // Get image dimensions
      const dimensions = sizeOf(fileBuffer);
      console.log(`Image dimensions: ${dimensions.width}x${dimensions.height}`);

      // Generate a unique filename with timestamp
      const uniqueFilename = `${Date.now()}_${filename}`;

      // Upload to Firebase Storage
      const storageRef = ref(storage, `sits/${uniqueFilename}`);
      await uploadBytes(storageRef, fileBuffer);

      // Use CDN URL instead of direct storage URL
      const photoURL = `https://satlas-world.web.app/images/sits/${uniqueFilename}`;

      // Create image collection
      const imageCollectionId = `${Date.now()}_${userId}_${index}`;
      const imageRef = await addDoc(collection(db, 'images'), {
        photoURL,
        userId,
        userName,
        collectionId: imageCollectionId,
        createdAt: new Date(),
        width: dimensions.width,
        height: dimensions.height
      });

      // Create sit
      const sitRef = await addDoc(collection(db, 'sits'), {
        location: {
          latitude: location.latitude,
          longitude: location.longitude
        },
        imageCollectionId,
        createdAt: new Date(),
        uploadedBy: userId,
        uploadedByUsername: userName
      });

      results.push({
        sitId: sitRef.id,
        imageId: imageRef.id,
        location,
        filename
      });

      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`Error uploading ${filename}:`, error);
      // Continue with next file
    }
  }

  return results;
}

// Example usage
const userId = 'bEorC36iZYZGWKydUqFo6VZ7RSn2'; // Replace with your user ID
const userName = 'Dave'; // Replace with your name
const imagesDir = 'scripts/assets/satlas_images'; // Directory containing images

bulkUploadImages(imagesDir, userId, userName)
  .then(results => {
    console.log(`Successfully uploaded ${results.length} images`);
    console.log('First few results:', results.slice(0, 3));
  })
  .catch(error => {
    console.error('Upload failed:', error);
  });