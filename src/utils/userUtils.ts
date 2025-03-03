import { collection, query, where, getDocs } from 'firebase/firestore';
import { FirebaseService } from '../services/FirebaseService';

/**
 * Checks if a username is already taken by another user
 * @param username The username to check
 * @param currentUserId The current user's ID (to exclude from the check)
 * @returns Promise<boolean> True if the username is taken, false otherwise
 */
export const isUsernameTaken = async (
  username: string,
  currentUserId?: string,
  originalUsername?: string
): Promise<boolean> => {
  // Skip check if it's the user's current username
  if (originalUsername && username === originalUsername) {
    return false;
  }

  try {
    const usersRef = collection(FirebaseService.db, 'users');
    const q = query(usersRef, where('username', '==', username));
    const querySnapshot = await getDocs(q);

    // If currentUserId is provided, exclude the current user from the check
    if (currentUserId) {
      return querySnapshot.docs.some(doc => doc.id !== currentUserId);
    }

    return !querySnapshot.empty;
  } catch (error) {
    console.error('Error checking username:', error);
    return false; // Assume it's not taken if there's an error
  }
};

/**
 * Generates a unique username based on user information
 * @param userId The user's ID (to exclude from uniqueness check)
 * @param displayName The user's display name (optional)
 * @returns Promise<string> A unique username
 */
export const generateUniqueUsername = async (
  userId: string,
  displayName?: string | null
): Promise<string> => {
  // Create base name from user info
  let baseName = '';
  if (displayName) {
    baseName = displayName.split(' ')[0];
  } else {
    baseName = `user${Math.floor(Math.random() * 1000)}`;
  }

  // Clean up the name (remove special chars, lowercase)
  let cleanName = baseName.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Ensure minimum length
  if (cleanName.length < 3) {
    cleanName = `user${userId.substring(0, 5)}`;
  }

  // Try the base name first
  let uniqueName = cleanName;
  let counter = 1;

  // Keep trying until we find a unique name
  while (await isUsernameTaken(uniqueName, userId)) {
    uniqueName = `${cleanName}${counter}`;
    counter++;
  }

  return uniqueName;
};

/**
 * Validates a username
 * @param username The username to validate
 * @returns Object with isValid and error properties
 */
export const validateUsername = (username: string): { isValid: boolean; error?: string } => {
  if (!username || username.length < 3) {
    return {
      isValid: false,
      error: 'Username must be at least 3 characters'
    };
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return {
      isValid: false,
      error: 'Only letters, numbers, and underscores allowed'
    };
  }

  return { isValid: true };
};