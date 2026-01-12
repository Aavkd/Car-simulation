export class HUDManager {
    constructor(controller) {
        this.controller = controller;
        this.questTracker = document.getElementById('quest-tracker');
        this.qtTitle = document.getElementById('qt-title');
        this.qtObjectives = document.getElementById('qt-objectives');

        this.interactionPrompt = document.getElementById('interaction-prompt');
        this.notificationArea = document.getElementById('notification-area');

        this.isVisible = true;
    }

    show() {
        this.isVisible = true;

        // Determine if quest tracker should be shown (only if there are active quests)
        this.updateQuestTracker();
    }

    hide() {
        this.isVisible = false;
        this.questTracker.classList.add('hidden');
        this.interactionPrompt.classList.add('hidden');
    }

    update() {
        if (!this.isVisible) return;

        // Interaction Prompt Logic
        // We need to check if PlayerController has an active intersection
        // Accessing PlayerController via global game instance might be cleaner if passed down
        // For now, let's assume RPGManager has access to player interactions or we poll

        const player = window.game?.playerController;
        if (player && player.intersectedObject && player.intersectedObject.userData.interactive) {
            this.interactionPrompt.classList.remove('hidden');
            const action = player.intersectedObject.userData.actionName || 'Talk';
            this.interactionPrompt.querySelector('.prompt-text').textContent = action;
        } else {
            this.interactionPrompt.classList.add('hidden');
        }
    }

    updateQuestTracker() {
        if (!this.isVisible) return;

        const activeQuest = this.controller.rpgManager.questManager.getActiveQuest();

        if (activeQuest) {
            this.questTracker.classList.remove('hidden');
            this.qtTitle.textContent = activeQuest.title;

            this.qtObjectives.innerHTML = '';
            activeQuest.objectives.forEach(obj => {
                const li = document.createElement('li');
                li.textContent = obj.description;
                if (obj.isCompleted) {
                    li.classList.add('completed');
                }
                this.qtObjectives.appendChild(li);
            });
        } else {
            this.questTracker.classList.add('hidden');
        }
    }

    showToast(title, message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        `;

        // Add specific border color based on type if needed
        if (type === 'error') toast.style.borderLeftColor = '#e74c3c';

        this.notificationArea.appendChild(toast);

        // Remove after 3 seconds
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
}
