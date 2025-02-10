# Migration from Legacy to React

## Progress

### ✅ Completed
- Map initialization and management (MapContext)
- Marker creation and management (MarkerContext)
- Popup system (PopupContext)
- Authentication system (AuthContext)
- Profile UI and management (ProfileContext)
- Basic sits loading and display (SitsContext)

### 🚧 In Progress
- Marks/favorites system (MarksContext)
  - Basic functionality working
  - Need to remove legacy marks.ts
- Photo upload system (PhotoUploadContext)
  - Basic UI in place
  - Need to complete functionality

### 📋 Todo
1. Complete Photo Upload
   - Move functionality from map.ts to PhotoUploadContext
   - Test upload flow
   - Add error handling

2. Complete Add New Sit Flow
   - Move from map.ts to React components
   - Integrate with photo upload
   - Add location validation

3. Clean Up Legacy Code
   - Remove /ts folder:
     - main.ts (after all features moved)
     - map.ts (after photo upload complete)
     - marks.ts (after marks system verified)
     - profile.ts (after profile system verified)
   - Clean up index.html
   - Remove unused CSS

4. Testing & Verification
   - Test all marker interactions
   - Verify marks/favorites system
   - Test photo upload flow
   - Verify authentication system

## Next Steps
1. Complete marks system migration
2. Move photo upload functionality to React
3. Remove legacy code as features are verified

## Notes
- Keep console.error for actual errors
- Consider adding proper error boundaries
- Need to verify all features work before removing legacy code