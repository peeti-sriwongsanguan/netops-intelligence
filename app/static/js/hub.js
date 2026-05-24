/**
 * app/static/js/hub.js
 * SecAAS Hub Core Engine
 * Manages repository workspace initialization and system toasts
 */

document.addEventListener('DOMContentLoaded', () => {
    // Automatically flag first workspace active if tab interfaces expand later
    const systemToast = document.getElementById('toast');
    if (systemToast && systemToast.textContent.trim() !== "") {
        showHubToast(systemToast.textContent);
    }
});

/**
 * Universal Notification Engine
 * @param {string} message - Content payload text
 * @param {string} type - System status variant ('success' or 'error')
 */
function showHubToast(message, type = 'success') {
    const toastElement = document.getElementById('toast');
    if (!toastElement) return;

    toastElement.textContent = message;
    toastElement.className = 'show';

    if (type === 'error') {
        toastElement.classList.add('error');
    } else {
        toastElement.classList.add('success');
    }

    if (window.hubToastTimeout) {
        clearTimeout(window.hubToastTimeout);
    }

    window.hubToastTimeout = setTimeout(() => {
        toastElement.className = '';
    }, 3500);
}