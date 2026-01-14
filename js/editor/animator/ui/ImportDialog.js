/**
 * ImportDialog.js
 * Animation Import System - Phase 3.1 + Phase 6 (Advanced Visualization)
 * 
 * Modal dialog for the animation import workflow.
 * Provides file selection, bone mapping UI, import options, and 3D preview.
 */

import { AnimationImporter } from '../import/AnimationImporter.js';
import { HumanoidMapper, HUMANOID_BONES } from '../import/HumanoidAvatar.js';
import { SkeletonViewer } from '../import/SkeletonViewer.js';
import { Retargeter } from '../import/Retargeter.js';
import { ClipConverter } from '../import/ClipConverter.js';
import { DialogSceneManager } from '../viz/DialogSceneManager.js';

/**
 * ImportDialog - Modal UI for animation import
 */
export class ImportDialog {
    /**
     * @param {UIManager} uiManager - Reference to the UI manager
     * @param {AnimatorEditorController} editor - Reference to the animator editor
     */
    constructor(uiManager, editor) {
        this.uiManager = uiManager;
        this.editor = editor;

        // UI elements
        this.container = null;
        this.overlay = null;

        // Import state
        this.importer = new AnimationImporter();
        this.importResult = null;
        this.boneMapping = {};
        this.targetMapping = {};
        this.selectedClips = new Set();

        // Options
        this.options = {
            prefix: '',
            suffix: '',
            scale: 1.0,
            removeRootMotion: false,
            fps: 30
        };

        // Skeleton viewer for preview
        this.skeletonViewer = null;

        // 3D Scene manager for preview (Phase 6)
        this.sceneManager = null;
        this.previewContainer = null;
        this.previewActive = false;
        this.splitViewEnabled = false;

        // Bind methods
        this._onFileSelect = this._onFileSelect.bind(this);
        this._onDragOver = this._onDragOver.bind(this);
        this._onDrop = this._onDrop.bind(this);
    }

