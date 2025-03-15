import React from 'react';

export type NotificationType = 'success' | 'error';

export interface NotificationItem {
  message: string;
  type: NotificationType;
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

  componentWillUnmount() {
    Notification.instance = null;
  }

  /**
   * Show a notification
   */
  public showNotification = (messageOrNotification: string | { message: string, type: NotificationType }, type?: NotificationType) => {
    // Handle both formats: (message, type) and ({ message, type })
    let message: string;
    let notificationType: NotificationType;

    if (typeof messageOrNotification === 'string') {
      // Old format: (message, type)
      message = messageOrNotification;
      notificationType = type || 'error'; // Default to error if type is not provided
    } else {
      // New format: ({ message, type })
      message = messageOrNotification.message;
      notificationType = messageOrNotification.type;
    }

    // Create a new notification
    const newNotification: NotificationItem = {
      message,
      type: notificationType
    };

    // Add the new notification to the list
    this.setState(prevState => ({
      notifications: [...prevState.notifications, newNotification]
    }));

    // Set a timeout to automatically remove this notification
    setTimeout(() => {
      this.setState(prevState => ({
        notifications: prevState.notifications.filter(n => n !== newNotification)
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