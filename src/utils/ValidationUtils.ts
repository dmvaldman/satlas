import { Coordinates, Sit, Image } from '../types';
import { getDistanceInFeet } from './geo';
import { OfflineService } from '../services/OfflineService';

export class ValidationError extends Error {}

export class UserNotAuthenticatedError extends ValidationError {
  constructor(message: string = 'You must be signed in to create a sit') {
    super(message);
  }
}

export class InvalidLocationError extends ValidationError {
  constructor(message: string = 'Valid location data is required') {
    super(message);
  }
}

export class SitTooCloseError extends ValidationError {
  constructor(message: string = 'Too close to an existing sit') {
    super(message);
  }
}

export class ValidationUtils {
  /**
   * Check if a user is authenticated
   * @param userId The user ID to check
   * @returns True if the user is authenticated
   * @throws UserNotAuthenticatedError if the user is not authenticated
   */
  static isUserAuthenticated(userId: string | null | undefined): boolean {
    if (!userId) {
      throw new UserNotAuthenticatedError();
    }
    return true;
  }

  /**
   * Check if a location is valid
   * @param location The location to check
   * @returns True if the location is valid
   * @throws InvalidLocationError if the location is invalid
   */
  static isLocationValid(location: Coordinates | null | undefined): boolean {
    if (!location) {
      throw new InvalidLocationError();
    }

    const { latitude, longitude } = location;
    const isValid = (
      typeof latitude === 'number' &&
      typeof longitude === 'number' &&
      !isNaN(latitude) &&
      !isNaN(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    );

    if (!isValid) {
      throw new InvalidLocationError();
    }

    return true;
  }

  /**
   * Check if a location is near a sit
   * @param location The location to check
   * @param sit The sit to check against
   * @param maxDistanceFeet Maximum distance in feet (default: 100)
   * @returns True if the location is near the sit
   */
  static isLocationNearSit(
    location: Coordinates,
    sit: Sit,
    maxDistanceFeet: number = 100
  ): boolean {
    return getDistanceInFeet(location, sit.location) <= maxDistanceFeet;
  }

  /**
   * Check if a user can add a photo to a sit
   * @param imageCollectionId The collection ID
   * @param userId The user ID
   * @param isOnline Whether we're online
   * @param existingImages Optional array of existing images (for online mode)
   * @returns True if the user can add a photo
   */
  static canUserAddPhotoToSit(
    imageCollectionId: string,
    userId: string,
    isOnline: boolean,
    existingImages?: Image[]
  ): boolean {
    // Check authentication
    if (!this.isUserAuthenticated(userId)) {
      return false;
    }

    // First check existing images if we're online and have them
    if (isOnline && existingImages) {
      const userAlreadyHasImage = existingImages.some(img => img.userId === userId);
      if (userAlreadyHasImage) {
        return false;
      }
    }

    // Then check pending uploads - only disallow if there's more than one pending upload
    // for this user and collection
    const offlineService = OfflineService.getInstance();
    const pendingAddToSits = offlineService.getPendingAddToSits();

    // Count how many pending uploads this user has for this collection
    const userPendingUploadsCount = pendingAddToSits.filter(
      upload => upload.imageCollectionId === imageCollectionId && upload.userId === userId
    ).length;

    // If the user has more than one pending upload for this collection, don't allow another
    if (userPendingUploadsCount > 1) {
      return false;
    }

    return true;
  }

  /**
   * Check if a user can replace an image
   * @param imageId The image ID
   * @param userId The user ID
   * @param isOnline Whether we're online
   * @param existingImage Optional existing image (for online mode)
   * @returns True if the user can replace the image
   */
  static canUserReplaceImage(
    imageId: string,
    userId: string,
    isOnline: boolean,
    existingImage?: Image
  ): boolean {
    // Check authentication
    if (!this.isUserAuthenticated(userId)) {
      return false;
    }

    // For temporary images, check if it starts with temp_
    if (imageId.startsWith('temp_')) {
      return true; // Temp images can be replaced by anyone (they're local only)
    }

    // Check offline queue for pending uploads
    const offlineService = OfflineService.getInstance();

    // For offline mode, check if the image is in the pending uploads
    if (!isOnline) {
      const pendingReplaceImages = offlineService.getPendingReplaceImages();
      const pendingImage = pendingReplaceImages.find(upload => upload.imageId === imageId);

      // If we found a pending image, check if the user owns it
      if (pendingImage) {
        return pendingImage.userId === userId;
      }
    }

    // If online and we have the existing image, check ownership
    if (isOnline && existingImage) {
      return existingImage.userId === userId;
    }

    return true; // Default to allowing if we can't determine
  }

  /**
   * Check if a user can create a sit at a location
   * @param location The location for the new sit
   * @param userId The user ID
   * @param nearbySits Optional array of nearby sits (for online mode)
   * @param maxDistanceFeet Maximum distance in feet (default: 100)
   * @returns True if validation passes
   * @throws ValidationError subclasses for different validation failures
   */
  static canUserCreateSitAtLocation(
    location: Coordinates,
    userId: string,
    nearbySits?: Sit[],
    maxDistanceFeet: number = 100
  ): boolean {
    // Check authentication - will throw UserNotAuthenticatedError if not authenticated
    this.isUserAuthenticated(userId);

    // Check location validity - will throw InvalidLocationError if invalid
    this.isLocationValid(location);

    // If we have nearby sits, check distance
    if (nearbySits && nearbySits.length > 0) {
      for (const sit of nearbySits) {
        if (this.isLocationNearSit(location, sit, maxDistanceFeet)) {
          throw new SitTooCloseError();
        }
      }
    }

    return true;
  }
}
