# Migration from Legacy to React

## Progress

### ✅ Completed
- **Map System:**
  - Map initialization and management (MapContext)
  - Marker creation and management (MarkerContext)
  - Popup system (PopupContext)
- **Auth & Profile:**
  - Authentication system (AuthContext)
  - Profile UI and management (ProfileContext)
- **Sits:**
  - Basic sits loading and display (SitsContext)
- **Marks System:**
  - Migration complete in MarksContext with support for "favorite", "visited" and new "wantToGo" types
  - Uses locally computed timestamps (via `new Date()`) instead of `serverTimestamp()`
- **Photo Upload UI:**
  - Basic UI integrated into PhotoUploadContext

### 🚧 In Progress
- **Photo Upload System Functionality:**
  - Final integration, error handling, and testing pending (PhotoUploadContext)
- **Legacy Code Clean-Up:**
  - Marks logic has been migrated; legacy file `/ts/marks.ts` is ready for removal
  - Other legacy files (such as `/ts/map.ts`, `/ts/main.ts`, and `/ts/profile.ts`) will be removed after full feature verification
- **Add New Sit Flow:**
  - Refinement and migration from legacy code is underway

### 📋 Todo
1. **Finalize Photo Upload Flow**
   - Complete integration in PhotoUploadContext
   - Enhance error handling and perform thorough testing
2. **Complete Add New Sit Flow**
   - Migrate remaining functionalities from legacy code
   - Integrate with photo upload and add location validation
3. **Remove Legacy Code**
   - Delete legacy files in the `/ts` folder:
     - `/ts/marks.ts` (marks system verified)
     - `/ts/map.ts`
     - `/ts/main.ts`
     - `/ts/profile.ts` (if applicable)
   - Clean up `index.html` and remove unused CSS/JS assets
4. **Comprehensive Testing & Verification**
   - Test all marker interactions and popup updates (for all mark types)
   - Verify full authentication and profile flows
   - Ensure robust error handling in photo upload and new sit addition

## Next Steps
1. Thoroughly test the new Marks system (favorite, visited, wantToGo) through the UI.
2. Finalize and verify Photo Upload and New Sit flows.
3. Remove all legacy code once feature migration is verified.
4. Update documentation and polish any remaining refactoring.

## Notes
- Maintain verbose logging for error tracking.
- Consider adding error boundaries where appropriate.
- Verify that no references to the legacy `/ts` files remain after removal.