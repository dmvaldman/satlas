import React from 'react';

export type ViewType = 'map' | 'gallery';

interface ViewToggleProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
}

class ViewToggle extends React.Component<ViewToggleProps> {
  render() {
    const { currentView, onViewChange } = this.props;

    return (
      <div className="view-toggle-container">
        <button
          className={`view-toggle-button ${currentView === 'map' ? 'active' : ''}`}
          onClick={() => onViewChange('map')}
        >
          Map
        </button>
        <button
          className={`view-toggle-button ${currentView === 'gallery' ? 'active' : ''}`}
          onClick={() => onViewChange('gallery')}
        >
          Gallery
        </button>
      </div>
    );
  }
}

export default ViewToggle;