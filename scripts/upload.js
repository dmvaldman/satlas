import { bulkUploadImages } from './bulkUpload.js';
import dotenv from 'dotenv';

dotenv.config();

// Example usage
const userId = 'bEorC36iZYZGWKydUqFo6VZ7RSn2'; // Replace with your user ID
const userName = 'Dave'; // Replace with your name
const imagesDir = './satlas_images'; // Directory containing images

bulkUploadImages(imagesDir, userId, userName)
  .then(results => {
    console.log(`Successfully uploaded ${results.length} images`);
    console.log('First few results:', results.slice(0, 3));
  })
  .catch(error => {
    console.error('Upload failed:', error);
  });