    /**
     * Build the dialog UI
     * @returns {HTMLElement}
     */
    build() {
        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'import-dialog-overlay';
        this.overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: none;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        `;

        // Create main container
        this.container = document.createElement('div');
        this.container.className = 'import-dialog';
        this.container.style.cssText = `
            background: var(--ae-surface, #252525);
            border-radius: 12px;
            width: 900px;
            max-width: 90vw;
            max-height: 85vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
            overflow: hidden;
        `;

        // Build sections
        this.container.appendChild(this._buildHeader());
        this.container.appendChild(this._buildContent());
        this.container.appendChild(this._buildFooter());

        this.overlay.appendChild(this.container);

        // Close on overlay click
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.hide();
            }
        });

        return this.overlay;
    }

    /**
     * Build header section
     * @private
     */
    _buildHeader() {
        const header = document.createElement('div');
        header.className = 'import-dialog-header';
        header.style.cssText = `
            padding: 16px 20px;
            border-bottom: 1px solid var(--ae-border, #333);
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;

        const title = document.createElement('h2');
        title.textContent = '📥 Import Animation';
        title.style.cssText = `
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            color: var(--ae-text, #fff);
        `;

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = `
            background: none;
            border: none;
            color: var(--ae-text-secondary, #888);
            font-size: 20px;
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
        `;
        closeBtn.onclick = () => this.hide();

        header.appendChild(title);
        header.appendChild(closeBtn);

        return header;
    }

    /**
     * Build main content area
     * @private
     */
    _buildContent() {
        const content = document.createElement('div');
        content.className = 'import-dialog-content';
        content.style.cssText = `
            flex: 1;
            padding: 20px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 20px;
        `;

        // File drop zone (initial state)
        this.dropZone = this._buildDropZone();
        content.appendChild(this.dropZone);

        // 3D Preview section (Phase 6)
        this.previewSection = this._buildPreviewSection();
        this.previewSection.style.display = 'none';
        content.appendChild(this.previewSection);

        // Import details (shown after file load)
        this.detailsPanel = this._buildDetailsPanel();
        this.detailsPanel.style.display = 'none';
        content.appendChild(this.detailsPanel);

        return content;
    }

    /**
     * Build file drop zone
     * @private
     */
    _buildDropZone() {
        const zone = document.createElement('div');
        zone.className = 'import-drop-zone';
        zone.style.cssText = `
            border: 2px dashed var(--ae-border, #444);
            border-radius: 8px;
            padding: 60px 20px;
            text-align: center;
            transition: all 0.2s;
            cursor: pointer;
        `;

        zone.innerHTML = `
            <div style="font-size: 48px; margin-bottom: 16px;">📁</div>
            <div style="font-size: 16px; color: var(--ae-text, #fff); margin-bottom: 8px;">
                Drop animation file here
            </div>
            <div style="font-size: 13px; color: var(--ae-text-secondary, #888);">
                Supports: GLB, GLTF, FBX, BVH
            </div>
            <input type="file" accept=".glb,.gltf,.fbx,.bvh" style="display: none;">
        `;

        const fileInput = zone.querySelector('input');

        // Click to browse
        zone.onclick = () => fileInput.click();

        // File selection
        fileInput.onchange = (e) => {
            if (e.target.files[0]) {
                this._onFileSelect(e.target.files[0]);
            }
        };

        // Drag and drop
        zone.ondragover = this._onDragOver;
        zone.ondragleave = () => {
            zone.style.borderColor = 'var(--ae-border, #444)';
            zone.style.background = 'transparent';
        };
        zone.ondrop = this._onDrop;

        return zone;
    }

    /**
     * Build 3D preview section (Phase 6)
     * @private
     */
    _buildPreviewSection() {
        const section = document.createElement('div');
        section.className = 'import-preview-section';
        section.style.cssText = `
            background: var(--ae-surface-alt, #2a2a2a);
            border-radius: 8px;
            overflow: hidden;
        `;

        // Preview header with controls
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 12px;
            border-bottom: 1px solid var(--ae-border, #333);
        `;

        const title = document.createElement('span');
        title.textContent = '🎬 3D Preview';
        title.style.cssText = `
            font-weight: 600;
            font-size: 13px;
            color: var(--ae-text, #fff);
        `;

        // Controls container
        const controls = document.createElement('div');
        controls.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
        `;

        // Playback controls
        this.playBtn = document.createElement('button');
        this.playBtn.innerHTML = '▶';
        this.playBtn.title = 'Play/Pause';
        this.playBtn.style.cssText = `
            background: var(--ae-accent, #4a9eff);
            border: none;
            color: white;
            width: 28px;
            height: 28px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        `;
        this.playBtn.onclick = () => this._togglePlayback();

        // Stop button
        const stopBtn = document.createElement('button');
        stopBtn.innerHTML = '⏹';
        stopBtn.title = 'Stop';
        stopBtn.style.cssText = `
            background: var(--ae-surface, #252525);
            border: 1px solid var(--ae-border, #444);
            color: var(--ae-text, #fff);
            width: 28px;
            height: 28px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        `;
        stopBtn.onclick = () => this._stopPreviewPlayback();

        // Time display
        this.timeDisplay = document.createElement('span');
        this.timeDisplay.textContent = '0.00 / 0.00';
        this.timeDisplay.style.cssText = `
            font-size: 11px;
            color: var(--ae-text-muted, #666);
            min-width: 80px;
            text-align: center;
        `;

        // Split view toggle
        this.splitViewBtn = document.createElement('button');
        this.splitViewBtn.innerHTML = '◧';
        this.splitViewBtn.title = 'Toggle Split View';
        this.splitViewBtn.style.cssText = `
            background: var(--ae-surface, #252525);
            border: 1px solid var(--ae-border, #444);
            color: var(--ae-text, #fff);
            width: 28px;
            height: 28px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        `;
        this.splitViewBtn.onclick = () => this._toggleSplitView();

        controls.appendChild(this.playBtn);
        controls.appendChild(stopBtn);
        controls.appendChild(this.timeDisplay);
        controls.appendChild(this.splitViewBtn);

        header.appendChild(title);
        header.appendChild(controls);
        section.appendChild(header);

        // 3D Canvas container
        this.previewContainer = document.createElement('div');
        this.previewContainer.className = 'preview-canvas-container';
        this.previewContainer.style.cssText = `
            width: 100%;
            height: 280px;
            background: #1a1a2e;
            position: relative;
        `;
        section.appendChild(this.previewContainer);

        // Timeline scrubber
        const scrubberContainer = document.createElement('div');
        scrubberContainer.style.cssText = `
            padding: 10px 12px;
            border-top: 1px solid var(--ae-border, #333);
        `;

        this.scrubber = document.createElement('input');
        this.scrubber.type = 'range';
        this.scrubber.min = '0';
        this.scrubber.max = '100';
        this.scrubber.value = '0';
        this.scrubber.style.cssText = `
            width: 100%;
            height: 6px;
            cursor: pointer;
        `;
        this.scrubber.oninput = () => this._onScrub();

        scrubberContainer.appendChild(this.scrubber);
        section.appendChild(scrubberContainer);

        return section;
    }


    /**
     * Build details panel (shown after file load)
     * @private
     */
    _buildDetailsPanel() {
        const panel = document.createElement('div');
        panel.className = 'import-details';
        panel.style.cssText = `
            display: flex;
            gap: 20px;
        `;

        // Left column: Source info & Bone mapping
        const leftCol = document.createElement('div');
        leftCol.className = 'import-left-col';
        leftCol.style.cssText = `
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 16px;
        `;

        // Source info section
        this.sourceInfoSection = this._buildSection('Source File', '');
        leftCol.appendChild(this.sourceInfoSection);

        // Bone mapping section
        this.boneMappingSection = this._buildSection('Bone Mapping', '');
        leftCol.appendChild(this.boneMappingSection);

        // Right column: Clip selection & Options
        const rightCol = document.createElement('div');
        rightCol.className = 'import-right-col';
        rightCol.style.cssText = `
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 16px;
        `;

        // Clip selection
        this.clipSection = this._buildSection('Animation Clips', '');
        rightCol.appendChild(this.clipSection);

        // Options
        this.optionsSection = this._buildOptionsSection();
        rightCol.appendChild(this.optionsSection);

        panel.appendChild(leftCol);
        panel.appendChild(rightCol);

        return panel;
    }

    /**
     * Build a generic section container
     * @private
     */
    _buildSection(title, content) {
        const section = document.createElement('div');
        section.className = 'import-section';
        section.style.cssText = `
            background: var(--ae-surface-alt, #2a2a2a);
            border-radius: 8px;
            padding: 12px;
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            font-weight: 600;
            color: var(--ae-text, #fff);
            margin-bottom: 10px;
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        `;
        header.textContent = title;

        const body = document.createElement('div');
        body.className = 'section-body';
        body.innerHTML = content;

        section.appendChild(header);
        section.appendChild(body);

        return section;
    }

    /**
     * Build options section
     * @private
     */
    _buildOptionsSection() {
        const section = this._buildSection('Import Options', '');
        const body = section.querySelector('.section-body');
        body.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 12px;
        `;

        // Prefix
        body.appendChild(this._buildInput('Prefix', 'prefix', '', 'e.g., imported_'));

        // Suffix  
        body.appendChild(this._buildInput('Suffix', 'suffix', '', 'e.g., _retargeted'));

        // Scale
        body.appendChild(this._buildInput('Scale', 'scale', '1.0', 'Scale factor', 'number'));

        // Remove root motion
        body.appendChild(this._buildCheckbox('Remove Root Motion', 'removeRootMotion', false));

        // FPS
        body.appendChild(this._buildInput('Sample FPS', 'fps', '30', 'Sampling rate', 'number'));

        return section;
    }

    /**
     * Build input field
     * @private
     */
    _buildInput(label, key, value, placeholder, type = 'text') {
        const row = document.createElement('div');
        row.style.cssText = `
            display: flex;
            align-items: center;
            gap: 10px;
        `;

        const lbl = document.createElement('label');
        lbl.textContent = label;
        lbl.style.cssText = `
            flex: 0 0 100px;
            font-size: 12px;
            color: var(--ae-text-secondary, #888);
        `;

        const input = document.createElement('input');
        input.type = type;
        input.value = value;
        input.placeholder = placeholder;
        input.style.cssText = `
            flex: 1;
            padding: 6px 10px;
            border: 1px solid var(--ae-border, #444);
            border-radius: 4px;
            background: var(--ae-surface, #252525);
            color: var(--ae-text, #fff);
            font-size: 12px;
        `;
        input.onchange = () => {
            this.options[key] = type === 'number' ? parseFloat(input.value) : input.value;
        };

        row.appendChild(lbl);
        row.appendChild(input);

        return row;
    }

    /**
     * Build checkbox
     * @private
     */
    _buildCheckbox(label, key, checked) {
        const row = document.createElement('div');
        row.style.cssText = `
            display: flex;
            align-items: center;
            gap: 10px;
        `;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = checked;
        checkbox.onchange = () => {
            this.options[key] = checkbox.checked;
        };

        const lbl = document.createElement('label');
        lbl.textContent = label;
        lbl.style.cssText = `
            font-size: 12px;
            color: var(--ae-text-secondary, #888);
            cursor: pointer;
        `;
        lbl.onclick = () => {
            checkbox.checked = !checkbox.checked;
            this.options[key] = checkbox.checked;
        };

        row.appendChild(checkbox);
        row.appendChild(lbl);

        return row;
    }

    /**
     * Build footer with action buttons
     * @private
     */
    _buildFooter() {
        const footer = document.createElement('div');
        footer.className = 'import-dialog-footer';
        footer.style.cssText = `
            padding: 16px 20px;
            border-top: 1px solid var(--ae-border, #333);
            display: flex;
            justify-content: flex-end;
            gap: 12px;
        `;

        // Cancel button
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = `
            padding: 8px 20px;
            border: 1px solid var(--ae-border, #444);
            border-radius: 6px;
            background: transparent;
            color: var(--ae-text, #fff);
            cursor: pointer;
            font-size: 13px;
        `;
        cancelBtn.onclick = () => this.hide();

        // Import button
        this.importBtn = document.createElement('button');
        this.importBtn.textContent = 'Import Selected';
        this.importBtn.disabled = true;
        this.importBtn.style.cssText = `
            padding: 8px 20px;
            border: none;
            border-radius: 6px;
            background: var(--ae-accent, #4a9eff);
            color: #fff;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            opacity: 0.5;
        `;
        this.importBtn.onclick = () => this._performImport();

        footer.appendChild(cancelBtn);
        footer.appendChild(this.importBtn);

        return footer;
    }

    /**
     * Show the dialog
     */
    show() {
        if (!this.overlay.parentElement) {
            document.body.appendChild(this.overlay);
        }
        this.overlay.style.display = 'flex';

        // Reset state
        this._reset();
    }

    /**
     * Hide the dialog
     */
    hide() {
        this.overlay.style.display = 'none';
        this._reset();
    }

    /**
     * Reset dialog state
     * @private
     */
    _reset() {
        this.importResult = null;
        this.boneMapping = {};
        this.targetMapping = {};
        this.selectedClips.clear();

        // Cleanup 3D preview
        this._cleanupPreview();

        // Restore drop zone to initial state
        this.dropZone.innerHTML = `
            <div style="font-size: 48px; margin-bottom: 16px;">📁</div>
            <div style="font-size: 16px; color: var(--ae-text, #fff); margin-bottom: 8px;">
                Drop animation file here
            </div>
            <div style="font-size: 13px; color: var(--ae-text-secondary, #888);">
                Supports: GLB, GLTF, FBX, BVH
            </div>
            <input type="file" accept=".glb,.gltf,.fbx,.bvh" style="display: none;">
        `;

        // Re-attach file input handler
        const fileInput = this.dropZone.querySelector('input');
        if (fileInput) {
            fileInput.onchange = (e) => {
                if (e.target.files[0]) {
                    this._onFileSelect(e.target.files[0]);
                }
            };

            // Re-attach click handler for drop zone to trigger file input
            this.dropZone.onclick = () => fileInput.click();
        }

        // Show drop zone, hide details and preview
        this.dropZone.style.display = 'block';
        this.previewSection.style.display = 'none';
        this.detailsPanel.style.display = 'none';

        // Disable import button
        this.importBtn.disabled = true;
        this.importBtn.style.opacity = '0.5';
        this.importBtn.textContent = 'Import Selected';
    }

    /**
     * Handle drag over
     * @private
     */
    _onDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone.style.borderColor = 'var(--ae-accent, #4a9eff)';
        this.dropZone.style.background = 'rgba(74, 158, 255, 0.1)';
    }

    /**
     * Handle file drop
     * @private
     */
    _onDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone.style.borderColor = 'var(--ae-border, #444)';
        this.dropZone.style.background = 'transparent';

        const file = e.dataTransfer.files[0];
        if (file && AnimationImporter.isSupported(file.name)) {
            this._onFileSelect(file);
        }
    }

    /**
     * Handle file selection
     * @private
     */
    async _onFileSelect(file) {
        // Show loading state
        this.dropZone.innerHTML = `
            <div style="font-size: 48px; margin-bottom: 16px;">⏳</div>
            <div style="font-size: 16px; color: var(--ae-text, #fff);">
                Loading ${file.name}...
            </div>
        `;

        // Import the file
        this.importResult = await this.importer.importFile(file);

        if (this.importResult.success) {
            this._showImportDetails();
        } else {
            this._showError(this.importResult.error);
        }
    }

    /**
     * Show import details after successful load
     * @private
     */
    _showImportDetails() {
        // Hide drop zone, show details and preview
        this.dropZone.style.display = 'none';
        this.previewSection.style.display = 'block';
        this.detailsPanel.style.display = 'flex';

        // Populate source info
        const sourceBody = this.sourceInfoSection.querySelector('.section-body');
        sourceBody.innerHTML = `
            <div style="font-size: 12px; color: var(--ae-text-secondary, #888); margin-bottom: 8px;">
                <strong style="color: var(--ae-text, #fff);">${this.importResult.fileName}</strong>
            </div>
            <div style="font-size: 12px; color: var(--ae-text-secondary, #888);">
                Format: ${this.importResult.format.toUpperCase()}<br>
                Bones: ${this.importResult.boneNames.length}<br>
                Clips: ${this.importResult.clips.length}
            </div>
        `;

        // Auto-map bones
        if (this.importResult.skeleton) {
            this.boneMapping = HumanoidMapper.autoMap(this.importResult.skeleton.bones);
        }

        // Build bone mapping UI
        this._buildBoneMappingUI();

        // Build clip selection UI
        this._buildClipSelectionUI();

        // Auto-map target skeleton if entity is selected
        this._autoMapTargetSkeleton();

        // Initialize 3D preview (Phase 6)
        this._initializePreview();

        // Update import button state
        this._updateImportButtonState();
    }

    /**
     * Build bone mapping UI
     * @private
     */
    _buildBoneMappingUI() {
        const body = this.boneMappingSection.querySelector('.section-body');
        body.innerHTML = '';
        body.style.cssText = `
            max-height: 250px;
            overflow-y: auto;
        `;

        const validation = HumanoidMapper.validateMapping(this.boneMapping);

        // Summary
        const summary = document.createElement('div');
        summary.style.cssText = `
            padding: 8px;
            margin-bottom: 10px;
            border-radius: 4px;
            font-size: 12px;
            background: ${validation.valid ? 'rgba(0, 255, 0, 0.1)' : 'rgba(255, 200, 0, 0.1)'};
            color: ${validation.valid ? '#4caf50' : '#ff9800'};
        `;
        summary.textContent = validation.valid
            ? '✓ All required bones mapped'
            : `⚠ Missing: ${validation.missing.join(', ')}`;
        body.appendChild(summary);

        // Bone list by category
        const categories = HumanoidMapper.getCategories();

        for (const category of categories) {
            const categoryDiv = document.createElement('div');
            categoryDiv.style.marginBottom = '12px';

            const catHeader = document.createElement('div');
            catHeader.textContent = category;
            catHeader.style.cssText = `
                font-size: 11px;
                color: var(--ae-text-muted, #666);
                margin-bottom: 4px;
                text-transform: uppercase;
            `;
            categoryDiv.appendChild(catHeader);

            const bones = HumanoidMapper.getBonesByCategory(category);
            for (const humanoidBone of bones) {
                const row = this._buildBoneMappingRow(humanoidBone);
                categoryDiv.appendChild(row);
            }

            body.appendChild(categoryDiv);
        }
    }

    /**
     * Build a bone mapping row
     * @private
     */
    _buildBoneMappingRow(humanoidBone) {
        const def = HUMANOID_BONES[humanoidBone];
        const mappedTo = this.boneMapping[humanoidBone];

        const row = document.createElement('div');
        row.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 4px 0;
        `;

        // Status indicator
        const status = document.createElement('span');
        status.textContent = mappedTo ? '✓' : (def.required ? '✗' : '○');
        status.style.cssText = `
            width: 16px;
            text-align: center;
            color: ${mappedTo ? '#4caf50' : (def.required ? '#f44336' : '#888')};
        `;

        // Bone name
        const label = document.createElement('span');
        label.textContent = humanoidBone;
        label.style.cssText = `
            flex: 0 0 100px;
            font-size: 12px;
            color: var(--ae-text, #fff);
        `;

        // Dropdown for source bone
        const select = document.createElement('select');
        select.style.cssText = `
            flex: 1;
            padding: 4px 8px;
            border: 1px solid var(--ae-border, #444);
            border-radius: 4px;
            background: var(--ae-surface, #252525);
            color: var(--ae-text, #fff);
            font-size: 11px;
        `;

        // Add empty option
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = '-- Not Mapped --';
        select.appendChild(emptyOpt);

        // Add source bones
        for (const boneName of this.importResult.boneNames) {
            const opt = document.createElement('option');
            opt.value = boneName;
            opt.textContent = boneName;
            if (boneName === mappedTo) {
                opt.selected = true;
            }
            select.appendChild(opt);
        }

        select.onchange = () => {
            if (select.value) {
                this.boneMapping[humanoidBone] = select.value;
            } else {
                delete this.boneMapping[humanoidBone];
            }
            this._buildBoneMappingUI(); // Refresh to update status
            this._updateImportButtonState();
        };

        row.appendChild(status);
        row.appendChild(label);
        row.appendChild(select);

        return row;
    }

    /**
     * Build clip selection UI
     * @private
     */
    _buildClipSelectionUI() {
        const body = this.clipSection.querySelector('.section-body');
        body.innerHTML = '';
        body.style.cssText = `
            max-height: 200px;
            overflow-y: auto;
        `;

        if (this.importResult.clipInfo.length === 0) {
            body.innerHTML = '<div style="color: var(--ae-text-muted, #666); font-size: 12px;">No animation clips found</div>';
            return;
        }

        // Select all / none
        const controls = document.createElement('div');
        controls.style.cssText = `
            margin-bottom: 8px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--ae-border, #333);
        `;

        const selectAllBtn = document.createElement('button');
        selectAllBtn.textContent = 'Select All';
        selectAllBtn.style.cssText = `
            padding: 4px 10px;
            margin-right: 8px;
            border: 1px solid var(--ae-border, #444);
            border-radius: 4px;
            background: transparent;
            color: var(--ae-text, #fff);
            cursor: pointer;
            font-size: 11px;
        `;
        selectAllBtn.onclick = () => {
            this.importResult.clipInfo.forEach(info => this.selectedClips.add(info.name));
            this._buildClipSelectionUI();
            this._updateImportButtonState();
        };

        const selectNoneBtn = document.createElement('button');
        selectNoneBtn.textContent = 'Select None';
        selectNoneBtn.style.cssText = selectAllBtn.style.cssText;
        selectNoneBtn.onclick = () => {
            this.selectedClips.clear();
            this._buildClipSelectionUI();
            this._updateImportButtonState();
        };

        controls.appendChild(selectAllBtn);
        controls.appendChild(selectNoneBtn);
        body.appendChild(controls);

        // Clip list
        for (const info of this.importResult.clipInfo) {
            const row = document.createElement('div');
            row.style.cssText = `
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 6px 4px;
                border-radius: 4px;
                cursor: pointer;
            `;
            row.onmouseover = () => row.style.background = 'rgba(255,255,255,0.05)';
            row.onmouseout = () => row.style.background = 'transparent';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = this.selectedClips.has(info.name);
            checkbox.onchange = () => {
                if (checkbox.checked) {
                    this.selectedClips.add(info.name);
                } else {
                    this.selectedClips.delete(info.name);
                }
                this._updateImportButtonState();
            };

            const name = document.createElement('span');
            name.textContent = info.name;
            name.style.cssText = `
                flex: 1;
                font-size: 12px;
                color: var(--ae-text, #fff);
            `;

            const duration = document.createElement('span');
            duration.textContent = `${info.duration.toFixed(2)}s`;
            duration.style.cssText = `
                font-size: 11px;
                color: var(--ae-text-muted, #666);
            `;

            row.onclick = (e) => {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.onchange();
                }
            };

            row.appendChild(checkbox);
            row.appendChild(name);
            row.appendChild(duration);
            body.appendChild(row);
        }

        // Auto-select first clip by default
        if (this.selectedClips.size === 0 && this.importResult.clipInfo.length > 0) {
            this.selectedClips.add(this.importResult.clipInfo[0].name);
            this._buildClipSelectionUI();
        }
    }

    /**
     * Auto-map target skeleton from selected entity
     * @private
     */
    _autoMapTargetSkeleton() {
        if (!this.editor.selectedEntity) {
            console.warn('[ImportDialog] No entity selected for target mapping');
            return;
        }

        // Get the mesh to traverse - could be selectedEntity itself or selectedEntity.mesh
        const meshToTraverse = this.editor.selectedEntity.mesh || this.editor.selectedEntity;

        if (!meshToTraverse || typeof meshToTraverse.traverse !== 'function') {
            console.warn('[ImportDialog] Selected entity has no traversable mesh');
            return;
        }

        // Find skeleton in selected entity
        let skeleton = null;
        meshToTraverse.traverse(child => {
            if (child.isSkinnedMesh && child.skeleton && !skeleton) {
                skeleton = child.skeleton;
            }
        });

        if (skeleton) {
            this.targetMapping = HumanoidMapper.autoMap(skeleton.bones);
            console.log('[ImportDialog] Auto-mapped target skeleton:', Object.keys(this.targetMapping).length, 'bones');
        }
    }

    /**
     * Update import button state
     * @private
     */
    _updateImportButtonState() {
        const hasClips = this.selectedClips.size > 0;
        const hasMapping = Object.keys(this.boneMapping).length > 0;
        const hasTarget = Object.keys(this.targetMapping).length > 0 || this.editor.selectedEntity;

        const canImport = hasClips && hasMapping;

        this.importBtn.disabled = !canImport;
        this.importBtn.style.opacity = canImport ? '1' : '0.5';
        this.importBtn.textContent = `Import ${this.selectedClips.size} Clip${this.selectedClips.size !== 1 ? 's' : ''}`;
    }

    /**
     * Perform the import
     * @private
     */
    async _performImport() {
        if (!this.importResult || this.selectedClips.size === 0) return;

        // Show loading
        this.importBtn.textContent = 'Importing...';
        this.importBtn.disabled = true;

        try {
            // Get selected clips
            const clipsToImport = this.importResult.clips.filter(
                clip => this.selectedClips.has(clip.name)
            );

            let importedClips = [];

            // Check if we need retargeting
            if (Object.keys(this.targetMapping).length > 0 && this.importResult.skeleton) {
                // Get target skeleton - check for mesh property first
                let targetSkeleton = null;
                if (this.editor.selectedEntity) {
                    const meshToTraverse = this.editor.selectedEntity.mesh || this.editor.selectedEntity;
                    if (meshToTraverse && typeof meshToTraverse.traverse === 'function') {
                        meshToTraverse.traverse(child => {
                            if (child.isSkinnedMesh && child.skeleton && !targetSkeleton) {
                                targetSkeleton = child.skeleton;
                            }
                        });
                    }
                }

                if (targetSkeleton) {
                    // Create retargeter
                    const retargeter = new Retargeter(
                        this.importResult.skeleton,
                        targetSkeleton,
                        this.boneMapping
                    );
                    retargeter.setTargetMapping(this.targetMapping);
                    retargeter.removeRootMotion = this.options.removeRootMotion;
                    retargeter.calibrate();

                    // Retarget clips
                    importedClips = retargeter.retargetClips(
                        clipsToImport,
                        this.options.prefix
                    );
                } else {
                    // No target skeleton, use clips directly
                    importedClips = clipsToImport;
                }
            } else {
                // No retargeting needed
                importedClips = clipsToImport;
            }

            // Add suffix if specified
            if (this.options.suffix) {
                importedClips = importedClips.map(clip => {
                    clip.name = clip.name + this.options.suffix;
                    return clip;
                });
            }

            // Convert to native format and save
            for (const clip of importedClips) {
                const nativeData = ClipConverter.toNativeFormat(clip, {
                    fps: this.options.fps
                });

                // Download as file
                ClipConverter.downloadAsFile(nativeData);

                console.log(`[ImportDialog] Exported: ${nativeData.name}`);
            }

            // Success message
            alert(`Successfully imported ${importedClips.length} animation(s)!\nFiles have been downloaded.`);

            // Close dialog
            this.hide();

        } catch (error) {
            console.error('[ImportDialog] Import failed:', error);
            this._showError(error.message);
        }
    }

    /**
     * Show error message
     * @private
     */
    _showError(message) {
        this.dropZone.style.display = 'block';
        this.detailsPanel.style.display = 'none';

        this.dropZone.innerHTML = `
            <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
            <div style="font-size: 16px; color: #f44336; margin-bottom: 8px;">
                Import Failed
            </div>
            <div style="font-size: 13px; color: var(--ae-text-secondary, #888);">
                ${message}
            </div>
            <div style="margin-top: 16px;">
                <button onclick="this.parentElement.parentElement.innerHTML = \`
                    <div style='font-size: 48px; margin-bottom: 16px;'>📁</div>
                    <div style='font-size: 16px; color: var(--ae-text, #fff); margin-bottom: 8px;'>
                        Drop animation file here
                    </div>
                    <div style='font-size: 13px; color: var(--ae-text-secondary, #888);'>
                        Supports: GLB, GLTF, FBX, BVH
                    </div>
                    <input type='file' accept='.glb,.gltf,.fbx,.bvh' style='display: none;'>
                \`" style="
                    padding: 8px 16px;
                    border: 1px solid var(--ae-border, #444);
                    border-radius: 4px;
                    background: transparent;
                    color: var(--ae-text, #fff);
                    cursor: pointer;
                ">Try Again</button>
            </div>
        `;
    }

    /**
     * Dispose of resources
     */
    dispose() {
        if (this.overlay && this.overlay.parentElement) {
            this.overlay.parentElement.removeChild(this.overlay);
        }

        if (this.skeletonViewer) {
            this.skeletonViewer.dispose();
        }

        // Clean up 3D scene manager
        if (this.sceneManager) {
            this.sceneManager.dispose();
            this.sceneManager = null;
        }
    }

    // =========================================
    // Phase 6: 3D Preview Methods
    // =========================================

    /**
     * Initialize the 3D preview scene
     * @private
     */
    _initializePreview() {
        // Create scene manager if not exists
        if (!this.sceneManager) {
            this.sceneManager = new DialogSceneManager();
            this.sceneManager.initialize(this.previewContainer);

            // Set up time update callback
            this.sceneManager.onTimeUpdate = (time, duration) => {
                this._updateTimeDisplay(time, duration);
            };
        }

        // Show source skeleton/mesh in preview
        if (this.importResult.scene) {
            this.sceneManager.showSourceSkeleton(
                this.importResult.skeleton,
                this.importResult.scene
            );
        } else if (this.importResult.skeleton) {
            this.sceneManager.showSourceSkeleton(this.importResult.skeleton);
        }

        // Show target mesh if entity is selected
        if (this.editor.selectedEntity) {
            const mesh = this.editor.selectedEntity.mesh || this.editor.selectedEntity;
            this.sceneManager.showTargetMesh(mesh);
        }

        // Update scrubber max value based on first clip
        if (this.importResult.clips && this.importResult.clips.length > 0) {
            const clip = this.importResult.clips[0];
            this.scrubber.max = Math.floor(clip.duration * 100);
            this._updateTimeDisplay(0, clip.duration);
        }

        // Start rendering
        this.sceneManager.start();
        this.previewActive = true;
    }

    /**
     * Toggle playback
     * @private
     */
    _togglePlayback() {
        if (!this.sceneManager || !this.importResult.clips || this.importResult.clips.length === 0) {
            return;
        }

        if (this.sceneManager.isPlaying) {
            this.sceneManager.setPaused(true);
            this.playBtn.innerHTML = '▶';
        } else {
            // Get selected clip or first clip
            const selectedClips = Array.from(this.selectedClips);
            const clipIndex = selectedClips.length > 0
                ? this.importResult.clipInfo.findIndex(c => this.selectedClips.has(c.name))
                : 0;
            const clip = this.importResult.clips[Math.max(0, clipIndex)];

            if (!this.sceneManager.currentAction) {
                this.sceneManager.startPlayback(clip);
            } else {
                this.sceneManager.setPaused(false);
            }
            this.playBtn.innerHTML = '⏸';
        }
    }

    /**
     * Stop playback
     * @private
     */
    _stopPreviewPlayback() {
        if (!this.sceneManager) return;

        this.sceneManager.stopPlayback();
        this.playBtn.innerHTML = '▶';
        this.scrubber.value = '0';
        this._updateTimeDisplay(0, this.sceneManager.getDuration() || 0);
    }

    /**
     * Handle scrubber input
     * @private
     */
    _onScrub() {
        if (!this.sceneManager || !this.importResult.clips || this.importResult.clips.length === 0) {
            return;
        }

        // Get clip
        const clip = this.importResult.clips[0];
        const time = (parseFloat(this.scrubber.value) / 100) * clip.duration;

        // Update pose
        this.sceneManager.updatePose(clip, time);
        this._updateTimeDisplay(time, clip.duration);
    }

    /**
     * Toggle split view
     * @private
     */
    _toggleSplitView() {
        if (!this.sceneManager) return;

        this.splitViewEnabled = !this.splitViewEnabled;
        this.sceneManager.setSplitView(this.splitViewEnabled);

        // Update button style
        this.splitViewBtn.style.background = this.splitViewEnabled
            ? 'var(--ae-accent, #4a9eff)'
            : 'var(--ae-surface, #252525)';
        this.splitViewBtn.style.color = this.splitViewEnabled ? 'white' : 'var(--ae-text, #fff)';
    }

    /**
     * Update time display
     * @private
     */
    _updateTimeDisplay(current, total) {
        if (!this.timeDisplay) return;

        const formatTime = (t) => t.toFixed(2);
        this.timeDisplay.textContent = `${formatTime(current)} / ${formatTime(total)}`;

        // Update scrubber position if playing
        if (total > 0 && this.sceneManager && this.sceneManager.isPlaying) {
            this.scrubber.value = Math.floor((current / total) * 100);
        }
    }

    /**
     * Stop preview when dialog is hidden
     * @private
     */
    _cleanupPreview() {
        if (this.sceneManager) {
            this.sceneManager.stopPlayback();
            this.sceneManager.stop();
        }
        this.previewActive = false;
    }
}

export default ImportDialog;
