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