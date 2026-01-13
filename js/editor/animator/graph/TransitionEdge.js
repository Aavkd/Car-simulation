/**
 * TransitionEdge.js
 * Phase 2: Visual State Machine Graph Editor
 * 
 * Curved Bezier lines representing transitions between states.
 */

export class TransitionEdge {
    constructor(fromNode, toNode, options = {}) {
        this.fromNode = fromNode;
        this.toNode = toNode;

        // Aliases for TransitionInspector compatibility
        this.source = fromNode;
        this.target = toNode;

        this.condition = options.condition || '';
        this.conditions = options.conditions || null; // Parsed conditions array
        this.duration = options.duration || 0.25;
        this.hasExitTime = options.hasExitTime ?? false;
        this.exitTime = options.exitTime || 0;

        // Settings storage for inspector
        this.settings = options.settings || {};

        this.lineWidth = 2;
        this.arrowSize = 8;
        this.labelOffset = 0.5;

        this.color = 'rgba(149, 165, 166, 0.8)';
        this.activeColor = 'rgba(52, 152, 219, 1)';
        this.hoverColor = 'rgba(255, 255, 255, 0.9)';

        this.hitTolerance = 10;
    }

    getControlPoints() {
        const start = this.fromNode.getOutputPortPosition();
        const end = this.toNode.getInputPortPosition();

        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const curvature = Math.min(distance * 0.3, 80);

        let cp1, cp2;
        if (dy < 0) {
            const perpX = Math.abs(dy) / distance;
            cp1 = { x: start.x + curvature * perpX, y: start.y + curvature * 0.5 };
            cp2 = { x: end.x + curvature * perpX, y: end.y - curvature * 0.5 };
        } else {
            cp1 = { x: start.x, y: start.y + curvature };
            cp2 = { x: end.x, y: end.y - curvature };
        }

        return { start, cp1, cp2, end };
    }

    getPointOnCurve(t) {
        const { start, cp1, cp2, end } = this.getControlPoints();
        const mt = 1 - t;
        return {
            x: mt * mt * mt * start.x + 3 * mt * mt * t * cp1.x + 3 * mt * t * t * cp2.x + t * t * t * end.x,
            y: mt * mt * mt * start.y + 3 * mt * mt * t * cp1.y + 3 * mt * t * t * cp2.y + t * t * t * end.y
        };
    }

    getTangentAtPoint(t) {
        const { start, cp1, cp2, end } = this.getControlPoints();
        const mt = 1 - t;
        const dx = 3 * mt * mt * (cp1.x - start.x) + 6 * mt * t * (cp2.x - cp1.x) + 3 * t * t * (end.x - cp2.x);
        const dy = 3 * mt * mt * (cp1.y - start.y) + 6 * mt * t * (cp2.y - cp1.y) + 3 * t * t * (end.y - cp2.y);
        const len = Math.sqrt(dx * dx + dy * dy);
        return { x: dx / len, y: dy / len };
    }

    containsPoint(px, py) {
        for (let i = 0; i <= 20; i++) {
            const pt = this.getPointOnCurve(i / 20);
            if (Math.hypot(px - pt.x, py - pt.y) < this.hitTolerance) return true;
        }
        return false;
    }

    render(ctx, activeStateName, isHovered = false, isSelected = false) {
        const { start, cp1, cp2, end } = this.getControlPoints();
        const isActive = activeStateName === this.fromNode.name;

        ctx.save();

        // Determine styling based on state
        let color = this.color;
        let lw = this.lineWidth;

        if (isSelected) {
            color = 'rgba(155, 89, 182, 1)'; // Purple for selected
            lw = 3.5;
        } else if (isHovered) {
            color = this.hoverColor;
            lw = 3;
        } else if (isActive) {
            color = this.activeColor;
            lw = 2.5;
        }

        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
        ctx.stroke();

        // Arrow
        const arrPt = this.getPointOnCurve(0.92);
        const tan = this.getTangentAtPoint(0.92);
        const angle = Math.atan2(tan.y, tan.x);

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(arrPt.x, arrPt.y);
        ctx.lineTo(arrPt.x + Math.cos(angle + Math.PI * 0.8) * this.arrowSize, arrPt.y + Math.sin(angle + Math.PI * 0.8) * this.arrowSize);
        ctx.lineTo(arrPt.x + Math.cos(angle - Math.PI * 0.8) * this.arrowSize, arrPt.y + Math.sin(angle - Math.PI * 0.8) * this.arrowSize);
        ctx.closePath();
        ctx.fill();

        // Condition label - show when hovered, active, or selected
        if (this.condition && (isHovered || isActive || isSelected)) {
            const lbl = this.getPointOnCurve(0.5);
            ctx.font = '10px "Segoe UI", sans-serif';
            const tw = ctx.measureText(this.condition).width;
            const pw = tw + 12, ph = 16;

            ctx.fillStyle = isSelected ? 'rgba(155, 89, 182, 0.95)' : isHovered ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.85)';
            ctx.beginPath();
            ctx.roundRect(lbl.x - pw / 2, lbl.y - ph / 2, pw, ph, ph / 2);
            ctx.fill();

            ctx.fillStyle = isSelected || isHovered ? '#ffffff' : '#ecf0f1';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.condition, lbl.x, lbl.y);
        }

        ctx.restore();
    }

    toJSON() {
        return {
            from: this.fromNode.name,
            to: this.toNode.name,
            condition: this.condition,
            duration: this.duration
        };
    }
}

export default TransitionEdge;
