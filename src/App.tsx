import React from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { ProfileProvider } from './contexts/ProfileContext';
import { MapProvider } from './contexts/MapContext';
import { SitsProvider } from './contexts/SitsContext';
import { PhotoUploadProvider } from './contexts/PhotoUploadContext';
import { AuthContainer } from './components/Auth/AuthContainer';
import { ProfileModal } from './components/Profile/ProfileModal';
import { MapContainer } from './components/Map/MapContainer';
import { PhotoUploadModal } from './components/PhotoUpload/PhotoUploadModal';
import { MarkerProvider } from './contexts/MarkerContext';
import { PopupProvider } from './contexts/PopupContext';
import { MarksProvider } from './contexts/MarksContext';

function App() {
  return (
    <AuthProvider>
      <ProfileProvider>
        <MapProvider>
          <SitsProvider>
            <MarksProvider>
              <MarkerProvider>
                <PopupProvider>
                  <PhotoUploadProvider>
                    <div className="app">
                      <header>
                        <AuthContainer />
                      </header>
                      <MapContainer />
                      <button className="fab" id="add-satlas-btn" aria-label="Add new Satlas">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                        </svg>
                      </button>
                      <ProfileModal />
                      <PhotoUploadModal />
                    </div>
                  </PhotoUploadProvider>
                </PopupProvider>
              </MarkerProvider>
            </MarksProvider>
          </SitsProvider>
        </MapProvider>
      </ProfileProvider>
    </AuthProvider>
  );
}

export default App;