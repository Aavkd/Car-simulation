import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

// Phase 1: Core Systems
import { UndoManager, BoneRotationCommand, BonePositionCommand, KeyframeAddCommand, KeyframeDeleteCommand } from './core/UndoManager.js';
import { SelectionManager } from './core/SelectionManager.js';
import { HotkeyManager } from './core/HotkeyManager.js';

// Phase 1: UI Components
import { UIManager } from './ui/UIManager.js';
import { Toolbar } from './ui/Toolbar.js';
import { InspectorPanel } from './ui/InspectorPanel.js';
import { StatusBar } from './ui/StatusBar.js';

// Phase 2: Graph Editor Components
import { GraphEditor } from './graph/GraphEditor.js';
import { ParameterWidget } from './graph/ParameterWidget.js';
import { TransitionInspector } from './graph/TransitionInspector.js';

// Phase 3: Timeline Components
import { TimelinePanel } from './timeline/TimelinePanel.js';

// Phase 4: IK Components
import { IKSolver } from './ik/IKSolver.js';
import { IKHandle } from './ik/IKHandle.js';
import { FootIK } from './ik/FootIK.js';

// Phase 5: Event Components
import { EventManager } from './events/EventManager.js';

// Phase 6: Animation Import Components
import { ImportDialog } from './ui/ImportDialog.js';

export class AnimatorEditorController {
    constructor(game) {
        this.game = game;
        this.container = null;
        this.contentContainer = null;
        this.isEnabled = false;

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.selectedEntity = null;

        // Playback state
        this.isScrubbing = false;

        this.isPoseMode = false;
        this.transformControls = null;
        this.selectedBone = null;
        this.skeletonHelper = null;
        this.capturedPoses = []; // For keyframing later
        this.isPreviewing = false;

        // Direct interpolation preview state
        this.previewTime = 0;
        this.previewDuration = 0;
        this.boneRefs = new Map(); // name -> bone object reference

        // ==================== Phase 1: Core Systems ====================
        this.undoManager = new UndoManager(50);
        this.selectionManager = new SelectionManager(this);
        this.hotkeyManager = new HotkeyManager(this);

        // ==================== Phase 1: UI Components ====================
        this.uiManager = new UIManager(this);
        this.toolbar = new Toolbar(this.uiManager, this);
        this.inspectorPanel = new InspectorPanel(this.uiManager, this);
        this.statusBar = new StatusBar(this.uiManager, this);

        // ==================== Phase 2: Graph Editor Components ====================
        this.graphEditor = new GraphEditor(this.uiManager, this);
        this.parameterWidget = new ParameterWidget(this.uiManager, this);
        this.transitionInspector = new TransitionInspector(this.uiManager, this);
        this.isGraphVisible = false;

        // ==================== Phase 3: Timeline Components ====================
        this.timelinePanel = new TimelinePanel(this.uiManager, this);
        // ==================== Phase 3: Timeline Components ====================
        this.timelinePanel = new TimelinePanel(this.uiManager, this);
        this.isTimelineVisible = false;

        // ==================== Phase 4: IK Components ====================
        this.ikSolver = new IKSolver();
        this.ikHandles = []; // Store active IK handles
        // ==================== Phase 4: IK Components ====================
        this.ikSolver = new IKSolver();
        this.ikHandles = []; // Store active IK handles
        this.footIK = new FootIK(this.game, this.ikSolver);

        // ==================== Phase 5: Event Components ====================
        this.eventManager = new EventManager(this);

        // Phase 5.3: Layer Preview
        this.visualizedLayer = null;

        // ==================== Phase 6: Animation Import ====================
        this.importDialog = new ImportDialog(this.uiManager, this);


        // Track bone transform state for undo
        this._transformStartQuaternion = null;
        this._transformStartPosition = null;

        // Bind events
        this._onMouseDownBound = (e) => this._onMouseDown(e);
        this._onKeyDownBound = (e) => this._onKeyDown(e); // Added keydown for shortcuts

        // Setup undo manager callbacks
        this.undoManager.onHistoryChange = (state) => {
            if (this.toolbar) {
                this.toolbar.updateUndoState(state);
            }
            if (this.statusBar) {
                this.statusBar.setMessage(state.canUndo ? `Undo: ${state.undoName}` : 'Ready');
            }
        };

        // Expose to global scope for UI interactions
        window.game.animator = this;
    }

    async initialize() {
        console.log('AnimatorEditorController: Initializing (Phase 1 + Phase 2)...');

        // Initialize Phase 1 UI
        this.uiManager.initialize();
        this.container = this.uiManager.getRoot();

        // Build UI components
        const inspectorEl = this.inspectorPanel.build();
        this.container.appendChild(inspectorEl);

        const toolbarEl = this.toolbar.build();
        this.container.appendChild(toolbarEl);

        const statusBarEl = this.statusBar.build();
        this.container.appendChild(statusBarEl);

        // Phase 2: Build Graph Editor and Parameter Widget
        const graphEl = this.graphEditor.build();
        this.container.appendChild(graphEl);
        this.graphEditor.hide(); // Hidden by default until entity selected

        const paramEl = this.parameterWidget.build();
        this.container.appendChild(paramEl);
        this.parameterWidget.hide(); // Hidden by default

        const transInspEl = this.transitionInspector.build();
        this.container.appendChild(transInspEl);
        // TransitionInspector hidden by default, shown when edge selected

        // Phase 3: Build Timeline Panel
        const timelineEl = this.timelinePanel.build();
        this.container.appendChild(timelineEl);
        this.timelinePanel.hide(); // Hidden by default until Pose Mode

        // Phase 6: Build Import Dialog
        const importDialogEl = this.importDialog.build();
        document.body.appendChild(importDialogEl); // Append to body for modal overlay

        // Get content container reference for backwards compatibility
        this.contentContainer = this.inspectorPanel.contentContainer;

        // Initialize transform controls
        this._createTransformControls();

        console.log('AnimatorEditorController: Phase 1-6 initialization complete');
    }

