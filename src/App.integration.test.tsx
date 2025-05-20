// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from './App';
import { FirebaseService } from './services/FirebaseService';
import { Location, PhotoResult } from './types';

// --- Mocks for Child Components ---
vi.mock('./components/PhotoUploadModal', () => ({
  default: vi.fn((props) => {
    // Allow tests to trigger onMissingLocationData
    if (props.isOpen && props.simulateMissingLocationData) {
      props.onMissingLocationData(
        props.mockPhotoDataWithoutLocation,
        props.mockOriginalModalProps
      );
    }
    return props.isOpen ? <div data-testid="mock-photo-upload-modal">PhotoUploadModal</div> : null;
  }),
}));

vi.mock('./components/EditLocationModal', () => ({
  default: vi.fn((props) => {
    // Allow tests to trigger onConfirm or onClose
    if (props.isOpen && props.simulateConfirm) {
      props.onConfirm();
    }
    if (props.isOpen && props.simulateClose) {
      props.onClose();
    }
    return props.isOpen ? <div data-testid="mock-edit-location-modal">EditLocationModal</div> : null;
  }),
}));

vi.mock('./components/Map', () => ({
  default: vi.fn((props) => {
    // Allow tests to trigger onConfirmLocation or onCancelLocationEdit
    if (props.isEditingLocation && props.simulateConfirmMapLocation) {
      props.onConfirmLocation(props.mockSelectedLocation);
    }
    if (props.isEditingLocation && props.simulateCancelMapLocation) {
      props.onCancelLocationEdit();
    }
    return <div data-testid="mock-map-component">Map Editing: {props.isEditingLocation ? 'Yes' : 'No'}</div>;
  }),
}));

// --- Mocks for Services and External Dependencies ---
vi.mock('./services/FirebaseService', async () => {
  const actual = await vi.importActual('./services/FirebaseService');
  return {
    ...actual,
    FirebaseService: {
      ...actual.FirebaseService,
      initialize: vi.fn().mockResolvedValue(undefined),
      onAuthStateChange: vi.fn(() => vi.fn()),
      loadSitsFromBounds: vi.fn().mockResolvedValue(new Map()),
      createSitWithImage: vi.fn().mockResolvedValue({ sit: {id: 'newSit123'}, image: {id: 'newImage456'} }),
      addImageToSit: vi.fn().mockResolvedValue({id: 'newImage789'}),
      replaceImageInSit: vi.fn().mockResolvedValue({id: 'replacedImage101'}),
    },
    auth: { currentUser: null },
  };
});

vi.mock('./services/LocationService', () => ({
  LocationService: vi.fn().mockImplementation(() => ({
    getCurrentLocation: vi.fn().mockResolvedValue({ latitude: 34, longitude: -118 }),
    startTracking: vi.fn(),
    stopTracking: vi.fn(),
    onLocationUpdate: vi.fn(),
    offLocationUpdate: vi.fn(),
  })),
  convertDMSToDD: vi.fn(),
}));
LocationService.getLastKnownLocation = vi.fn();


vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(), removeAllListeners: vi.fn() } }));
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('@sentry/react', () => ({ init: vi.fn(), setUser: vi.fn(), captureException: vi.fn() }));

// Helper to get App instance (less ideal for functional, better to test via UI/props)
// This is a simplified way to trigger App's internal methods for test setup if direct UI interaction is too complex.
let appInstance: App | null = null;
const TestApp = (props: any) => {
    const ref = React.useRef<App>(null);
    appInstance = ref.current;
    return <App ref={ref} {...props} />;
};


