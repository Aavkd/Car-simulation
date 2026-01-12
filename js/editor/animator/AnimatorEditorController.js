import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

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


        // Bind events
        this._onMouseDownBound = (e) => this._onMouseDown(e);
        this._onKeyDownBound = (e) => this._onKeyDown(e); // Added keydown for shortcuts

        // Expose to global scope for UI interactions
        window.game.animator = this;
    }

    async initialize() {
        console.log('AnimatorEditorController: Initializing...');
        this._createUI();
        this._createTransformControls();
    }

    _createTransformControls() {
        if (this.transformControls) return;

        this.transformControls = new TransformControls(this.game.camera, this.game.renderer.domElement);
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
        this.container.style.display = 'block';

        // Add Input Listeners
        window.addEventListener('mousedown', this._onMouseDownBound);
        window.addEventListener('keydown', this._onKeyDownBound);

        // Add Controls to Scene
        if (this.transformControls) {
            this.game.scene.add(this.transformControls);
        }

        console.log('AnimatorEditorController: Enabled');
    }

    disable() {
        if (!this.isEnabled) return;
        this.isEnabled = false;
        this.container.style.display = 'none';

        // Remove Input Listeners
        window.removeEventListener('mousedown', this._onMouseDownBound);
        window.removeEventListener('keydown', this._onKeyDownBound);

        // Cleanup
        this.disablePoseMode();
        if (this.transformControls) {
            this.transformControls.detach();
            this.game.scene.remove(this.transformControls);
        }

        this.selectedEntity = null;
        this._buildUI();

        console.log('AnimatorEditorController: Disabled');
    }

    update(dt) {
        if (!this.isEnabled) return;

        if (this.selectedEntity && this.selectedEntity.animator) {
            this._updateRealtimeValues();
        }

        if (this.isPoseMode) {
            this._updateBoneHelpers();

            // Manual preview update using direct bone interpolation
            if (this.isPreviewing && this.capturedPoses.length >= 2) {
                this._updateDirectPreview(dt);
            }


        }


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

        // POSE MODE: Select Bones
        if (this.isPoseMode && this.boneHelpers) {
            // Priority: If using the Transform Gizmo, ignore bone selection
            if (this.transformControls && this.transformControls.axis) {
                return;
            }

            const intersects = this.raycaster.intersectObjects(this.boneHelperGroup ? this.boneHelperGroup.children : this.boneHelpers, false);
            if (intersects.length > 0) {
                const bone = intersects[0].object.userData.bone;
                this._selectBone(bone);
                return;
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
        if (!this.contentContainer) return;

        if (this.isPoseMode && this.selectedEntity) {
            this._buildPoseUI();
            return;
        }

        if (!this.selectedEntity) {
            this.contentContainer.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; border: 2px dashed #444; border-radius: 8px; color: #666;">
                    <div style="font-size: 24px; margin-bottom: 10px;">🖱️</div>
                    <div>Click on a character in the scene to inspect.</div>
                </div>
            `;
            return;
        }

        // ... Standard Inspect UI (Original) ...
        // Re-implementing original logic briefly for when not in Pose Mode
        const name = this.selectedEntity.name || 'Unknown Entity';
        const animator = this.selectedEntity.animator;
        const currentStateName = animator && animator.fsm && animator.fsm.currentState ? animator.fsm.currentState.name : 'None';

        // Parameters UI
        let paramsHTML = '';
        if (animator && animator.fsm) {
            const data = animator.fsm.data;
            const keys = Object.keys(data);
            if (keys.length === 0) {
                paramsHTML = '<div style="font-size: 12px; color: #666; font-style: italic; padding: 10px;">No parameters found.</div>';
            } else {
                keys.forEach(key => {
                    const value = data[key];
                    if (typeof value === 'boolean') {
                        paramsHTML += `<div style="margin-bottom:10px;"><div style="font-size:11px;color:#ccc;margin-bottom:4px;font-weight:600;">${key}</div><input type="checkbox" ${value ? 'checked' : ''} onchange="window.game.animator.setParameter('${key}', this.checked)" style="accent-color:#3498db;"></div>`;
                    } else if (typeof value === 'number') {
                        paramsHTML += `<div style="margin-bottom:10px;"><div style="font-size:11px;color:#ccc;margin-bottom:4px;font-weight:600;">${key}</div><div style="display:flex;align-items:center;gap:10px;"><input type="range" min="0" max="10" step="0.1" value="${value}" style="flex:1" oninput="window.game.animator.setParameter('${key}', parseFloat(this.value)); this.nextElementSibling.textContent=parseFloat(this.value).toFixed(2)"><span style="color:#3498db;font-family:monospace;">${value.toFixed(2)}</span></div></div>`;
                    }
                });
            }
        }

        // Timeline / Active CLip UI
        let timelineHTML = '';
        if (animator && animator.currentAction) {
            const clip = animator.currentAction.getClip();
            timelineHTML = `
                <div style="margin-bottom: 20px;">
                    <div style="font-size: 11px; font-weight: bold; text-transform: uppercase; margin-bottom: 8px; color: #888;">Active Clip</div>
                    <div style="background: #222; border: 1px solid #333; border-radius: 4px; padding: 10px;">
                         <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                            <span style="color: #fff; font-size: 13px;">${clip.name}</span>
                            <span id="clip-time" style="color: #aaa; font-family: monospace; font-size: 13px;">${animator.currentAction.time.toFixed(2)}s</span>
                        </div>
                        <input type="range" id="clip-scrubber" min="0" max="${clip.duration}" step="0.01" value="${animator.currentAction.time}" style="width: 100%; accent-color: #3498db;"
                            onmousedown="window.game.animator.isScrubbing = true; window.game.animator.pauseClip()"
                            onmouseup="window.game.animator.isScrubbing = false; window.game.animator.resumeClip()"
                            oninput="window.game.animator.scrubClip(parseFloat(this.value)); document.getElementById('clip-time').textContent = parseFloat(this.value).toFixed(2) + 's'">
                    </div>
                </div>
             `;
        } else {
            timelineHTML = `
                <div style="margin-bottom: 20px;">
                    <div style="font-size: 11px; font-weight: bold; text-transform: uppercase; margin-bottom: 8px; color: #888;">Active Clip</div>
                     <div style="font-size: 12px; color: #666; font-style: italic; padding: 10px; background: #222; border-radius: 4px;">No clip playing.</div>
                </div>
             `;
        }

        this.contentContainer.innerHTML = `
            <div style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 6px; border: 1px solid #333; margin-bottom: 15px;">
                <div style="font-size: 10px; text-transform: uppercase; color: #aaa; margin-bottom: 5px;">Entity</div>
                <div style="font-size: 18px; font-weight: bold; color: #fff;">${name}</div>
                <div style="font-size: 12px; color: #4cd137;">● Active</div>
            </div>
            <div style="margin-bottom: 20px;">
                <div style="font-size: 11px; font-weight: bold; text-transform: uppercase; margin-bottom: 8px; color: #888;">State Machine</div>
                <div style="background: #222; border: 1px solid #333; border-radius: 4px; padding: 10px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span style="color: #aaa; font-size: 13px;">Current State:</span>
                        <span id="anim-state-name" style="color: #e1b12c; font-weight: bold; font-size: 13px;">${currentStateName}</span>
                    </div>
                </div>
            </div>
             <div style="margin-bottom: 20px;">
                <div style="font-size: 11px; font-weight: bold; text-transform: uppercase; margin-bottom: 8px; color: #888;">Parameters</div>
                <div style="background: #222; border: 1px solid #333; border-radius: 4px; padding: 10px;">${paramsHTML}</div>
            </div>
            ${timelineHTML}
            <div style="font-size: 10px; color: #555; text-align: center; margin-top: 20px;">Changes apply instantly. Use F8 to exit.</div>
        `;
    }

    _buildPoseUI() {
        const keyframeCount = this.capturedPoses.length;
        this.contentContainer.innerHTML = `
            <div style="background: #e67e2211; padding: 15px; border-radius: 6px; border: 1px solid #e67e22; margin-bottom: 15px;">
                <div style="font-size: 10px; text-transform: uppercase; color: #e67e22; margin-bottom: 5px;">Pose Mode</div>
                <div style="font-size: 16px; font-weight: bold; color: #fff;">${this.selectedEntity.name}</div>
            </div>

            <div style="margin-bottom: 20px;">
                <div style="font-size: 11px; font-weight: bold; text-transform: uppercase; margin-bottom: 8px; color: #888;">Tools</div>
                 <div style="display: flex; gap: 5px; margin-bottom: 10px;">
                    <button onclick="window.game.animator.transformControls.setMode('translate')" style="background: #333; border: 1px solid #444; color: #eee; padding: 8px; flex:1; cursor: pointer;">Move (W)</button>
                    <button onclick="window.game.animator.transformControls.setMode('rotate')" style="background: #333; border: 1px solid #444; color: #eee; padding: 8px; flex:1; cursor: pointer;">Rotate (E)</button>
                </div>
                <div style="font-size:12px; color:#888;">Selected Bone: <span style="color:#fff;">${this.selectedBone ? this.selectedBone.name : 'None'}</span></div>
                
                <!-- Bone Size Slider -->
                <div style="margin-top: 10px; border-top: 1px dashed #444; padding-top: 10px;">
                    <div style="display:flex; justify-content:space-between; font-size:11px; color:#aaa; margin-bottom:4px;">
                        <span>Bone Gizmo Size</span>
                        <span id="bone-scale-val">${(this.boneScaleMultiplier || 1.0).toFixed(2)}x</span>
                    </div>
                    <input type="range" min="0.01" max="5.0" step="0.01" value="${this.boneScaleMultiplier || 1.0}" style="width:100%; accent-color:#e67e22;" 
                        oninput="window.game.animator.setBoneScale(parseFloat(this.value)); document.getElementById('bone-scale-val').textContent = parseFloat(this.value).toFixed(2) + 'x'">
                </div>
            </div>

            <div style="margin-bottom: 20px; border-top: 1px solid #444; padding-top: 15px;">
                <div style="font-size: 11px; font-weight: bold; text-transform: uppercase; margin-bottom: 8px; color: #888;">Keyframes: ${keyframeCount}</div>
                
                <button onclick="window.game.animator.captureKeyframe()" style="width: 100%; padding: 12px; background: #27ae60; border: none; color: white; margin-bottom: 10px; cursor: pointer; font-weight: bold; border-radius: 4px;">📷 Capture Keyframe</button>
                
                <div style="max-height: 150px; overflow-y: auto; background: #222; margin-bottom: 10px; padding: 5px;">
                    ${this.capturedPoses.map((p, i) => `
                        <div style="display: flex; justify-content: space-between; padding: 5px; border-bottom: 1px solid #333; font-size: 12px;">
                            <span style="color: #aaa;">Frame ${i}</span>
                            <span style="color: #e74c3c; cursor: pointer;" onclick="window.game.animator.deleteKeyframe(${i})">✖</span>
                        </div>
                    `).join('')}
                </div>

                <div style="display: flex; gap: 10px;">
                <div style="display: flex; gap: 10px;">
                    <button onclick="window.game.animator.playPreview()" style="flex:1; padding: 10px; background: ${this.isPreviewing ? '#c0392b' : '#2980b9'}; border: none; color: white; cursor: pointer; font-weight: bold; border-radius: 4px;">${this.isPreviewing ? '⏹ Stop' : '▶ Preview'}</button>

                    <button onclick="window.game.animator.exportAnimation()" style="flex:1; padding: 10px; background: #8e44ad; border: none; color: white; cursor: pointer; font-weight: bold; border-radius: 4px;">💾 Export</button>
                </div>
            </div>
        `;
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

        this.capturedPoses.push(pose);
        console.log(`[Animator] Captured Keyframe #${this.capturedPoses.length} (${pose.bones.length} bones)`);
        this._buildUI();
    }

    deleteKeyframe(index) {
        if (index >= 0 && index < this.capturedPoses.length) {
            this.capturedPoses.splice(index, 1);
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

        this._buildUI(); // Return to main menu
    }
}
