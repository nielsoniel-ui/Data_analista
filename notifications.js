/**
 * Data Analista - Sistema de Notificações e Confirmações Nativas
 * Suporta Notificações Toast no DOM (UI nativa estilizada)
 * e Web Notifications API do navegador (Notification API) com permissão.
 */

(function () {
  // Criar container de Toasts se não existir
  function ensureToastContainer() {
    let container = document.getElementById('data-analista-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'data-analista-toast-container';
      container.className = 'fixed top-5 right-5 z-[9999] flex flex-col space-y-3 pointer-events-none max-w-sm w-full px-4 sm:px-0';
      document.body.appendChild(container);
    }
    return container;
  }

  // Solicitar permissão para Notificações do Navegador (Web Notification API)
  function requestBrowserNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        Notification.requestPermission();
      } catch (e) {
        console.warn('Erro ao solicitar permissão de notificações:', e);
      }
    }
  }

  // Disparar Notificação Nativa do Sistema Operativo / Browser se permitido
  function showBrowserNotification(title, message) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body: message,
          icon: 'AI Data analyst.png',
          badge: 'AI Data analyst.png'
        });
      } catch (e) {
        // Fallback silencioso
      }
    }
  }

  // Ícones SVG para cada tipo de Toast
  const icons = {
    success: `<svg class="w-5 h-5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`,
    error: `<svg class="w-5 h-5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`,
    warning: `<svg class="w-5 h-5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`,
    info: `<svg class="w-5 h-5 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`
  };

  /**
   * Notificação Nativa Toast (exibe no topo da interface e no sistema operacional)
   * @param {string} message - Texto da notificação
   * @param {string} type - 'success' | 'error' | 'warning' | 'info'
   * @param {string} [title] - Título opcional
   * @param {number} [duration=4500] - Tempo em ms
   */
  window.showNotification = function (message, type = 'info', title = '', duration = 4500) {
    const container = ensureToastContainer();
    const toast = document.createElement('div');

    const defaultTitles = {
      success: 'Sucesso',
      error: 'Erro',
      warning: 'Atenção',
      info: 'Notificação'
    };

    const toastTitle = title || defaultTitles[type] || 'Data Analista';

    toast.className = `
      pointer-events-auto flex items-start gap-3 p-4 bg-white border border-gray-200/90 rounded-2xl shadow-lg 
      transform transition-all duration-300 ease-out translate-y-[-15px] opacity-0
    `;

    toast.innerHTML = `
      <div class="mt-0.5">${icons[type] || icons.info}</div>
      <div class="flex-1 min-w-0 pr-2">
        <h4 class="text-xs font-bold text-gray-900 leading-tight">${toastTitle}</h4>
        <p class="text-xs text-gray-600 mt-0.5 leading-relaxed break-words">${message}</p>
      </div>
      <button type="button" class="text-gray-400 hover:text-gray-600 p-0.5 rounded transition-colors" aria-label="Fechar">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
      </button>
    `;

    const closeBtn = toast.querySelector('button');
    const dismiss = () => {
      toast.classList.add('opacity-0', 'translate-y-[-10px]', 'scale-95');
      setTimeout(() => {
        if (toast.parentElement) toast.parentElement.removeChild(toast);
      }, 300);
    };

    closeBtn.addEventListener('click', dismiss);
    container.appendChild(toast);

    // Animar entrada
    requestAnimationFrame(() => {
      toast.classList.remove('opacity-0', 'translate-y-[-15px]');
      toast.classList.add('opacity-100', 'translate-y-0');
    });

    // Auto-remover
    if (duration > 0) {
      setTimeout(dismiss, duration);
    }

    // Tentar notificação no sistema operacional também
    showBrowserNotification(toastTitle, message);
  };

  /**
   * Modal de Confirmação Nativo (substitui o confirm() padrão do navegador)
   * @param {string} message - Pergunta de confirmação
   * @param {Object} [options] - Opções de títulos e botões
   * @returns {Promise<boolean>}
   */
  window.showConfirmDialog = function (message, options = {}) {
    return new Promise((resolve) => {
      const title = options.title || 'Confirmação';
      const confirmText = options.confirmText || 'Confirmar';
      const cancelText = options.cancelText || 'Cancelar';
      const confirmColor = options.destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-[#111315] hover:bg-black';

      const overlay = document.createElement('div');
      overlay.className = 'fixed inset-0 bg-black/60 z-[10000] flex items-center justify-center p-4 transition-opacity duration-200 opacity-0';

      const modal = document.createElement('div');
      modal.className = 'bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl transform transition-transform duration-200 scale-95';

      modal.innerHTML = `
        <div class="flex items-start gap-3">
          <div class="p-2.5 rounded-full ${options.destructive ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'} shrink-0">
            ${options.destructive 
              ? `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`
              : `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`}
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="text-sm font-bold text-gray-900 leading-tight">${title}</h3>
            <p class="text-xs text-gray-600 mt-1 leading-relaxed whitespace-pre-line">${message}</p>
          </div>
        </div>
        <div class="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
          <button type="button" id="confirmCancelBtn" class="px-4 py-2 border border-gray-200 text-gray-700 hover:bg-slate-50 text-xs font-semibold rounded-xl transition-colors">
            ${cancelText}
          </button>
          <button type="button" id="confirmOkBtn" class="px-4 py-2 ${confirmColor} text-white text-xs font-semibold rounded-xl transition-colors shadow-sm">
            ${confirmText}
          </button>
        </div>
      `;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      requestAnimationFrame(() => {
        overlay.classList.remove('opacity-0');
        overlay.classList.add('opacity-100');
        modal.classList.remove('scale-95');
        modal.classList.add('scale-100');
      });

      const cleanup = (result) => {
        overlay.classList.remove('opacity-100');
        overlay.classList.add('opacity-0');
        modal.classList.remove('scale-100');
        modal.classList.add('scale-95');
        setTimeout(() => {
          if (overlay.parentElement) overlay.parentElement.removeChild(overlay);
          resolve(result);
        }, 200);
      };

      modal.querySelector('#confirmCancelBtn').addEventListener('click', () => cleanup(false));
      modal.querySelector('#confirmOkBtn').addEventListener('click', () => cleanup(true));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cleanup(false);
      });
    });
  };

  // Solicitar permissão de notificações em clique relevante
  document.addEventListener('click', function initNotifyPermission() {
    requestBrowserNotificationPermission();
    document.removeEventListener('click', initNotifyPermission);
  }, { once: true });
})();
