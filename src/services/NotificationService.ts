// Define and export types directly from the service
export type NotificationType = 'success' | 'error';
export interface NotificationItem {
  message: string;
  type: NotificationType;
}

// Define the listener callback type
type NotificationListener = (notifications: NotificationItem[]) => void;

export class NotificationService {
  private static instance: NotificationService | null = null;
  private notifications: NotificationItem[] = [];
  private listeners: Set<NotificationListener> = new Set();
  private readonly TIMEOUT_MS = 5000;

  // Private constructor for singleton pattern
  private constructor() {}

  // Get the singleton instance
  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  // Subscribe to notification changes
  public subscribe(listener: NotificationListener): () => void {
    this.listeners.add(listener);
    // Return an unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  // Notify all listeners about the current notifications
  private notifyListeners(): void {
    const currentNotifications = this.getAllNotifications();
    this.listeners.forEach(listener => listener(currentNotifications));
  }

  // Get a copy of the current notifications
  public getAllNotifications(): NotificationItem[] {
    // Return a shallow copy to prevent external modification
    return [...this.notifications];
  }

  // Show a new notification
  public showNotification(notificationData: { message: string; type: NotificationType }): void {
    // Create a unique object for the notification to allow proper removal
    // Using object identity for removal, so must be a unique object
    const newNotification: NotificationItem = {
        message: notificationData.message,
        type: notificationData.type
    };

    this.notifications = [...this.notifications, newNotification];
    this.notifyListeners();

    // Set a timeout to automatically remove this specific notification
    setTimeout(() => {
      this.removeNotification(newNotification);
    }, this.TIMEOUT_MS);
  }

  // Remove a specific notification instance
  public removeNotification(notificationToRemove: NotificationItem): void {
    const initialLength = this.notifications.length;
    // Filter based on object identity
    this.notifications = this.notifications.filter(n => n !== notificationToRemove);
    // Only notify if something was actually removed
    if (this.notifications.length < initialLength) {
      this.notifyListeners();
    }
  }

  // Optional: Clear all notifications
  public clearAllNotifications(): void {
    if (this.notifications.length > 0) {
        this.notifications = [];
        this.notifyListeners();
    }
  }
}