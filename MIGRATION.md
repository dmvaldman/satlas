# React Migration Plan

## Current Issues
- [x] Fix marker click handling
- [x] Ensure popups work correctly
- [ ] Handle map container sizing
- [ ] Manage state between legacy and React apps

## Next Steps
1. [x] Complete MarkerContext migration
2. [x] Test marker and popup interaction
3. [ ] Move on to PhotoUpload component
4. [ ] Finally migrate Profile component

## Testing Checklist
- [ ] Markers appear correctly
- [ ] Markers are clickable
- [ ] Popups show and hide correctly
- [ ] Map resizes properly
- [ ] State updates work in both apps

## Components to Migrate
- [x] Map Container
- [x] Auth Container
- [x] Popup Component
- [x] Marker Component
- [x] Photo Upload Modal
- [ ] Profile Modal

## Contexts to Migrate
- [x] Map Context
- [x] Auth Context
- [x] Sits Context
- [x] Popup Context
- [x] Marker Context
- [x] Photo Upload Context
- [ ] Profile Context

## Migration Steps
1. [x] Set up React build pipeline
2. [x] Create basic React app structure
3. [ ] Migrate components one at a time
4. [ ] Test each component thoroughly
5. [ ] Remove legacy code when ready