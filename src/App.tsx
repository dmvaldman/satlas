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
import { AddSitButton } from './components/Map/AddSitButton';
import React from 'react';

function App() {
  console.log('App rendering, about to render PhotoUploadModal', {
    isDevelopment: process.env.NODE_ENV === 'development',
    isStrictMode: React.StrictMode !== undefined
  });
  return (
    <AuthProvider>
      <ProfileProvider>
        <MapProvider>
          <SitsProvider>
            <MarksProvider>
              <PhotoUploadProvider>
                <PopupProvider>
                  <MarkerProvider>
                    <div className="app">
                      <header>
                        <AuthContainer />
                      </header>
                      <MapContainer />
                      <AddSitButton />
                      <ProfileModal />
                      {console.log('About to render PhotoUploadModal in JSX')}
                      <PhotoUploadModal />
                      {console.log('Rendered PhotoUploadModal in JSX')}
                    </div>
                  </MarkerProvider>
                </PopupProvider>
              </PhotoUploadProvider>
            </MarksProvider>
          </SitsProvider>
        </MapProvider>
      </ProfileProvider>
    </AuthProvider>
  );
}

export default App;