    _createTransformControls() {
        if (this.transformControls) return;

        this.transformControls = new TransformControls(this.game.camera, this.game.renderer.domElement);

        // Track drag start for undo
        this.transformControls.addEventListener('mouseDown', () => {
            if (this.selectedBone) {
                this._transformStartQuaternion = this.selectedBone.quaternion.clone();
                this._transformStartPosition = this.selectedBone.position.clone();
            }
        });

        // Create undo command when drag ends
        this.transformControls.addEventListener('mouseUp', () => {
            if (this.selectedBone && this._transformStartQuaternion) {
                const mode = this.transformControls.mode;
                if (mode === 'rotate') {
                    const cmd = new BoneRotationCommand(
                        this.selectedBone,
                        this._transformStartQuaternion,
                        this.selectedBone.quaternion.clone()
                    );
                    this.undoManager.addToHistory(cmd);
                } else if (mode === 'translate') {
                    const cmd = new BonePositionCommand(
                        this.selectedBone,
                        this._transformStartPosition,
                        this.selectedBone.position.clone()
                    );
                    this.undoManager.addToHistory(cmd);
                }
            }
            this._transformStartQuaternion = null;
            this._transformStartPosition = null;
        });

        this.transformControls.addEventListener('dragging-changed', (event) => {
            // Disable camera controls while dragging
            if (this.game.cameraController) {
                this.game.cameraController.enabled = !event.value;
            }
        });

        // Force matrix update on change
        this.transformControls.addEventListener('change', () => {
            if (this.selectedEntity && this.selectedEntity.mesh) {
                // Force update the entire character hierarchy to ensure child bones and skinned meshes align
                this.selectedEntity.mesh.updateMatrixWorld(true);
            }
        });

        // Hide by default
        this.transformControls.enabled = false;
    }

    _createUI() {
        // Create main container
        this.container = document.createElement('div');
        this.container.id = 'animator-editor';
        this.container.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            display: none;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            z-index: 1000;
        `;

        // Create Sidebar
        const sidebar = document.createElement('div');
        sidebar.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 320px;
            height: 100%;
            background: rgba(20, 20, 25, 0.96);
            border-right: 1px solid #444;
            pointer-events: auto;
            display: flex;
            flex-direction: column;
            padding: 15px;
            box-sizing: border-box;
            color: #eee;
            box-shadow: 2px 0 10px rgba(0,0,0,0.5);
            overflow: hidden;
        `;

        sidebar.innerHTML = `
            <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #444;">
                <h2 style="margin: 0; font-size: 20px; color: #3498db; font-weight: 600;">Deep Animator</h2>
                <div style="font-size: 11px; color: #888; margin-top: 4px; display: flex; justify-content: space-between;">
                    <span>Phase 4 Editor</span>
                    <span style="color: #555;">v0.1.1</span>
                </div>
                <!-- Pose Mode Toggle -->
                <div style="margin-top: 15px;">
                     <button id="btn-pose-mode" onclick="window.game.animator.togglePoseMode()" style="width: 100%; padding: 8px; background: #2c3e50; border: 1px solid #34495e; color: #fff; cursor: pointer; border-radius: 4px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <span>🦴</span>
                        <span id="txt-pose-mode">Enter Pose Mode</span>
                     </button>
                </div>
            </div>
            <div id="animator-content" style="flex: 1; overflow-y: auto;">
                <div style="text-align: center; padding: 40px 20px; border: 2px dashed #444; border-radius: 8px; color: #666;">
                    <div style="font-size: 24px; margin-bottom: 10px;">🖱️</div>
                    <div>Click on a character in the scene to inspect.</div>
                </div>
            </div>
        `;

        this.container.appendChild(sidebar);
        document.body.appendChild(this.container);
        this.contentContainer = this.container.querySelector('#animator-content');
    }

    enable() {
        if (this.isEnabled) return;
        this.isEnabled = true;

        // Show UI
        this.uiManager.show();

        // Add Input Listeners
        window.addEventListener('mousedown', this._onMouseDownBound);

        // Enable hotkey manager (handles keydown)
        this.hotkeyManager.enable();

        // Add Controls to Scene
        if (this.transformControls) {
            this.game.scene.add(this.transformControls);
        }

        // Update status bar
        if (this.statusBar) {
            this.statusBar.setMessage('Ready');
        }

        console.log('AnimatorEditorController: Enabled (Phase 1)');
    }

