/**
 * GraphEditor.js
 * Phase 2: Visual State Machine Graph Editor
 * 
 * Canvas-based node graph for FSM visualization with pan/zoom controls.
 */

import { StateNode, STATE_COLORS } from './StateNode.js';
import { TransitionEdge } from './TransitionEdge.js';

/**
 * GraphEditor - Main canvas controller for state machine visualization
 */
export class GraphEditor {
    constructor(uiManager, animatorEditor) {
        this.uiManager = uiManager;
        this.editor = animatorEditor;

        // DOM Elements
        this.container = null;
        this.canvas = null;
        this.ctx = null;

        // Graph state
        this.nodes = new Map(); // state name -> StateNode
        this.edges = []; // TransitionEdge[]

        // View transformation
        this.viewOffset = { x: 0, y: 0 };
        this.viewScale = 1;
        this.minScale = 0.25;
        this.maxScale = 2.0;

        // Grid settings
        this.gridSize = 20;
        this.gridColor = 'rgba(255, 255, 255, 0.05)';
        this.gridMajorColor = 'rgba(255, 255, 255, 0.1)';
        this.gridMajorInterval = 5;

        // Interaction state
        this.isDragging = false;
        this.isPanning = false;
        this.dragStart = { x: 0, y: 0 };
        this.selectedNode = null;
        this.selectedEdge = null;
        this.hoveredNode = null;
        this.hoveredEdge = null;

        // Active state tracking
        this.activeStateName = null;
        this.transitionProgress = 0;

        // Animation
        this.animationFrame = null;
        this._lastTime = 0;

        // Bind event handlers
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
        this._onWheel = this._onWheel.bind(this);
        this._onContextMenu = this._onContextMenu.bind(this);
        this._onResize = this._onResize.bind(this);

        // DPR for canvas scaling
        this.dpr = 1;

        console.log('[GraphEditor] Initialized');
    }

