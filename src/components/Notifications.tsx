import React from 'react';

// Define types directly here or move to a central types file if used elsewhere
export type NotificationType = 'success' | 'error';
export interface NotificationItem {
  id: number; // Add ID directly to the main type
  message: string;
  type: NotificationType;
}

// Define the type for the custom event detail from index.tsx
interface AppErrorEventDetail {
  message: string;
  type: NotificationType; // Should match NotificationType
  eventId?: string;
}

interface NotificationsState {
  notifications: NotificationItem[]; // Use the updated NotificationItem
}

class Notifications extends React.Component<{}, NotificationsState> {
  private readonly TIMEOUT_MS = 5000;
  private nextId: number = 0; // Simple counter for unique keys

  constructor(props: {}) {
    super(props);
    this.state = {
      notifications: [] // Initialize empty
    };
  }

  componentDidMount() {
    window.addEventListener('app-error', this.handleAppError);
  }

  componentWillUnmount() {
    window.removeEventListener('app-error', this.handleAppError);
  }

  private handleAppError = (event: Event): void => {
    const customEvent = event as CustomEvent<AppErrorEventDetail>;
    if (customEvent.detail) {
      // Use the component's own method to show the notification
      this.showNotification({
        message: customEvent.detail.message,
        type: customEvent.detail.type // Ensure type matches NotificationType
      });
    }
  };

  // Public method to be called via ref
  // It now accepts data *without* an ID, and adds it internally
  public showNotification = (notificationData: { message: string; type: NotificationType }): void => {
    const newId = this.nextId++;
    const newNotification: NotificationItem = { // Create the object with the ID
        ...notificationData,
        id: newId
    };

    // Add notification to state
    this.setState(prevState => ({
        notifications: [...prevState.notifications, newNotification]
    }));

    // Set a timeout to automatically remove this specific notification by its ID
    setTimeout(() => {
      this.removeNotificationById(newId);
    }, this.TIMEOUT_MS);
  };

  // Remove notification by its unique ID (no change needed here)
  private removeNotificationById = (idToRemove: number): void => {
    this.setState(prevState => ({
      notifications: prevState.notifications.filter(n => n.id !== idToRemove)
    }));
  };

  render() {
    const { notifications } = this.state; // Use local state notifications (now NotificationItem[])

    // Render nothing if there are no notifications
    if (notifications.length === 0) {
        return null;
    }

    return (
      <div className="notifications-container">
        {notifications.map((notification) => ( // notification is now NotificationItem
          <div
            key={notification.id} // Use unique ID as key
            className={`notification ${notification.type}`}
            onClick={() => this.removeNotificationById(notification.id)} // Allow clicking the notification to dismiss
            style={{ cursor: 'pointer' }} // Indicate it's clickable
          >
            <span className="notification-message">{notification.message}</span>
            {/* Optional: Keep explicit close button or rely on click-to-dismiss */}
            <button
              className="notification-close"
              onClick={(e) => {
                e.stopPropagation(); // Prevent card click when clicking button
                this.removeNotificationById(notification.id); // Remove by ID
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