const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK is handled in index.js
// if (admin.apps.length === 0) {
//   admin.initializeApp();
// }

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
                body: 'Open in Satlas.',
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
 * Firebase Cloud Function that triggers when a sit is favorited
 * and sends a notification to the sit owner
 */
exports.notifyOnSitFavorited = functions.firestore
  .document('favorites/{favoriteId}')
  .onCreate(async (snapshot, context) => {
    const db = admin.firestore();
    const markData = snapshot.data();
    const userId = markData.userId; // Person who favorited
    const sitId = markData.sitId;

    try {
      // Get the sit to find the owner
      const sitDoc = await db.collection('sits').doc(sitId).get();
      if (!sitDoc.exists) {
        console.log(`Sit ${sitId} not found, skipping notification`);
        return null;
      }

      const sit = sitDoc.data();
      const sitOwnerId = sit.uploadedBy;

      // Don't notify if they favorited their own sit
      if (userId === sitOwnerId) {
        console.log(`User ${userId} favorited their own sit, skipping notification`);
        return null;
      }

      // Get the sit owner's user document to check push notification preferences
      const ownerDoc = await db.collection('users').doc(sitOwnerId).get();
      if (!ownerDoc.exists) {
        console.log(`Sit owner ${sitOwnerId} not found, skipping notification`);
        return null;
      }

      const ownerData = ownerDoc.data();
      if (!ownerData.pushNotificationsEnabled) {
        console.log(`Sit owner ${sitOwnerId} has push notifications disabled, skipping`);
        return null;
      }

      // Get the username of the person who favorited
      const markerDoc = await db.collection('users').doc(userId).get();
      const markerUsername = markerDoc.exists ? markerDoc.data().username : 'Someone';

      // Get owner's push tokens
      const tokensSnapshot = await db.collection('push_tokens')
        .where('userId', '==', sitOwnerId)
        .get();

      if (tokensSnapshot.empty) {
        console.log(`No push tokens found for sit owner ${sitOwnerId}`);
        return null;
      }

      console.log(`Found ${tokensSnapshot.size} push token(s) for sit owner ${sitOwnerId}`);

      // Get sit thumbnail image
      let imageUrl = null;
      if (sit.imageCollectionId) {
        const imagesQuery = await db.collection('images')
          .where('collectionId', '==', sit.imageCollectionId)
          .limit(1)
          .get();
        if (!imagesQuery.empty) {
          const imgData = imagesQuery.docs[0].data();
          if (imgData.photoURL) {
            imageUrl = `${imgData.photoURL}?size=thumb`;
          }
        }
      }

      // Send notifications to all owner's devices
      const messages = tokensSnapshot.docs.map(tokenDoc => {
        const token = tokenDoc.data().token;
        if (!token) {
          console.warn(`Push token document ${tokenDoc.id} has no token field`);
          return null;
        }

        const message = {
          token: token,
          notification: {
            title: 'Your Sit was favorited!',
            body: `${markerUsername} favorited your sit.`
          },
          data: {
            type: 'sit_favorited',
            sitId: sitId,
            url: `https://satlas.earth/?sitId=${sitId}`
          },
          android: {
            notification: {}
          },
          apns: {
            payload: {
              aps: {
                'mutable-content': 1
              }
            }
          }
        };

        // Only include imageUrl if it exists
        if (imageUrl) {
          message.notification.imageUrl = imageUrl;
          message.android.notification.imageUrl = imageUrl;
        }

        return message;
      }).filter(msg => msg !== null);

      if (messages.length > 0) {
        console.log(`Preparing to send ${messages.length} notification(s) to sit owner ${sitOwnerId}`);
        const batchResponse = await admin.messaging().sendEach(messages);
        console.log(`Sent ${batchResponse.successCount} favorited notifications to sit owner ${sitOwnerId}`);
        if (batchResponse.failureCount > 0) {
          console.error(`Failed to send ${batchResponse.failureCount} notification(s)`);
          const invalidTokens = [];
          batchResponse.responses.forEach((response, index) => {
            if (!response.success) {
              const errorCode = response.error?.code;
              const errorMessage = response.error?.message || 'Unknown error';
              console.error(`Failed to send to token ${index}: ${errorMessage}`);

              // Clean up invalid tokens (not found, invalid argument, unregistered)
              if (errorCode === 'messaging/invalid-registration-token' ||
                  errorCode === 'messaging/registration-token-not-registered' ||
                  errorMessage.includes('Requested entity was not found') ||
                  errorMessage.includes('not found')) {
                invalidTokens.push(tokensSnapshot.docs[index].id);
              }
            }
          });

          // Delete invalid tokens
          if (invalidTokens.length > 0) {
            console.log(`Deleting ${invalidTokens.length} invalid token(s)`);
            const batch = db.batch();
            invalidTokens.forEach(tokenId => {
              batch.delete(db.collection('push_tokens').doc(tokenId));
            });
            await batch.commit();
            console.log(`Deleted ${invalidTokens.length} invalid token(s)`);
          }
        }
      } else {
        console.log(`No messages to send for sit owner ${sitOwnerId}`);
      }

      return null;
    } catch (error) {
      console.error('Error in notifyOnSitFavorited:', error);
      return null;
    }
  });

