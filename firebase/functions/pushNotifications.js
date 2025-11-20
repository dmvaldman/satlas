const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK is handled in index.js
// if (admin.apps.length === 0) {
//   admin.initializeApp();
// }

/**
 * Firebase Cloud Function that runs on a schedule to check for users near sits
 * and send them proximity notifications
 */
exports.checkProximityAndNotify = functions.pubsub
  .schedule('every 30 minutes')
  .onRun(async (context) => {
    const db = admin.firestore();

    try {
      // Get users with push notifications enabled
      const usersSnapshot = await db.collection('users')
        .where('pushNotificationsEnabled', '==', true)
        .get();

      console.log(`Found ${usersSnapshot.size} users with push notifications enabled`);

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;

        // Get user's tokens
        const tokensSnapshot = await db.collection('push_tokens')
          .where('userId', '==', userId)
          .get();

        if (tokensSnapshot.empty) {
          console.log(`No push tokens found for user ${userId}`);
          continue;
        }

        // Get user's last known location
        // This assumes you're storing user locations in a 'user_locations' collection
        const locationDoc = await db.collection('user_locations').doc(userId).get();
        if (!locationDoc.exists) {
          console.log(`No location data found for user ${userId}`);
          continue;
        }

        const userLocation = locationDoc.data();

        // Find nearby sits (within 100 meters)
        // This is a simplified example - in a real app, you'd use geohashing or a geospatial query
        const sitsSnapshot = await db.collection('sits').get();
        const nearbySits = [];

        for (const sitDoc of sitsSnapshot.docs) {
          const sit = sitDoc.data();

          // Calculate distance between user and sit
          const distance = calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            sit.location.latitude,
            sit.location.longitude
          );

          // If within 100 meters, add to nearby sits
          if (distance <= 100) {
            nearbySits.push({
              id: sitDoc.id,
              ...sit
            });
          }
        }

        if (nearbySits.length === 0) {
          console.log(`No sits found near user ${userId}`);
          continue;
        }

        console.log(`Found ${nearbySits.length} sits near user ${userId}`);

        // Send notification to all user's devices
        for (const tokenDoc of tokensSnapshot.docs) {
          const token = tokenDoc.data().token;

          try {
            await admin.messaging().send({
              token: token,
              notification: {
                title: 'Sits Nearby',
                body: `There are ${nearbySits.length} sits near you!`
              },
              data: {
                type: 'proximity_alert',
                sitId: nearbySits[0].id // Include first sit ID
              }
            });

            console.log(`Successfully sent notification to token ${token}`);

            // Update token's last used timestamp
            await db.collection('push_tokens').doc(tokenDoc.id).update({
              lastUsed: admin.firestore.FieldValue.serverTimestamp()
            });
          } catch (error) {
            console.error(`Error sending notification to token ${token}:`, error);

            // If the token is invalid, delete it
            if (error.code === 'messaging/invalid-registration-token' ||
                error.code === 'messaging/registration-token-not-registered') {
              await db.collection('push_tokens').doc(tokenDoc.id).delete();
              console.log(`Deleted invalid token ${token}`);
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Error in checkProximityAndNotify:', error);
      return null;
    }
  });

/**
 * Firebase Cloud Function that triggers when a new sit is created
 * and sends notifications to nearby users
 */
exports.notifyOnNewSit = functions.firestore
  .document('sits/{sitId}')
  .onCreate(async (snapshot, context) => {
    const db = admin.firestore();
    const sitId = context.params.sitId;
    const newSit = snapshot.data();

    try {
      // Skip if the sit doesn't have a location
      if (!newSit.location || !newSit.location.latitude || !newSit.location.longitude) {
        console.log(`Sit ${sitId} has no location, skipping notification`);
        return null;
      }

      // Calculate bounding box for initial filtering (approx 50km / 30 miles)
      // 1 degree lat is approx 111km. So 0.5 degrees is ~55km.
      const LAT_DELTA = 0.5;
      const latMin = newSit.location.latitude - LAT_DELTA;
      const latMax = newSit.location.latitude + LAT_DELTA;

      // Query users within the latitude band (Firestore can only range filter on one field)
      // We rely on client-side (function-side) filtering for longitude/exact distance
      const usersSnapshot = await db.collection('users')
        .where('pushNotificationsEnabled', '==', true)
        .where('cityCoordinates.latitude', '>=', latMin)
        .where('cityCoordinates.latitude', '<=', latMax)
        .get();

      console.log(`Found ${usersSnapshot.size} candidate users in latitude band`);

      const NOTIFICATION_RADIUS_METERS = 16100; // 10 miles

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;
        const userData = userDoc.data();

        // Skip the user who created the sit
        if (userId === newSit.uploadedBy) continue;

        // Check valid city coordinates
        if (!userData.cityCoordinates || !userData.cityCoordinates.latitude || !userData.cityCoordinates.longitude) {
            continue;
        }

        // Calculate exact distance
        const distance = calculateDistance(
          userData.cityCoordinates.latitude,
          userData.cityCoordinates.longitude,
          newSit.location.latitude,
          newSit.location.longitude
        );

        // Filter by radius
        if (distance > NOTIFICATION_RADIUS_METERS) {
          continue;
        }

        console.log(`User ${userId} is ${(distance/1000).toFixed(1)}km away. sending notification.`);

        // Get user's tokens (assuming tokens are in a subcollection or separate collection)
        // The previous code queried a root 'push_tokens' collection. We keep that.
        const tokensSnapshot = await db.collection('push_tokens')
          .where('userId', '==', userId)
          .get();

        if (tokensSnapshot.empty) continue;

        // Construct image URL (thumbnail)
        // Assuming standard path structure: sits/{sitId}_thumb.jpg (if generated)
        // or using the serveImages endpoint.
        // Ideally we use the same logic as the app: append ?size=thumb if it's a serving URL,
        // or we construct the storage URL.
        // Let's assume newSit has an image/photoURL field?
        // The previous code didn't include an image. Let's add it.

        // We need to fetch the image URL from the 'images' collection or from the sit data?
        // The sit data usually has 'imageCollectionId', we need to find the first image.
        // This might be too expensive to do N times.
        // BETTER: The Sit documentce should ideally have a 'thumbnailUrl' or 'coverImage'.
        // If not, we might skip the image for now to keep it simple, or fetch it once.

        // Let's fetch the cover image ONCE for the batch
        let imageUrl = null;
        if (newSit.imageCollectionId) {
             const imagesQuery = await db.collection('images')
                .where('collectionId', '==', newSit.imageCollectionId)
                .limit(1)
                .get();
             if (!imagesQuery.empty) {
                 const imgData = imagesQuery.docs[0].data();
                 if (imgData.photoURL) {
                     imageUrl = `${imgData.photoURL}?size=thumb`;
                 }
             }
        }

        // Send to all tokens
        const messages = tokensSnapshot.docs.map(tokenDoc => ({
            token: tokenDoc.data().token,
            notification: {
                title: 'New Sit added nearby!',
                body: 'Tap to open it in Satlas.',
                imageUrl: imageUrl || undefined // FCM supports imageUrl
            },
            data: {
                type: 'new_sit_alert',
                sitId: sitId,
                url: `https://satlas.earth/?sitId=${sitId}` // For deep linking
            },
            android: {
                notification: {
                    imageUrl: imageUrl || undefined
                }
            },
            apns: {
                payload: {
                    aps: {
                        'mutable-content': 1
                    }
                },
                fcm_options: {
                    image: imageUrl || undefined
                }
            }
        }));

        if (messages.length > 0) {
            // batch send
            const batchResponse = await admin.messaging().sendEach(messages);
            console.log(`Sent ${batchResponse.successCount} notifications to user ${userId}`);

            // Cleanup invalid tokens logic could go here using batchResponse.responses
        }
      }

      return null;
    } catch (error) {
      console.error('Error in notifyOnNewSit:', error);
      return null;
    }
  });

/**
 * Firebase Cloud Function that runs on a schedule to clean up old tokens
 * that haven't been used in 30 days
 */
exports.cleanupOldTokens = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    const db = admin.firestore();

    try {
      // Calculate the timestamp for 30 days ago
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Get tokens that haven't been used in 30 days
      const tokensSnapshot = await db.collection('push_tokens')
        .where('lastUsed', '<', thirtyDaysAgo)
        .get();

      console.log(`Found ${tokensSnapshot.size} tokens to clean up`);

      // Delete old tokens
      const batch = db.batch();
      tokensSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      console.log(`Deleted ${tokensSnapshot.size} old tokens`);

      return null;
    } catch (error) {
      console.error('Error in cleanupOldTokens:', error);
      return null;
    }
  });

/**
 * Calculate distance between two points in meters using Haversine formula
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
}