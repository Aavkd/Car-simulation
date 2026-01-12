export class DialogueUI {
    constructor(controller) {
        this.controller = controller;
        this.overlay = document.getElementById('dialogue-overlay');
        this.speakerEl = this.overlay.querySelector('.dialogue-speaker');
        this.textEl = this.overlay.querySelector('.dialogue-text');
        this.responsesEl = document.getElementById('dialogue-responses');

        this.typingSpeed = 30; // ms per char
        this.isTyping = false;
        this.currentText = '';
        this.typeInterval = null;
    }

    show(node) {
        this.overlay.classList.remove('hidden');
        this.renderNode(node);
    }

    hide() {
        this.overlay.classList.add('hidden');
        this.clearTyping();
    }

    renderNode(node) {
        // Set speaker name (could be passed in node or found via NPC ID)
        this.speakerEl.textContent = node.speaker || "Unknown";

        // Start typewriter
        this.currentText = node.text;
        this.typeText(this.currentText);

        // Clear previous buttons
        this.responsesEl.innerHTML = '';

        // Generate response buttons
        // Generate response buttons
        if (node.choices && node.choices.length > 0) {
            node.choices.forEach((opt, i) => {
                const btn = document.createElement('button');
                btn.className = 'response-btn';
                btn.textContent = opt.text;

                // Add requirements text if needed, or style differently
                if (opt.condition) {
                    // check condition here? Or let DialogueSystem handle invalid selection?
                    // For UI feedback, we might want to disable the button
                    // But DialogueSystem.checkRequirement() is internal.
                    // The system logic currently returns if condition not met, but UI doesn't know.
                    // For now, render them all, maybe add visual indicator
                    // btn.classList.add('conditional');
                }

                btn.addEventListener('click', () => {
                    if (this.isTyping) {
                        // If clicking while typing, complete text immediately
                        this.finishTyping();
                    } else {
                        // Select option by index
                        this.controller.rpgManager.dialogueSystem.selectOption(i);
                    }
                });
                this.responsesEl.appendChild(btn);
            });
        } else {
            // "End" or "Continue" button if no options
            const btn = document.createElement('button');
            btn.className = 'response-btn';
            // Check if it's truly an end or just a linear continuation
            btn.textContent = node.end ? 'End' : 'Continue';

            btn.addEventListener('click', () => {
                if (node.next) {
                    this.controller.rpgManager.dialogueSystem.advance();
                } else {
                    this.controller.rpgManager.dialogueSystem.endDialogue();
                }
            });
            this.responsesEl.appendChild(btn);
        }
    }

    typeText(text) {
        this.clearTyping();
        this.isTyping = true;
        this.textEl.textContent = '';

        let i = 0;
        this.typeInterval = setInterval(() => {
            this.textEl.textContent += text.charAt(i);
            i++;
            if (i >= text.length) {
                this.finishTyping();
            }
        }, this.typingSpeed);
    }

    clearTyping() {
        if (this.typeInterval) clearInterval(this.typeInterval);
        this.isTyping = false;
    }

    finishTyping() {
        this.clearTyping();
        this.textEl.textContent = this.currentText;
    }
}