/**
 * Firebase Cloud Function that triggers when a sit is visited
 * and sends a notification to the sit owner
 */
exports.notifyOnSitVisited = functions.firestore
  .document('visited/{visitedId}')
  .onCreate(async (snapshot, context) => {
    const db = admin.firestore();
    const markData = snapshot.data();
    const userId = markData.userId; // Person who visited
    const sitId = markData.sitId;

    try {
      // Get the sit to find the owner
      const sitDoc = await db.collection('sits').doc(sitId).get();
      if (!sitDoc.exists) {
        console.log(`Sit ${sitId} not found, skipping notification`);
        return null;
      }

      const sit = sitDoc.data();
      const sitOwnerId = sit.uploadedBy;

      // Don't notify if they visited their own sit
      if (userId === sitOwnerId) {
        console.log(`User ${userId} visited their own sit, skipping notification`);
        return null;
      }

      // Get the sit owner's user document to check push notification preferences
      const ownerDoc = await db.collection('users').doc(sitOwnerId).get();
      if (!ownerDoc.exists) {
        console.log(`Sit owner ${sitOwnerId} not found, skipping notification`);
        return null;
      }

      const ownerData = ownerDoc.data();
      if (!ownerData.pushNotificationsEnabled) {
        console.log(`Sit owner ${sitOwnerId} has push notifications disabled, skipping`);
        return null;
      }

      // Get the username of the person who visited
      const markerDoc = await db.collection('users').doc(userId).get();
      const markerUsername = markerDoc.exists ? markerDoc.data().username : 'Someone';

      // Get owner's push tokens
      const tokensSnapshot = await db.collection('push_tokens')
        .where('userId', '==', sitOwnerId)
        .get();

      if (tokensSnapshot.empty) {
        console.log(`No push tokens found for sit owner ${sitOwnerId}`);
        return null;
      }

      // Get sit thumbnail image
      let imageUrl = null;
      if (sit.imageCollectionId) {
        const imagesQuery = await db.collection('images')
          .where('collectionId', '==', sit.imageCollectionId)
          .limit(1)
          .get();
        if (!imagesQuery.empty) {
          const imgData = imagesQuery.docs[0].data();
          if (imgData.photoURL) {
            imageUrl = `${imgData.photoURL}?size=thumb`;
          }
        }
      }

      // Send notifications to all owner's devices
      const messages = tokensSnapshot.docs.map(tokenDoc => {
        const token = tokenDoc.data().token;
        if (!token) {
          console.warn(`Push token document ${tokenDoc.id} has no token field`);
          return null;
        }

        const message = {
          token: token,
          notification: {
            title: 'Your Sit was visited!',
            body: `${markerUsername} visited your sit.`
          },
          data: {
            type: 'sit_visited',
            sitId: sitId,
            url: `https://satlas.earth/?sitId=${sitId}`
          },
          android: {
            notification: {}
          },
          apns: {
            payload: {
              aps: {
                'mutable-content': 1
              }
            }
          }
        };

        // Only include imageUrl if it exists
        if (imageUrl) {
          message.notification.imageUrl = imageUrl;
          message.android.notification.imageUrl = imageUrl;
        }

        return message;
      }).filter(msg => msg !== null);

      if (messages.length > 0) {
        console.log(`Preparing to send ${messages.length} notification(s) to sit owner ${sitOwnerId}`);
        const batchResponse = await admin.messaging().sendEach(messages);
        console.log(`Sent ${batchResponse.successCount} visited notifications to sit owner ${sitOwnerId}`);
        if (batchResponse.failureCount > 0) {
          console.error(`Failed to send ${batchResponse.failureCount} notification(s)`);
          const invalidTokens = [];
          batchResponse.responses.forEach((response, index) => {
            if (!response.success) {
              const errorCode = response.error?.code;
              const errorMessage = response.error?.message || 'Unknown error';
              console.error(`Failed to send to token ${index}: ${errorMessage}`);

              // Clean up invalid tokens (not found, invalid argument, unregistered)
              if (errorCode === 'messaging/invalid-registration-token' ||
                  errorCode === 'messaging/registration-token-not-registered' ||
                  errorMessage.includes('Requested entity was not found') ||
                  errorMessage.includes('not found')) {
                invalidTokens.push(tokensSnapshot.docs[index].id);
              }
            }
          });

          // Delete invalid tokens
          if (invalidTokens.length > 0) {
            console.log(`Deleting ${invalidTokens.length} invalid token(s)`);
            const batch = db.batch();
            invalidTokens.forEach(tokenId => {
              batch.delete(db.collection('push_tokens').doc(tokenId));
            });
            await batch.commit();
            console.log(`Deleted ${invalidTokens.length} invalid token(s)`);
          }
        }
      } else {
        console.log(`No messages to send for sit owner ${sitOwnerId}`);
      }

      return null;
    } catch (error) {
      console.error('Error in notifyOnSitVisited:', error);
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