describe('App.tsx - Refactored Manual Photo Location Editing Integration', () => {
  const samplePhotoDataWithoutLocation: Omit<PhotoResult, 'location'> = {
    base64Data: 'mockBase64',
    dimensions: { width: 100, height: 100 },
  };
  const sampleOriginalModalProps = { sitId: undefined, replacementImageId: undefined }; // For new sit
  const sampleSelectedLocation: Location = { latitude: 10, longitude: 20 };

  beforeEach(() => {
    vi.clearAllMocks();
    appInstance = null; // Reset instance
    // Default to no user, tests can override if auth is needed
    // @ts-ignore
    vi.mocked(FirebaseService.auth).currentUser = null;
  });

  const openPhotoUploadModalAndTriggerMissingLocation = async (appRenderer: any) => {
    // 1. Simulate opening PhotoUploadModal (e.g., by calling a method on App instance)
    // This part depends on how App.tsx manages modals. For this test, we'll assume
    // a method `openPhotoUploadModal` exists and can be called on the App instance.
    // Or, we rely on the PhotoUploadModal mock being controlled by props.
    
    // For this test, we'll assume App's state is managed such that PhotoUploadModal is open.
    // Then, we'll simulate PhotoUploadModal calling `onMissingLocationData`.
    // This is an indirect way to test App's reaction.
    
    // If App instance is available and has the method:
    // act(() => {
    //   appInstance?.openPhotoUploadModal('create_sit'); // Or relevant state/args
    // });
    // await appRenderer.rerender(<TestApp simulateMissingLocationData={true} />); // Re-render to pass simulation prop

    // More directly, call the handler that App would pass to PhotoUploadModal.
    // This requires getting the handler from App's props or internal setup.
    // For this test, we'll simulate the direct call to App's handler.
    act(() => {
        // @ts-ignore - directly calling the handler for test purposes
        appInstance?.handleMissingLocationData(samplePhotoDataWithoutLocation, sampleOriginalModalProps);
    });
    await waitFor(() => {}); // Allow state updates
  };


  it('Scenario: Full Refactored Manual Edit Flow - Confirmation', async () => {
    const { rerender } = render(<TestApp />);
    
    // 1. PhotoUploadModal calls onMissingLocationData
    await openPhotoUploadModalAndTriggerMissingLocation(rerender);

    // 2. Verify App state: showEditLocationModal is true, photo data is set
    // We'll check this by seeing if EditLocationModal is rendered
    await waitFor(() => expect(screen.getByTestId('mock-edit-location-modal')).toBeInTheDocument());
    // Conceptually, App's state for photoForManualLocation & manualLocationOriginalModalProps is set.

    // 3. EditLocationModal calls onConfirm
    act(() => {
        // @ts-ignore - directly calling the handler for test purposes
        appInstance?.handleEditLocationModalConfirm();
    });
    await waitFor(() => {});

    // 4. Verify App state: showEditLocationModal is false, isManualLocationEditing is true
    expect(screen.queryByTestId('mock-edit-location-modal')).not.toBeInTheDocument();
    // MapComponent should now receive isEditingLocation = true
    expect(screen.getByTestId('mock-map-component').textContent).toContain('Map Editing: Yes');
    
    // 5. MapComponent calls onConfirmLocation
    act(() => {
        // @ts-ignore - directly calling the handler for test purposes
        appInstance?.handleConfirmManualLocation(sampleSelectedLocation);
    });
    await waitFor(() => {});

    // 6. Verify photo upload service is called & state is reset
    expect(FirebaseService.createSitWithImage).toHaveBeenCalledWith(
      expect.objectContaining({ location: sampleSelectedLocation }),
      expect.objectContaining({
        base64Data: samplePhotoDataWithoutLocation.base64Data,
        dimensions: samplePhotoDataWithoutLocation.dimensions,
        location: sampleSelectedLocation,
      })
    );
    expect(screen.getByTestId('mock-map-component').textContent).toContain('Map Editing: No');
    // Conceptually, App's state for photoForManualLocation etc. is reset.
  });

  it('Scenario: Full Refactored Manual Edit Flow - Cancellation from EditLocationModal', async () => {
    const { rerender } = render(<TestApp />);

    // 1. PhotoUploadModal calls onMissingLocationData
    await openPhotoUploadModalAndTriggerMissingLocation(rerender);

    // 2. Verify EditLocationModal is shown
    await waitFor(() => expect(screen.getByTestId('mock-edit-location-modal')).toBeInTheDocument());

    // 3. EditLocationModal calls onClose
     act(() => {
        // @ts-ignore - directly calling the handler for test purposes
        appInstance?.handleEditLocationModalClose();
    });
    await waitFor(() => {});


    // 4. Verify App state is reset
    expect(screen.queryByTestId('mock-edit-location-modal')).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-map-component').textContent).toContain('Map Editing: No'); // isManualLocationEditing should be false
    
    // 5. Verify no photo upload occurs
    expect(FirebaseService.createSitWithImage).not.toHaveBeenCalled();
    expect(FirebaseService.addImageToSit).not.toHaveBeenCalled();
    expect(FirebaseService.replaceImageInSit).not.toHaveBeenCalled();
  });

  it('Scenario: Full Refactored Manual Edit Flow - Cancellation from Map.tsx', async () => {
    const { rerender } = render(<TestApp />);

    // 1. PhotoUploadModal calls onMissingLocationData
    await openPhotoUploadModalAndTriggerMissingLocation(rerender);
    
    // 2. EditLocationModal calls onConfirm
    act(() => { // @ts-ignore
        appInstance?.handleEditLocationModalConfirm();
    });
    await waitFor(() => expect(screen.getByTestId('mock-map-component').textContent).toContain('Map Editing: Yes'));

    // 3. MapComponent calls onCancelLocationEdit
    act(() => { // @ts-ignore
        appInstance?.handleCancelManualLocationEdit();
    });
    await waitFor(() => {});

    // 4. Verify App state is reset
    expect(screen.getByTestId('mock-map-component').textContent).toContain('Map Editing: No');
    
    // 5. Verify no photo upload occurs
    expect(FirebaseService.createSitWithImage).not.toHaveBeenCalled();
    expect(FirebaseService.addImageToSit).not.toHaveBeenCalled();
    expect(FirebaseService.replaceImageInSit).not.toHaveBeenCalled();
  });
});