    /**
     * Build the graph editor panel
     * @returns {HTMLElement}
     */
    build() {
        // Create graph panel container
        this.container = document.createElement('div');
        this.container.id = 'animator-graph-editor';
        this.container.className = 'animator-panel';
        this.container.style.cssText = `
            position: absolute;
            top: 50px;
            left: 320px;
            right: 0;
            bottom: 250px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;

        // Create header
        const header = this.uiManager.createPanelHeader('State Machine Graph', {
            closeable: false
        });
        this.container.appendChild(header);

        // Add header controls
        const controls = document.createElement('div');
        controls.style.cssText = 'display: flex; gap: 8px; align-items: center;';
        controls.innerHTML = `
            <button class="animator-tool-btn" id="graph-fit-btn" title="Fit View">⊞</button>
            <button class="animator-tool-btn" id="graph-zoom-in" title="Zoom In">+</button>
            <button class="animator-tool-btn" id="graph-zoom-out" title="Zoom Out">−</button>
            <span class="animator-status" id="graph-zoom-level">100%</span>
        `;
        header.appendChild(controls);

        // Create canvas wrapper
        const canvasWrapper = document.createElement('div');
        canvasWrapper.style.cssText = `
            flex: 1;
            position: relative;
            overflow: hidden;
            background: #1a1a1f;
        `;
        this.container.appendChild(canvasWrapper);

        // Create canvas
        this.canvas = document.createElement('canvas');
        this.canvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            cursor: grab;
        `;
        canvasWrapper.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');

        // Create info overlay
        const infoOverlay = document.createElement('div');
        infoOverlay.id = 'graph-info-overlay';
        infoOverlay.style.cssText = `
            position: absolute;
            bottom: 10px;
            left: 10px;
            padding: 8px 12px;
            background: rgba(0, 0, 0, 0.7);
            border-radius: 4px;
            font-size: 11px;
            color: var(--anim-text-secondary);
            pointer-events: none;
        `;
        infoOverlay.innerHTML = 'Scroll to zoom • Middle-click to pan • Click to select';
        canvasWrapper.appendChild(infoOverlay);

        // Active state indicator
        const stateIndicator = document.createElement('div');
        stateIndicator.id = 'graph-active-state';
        stateIndicator.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            padding: 8px 15px;
            background: rgba(39, 174, 96, 0.2);
            border: 1px solid var(--anim-success);
            border-radius: 4px;
            font-size: 12px;
            color: var(--anim-success);
        `;
        stateIndicator.innerHTML = '<span style="opacity: 0.7;">Active:</span> <strong id="graph-state-name">None</strong>';
        canvasWrapper.appendChild(stateIndicator);

        // Setup event listeners
        this._setupEventListeners();

        return this.container;
    }

    /**
     * Setup event listeners
     * @private
     */
    _setupEventListeners() {
        this.canvas.addEventListener('mousedown', this._onMouseDown);
        this.canvas.addEventListener('mousemove', this._onMouseMove);
        this.canvas.addEventListener('mouseup', this._onMouseUp);
        this.canvas.addEventListener('mouseleave', this._onMouseUp);
        this.canvas.addEventListener('wheel', this._onWheel, { passive: false });
        this.canvas.addEventListener('contextmenu', this._onContextMenu);

        window.addEventListener('resize', this._onResize);

        // Button controls
        setTimeout(() => {
            const fitBtn = document.getElementById('graph-fit-btn');
            const zoomInBtn = document.getElementById('graph-zoom-in');
            const zoomOutBtn = document.getElementById('graph-zoom-out');

            if (fitBtn) fitBtn.onclick = () => this.fitView();
            if (zoomInBtn) zoomInBtn.onclick = () => this.zoom(1.2);
            if (zoomOutBtn) zoomOutBtn.onclick = () => this.zoom(0.8);
        }, 0);
    }

    /**
     * Show the graph editor
     */
    show() {
        if (this.container) {
            this.container.style.display = 'flex';
            this._resizeCanvas();
            this._startAnimation();
        }
    }

    /**
     * Hide the graph editor
     */
    hide() {
        if (this.container) {
            this.container.style.display = 'none';
            this._stopAnimation();
        }
    }

    /**
     * Start render loop
     * @private
     */
    _startAnimation() {
        const animate = (time) => {
            const dt = (time - this._lastTime) / 1000;
            this._lastTime = time;

            this._update(dt);
            this._render();

            this.animationFrame = requestAnimationFrame(animate);
        };

        this._lastTime = performance.now();
        this.animationFrame = requestAnimationFrame(animate);
    }

    /**
     * Stop render loop
     * @private
     */
    _stopAnimation() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }

    /**
     * Update graph state
     * @private
     */
    _update(dt) {
        // Update active state from selected entity
        if (this.editor.selectedEntity && this.editor.selectedEntity.animator) {
            const fsm = this.editor.selectedEntity.animator.fsm;
            if (fsm && fsm.currentState) {
                const newState = fsm.currentState.name;
                if (this.activeStateName !== newState) {
                    this.activeStateName = newState;
                    this._updateActiveStateIndicator();
                }
            }
        }

        // Animate node pulses
        for (const node of this.nodes.values()) {
            node.update(dt, this.activeStateName === node.name);
        }
    }

    /**
     * Update the active state indicator UI
     * @private
     */
    _updateActiveStateIndicator() {
        const el = document.getElementById('graph-state-name');
        if (el) {
            el.textContent = this.activeStateName || 'None';
        }
    }

    /**
     * Render the graph
     * @private
     */
    _render() {
        if (!this.ctx || !this.canvas) return;

        const ctx = this.ctx;
        // Use CSS dimensions (not pixel dimensions) for coordinate calculations
        const w = this.canvas.width / this.dpr;
        const h = this.canvas.height / this.dpr;

        // Clear (need to account for DPR scale)
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
        ctx.scale(this.dpr, this.dpr);

        ctx.fillStyle = '#1a1a1f';
        ctx.fillRect(0, 0, w, h);

        // Apply view transform
        ctx.translate(w / 2 + this.viewOffset.x, h / 2 + this.viewOffset.y);
        ctx.scale(this.viewScale, this.viewScale);

        // Draw grid
        this._drawGrid();

        // Draw edges first (behind nodes)
        for (const edge of this.edges) {
            const isSelected = this.selectedEdge === edge;
            const isHovered = this.hoveredEdge === edge;
            edge.render(ctx, this.activeStateName, isHovered, isSelected);
        }

        // Draw nodes
        for (const node of this.nodes.values()) {
            const isActive = this.activeStateName === node.name;
            const isSelected = this.selectedNode === node;
            const isHovered = this.hoveredNode === node;
            node.render(ctx, isActive, isSelected, isHovered);
        }

        ctx.restore();
    }

    /**
     * Draw the background grid
     * @private
     */
    _drawGrid() {
        const ctx = this.ctx;
        // Use CSS dimensions for grid calculations
        const w = (this.canvas.width / this.dpr) / this.viewScale;
        const h = (this.canvas.height / this.dpr) / this.viewScale;
        const halfW = w / 2;
        const halfH = h / 2;

        // Calculate visible grid range accounting for view offset
        const offsetX = this.viewOffset.x / this.viewScale;
        const offsetY = this.viewOffset.y / this.viewScale;

        const startX = Math.floor((-halfW - offsetX) / this.gridSize) * this.gridSize;
        const endX = Math.ceil((halfW - offsetX) / this.gridSize) * this.gridSize;
        const startY = Math.floor((-halfH - offsetY) / this.gridSize) * this.gridSize;
        const endY = Math.ceil((halfH - offsetY) / this.gridSize) * this.gridSize;

        ctx.lineWidth = 1 / this.viewScale;

        // Draw grid lines
        for (let x = startX; x <= endX; x += this.gridSize) {
            const isMajor = Math.abs(x / this.gridSize) % this.gridMajorInterval === 0;
            ctx.strokeStyle = isMajor ? this.gridMajorColor : this.gridColor;
            ctx.beginPath();
            ctx.moveTo(x, startY);
            ctx.lineTo(x, endY);
            ctx.stroke();
        }

        for (let y = startY; y <= endY; y += this.gridSize) {
            const isMajor = Math.abs(y / this.gridSize) % this.gridMajorInterval === 0;
            ctx.strokeStyle = isMajor ? this.gridMajorColor : this.gridColor;
            ctx.beginPath();
            ctx.moveTo(startX, y);
            ctx.lineTo(endX, y);
            ctx.stroke();
        }

        // Draw origin crosshair
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2 / this.viewScale;
        ctx.beginPath();
        ctx.moveTo(-20, 0);
        ctx.lineTo(20, 0);
        ctx.moveTo(0, -20);
        ctx.lineTo(0, 20);
        ctx.stroke();
    }

    /**
     * Load state machine data from entity
     * @param {Object} animator - AnimationController instance
     */
    loadFromAnimator(animator) {
        this.nodes.clear();
        this.edges = [];
        this.activeStateName = null;

        // Check if we have a valid FSM with states
        const hasFSM = animator && animator.fsm && animator.fsm.states && animator.fsm.states.size > 0;

        if (!hasFSM) {
            console.log('[GraphEditor] No FSM found - showing placeholder');

            // Create a placeholder node indicating no FSM
            const placeholderNode = new StateNode('No State Machine', { x: 0, y: 0 }, 'normal');
            placeholderNode.width = 180;
            this.nodes.set('placeholder', placeholderNode);

            // Update indicator
            this._updateActiveStateIndicator();
            this.fitView();
            return;
        }

        const fsm = animator.fsm;
        const stateNames = Array.from(fsm.states.keys());

        console.log(`[GraphEditor] Loading FSM with ${stateNames.length} states:`, stateNames);

        // Calculate initial positions in a circle
        const radius = 150;
        const angleStep = (2 * Math.PI) / Math.max(stateNames.length, 1);

        stateNames.forEach((name, index) => {
            const state = fsm.states.get(name);
            const angle = index * angleStep - Math.PI / 2; // Start from top

            // Determine node type
            let nodeType = 'normal';
            if (name === 'Idle') nodeType = 'entry';
            else if (name === 'Any') nodeType = 'any';

            const node = new StateNode(name, {
                x: Math.cos(angle) * radius,
                y: Math.sin(angle) * radius
            }, nodeType);

            this.nodes.set(name, node);
        });

        // Create edges based on state transitions
        this._inferTransitions(fsm);

        console.log(`[GraphEditor] Loaded ${this.nodes.size} states, ${this.edges.length} transitions`);

        // Update active state
        if (fsm.currentState) {
            this.activeStateName = fsm.currentState.name;
        }
        this._updateActiveStateIndicator();

        // Fit view to content
        this.fitView();
    }

    /**
     * Load keyframes as timeline nodes (for Pose Mode)
     * @param {Array} keyframes - Array of captured poses
     * @param {number} currentFrame - Currently selected frame
     */
    loadKeyframes(keyframes, currentFrame = 0) {
        this.nodes.clear();
        this.edges = [];
        this.activeStateName = null;

        if (!keyframes || keyframes.length === 0) {
            // Show start node for new animation
            const startNode = new StateNode('Start', { x: 0, y: 0 }, 'entry');
            startNode.width = 100;
            this.nodes.set('start', startNode);

            this._updateActiveStateIndicator();
            this.fitView();
            return;
        }

        // Create nodes for each keyframe in a horizontal timeline layout
        const spacing = 180;
        const startX = -((keyframes.length - 1) * spacing) / 2;

        keyframes.forEach((pose, index) => {
            const isActive = index === currentFrame;
            const nodeType = index === 0 ? 'entry' : 'normal';

            const node = new StateNode(`Frame ${index}`, {
                x: startX + index * spacing,
                y: 0
            }, nodeType);

            node.width = 100;
            this.nodes.set(`frame_${index}`, node);

            // Create edge to next frame
            if (index < keyframes.length - 1) {
                // Will add edge after all nodes are created
            }
        });

        // Create edges between consecutive frames
        for (let i = 0; i < keyframes.length - 1; i++) {
            const fromNode = this.nodes.get(`frame_${i}`);
            const toNode = this.nodes.get(`frame_${i + 1}`);
            if (fromNode && toNode) {
                const edge = new TransitionEdge(fromNode, toNode, {
                    condition: `${i} → ${i + 1}`
                });
                this.edges.push(edge);
            }
        }

        // Set active frame
        this.activeStateName = `Frame ${currentFrame}`;
        this._updateActiveStateIndicator();

        console.log(`[GraphEditor] Loaded ${keyframes.length} keyframes as timeline`);
        this.fitView();
    }

    /**
     * Infer transitions from FSM state code
     * @private
     */
    _inferTransitions(fsm) {
        // Common transition patterns based on state names
        const transitionMap = {
            'Idle': ['Move', 'Air'],
            'Move': ['Idle', 'Air'],
            'Air': ['Idle', 'Move']
        };

        // Create edges for known transitions
        for (const [fromName, toNames] of Object.entries(transitionMap)) {
            const fromNode = this.nodes.get(fromName);
            if (!fromNode) continue;

            for (const toName of toNames) {
                const toNode = this.nodes.get(toName);
                if (!toNode) continue;

                // Determine condition text based on transition
                let condition = '';
                if (fromName === 'Idle' && toName === 'Move') {
                    condition = 'speed > 0.1';
                } else if (fromName === 'Move' && toName === 'Idle') {
                    condition = 'speed <= 0.1';
                } else if (toName === 'Air') {
                    condition = '!isGrounded';
                } else if (fromName === 'Air') {
                    condition = 'isGrounded';
                }

                const edge = new TransitionEdge(fromNode, toNode, {
                    condition: condition
                });
                this.edges.push(edge);
            }
        }
    }

    /**
     * Convert screen coordinates to graph coordinates
     * @private
     */
    _screenToGraph(screenX, screenY) {
        const rect = this.canvas.getBoundingClientRect();
        // Convert from screen to CSS coordinates
        const canvasX = screenX - rect.left;
        const canvasY = screenY - rect.top;

        // Convert from CSS to graph coordinates
        const cssWidth = rect.width;
        const cssHeight = rect.height;

        return {
            x: (canvasX - cssWidth / 2 - this.viewOffset.x) / this.viewScale,
            y: (canvasY - cssHeight / 2 - this.viewOffset.y) / this.viewScale
        };
    }

    /**
     * Find node at position
     * @private
     */
    _findNodeAt(graphX, graphY) {
        for (const node of this.nodes.values()) {
            if (node.containsPoint(graphX, graphY)) {
                return node;
            }
        }
        return null;
    }

    /**
     * Find edge at position
     * @private
     */
    _findEdgeAt(graphX, graphY) {
        for (const edge of this.edges) {
            if (edge.containsPoint(graphX, graphY)) {
                return edge;
            }
        }
        return null;
    }

    /**
     * Handle mouse down
     * @private
     */
    _onMouseDown(event) {
        const graphPos = this._screenToGraph(event.clientX, event.clientY);

        // Middle mouse or right mouse for panning
        if (event.button === 1 || event.button === 2) {
            this.isPanning = true;
            this.dragStart = { x: event.clientX, y: event.clientY };
            this.canvas.style.cursor = 'grabbing';
            event.preventDefault();
            return;
        }

        // Left click
        if (event.button === 0) {
            const node = this._findNodeAt(graphPos.x, graphPos.y);

            if (node) {
                this.selectedNode = node;
                this.selectedEdge = null;
                this.isDragging = true;
                this.dragStart = { x: graphPos.x - node.x, y: graphPos.y - node.y };
                this.canvas.style.cursor = 'move';

                // Hide transition inspector when node selected
                if (this.editor.transitionInspector) {
                    this.editor.transitionInspector.hide();
                }
            } else {
                // Check if clicking on an edge
                const edge = this._findEdgeAt(graphPos.x, graphPos.y);

                if (edge) {
                    this.selectedNode = null;
                    this.selectedEdge = edge;

                    // Show transition inspector for this edge
                    if (this.editor.transitionInspector) {
                        this.editor.transitionInspector.show(edge);
                    }
                } else {
                    this.selectedNode = null;
                    this.selectedEdge = null;

                    // Hide transition inspector
                    if (this.editor.transitionInspector) {
                        this.editor.transitionInspector.hide();
                    }

                    // Start panning with left click on empty space
                    this.isPanning = true;
                    this.dragStart = { x: event.clientX, y: event.clientY };
                    this.canvas.style.cursor = 'grabbing';
                }
            }
        }
    }

    /**
     * Handle mouse move
     * @private
     */
    _onMouseMove(event) {
        const graphPos = this._screenToGraph(event.clientX, event.clientY);

        if (this.isPanning) {
            const dx = event.clientX - this.dragStart.x;
            const dy = event.clientY - this.dragStart.y;
            this.viewOffset.x += dx;
            this.viewOffset.y += dy;
            this.dragStart = { x: event.clientX, y: event.clientY };
            return;
        }

        if (this.isDragging && this.selectedNode) {
            this.selectedNode.x = graphPos.x - this.dragStart.x;
            this.selectedNode.y = graphPos.y - this.dragStart.y;

            // Snap to grid if close enough
            const snapThreshold = this.gridSize / 2;
            const snappedX = Math.round(this.selectedNode.x / this.gridSize) * this.gridSize;
            const snappedY = Math.round(this.selectedNode.y / this.gridSize) * this.gridSize;

            if (Math.abs(this.selectedNode.x - snappedX) < snapThreshold) {
                this.selectedNode.x = snappedX;
            }
            if (Math.abs(this.selectedNode.y - snappedY) < snapThreshold) {
                this.selectedNode.y = snappedY;
            }
            return;
        }

        // Hover detection
        const node = this._findNodeAt(graphPos.x, graphPos.y);
        this.hoveredNode = node;

        if (!node) {
            const edge = this._findEdgeAt(graphPos.x, graphPos.y);
            this.hoveredEdge = edge;
        } else {
            this.hoveredEdge = null;
        }

        // Update cursor
        if (this.hoveredNode) {
            this.canvas.style.cursor = 'pointer';
        } else {
            this.canvas.style.cursor = 'grab';
        }
    }

    /**
     * Handle mouse up
     * @private
     */
    _onMouseUp(event) {
        this.isDragging = false;
        this.isPanning = false;
        this.canvas.style.cursor = this.hoveredNode ? 'pointer' : 'grab';
    }

    /**
     * Handle mouse wheel for zooming
     * @private
     */
    _onWheel(event) {
        event.preventDefault();

        const delta = event.deltaY > 0 ? 0.9 : 1.1;
        this.zoom(delta, event.clientX, event.clientY);
    }

    /**
     * Handle context menu (prevent default)
     * @private
     */
    _onContextMenu(event) {
        event.preventDefault();
    }

    /**
     * Handle window resize
     * @private
     */
    _onResize() {
        this._resizeCanvas();
    }

    /**
     * Resize canvas to match container
     * @private
     */
    _resizeCanvas() {
        if (!this.canvas || !this.container) return;

        const wrapper = this.canvas.parentElement;
        if (!wrapper) return;

        const rect = wrapper.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        // Set actual pixel size (for crisp rendering)
        this.dpr = window.devicePixelRatio || 1;
        this.canvas.width = rect.width * this.dpr;
        this.canvas.height = rect.height * this.dpr;

        // Don't scale context here - we do it in render
        this._render();
    }

    /**
     * Zoom the view
     * @param {number} factor - Zoom multiplier
     * @param {number} [pivotX] - Screen X to zoom towards
     * @param {number} [pivotY] - Screen Y to zoom towards
     */
    zoom(factor, pivotX, pivotY) {
        const oldScale = this.viewScale;
        this.viewScale = Math.max(this.minScale, Math.min(this.maxScale, this.viewScale * factor));

        // Zoom towards mouse position
        if (pivotX !== undefined && pivotY !== undefined) {
            const rect = this.canvas.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            const dx = pivotX - centerX;
            const dy = pivotY - centerY;

            const scaleChange = this.viewScale / oldScale;
            this.viewOffset.x = this.viewOffset.x * scaleChange + dx * (1 - scaleChange);
            this.viewOffset.y = this.viewOffset.y * scaleChange + dy * (1 - scaleChange);
        }

        // Update zoom level display
        const el = document.getElementById('graph-zoom-level');
        if (el) {
            el.textContent = Math.round(this.viewScale * 100) + '%';
        }
    }

    /**
     * Fit view to show all nodes
     */
    fitView() {
        if (this.nodes.size === 0) {
            this.viewOffset = { x: 0, y: 0 };
            this.viewScale = 1;
            return;
        }

        // Calculate bounds
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        for (const node of this.nodes.values()) {
            minX = Math.min(minX, node.x - node.width / 2);
            maxX = Math.max(maxX, node.x + node.width / 2);
            minY = Math.min(minY, node.y - node.height / 2);
            maxY = Math.max(maxY, node.y + node.height / 2);
        }

        const padding = 50;
        const contentWidth = maxX - minX + padding * 2;
        const contentHeight = maxY - minY + padding * 2;

        const canvasWidth = this.canvas.width / (window.devicePixelRatio || 1);
        const canvasHeight = this.canvas.height / (window.devicePixelRatio || 1);

        // Calculate scale to fit
        const scaleX = canvasWidth / contentWidth;
        const scaleY = canvasHeight / contentHeight;
        this.viewScale = Math.min(scaleX, scaleY, 1.5);
        this.viewScale = Math.max(this.minScale, Math.min(this.maxScale, this.viewScale));

        // Center the view
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        this.viewOffset = {
            x: -centerX * this.viewScale,
            y: -centerY * this.viewScale
        };

        // Update zoom display
        const el = document.getElementById('graph-zoom-level');
        if (el) {
            el.textContent = Math.round(this.viewScale * 100) + '%';
        }
    }

    /**
     * Cleanup
     */
    dispose() {
        this._stopAnimation();

        if (this.canvas) {
            this.canvas.removeEventListener('mousedown', this._onMouseDown);
            this.canvas.removeEventListener('mousemove', this._onMouseMove);
            this.canvas.removeEventListener('mouseup', this._onMouseUp);
            this.canvas.removeEventListener('mouseleave', this._onMouseUp);
            this.canvas.removeEventListener('wheel', this._onWheel);
            this.canvas.removeEventListener('contextmenu', this._onContextMenu);
        }

        window.removeEventListener('resize', this._onResize);

        if (this.container) {
            this.container.remove();
        }

        this.nodes.clear();
        this.edges = [];
    }
}

export default GraphEditor;
