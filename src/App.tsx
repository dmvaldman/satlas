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

function App() {
  return (
    <AuthProvider>
      <ProfileProvider>
        <MapProvider>
          <SitsProvider>
            <MarksProvider>
              <PopupProvider>
                <MarkerProvider>
                  <PhotoUploadProvider>
                    <div className="app">
                      <header>
                        <AuthContainer />
                      </header>
                      <MapContainer />
                      <AddSitButton />
                      <ProfileModal />
                      <PhotoUploadModal />
                    </div>
                  </PhotoUploadProvider>
                </MarkerProvider>
              </PopupProvider>
            </MarksProvider>
          </SitsProvider>
        </MapProvider>
      </ProfileProvider>
    </AuthProvider>
  );
}

export default App;