/**
 * StateNode.js
 * Phase 2: Visual State Machine Graph Editor
 * 
 * Visual representation of an FSM state as a draggable node.
 */

/**
 * Color palette for different state types
 */
export const STATE_COLORS = {
    entry: {
        fill: '#27ae60',
        border: '#2ecc71',
        text: '#ffffff',
        glow: 'rgba(39, 174, 96, 0.5)'
    },
    normal: {
        fill: '#34495e',
        border: '#7f8c8d',
        text: '#ecf0f1',
        glow: 'rgba(52, 73, 94, 0.5)'
    },
    any: {
        fill: '#f39c12',
        border: '#f1c40f',
        text: '#2c3e50',
        glow: 'rgba(243, 156, 18, 0.5)'
    },
    exit: {
        fill: '#e74c3c',
        border: '#c0392b',
        text: '#ffffff',
        glow: 'rgba(231, 76, 60, 0.5)'
    },
    active: {
        border: '#3498db',
        glow: 'rgba(52, 152, 219, 0.8)'
    },
    selected: {
        border: '#9b59b6',
        glow: 'rgba(155, 89, 182, 0.8)'
    },
    hover: {
        border: '#ffffff',
        glow: 'rgba(255, 255, 255, 0.3)'
    }
};

/**
 * StateNode - Represents a single state in the FSM graph
 */
export class StateNode {
    /**
     * @param {string} name - State name
     * @param {Object} position - { x, y } position in graph space
     * @param {string} type - 'entry', 'normal', 'any', or 'exit'
     */
    constructor(name, position = { x: 0, y: 0 }, type = 'normal') {
        this.name = name;
        this.x = position.x;
        this.y = position.y;
        this.type = type;

        // Node dimensions
        this.width = 140;
        this.height = 50;
        this.cornerRadius = 8;

        // Connection ports
        this.inputPort = { x: 0, y: -this.height / 2 };  // Top center
        this.outputPort = { x: 0, y: this.height / 2 };   // Bottom center

        // Animation state
        this.pulsePhase = Math.random() * Math.PI * 2;
        this.pulseIntensity = 0;
        this.targetPulseIntensity = 0;

        // Metadata
        this.motion = null; // Associated animation clip name
        this.speed = 1.0;
        this.transitions = []; // Outgoing transition names
    }

    /**
     * Update animation state
     * @param {number} dt - Delta time
     * @param {boolean} isActive - Whether this is the active state
     */
    update(dt, isActive) {
        // Animate pulse for active state
        this.targetPulseIntensity = isActive ? 1 : 0;
        this.pulseIntensity += (this.targetPulseIntensity - this.pulseIntensity) * dt * 5;
        this.pulsePhase += dt * 3;
    }

    /**
     * Get the world position of the input port
     * @returns {Object} { x, y }
     */
    getInputPortPosition() {
        return {
            x: this.x + this.inputPort.x,
            y: this.y + this.inputPort.y
        };
    }

    /**
     * Get the world position of the output port
     * @returns {Object} { x, y }
     */
    getOutputPortPosition() {
        return {
            x: this.x + this.outputPort.x,
            y: this.y + this.outputPort.y
        };
    }

    /**
     * Check if a point is inside the node
     * @param {number} px - Point X
     * @param {number} py - Point Y
     * @returns {boolean}
     */
    containsPoint(px, py) {
        return (
            px >= this.x - this.width / 2 &&
            px <= this.x + this.width / 2 &&
            py >= this.y - this.height / 2 &&
            py <= this.y + this.height / 2
        );
    }

    /**
     * Render the node
     * @param {CanvasRenderingContext2D} ctx
     * @param {boolean} isActive - Currently active state
     * @param {boolean} isSelected - Currently selected
     * @param {boolean} isHovered - Currently hovered
     */
    render(ctx, isActive = false, isSelected = false, isHovered = false) {
        const colors = STATE_COLORS[this.type];
        const x = this.x - this.width / 2;
        const y = this.y - this.height / 2;

        ctx.save();

        // Draw glow for active/selected states
        if (isActive || isSelected || this.pulseIntensity > 0.01) {
            const glowColor = isSelected ? STATE_COLORS.selected.glow :
                isActive ? STATE_COLORS.active.glow : colors.glow;

            const pulseSize = isActive ? Math.sin(this.pulsePhase) * 3 + 5 : 5;
            const glowSize = 10 + pulseSize * this.pulseIntensity;

            ctx.shadowBlur = glowSize;
            ctx.shadowColor = glowColor;
        }

        // Draw node background
        ctx.fillStyle = colors.fill;
        ctx.beginPath();
        this._roundedRect(ctx, x, y, this.width, this.height, this.cornerRadius);
        ctx.fill();

        // Reset shadow for border
        ctx.shadowBlur = 0;

        // Draw border
        let borderColor = colors.border;
        let borderWidth = 2;

        if (isSelected) {
            borderColor = STATE_COLORS.selected.border;
            borderWidth = 3;
        } else if (isActive) {
            borderColor = STATE_COLORS.active.border;
            borderWidth = 3;
        } else if (isHovered) {
            borderColor = STATE_COLORS.hover.border;
            borderWidth = 2;
        }

        ctx.strokeStyle = borderColor;
        ctx.lineWidth = borderWidth;
        ctx.beginPath();
        this._roundedRect(ctx, x, y, this.width, this.height, this.cornerRadius);
        ctx.stroke();

        // Draw type indicator (small colored bar at top)
        if (this.type === 'entry') {
            ctx.fillStyle = colors.border;
            ctx.beginPath();
            this._roundedRect(ctx, x + 4, y + 4, this.width - 8, 4, 2);
            ctx.fill();
        }

        // Draw state name
        ctx.fillStyle = colors.text;
        ctx.font = 'bold 13px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.name, this.x, this.y);

        // Draw connection ports
        this._renderPort(ctx, this.getInputPortPosition(), isHovered);
        this._renderPort(ctx, this.getOutputPortPosition(), isHovered);

        // Draw active indicator (pulsing dot)
        if (isActive) {
            const indicatorX = x + this.width - 12;
            const indicatorY = y + 12;
            const pulseRadius = 4 + Math.sin(this.pulsePhase * 2) * 1.5;

            ctx.fillStyle = STATE_COLORS.active.border;
            ctx.beginPath();
            ctx.arc(indicatorX, indicatorY, pulseRadius, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    /**
     * Render a connection port
     * @private
     */
    _renderPort(ctx, position, isHovered) {
        const radius = isHovered ? 5 : 4;

        ctx.fillStyle = '#7f8c8d';
        ctx.strokeStyle = '#bdc3c7';
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    /**
     * Draw a rounded rectangle path
     * @private
     */
    _roundedRect(ctx, x, y, width, height, radius) {
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    /**
     * Serialize node data for saving
     * @returns {Object}
     */
    toJSON() {
        return {
            name: this.name,
            type: this.type,
            position: { x: this.x, y: this.y },
            motion: this.motion,
            speed: this.speed,
            transitions: this.transitions
        };
    }

    /**
     * Create a StateNode from serialized data
     * @param {Object} data
     * @returns {StateNode}
     */
    static fromJSON(data) {
        const node = new StateNode(data.name, data.position, data.type);
        node.motion = data.motion;
        node.speed = data.speed;
        node.transitions = data.transitions || [];
        return node;
    }
}

export default StateNode;
