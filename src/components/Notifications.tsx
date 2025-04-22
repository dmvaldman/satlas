import React from 'react';
// Import service and types
import { NotificationService, NotificationItem, NotificationType } from '../services/NotificationService';

// Define the type for the custom event detail from index.tsx
// Keep this if still used, otherwise remove
interface AppErrorEventDetail {
  message: string;
  type: NotificationType;
  eventId?: string;
}

// Use a unique ID for React keys, managed by the service or component
interface NotificationItemWithId extends NotificationItem {
    id: number; // Unique ID for React key prop
}

class Notifications extends React.Component<{}, { notifications: NotificationItemWithId[] }> {
  private timeout: number = 5000;
  private notificationService: NotificationService | null = null;
  private unsubscribe: (() => void) | null = null;
  private nextId: number = 0; // Simple counter for unique keys

  constructor(props: {}) {
    super(props);
    this.state = {
      notifications: [] // Initialize empty
    };
  }

  componentDidMount() {
    this.notificationService = NotificationService.getInstance();
    this.handleNotificationsChange = this.handleNotificationsChange.bind(this);
    this.unsubscribe = this.notificationService.subscribe(this.handleNotificationsChange);

    // Process initial notifications from service to add unique IDs
    const initialNotifications = this.notificationService.getAllNotifications();
    this.handleNotificationsChange(initialNotifications);

    // Optional: Keep app-error listener if needed
    window.addEventListener('app-error', this.handleAppError);
  }

  componentWillUnmount() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.notificationService = null;
    window.removeEventListener('app-error', this.handleAppError);
  }

  // Handler for service updates - add unique IDs for React keys
  private handleNotificationsChange = (serviceNotifications: NotificationItem[]) => {
    const notificationsWithIds = serviceNotifications.map(n => ({
      ...n,
      id: this.nextId++ // Assign a unique ID for the key prop
    }));
    this.setState({ notifications: notificationsWithIds });
  };

  // Handler for the custom 'app-error' event (keep if needed)
  private handleAppError = (event: Event) => {
    const customEvent = event as CustomEvent<AppErrorEventDetail>;
    if (customEvent.detail && this.notificationService) {
      this.notificationService.showNotification({
        message: customEvent.detail.message,
        type: customEvent.detail.type
      });
    }
  };

  // Remove notification needs to map back to the service's object
  private removeNotification = (idToRemove: number) => {
    if (!this.notificationService) return;
    // Find the original notification object in the service based on matching message/type/etc.
    // This relies on the service returning the *actual* objects it stores via getAllNotifications
    // or finding a robust way to map the ID back.
    // For simplicity now, we'll find the corresponding item in current state and ask service to remove it.
    // NOTE: This might be fragile if multiple identical notifications exist.
    // A better approach might involve the service managing IDs.
    const notificationInState = this.state.notifications.find(n => n.id === idToRemove);
    if (notificationInState) {
      // Reconstruct the object shape the service expects (without ID)
      const serviceNotification: NotificationItem = {
          message: notificationInState.message,
          type: notificationInState.type
      };
      // Ask the service to remove the *original* object it holds
      // This relies on the service using object identity for removal
      // We need to find the original object in the service that matches
      const allServiceNotifications = this.notificationService.getAllNotifications();
      const originalNotification = allServiceNotifications.find(n =>
          n.message === serviceNotification.message && n.type === serviceNotification.type
      );
      if (originalNotification) {
          this.notificationService.removeNotification(originalNotification);
      } else {
          console.warn("Could not find original notification in service to remove.");
      }
    }
  };

  render() {
    const { notifications } = this.state; // Use local state notifications with IDs

    return (
      <div className="notifications-container">
        {notifications.map((notification) => (
          <div
            key={notification.id} // Use unique ID as key
            className={`notification ${notification.type}`}
          >
            <span className="notification-message">{notification.message}</span>
            <button
              className="notification-close"
              onClick={(e) => {
                e.stopPropagation();
                this.removeNotification(notification.id); // Remove by ID
              }}
              aria-label="Close notification"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    );
  }
}

export default Notifications;