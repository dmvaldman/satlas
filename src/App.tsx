import { AuthProvider } from './contexts/AuthContext';
import { AuthContainer } from './components/Auth/AuthContainer';

function App() {
  return (
    <AuthProvider>
      <div className="app">
        <header>
          <AuthContainer />
        </header>
        {/* Other components will go here */}
      </div>
    </AuthProvider>
  );
}

export default App;