    disable() {
        if (!this.isEnabled) return;
        this.isEnabled = false;

        // Hide UI
        this.uiManager.hide();

        // Remove Input Listeners
        window.removeEventListener('mousedown', this._onMouseDownBound);

        // Disable hotkey manager
        this.hotkeyManager.disable();

        // Cleanup
        this.disablePoseMode();
        if (this.transformControls) {
            this.transformControls.detach();
            this.game.scene.remove(this.transformControls);
        }

        // Clear undo history when exiting
        this.undoManager.clear();

        // Clear selection
        this.selectionManager.clearSelection();

        this.selectedEntity = null;
        this._buildUI();

        // Phase 2: Hide graph components
        this.graphEditor.hide();
        this.parameterWidget.hide();
        this.isGraphVisible = false;

        console.log('AnimatorEditorController: Disabled');
    }

    update(dt) {
        if (!this.isEnabled) return;

        if (this.selectedEntity && this.selectedEntity.animator) {
            this._updateRealtimeValues();

            // Phase 2: Update parameter widget real-time values
            if (this.parameterWidget) {
                this.parameterWidget.update();
            }
        }

        if (this.isPoseMode) {
            this._updateBoneHelpers();

            // Manual preview update using direct bone interpolation
            if (this.isPreviewing && this.capturedPoses.length >= 2) {
                this._updateDirectPreview(dt);
            }


        }

        // Phase 4: Update IK Solver
        if (this.isPoseMode) {
            if (this.footIK) this.footIK.update(dt);
            if (this.ikSolver) this.ikSolver.update();
        }

        // Phase 5: Update Event Manager
        // Note: In a real scenario, this should be driven by the running animation time.
        // For now, if we are previewing, we can update it.
        // But EventManager.update expects (currentTime, previousTime, isPlaying).
        // The timeline/preview logic needs to feed this.
        // For now, we will just perform initialization or basic updates if needed.
        // Actual triggering happens when the timeline or preview updates the time.
        // However, we should ensure the event manager has the correct sorted events if we just added one.
        // This is mostly handled by addEvent/sortEvents calls.



        // Update Camera Orbit
        if (this.selectedEntity && this.game.cameraController) {
            // Handle Gamepad Camera Input
            if (this.game.input && this.game.input.gamepad) {
                const gp = this.game.input.gamepad;
                // Use lookX and lookY (Right Stick)
                // Multiplier 20.0 matches Game.js gameplay camera speed
                this.game.cameraController.handleAnalogInput(gp.lookX, gp.lookY, 20.0);
            }

            // Update Orbit Position
            // We pass the mesh position as the center of orbit
            this.game.cameraController.updateOrbit(this.selectedEntity.mesh.position, dt);
        }
    }

    _updateRealtimeValues() {
        if (!this.contentContainer) return;
        const animator = this.selectedEntity.animator;
        if (!animator || !animator.fsm) return;

        // Update State Name
        const stateNameEl = this.contentContainer.querySelector('#anim-state-name');
        if (stateNameEl && animator.fsm.currentState) {
            const current = stateNameEl.textContent;
            const active = animator.fsm.currentState.name;
            if (current !== active) stateNameEl.textContent = active;
        }

        // Update Parameters
        const data = animator.fsm.data;
        for (const [key, value] of Object.entries(data)) {
            const input = this.contentContainer.querySelector(`#param-${key}`);
            if (input) {
                if (document.activeElement !== input) {
                    if (typeof value === 'boolean') {
                        input.checked = value;
                    } else if (typeof value === 'number') {
                        const display = this.contentContainer.querySelector(`#param-val-${key}`);
                        if (display) display.textContent = value.toFixed(2);
                    }
                }
            }
        }

        // Update Scrubber (Active Action)
        if (animator.currentAction && !this.isScrubbing) {
            const range = this.contentContainer.querySelector('#clip-scrubber');
            const timeDisplay = this.contentContainer.querySelector('#clip-time');
            const action = animator.currentAction;

            if (range && timeDisplay) {
                range.max = action.getClip().duration;
                range.value = action.time;
                timeDisplay.textContent = action.time.toFixed(2) + 's';
            }
        }
    }

    _onMouseDown(event) {
        if (!this.isEnabled) return;
        if (event.button !== 0) return; // Left click only

        // Don't raycast if clicking on UI
        const sidebar = this.container.firstElementChild;
        if (sidebar && sidebar.contains(event.target)) {
            return;
        }

        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.game.camera);

        // POSE MODE: Select Bones or IK Handles
        if (this.isPoseMode) {
            // 1. Check IK Handles
            const ikIntersects = this.raycaster.intersectObjects(this.game.scene.children, true);
            for (const hit of ikIntersects) {
                let target = hit.object;
                while (target) {
                    if (target.userData && target.userData.type === 'ik_handle') {
                        this._selectIKHandle(target.userData.handle);
                        return;
                    }
                    target = target.parent;
                    if (target === this.game.scene) break;
                }
            }

            // 2. Check Bone Helpers
            if (this.boneHelpers) {
                // Priority: If using the Transform Gizmo, ignore bone selection
                if (this.transformControls && this.transformControls.axis) {
                    return;
                }

                const boneIntersects = this.raycaster.intersectObjects(this.boneHelperGroup ? this.boneHelperGroup.children : this.boneHelpers, false);
                if (boneIntersects.length > 0) {
                    const bone = boneIntersects[0].object.userData.bone;
                    this._selectBone(bone);
                    return;
                }
            }
        }

        // INSPECT MODE: Select Entities
        const intersects = this.raycaster.intersectObjects(this.game.scene.children, true);

        // DEBUG: console.log(`[Animator] Intersects: ${intersects.length}`);

