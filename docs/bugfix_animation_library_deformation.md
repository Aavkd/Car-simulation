# Bug Fix: Animation Library Preview Deformation

**Date**: 2026-01-14
**Status**: ✅ Resolved
**Component**: Animation Library System - Phase 5.2/7.3

## Problem Description
When using the Animation Library in the Deep Animator Editor:
1. Characters correctly play animations through the preview functionality
2. When the preview is stopped, characters get deformed (often crushed or twisted) instead of returning to their original pose

## Root Cause
1. **Hierarchy Traversal Issue**: `_captureEntityPose` and `_restoreEntityPose` used `mesh.traverse()` to find bones. In many standard 3D formats (GLTF, FBX), the `SkinnedMesh` and the `Bone` hierarchy are siblings. Traversing the mesh **does not** visit the bones. Consequently, the "original pose" map was empty, and no restoration occurred.
2. **Missing Matrix Updates**: The system failed to update world matrices and skeleton bone matrices after attempting restoration.

## Solution Applied
Refactored `LibraryService.js` to:
1. access bones directly via `skeleton.bones` property when available.
2. Force `mesh.updateMatrixWorld(true)` and `skeleton.update()` after restoration.

```javascript
// New logic iterates skeleton bones directly
if (skeleton) {
    for (const bone of skeleton.bones) {
        // ... capture/restore logic
    }
}
```

## Files Modified
- `js/editor/animator/library/LibraryService.js` (lines 355-399)

## Testing
To verify the fix:
1. Open Animator Editor (F8)
2. Select a character entity
3. Open Animation Library panel
4. Preview any animation
5. Stop the preview
6. Verify character returns to original pose without deformation

## Technical Notes
This fix ensures compatibility with both standard Three.js loader hierarchies (where bones are separate from mesh) and custom hierarchies.
