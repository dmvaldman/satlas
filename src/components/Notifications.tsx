import React from 'react';

export type NotificationType = 'success' | 'error';

export interface NotificationItem {
  message: string;
  type: NotificationType;
}

// Define the type for the custom event detail from index.tsx
interface AppErrorEventDetail {
  message: string;
  type: NotificationType;
  eventId?: string;
}

class Notification extends React.Component<{}, { notifications: NotificationItem[] }> {
  private static instance: Notification | null = null;
  private timeout: number = 5000;

  constructor(props: {}) {
    super(props);
    this.state = {
      notifications: []
    };

    // Set up singleton instance
    Notification.instance = this;
  }

  // Add event listener when the component mounts
  componentDidMount() {
    window.addEventListener('app-error', this.handleAppError);
  }

  componentWillUnmount() {
    Notification.instance = null;
    // Remove event listener when the component unmounts
    window.removeEventListener('app-error', this.handleAppError);
  }

  // Handler for the custom 'app-error' event
  private handleAppError = (event: Event) => {
    // Type assertion to access the detail property
    const customEvent = event as CustomEvent<AppErrorEventDetail>;
    if (customEvent.detail) {
      this.showNotification({
        message: customEvent.detail.message,
        type: customEvent.detail.type
      });
    }
  };

  /**
   * Show a notification
   */
  public showNotification = (notification: { message: string, type: NotificationType }) => {
    // Add the new notification to the list
    this.setState(prevState => ({
      notifications: [...prevState.notifications, notification]
    }));

    // Set a timeout to automatically remove this notification
    setTimeout(() => {
      this.setState(prevState => ({
        notifications: prevState.notifications.filter(n => n !== notification)
      }));
    }, this.timeout);
  };

  /**
   * Remove a specific notification
   */
  private removeNotification = (index: number) => {
    this.setState(prevState => ({
      notifications: prevState.notifications.filter((_, i) => i !== index)
    }));
  };

  /**
   * Clear all notifications
   */
  public clearAllNotifications = () => {
    this.setState({ notifications: [] });
  };

  /**
   * Static method to get the instance
   */
  public static getInstance(): Notification | null {
    return Notification.instance;
  }

  render() {
    const { notifications } = this.state;

    // Always render the container even when there are no notifications
    // This keeps the component mounted and the singleton instance available
    return (
      <div className="notifications-container">
        {notifications.map((notification, index) => (
          <div
            key={index}
            className={`notification ${notification.type}`}
          >
            <span className="notification-message">{notification.message}</span>
            <button
              className="notification-close"
              onClick={(e) => {
                e.stopPropagation(); // Prevent event from bubbling
                this.removeNotification(index);
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

export default Notification;