        for (const intersect of intersects) {
            let target = intersect.object;
            // Ignore bone helpers in normal mode if they happen to exist
            if (target.userData && target.userData.isBoneHelper) continue;

            // Traverse up to find an object that has an entity reference
            while (target) {
                if (target.userData && target.userData.entity) {
                    this._selectEntity(target);
                    return;
                }

                // Fallback: If it's a managed object from SceneObjectManager (has id and type)
                // and DOES NOT have a parent with an entity ref (we are at the root of the object)
                if (target.userData && target.userData.id && (target.userData.type === 'npc' || target.userData.type === 'object' || target.userData.type === 'enemy')) {
                    this._selectEntity(target, true);
                    return;
                }

                target = target.parent;
                if (target === this.game.scene) break;
            }
        }
        // console.log('[Animator] No entity hit');
    }

    _selectEntity(mesh, isRawEntity = false) {
        let entity;

        if (isRawEntity) {
            // Create a wrapper for raw scene objects so Animator can use them
            entity = {
                name: mesh.userData.name || 'Scene Object',
                mesh: mesh,
                animator: mesh.userData.proceduralInstance ? null : null, // Could attach an animator here if we wanted
                // If the user manually added animations to userData, we could potentially use them, 
                // but AnimationController usually manages them. 
                // For Pose Mode, we just need the mesh.
                userData: mesh.userData,
                // If it's an NPC/Enemy, it might have an animator instance attached elsewhere, 
                // but SceneObjectManager just spawns meshes. 
                // If this is a real NPCEntity from game loop, it would have 'userData.entity'.
                // Since it doesn't, this is a raw editor object.
            };

            // Try to find animator if it exists on the mesh
            if (mesh.userData.animator) {
                entity.animator = mesh.userData.animator;
            }
        } else {
            entity = mesh.userData.entity;
        }

        if (entity) {
            this.selectedEntity = entity;
            console.log(`[Animator] Selected Entity: ${entity.name}`);
            this._buildUI();

            // Phase 2: Preload graph data but don't show - user triggers via G key or button
            // Graph will be shown when user presses 'G' or clicks the graph toggle button
        } else {
            console.warn('[Animator] Selected object has no entity ref (logic mismatch)');
        }
    }

    _selectBone(bone) {
        this.selectedBone = bone;
        console.log(`[Animator] Selected Bone: ${bone.name}`);

        // Attach Transform Controls
        if (this.transformControls) {
            this.transformControls.attach(bone);
        }

        this._buildUI();
    }

    _buildUI() {
        // Delegate to InspectorPanel
        if (this.inspectorPanel) {
            this.inspectorPanel.refresh();
        }
    }

    // _buildPoseUI removed as it is now handled by InspectorPanel.buildPoseUI()

    toggleFootIK() {
        if (this.footIK) {
            this.footIK.setEnabled(!this.footIK.enabled);
            this._buildUI();
        }
    }

    /**
     * Create a new animation layer
     * @param {string} name 
     * @param {string} rootBoneName 
     */
    createLayer(name, rootBoneName) {
        if (!this.selectedEntity || !this.selectedEntity.animator) return;

        if (!name || name.trim() === '') {
            console.warn('[Animator] Layer name cannot be empty');
            return;
        }

        const animator = this.selectedEntity.animator;
        if (animator.layers.has(name)) {
            console.warn(`[Animator] Layer '${name}' already exists`);
            return;
        }

        animator.addLayer(name, rootBoneName);
        console.log(`[Animator] Created layer '${name}' with root '${rootBoneName}'`);

        // Refresh UI
        this._buildUI();
    }

    /**
     * Get list of all bone names in the selected entity's skeleton
     * @returns {string[]}
     */
    getSkeletonBoneNames() {
        const names = [];
        if (this.selectedEntity && this.selectedEntity.mesh) {
            this.selectedEntity.mesh.traverse(child => {
                if (child.isBone) {
                    names.push(child.name);
                }
            });
        }
        return names.sort(); // Sort alphabetically for easier searching
    }

    captureKeyframe() {
        if (!this.selectedEntity) return;

        // On first capture, populate bone references from the mesh
        if (this.boneRefs.size === 0) {
            this.selectedEntity.mesh.traverse(child => {
                if (child.isBone) {
                    // Only store first bone found with each name
                    if (!this.boneRefs.has(child.name)) {
                        this.boneRefs.set(child.name, child);
                    }
                }
            });
            console.log(`[Animator] Indexed ${this.boneRefs.size} unique bones`);
        }

        // Capture quaternions from the stored bone references (not from traverse)
        const pose = {
            id: Date.now(),
            bones: []
        };

        // Iterate the bone refs we already have - this ensures we capture from the same bones each time
        for (const [boneName, bone] of this.boneRefs) {
            pose.bones.push({
                name: boneName,
                rot: bone.quaternion.clone()
            });
        }

        // Use undo manager for keyframe addition
        const cmd = new KeyframeAddCommand(this.capturedPoses, pose);
        this.undoManager.executeCommand(cmd);

        console.log(`[Animator] Captured Keyframe #${this.capturedPoses.length} (${pose.bones.length} bones)`);

        // Update toolbar with keyframe count
        if (this.toolbar) {
            this.toolbar.setTotalFrames(this.capturedPoses.length);
        }

        // Phase 2: Update graph editor with keyframe timeline
        if (this.graphEditor && this.isGraphVisible) {
            this.graphEditor.loadKeyframes(this.capturedPoses, this.capturedPoses.length - 1);
        }

        // Phase 3: Update timeline panel with new keyframe
        if (this.timelinePanel && this.isTimelineVisible) {
            this.timelinePanel.loadKeyframes(this.capturedPoses, this.capturedPoses.length - 1);
        }

        this._buildUI();
    }

    deleteKeyframe(index) {
        if (index >= 0 && index < this.capturedPoses.length) {
            // Use undo manager for keyframe deletion
            const cmd = new KeyframeDeleteCommand(this.capturedPoses, index);
            this.undoManager.executeCommand(cmd);

            // Update toolbar with keyframe count
            if (this.toolbar) {
                this.toolbar.setTotalFrames(this.capturedPoses.length);
            }

            // Phase 3: Update timeline panel after deletion
            if (this.timelinePanel && this.isTimelineVisible) {
                this.timelinePanel.loadKeyframes(this.capturedPoses, Math.max(0, index - 1));
            }

            this._buildUI();
        }
    }

    playPreview() {
        if (this.isPreviewing) {
            this.stopPreview();
            return;
        }

        if (this.capturedPoses.length < 2) {
            console.warn('[Animator] Need at least 2 poses to play animation.');
            return;
        }

        // Direct bone interpolation approach - no AnimationMixer needed
        this.isPreviewing = true;
        this.previewTime = 0;
        this.previewDuration = (this.capturedPoses.length - 1) * 1.0; // 1 second per pose transition

        // Pause entity animator if exists
        if (this.selectedEntity && this.selectedEntity.animator) {
            this.selectedEntity.animator.paused = true;
            if (this.selectedEntity.animator.mixer) {
                this.selectedEntity.animator.mixer.timeScale = 0;
            }
        }

        console.log(`[Animator] Playing Preview - Direct Interpolation (${this.capturedPoses.length} keyframes, ${this.previewDuration}s)`);
        this._buildUI();
    }

    /**
     * Update preview using direct bone quaternion interpolation
     */
    _updateDirectPreview(dt) {
        this.previewTime += dt;

        // Loop the animation
        if (this.previewTime >= this.previewDuration) {
            this.previewTime = this.previewTime % Math.max(this.previewDuration, 0.001);
        }

        // Calculate which two poses to blend between
        const poseIndex = this.previewTime; // 1 second per pose
        const fromIndex = Math.floor(poseIndex);
        const toIndex = Math.min(fromIndex + 1, this.capturedPoses.length - 1);
        const alpha = poseIndex - fromIndex; // 0-1 blend factor

        const fromPose = this.capturedPoses[fromIndex];
        const toPose = this.capturedPoses[toIndex];

        if (!fromPose || !toPose) return;

        // Debug: Log once per second
        if (!this._lastDebugLog || Date.now() - this._lastDebugLog > 1000) {
            console.log(`[Preview] time=${this.previewTime.toFixed(2)}, from=${fromIndex}, to=${toIndex}, alpha=${alpha.toFixed(2)}, boneRefs=${this.boneRefs.size}`);
            this._lastDebugLog = Date.now();
        }

        let bonesUpdated = 0;
        // Interpolate each bone's quaternion
        for (const fromBone of fromPose.bones) {
            const bone = this.boneRefs.get(fromBone.name);
            if (!bone) continue;

            // Find matching bone in destination pose
            const toBone = toPose.bones.find(b => b.name === fromBone.name);
            if (!toBone) continue;

            // Spherical interpolation between quaternions
            bone.quaternion.slerpQuaternions(fromBone.rot, toBone.rot, alpha);
            bonesUpdated++;
        }

        // Trigger Animation Events
        if (this.eventManager) {
            // Using previewTime as current time.
            // We need previous time from the last frame.
            // Since this.previewTime is accumulated, we can infer previous roughly,
            // or we should store it.
            const previousTime = this.previewTime - dt;
            // Handle wrapping for events at loop point
            if (previousTime < 0) {
                // Loop occurred
                // Trigger events from oldEnd -> End AND Start -> Current
                // Simplified: Just update from 0
                this.eventManager.update(this.previewTime, 0, true);
            } else {
                this.eventManager.update(this.previewTime, previousTime, true);
            }

            // Also update playhead in timeline
            if (this.timelinePanel && this.isTimelineVisible) {
                this.timelinePanel.setPlayheadTime(this.previewTime);
            }
        }
    }

    stopPreview() {
        this.isPreviewing = false;
        this.previewTime = 0;

        // Restore to first captured pose (or leave as-is)
        if (this.capturedPoses.length > 0) {
            const firstPose = this.capturedPoses[0];
            for (const boneData of firstPose.bones) {
                const bone = this.boneRefs.get(boneData.name);
                if (bone) {
                    bone.quaternion.copy(boneData.rot);
                }
            }
        }

        this._buildUI();
    }


    _createPreviewClip() {
        const tracks = [];
        const durationPerPose = 1.0; // 1 second between poses
        const times = this.capturedPoses.map((_, i) => i * durationPerPose);

        // Group quaternion data by bone name
        const boneMap = new Map(); // name -> { quaternions: [] }

        this.capturedPoses.forEach(pose => {
            pose.bones.forEach(b => {
                if (!boneMap.has(b.name)) {
                    boneMap.set(b.name, { quaternions: [] });
                }
                const data = boneMap.get(b.name);
                // b.rot is now a Quaternion object, convert to array
                data.quaternions.push(b.rot.x, b.rot.y, b.rot.z, b.rot.w);
            });
        });

        boneMap.forEach((data, boneName) => {
            // Use bone name directly - THREE.js PropertyBinding will traverse scene graph to find objects by name
            const trackName = boneName + '.quaternion';
            tracks.push(new THREE.QuaternionKeyframeTrack(trackName, times, data.quaternions));
        });

        if (tracks.length === 0) return null;

        const duration = times[times.length - 1];
        const clip = new THREE.AnimationClip('Preview_Clip', duration, tracks);
        return clip;
    }

    exportAnimation() {
        if (this.capturedPoses.length === 0) return;

        const clip = this._createPreviewClip();
        if (!clip) return;

        const json = clip.toJSON();
        const jsonString = JSON.stringify(json, null, 2);

        // Log to console for now
        console.log('---------------- ANIMATION JSON ----------------');
        console.log(jsonString);
        console.log('------------------------------------------------');

        // Allow download
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'new_animation.anim.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    setParameter(key, value) {
        if (this.selectedEntity && this.selectedEntity.animator) {
            this.selectedEntity.animator.setInput(key, value);
        }
    }

    scrubClip(time) {
        if (this.selectedEntity && this.selectedEntity.animator && this.selectedEntity.animator.currentAction) {
            this.selectedEntity.animator.currentAction.time = time;
        }
    }

    setBoneScale(multiplier) {
        if (!this.boneHelpers) return;
        this.boneScaleMultiplier = multiplier;
        this.boneHelpers.forEach(helper => {
            if (helper && helper.userData.baseScale) {
                helper.scale.setScalar(helper.userData.baseScale * multiplier);
            }
        });
    }

    pauseClip() {
        if (this.selectedEntity && this.selectedEntity.animator && this.selectedEntity.animator.currentAction) {
            this.selectedEntity.animator.currentAction.paused = true;
        }
    }

    resumeClip() {
        if (this.selectedEntity && this.selectedEntity.animator && this.selectedEntity.animator.currentAction) {
            this.selectedEntity.animator.currentAction.paused = false;
        }
    }
    togglePoseMode() {
        if (this.isPoseMode) {
            this.disablePoseMode();
        } else {
            if (this.selectedEntity) {
                this.enablePoseMode();
            } else {
                alert('Select an entity first!');
            }
        }
    }

    enablePoseMode() {
        if (!this.selectedEntity) return;
        this.isPoseMode = true;

        // Update Button UI
        const btn = this.container.querySelector('#btn-pose-mode');
        const txt = this.container.querySelector('#txt-pose-mode');
        if (btn) btn.style.background = '#e67e22';
        if (txt) txt.textContent = 'Exit Pose Mode';

        // Show Skeleton
        if (!this.skeletonHelper) {
            this.skeletonHelper = new THREE.SkeletonHelper(this.selectedEntity.mesh);
            this.game.scene.add(this.skeletonHelper);
        }

        this._createBoneHelpers();

        // Enable Transform Controls
        if (this.transformControls) {
            this.transformControls.enabled = true;
        }

        console.log('[Animator] Pose Mode ENABLED');

        if (this.selectedEntity && this.selectedEntity.animator) {
            this.selectedEntity.animator.paused = true;
            // Force timeScale 0 just in case
            if (this.selectedEntity.animator.mixer) {
                this.selectedEntity.animator.mixer.timeScale = 0;
            }
        }

        this._validateAndRepairSkeleton(); // Force sync

        // Phase 2: Switch graph to show keyframe timeline
        if (this.graphEditor && this.isGraphVisible) {
            this.graphEditor.loadKeyframes(this.capturedPoses, 0);
        }

        // Phase 3: Show and initialize timeline panel
        if (this.timelinePanel) {
            this.timelinePanel.loadKeyframes(this.capturedPoses, 0);
            this.timelinePanel.show();
            this.isTimelineVisible = true;
        }

        this._buildUI(); // Rebuild for Pose tools
    }

    _createBoneHelpers() {
        if (!this.selectedEntity) return;
        this.boneHelpers = [];

        // Create a group for helpers if it doesn't exist
        if (!this.boneHelperGroup) {
            this.boneHelperGroup = new THREE.Group();
            this.game.scene.add(this.boneHelperGroup);
        } else {
            this.game.scene.add(this.boneHelperGroup); // Ensure it's in scene
        }

        // Force matrix update to ensure world scales are correct before we measure
        if (this.selectedEntity.mesh) {
            this.selectedEntity.mesh.updateMatrixWorld(true);
        }

        const targetWorldSize = 0.05; // 5cm
        const boxGeo = new THREE.BoxGeometry(1, 1, 1);
        const mat = new THREE.MeshBasicMaterial({ color: 0x00ff00, depthTest: false, transparent: true, opacity: 0.5 });
        const worldScale = new THREE.Vector3();

        let bones = [];
        if (this.selectedEntity.mesh.skeleton && this.selectedEntity.mesh.skeleton.bones) {
            bones = this.selectedEntity.mesh.skeleton.bones;
        } else {
            this.selectedEntity.mesh.traverse(child => {
                if (child.isBone) bones.push(child);
            });
        }

        if (bones.length === 0) console.warn('[Animator] No bones found for helper creation.');

        bones.forEach(bone => {
            const helper = new THREE.Mesh(boxGeo, mat.clone());

            // Calculate Scale
            bone.getWorldScale(worldScale);
            // If scale is weirdly 0 (can happen), default to 0.001 to avoid NaN
            const sX = Math.abs(worldScale.x) < 0.000001 ? 0.001 : worldScale.x;
            const requiredScale = targetWorldSize / sX;

            // Apply init scale
            helper.scale.setScalar(requiredScale);

            // Store metadata
            helper.userData.bone = bone;
            helper.userData.isBoneHelper = true;
            helper.userData.baseScale = requiredScale;

            // Add to GROUP, not bone
            this.boneHelperGroup.add(helper);
            this.boneHelpers.push(helper);
        });

        // Initial Sync
        this._updateBoneHelpers();
        this._updateMaskVisualization();
    }

    _updateBoneHelpers() {
        if (!this.boneHelpers || !this.boneHelperGroup) return;

        // Sync helpers to bones
        for (const helper of this.boneHelpers) {
            const bone = helper.userData.bone;
            if (bone) {
                // Get bone's world transform
                // We use helper.position/quaternion which are local to boneHelperGroup (scene root)
                // So they match world transform directly
                helper.position.setFromMatrixPosition(bone.matrixWorld);
                helper.quaternion.setFromRotationMatrix(bone.matrixWorld);
            }
        }
    }

    _validateAndRepairSkeleton() {
        if (!this.selectedEntity || !this.selectedEntity.mesh) return;

        let skinnedMesh = null;
        const foundBones = [];

        this.selectedEntity.mesh.traverse(child => {
            if (child.isSkinnedMesh) skinnedMesh = child;
            if (child.isBone) foundBones.push(child);
        });

        if (!skinnedMesh && foundBones.length > 0) {
            console.warn('[Animator] ❌ No SkinnedMesh found, but bones exist. The model might not be skinned properly.');
            // Optional: check for static mesh with skinning attributes if needed, but for now just warn.
        }

        if (skinnedMesh && foundBones.length > 0) {
            // console.log('[Animator] Validating Skeleton...');
            // Check if the first bone matches
            // Note: foundBones might include ALL bones, skeleton.bones might only be a subset.
            // But usually skeleton.bones[0] should be in foundBones.

            const skeletonBones = skinnedMesh.skeleton.bones;
            let mismatch = false;

            if (skeletonBones.length === 0) {
                mismatch = true;
                console.warn('[Animator] SkinnedMesh has empty skeleton!');
            } else {
                // Check if the actual bone objects are the same
                const rootBone = skeletonBones[0];
                const match = foundBones.find(b => b === rootBone);
                if (!match) {
                    mismatch = true;
                    console.warn('[Animator] Skeleton Mismatch Detected! SkinnedMesh is bound to phantom bones.');
                }
            }

            if (mismatch) {
                console.warn('[Animator] Attempting Auto-Repair...');

                // We need to recreate the skeleton with the bones we actually have in the scene
                // WARNING: The order matters. SkinnedMesh relies on index. 
                // We try to match by name if possible, or just assume standard hierarchy?
                // Safer approach: Map name->bone from foundBones, and rebuild the array based on original skeleton names

                const newBoneList = [];
                const boneMap = new Map();
                foundBones.forEach(b => boneMap.set(b.name, b));

                // If original skeleton existed, try to preserve order
                if (skeletonBones.length > 0) {
                    skeletonBones.forEach(b => {
                        const replacement = boneMap.get(b.name);
                        if (replacement) {
                            newBoneList.push(replacement);
                        } else {
                            console.warn(`[Animator] Could not find replacement for bone ${b.name}`);
                            // Provide original as fallback? Or invalid?
                        }
                    });
                } else {
                    // If empty, just use all found bones? No, that breaks binding.
                    // Fallback to foundBones
                    newBoneList.push(...foundBones);
                }

                if (newBoneList.length > 0) {
                    const newSkeleton = new THREE.Skeleton(newBoneList);
                    skinnedMesh.bind(newSkeleton, skinnedMesh.bindMatrix);

                    // Essential: Allow binding to update
                    skinnedMesh.pose();

                    console.log(`[Animator] Auto-Repair Complete. Rebound to ${newBoneList.length} bones.`);
                } else {
                    console.error('[Animator] Auto-Repair Failed: No bones found to look like skeleton.');
                }
            } else {
                console.log('[Animator] Skeleton is valid.');
            }
        }
    }

    disablePoseMode() {
        if (this.isPreviewing) {
            this.stopPreview(); // Handles cleanup
        }

        this.isPoseMode = false;



        // Update Button UI
        if (this.container) {
            const btn = this.container.querySelector('#btn-pose-mode');
            const txt = this.container.querySelector('#txt-pose-mode');
            if (btn) btn.style.background = '#2c3e50';
            if (txt) txt.textContent = 'Enter Pose Mode';
        }

        // Hide Skeleton
        if (this.skeletonHelper) {
            this.game.scene.remove(this.skeletonHelper);
            this.skeletonHelper = null;
        }

        // Cleanup Bone Helpers
        if (this.boneHelperGroup) {
            this.game.scene.remove(this.boneHelperGroup);
            // We usually don't dispose the group geometry, just clear children
            this.boneHelperGroup.clear();
        }
        if (this.boneHelpers) {
            this.boneHelpers.forEach(h => {
                if (h.geometry) h.geometry.dispose();
            });
            this.boneHelpers = [];
        }

        // Cleanup IK Handles (Phase 4)
        if (this.ikHandles) {
            this.ikHandles.forEach(h => h.dispose());
            this.ikHandles = [];
        }
        if (this.ikSolver) {
            this.ikSolver.clear();
        }

        // Disable Controls
        if (this.transformControls) {
            this.transformControls.detach();
            this.transformControls.enabled = false;
        }
        this.selectedBone = null;

        if (this.selectedEntity && this.selectedEntity.animator) {
            this.selectedEntity.animator.paused = false;
            if (this.selectedEntity.animator.mixer) {
                this.selectedEntity.animator.mixer.timeScale = 1;
            }
        }

        // Phase 2: Restore FSM view in graph editor
        if (this.graphEditor && this.isGraphVisible && this.selectedEntity) {
            this.graphEditor.loadFromAnimator(this.selectedEntity.animator);
        }

        // Phase 3: Hide timeline panel
        if (this.timelinePanel) {
            this.timelinePanel.hide();
            this.isTimelineVisible = false;
        }

        this._buildUI(); // Return to main menu
    }

    // ==================== Phase 4: IK Methods ====================

    createIKChain() {
        if (!this.selectedBone) {
            console.warn('Select a bone to create IK handle');
            return;
        }

        const effector = this.selectedBone;
        let root = effector;
        let depth = 2; // Default 2-bone chain (standard limb)

        // Walk up to find root
        for (let i = 0; i < depth; i++) {
            if (root.parent && root.parent.isBone) {
                root = root.parent;
            } else {
                break;
            }
        }

        if (root === effector) {
            console.warn('Cannot create chain: Bone has no parent bones');
            return;
        }

        console.log(`[Animator] Creating IK Chain: ${root.name} -> ${effector.name}`);

        // Create Handle
        const handleName = `IK_${effector.name}`;
        const handle = new IKHandle(handleName, effector.getWorldPosition(new THREE.Vector3()), this.game.scene);
        this.ikHandles.push(handle);

        // Add to Solver
        this.ikSolver.addChain({
            root: root,
            effector: effector,
            target: handle.target,
            joints: [] // Will be auto-populated
        });

        // Select the new handle
        this._selectIKHandle(handle);
    }

    _selectIKHandle(handle) {
        this.selectedBone = null; // Deselect bone

        // Attach transform controls to handle target
        if (this.transformControls) {
            this.transformControls.attach(handle.target);
            this.transformControls.enabled = true;
        }

        console.log(`[Animator] Selected IK Handle: ${handle.name}`);
        this._buildUI(); // Refresh UI
    }
    // ==================== Phase 5: Event Methods ====================

    _updateEventInspector(event) {
        if (this.inspectorPanel) {
            this.inspectorPanel.inspectEvent(event);
        }
    }

    deselectEvent() {
        if (this.timelinePanel) {
            this.timelinePanel.selectedEvent = null;
        }
        if (this.inspectorPanel) {
            this.inspectorPanel.inspectEvent(null);
        }
    }

    refreshTimeline() {
        if (this.timelinePanel) {
            // Force redraw or data update if needed
            // For now, the render loop handles drawing, but we might need to update cache if we had one
        }
    }

    // ==================== Phase 5.3: Layer Preview Methods ====================

    setLayerWeight(layerName, weight) {
        if (this.selectedEntity && this.selectedEntity.animator) {
            const layer = this.selectedEntity.animator.layers.get(layerName);
            if (layer) {
                layer.setWeight(weight);
            }
        }
    }

    toggleLayerMask(layerName) {
        if (this.visualizedLayer === layerName) {
            this.visualizedLayer = null;
        } else {
            this.visualizedLayer = layerName;
        }

        this._updateMaskVisualization();

        // If we are highlighting a layer mask, ensure we are in a mode where bone helpers are visible.
        // If not in pose mode, maybe we should enable a "visualization only" mode or just Pose Mode?
        // Roadmap says "Mask visualization on skeleton". Usually implies Pose Mode or a specialized view.
        // If user clicks eye but not in Pose Mode, text "Enter Pose Mode to see mask" or just auto-enter?
        // Let's auto-enter Pose Mode if not active, for convenience.
        if (this.visualizedLayer && !this.isPoseMode) {
            this.togglePoseMode(); // This will create bone helpers and then we need to re-apply mask
            // togglePoseMode calls _createBoneHelpers which calls _updateMaskVisualization, so we are good.
        } else {
            // Just update UI to refresh the eye icon
            this._buildUI();
        }
    }

    _updateMaskVisualization() {
        if (!this.boneHelpers) return;

        const defaultColor = 0x00ff00;
        const maskColor = 0xff0000; // Red for masked bones

        let maskedBones = new Set();
        if (this.visualizedLayer && this.selectedEntity && this.selectedEntity.animator) {
            const layer = this.selectedEntity.animator.layers.get(this.visualizedLayer);
            if (layer) {
                // Accessing internal method, acceptable for editor-core integration
                maskedBones = layer._getDescendantBoneNames(layer.rootBoneName);
            }
        }

        this.boneHelpers.forEach(helper => {
            const bone = helper.userData.bone;
            if (bone) {
                // Check if this bone is in the mask
                if (maskedBones.has(bone.name)) {
                    helper.material.color.setHex(maskColor);
                    helper.material.opacity = 0.8;
                } else {
                    helper.material.color.setHex(defaultColor);
                    helper.material.opacity = 0.5;
                }
            }
        });
    }
}
