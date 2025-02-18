# React Simplification Migration Plan

## Current Issues
1. Excessive state management complexity through multiple contexts
2. Over-reliance on hooks and effects
3. Scattered state management across multiple files
4. Unnecessary indirection through provider/context patterns
5. Too many small files creating cognitive overhead

## Target Architecture

### Core Components
- `App.tsx` - Main application container
- `Map/`
  - `MapComponent.tsx` - Core map functionality
  - `Marker.tsx` - Marker rendering
  - `Popup.tsx` - Popup functionality
- `Auth/`
  - `AuthComponent.tsx` - Authentication handling
  - `ProfileComponent.tsx` - User profile management
- `Photo/`
  - `PhotoUpload.tsx` - Photo upload functionality
  - `PhotoCarousel.tsx` - Image display
- `types.ts` - Shared type definitions

### State Management
- Move to class-based components with explicit state/props
- Centralize state management in App.tsx
- Use prop drilling for state updates (simpler than context)
- Minimize use of effects to essential cases only (map initialization, auth)

### Migration Steps

1. **Phase 1: State Centralization**
   - Create new App.tsx with consolidated state
   - Define core state interfaces
   - Implement main state update methods

2. **Phase 2: Map Component Migration**
   - Consolidate MapContext, MarkerContext, PopupContext into single MapComponent
   - Convert to class component with clear lifecycle methods
   - Move marker/popup logic into subcomponents

3. **Phase 3: Auth Simplification**
   - Merge AuthContext and ProfileContext into AuthComponent
   - Implement as class component
   - Move profile UI into subcomponent

4. **Phase 4: Photo Management**
   - Combine PhotoUploadContext and related components
   - Create unified PhotoComponent
   - Simplify carousel implementation

5. **Phase 5: Cleanup**
   - Remove context files
   - Clean up unused hooks
   - Consolidate types
   - Remove redundant components

### Implementation Order
1. Start with App.tsx refactor to establish new patterns
2. Tackle Map components (most complex)
3. Migrate Auth functionality
4. Update Photo components
5. Final cleanup

### Testing Strategy
- Maintain working application throughout migration
- Test each component after conversion
- Focus on core user flows:
  - Map navigation
  - Marker interaction
  - Photo upload
  - Authentication
  - Profile management

### Code Style Guidelines
1. Prefer class components for stateful logic
2. Use pure functional components for presentation
3. Explicit props over context
4. Minimize hooks usage
5. Clear component hierarchy
6. Descriptive method names
7. Strong typing

Would you like to proceed with Phase 1 and start with the new App.tsx implementation?