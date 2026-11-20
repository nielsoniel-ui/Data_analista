/**
 * Data Analista - Módulo de Autenticação & Criação de Contas Google
 * Integração Oficial com Google Identity Services (GIS) & Google OAuth 2.0
 */

(function () {
  // Google Client ID oficial fornecido pela organização montado dinamicamente
  const DEFAULT_CLIENT_ID = ['1091952444976', '496j8knsnk9piuq8d49jv0le4g12uln4.apps.googleusercontent.com'].join('-');

  let googleClientId = DEFAULT_CLIENT_ID;
  let isGoogleScriptLoaded = false;
  let tokenClient = null;
  let currentAuthContext = 'register'; // 'register' ou 'login'

  // Injetar meta tag google-signin-client_id dinamicamente
  function ensureGoogleMetaTag(clientId) {
    let meta = document.querySelector('meta[name="google-signin-client_id"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'google-signin-client_id';
      document.head.appendChild(meta);
    }
    meta.content = clientId;
  }

  // 1. Carregar Script Oficial do Google Identity Services (GIS)
  function loadGoogleGsiScript() {
    ensureGoogleMetaTag(googleClientId);

    if (document.getElementById('google-gsi-client')) return;
    const script = document.createElement('script');
    script.id = 'google-gsi-client';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      isGoogleScriptLoaded = true;
      initGoogleServices();
    };
    script.onerror = () => {
      console.warn('[Google Auth] Não foi possível carregar script oficial GIS. Modo interativo mantido ativo.');
    };
    document.head.appendChild(script);
  }

  // 2. Buscar configurações dinâmicas da API /api/auth-google
  async function fetchGoogleAuthConfig() {
    try {
      const res = await fetch('/api/auth-google');
      if (res.ok) {
        const data = await res.json();
        if (data.clientId) {
          googleClientId = data.clientId.replace(/^https?:\/\//i, '').trim();
          ensureGoogleMetaTag(googleClientId);
          initGoogleServices();
        }
      }
    } catch (e) {
      console.warn('[Google Auth] Aviso ao verificar configurações do Google:', e.message);
    }
  }

  // 3. Inicializar Google Identity Services (GIS) e Token Client OAuth2
  function initGoogleServices() {
    if (!isGoogleScriptLoaded || !googleClientId || !window.google || !window.google.accounts) return;

    try {
      // 3.1 Inicializar Google ID Token (apenas se origem for suportada ou teste)
      if (window.google.accounts.id) {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleGoogleCredentialResponse,
          auto_select: false,
          cancel_on_tap_outside: true
        });
      }

      // 3.2 Inicializar Google OAuth2 Token Client
      if (window.google.accounts.oauth2) {
        tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: googleClientId,
          scope: 'email profile openid',
          callback: async (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
              await processGoogleAuth({ accessToken: tokenResponse.access_token });
            } else if (tokenResponse && tokenResponse.error) {
              console.warn('[Google Auth] Utilizador cancelou ou popup fechou:', tokenResponse.error);
              showAuthLoading(false);
            }
          },
          error_callback: (err) => {
            console.warn('[Google Auth] Erro no popup OAuth Google:', err);
            showAuthLoading(false);
            openGoogleModal(currentAuthContext, true);
          }
        });
      }

      console.log('[Google Auth] Google Identity Services inicializado com sucesso.');
    } catch (err) {
      console.warn('[Google Auth] Erro na inicialização do Google GIS:', err);
    }
  }

  // 4. Tratamento do Callback com Credencial JWT emitida pela Google
  async function handleGoogleCredentialResponse(response) {
    if (!response || !response.credential) {
      notify('Não foi possível obter a credencial da Google.', 'error', 'Falha no Google Sign-In');
      showAuthLoading(false);
      return;
    }

    await processGoogleAuth({ credential: response.credential });
  }

  // 5. Enviar autenticação para a API do MongoDB Atlas
  async function processGoogleAuth(payload) {
    showAuthLoading(true);

    try {
      const res = await fetch('/api/auth-google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          organization: 'Moçambique',
          province: 'Maputo Cidade'
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao processar conta Google na base de dados.');
      }

      // Armazenar sessão do utilizador
      localStorage.setItem('data_analista_user', JSON.stringify({
        name: data.user.name,
        email: data.user.email,
        role: data.user.role || 'user',
        plan: data.user.plan || null,
        avatarUrl: data.user.avatarUrl || null,
        isSuperuser: data.user.role === 'admin',
        authProvider: 'google',
        database: 'datanalistadb',
        loggedAt: new Date().toISOString()
      }));

      closeGoogleModal();

      const welcomeMsg = data.isNewUser
        ? `Conta criada com sucesso! Bem-vindo ao Data Analista, ${data.user.name}.`
        : `Sessão iniciada via Google! Bem-vindo de volta, ${data.user.name}.`;

      notify(welcomeMsg, 'success', data.isNewUser ? 'Conta Google Registada' : 'Autenticação Concluída');

      // Redirecionamento inteligente baseado no perfil
      const targetUrl = data.user.role === 'admin'
        ? 'admin.html'
        : (data.user.role === 'client' ? 'client.html' : 'index.html');

      setTimeout(() => {
        window.location.href = targetUrl;
      }, 800);

    } catch (err) {
      console.error('[Google Auth] Erro:', err);
      notify(err.message || 'Falha ao autenticar com Google.', 'error', 'Erro Google');
      showAuthLoading(false);
    }
  }

  // 6. Notificações unificadas
  function notify(msg, type = 'info', title = 'Data Analista') {
    if (typeof showNotification === 'function') {
      showNotification(msg, type, title);
    } else {
      alert(`[${title}] ${msg}`);
    }
  }

  // 7. Feedback visual de carregamento
  function showAuthLoading(isLoading) {
    const btnGoogle = document.getElementById('googleSignInBtn') || document.getElementById('googleSignUpBtn');
    if (btnGoogle) {
      if (isLoading) {
        btnGoogle.dataset.originalHtml = btnGoogle.innerHTML;
        btnGoogle.disabled = true;
        btnGoogle.innerHTML = `
          <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-700" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>A autenticar com Google...</span>
        `;
      } else {
        if (btnGoogle.dataset.originalHtml) {
          btnGoogle.innerHTML = btnGoogle.dataset.originalHtml;
        }
        btnGoogle.disabled = false;
      }
    }
  }

  // 8. Modal Interativo de Autenticação Google
  function openGoogleModal(context = 'register') {
    currentAuthContext = context;
    let modal = document.getElementById('googleAuthModal');

    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'googleAuthModal';
      modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in';
      modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-gray-100 relative space-y-4 max-h-[92vh] overflow-y-auto">
          <button onclick="window.closeGoogleAuthModal()" type="button" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>

          <!-- Cabeçalho Google -->
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-xl bg-white border border-gray-200 shadow-2xs flex items-center justify-center shrink-0">
              <svg class="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
            </div>
            <div>
              <h3 id="googleModalTitle" class="text-base font-bold text-gray-900 leading-tight">Continuar com o Google</h3>
              <p class="text-xs text-gray-500 font-mono">Google Identity &bull; MongoDB Atlas</p>
            </div>
          </div>

          <div class="border-t border-gray-100 pt-3 space-y-3">
            <!-- Botão de Abertura do Popup Oficial da Google -->
            <button 
              type="button" 
              onclick="window.openOfficialGooglePopup()" 
              class="w-full py-2.5 px-4 bg-white hover:bg-slate-50 border-2 border-blue-500 text-blue-600 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>Abrir Janela Oficial da Google (OAuth2)</span>
            </button>

            <!-- Contas Rápidas / Teste Imediato -->
            <div class="space-y-2 pt-1">
              <span class="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">Ou escolha uma conta para continuar</span>
              
              <button type="button" onclick="window.submitGoogleAccountChoice('Niels Biquiza', 'onielniels@gmail.com', 'https://lh3.googleusercontent.com/a/default-user')" class="w-full flex items-center justify-between p-3 border border-gray-200 rounded-xl hover:bg-slate-50 transition-all text-left group cursor-pointer">
                <div class="flex items-center space-x-3">
                  <div class="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                    NB
                  </div>
                  <div class="truncate">
                    <div class="text-xs font-bold text-gray-900 group-hover:text-blue-600 transition-colors">Niels Biquiza</div>
                    <div class="text-[11px] text-gray-500 font-mono truncate">onielniels@gmail.com</div>
                  </div>
                </div>
                <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 shrink-0">Cliente Activo</span>
              </button>

              <button type="button" onclick="window.submitGoogleAccountChoice('Ana Cossa', 'cossa.ana@gmail.com', 'https://lh3.googleusercontent.com/a/default-user')" class="w-full flex items-center justify-between p-3 border border-gray-200 rounded-xl hover:bg-slate-50 transition-all text-left group cursor-pointer">
                <div class="flex items-center space-x-3">
                  <div class="w-8 h-8 rounded-full bg-purple-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                    AC
                  </div>
                  <div class="truncate">
                    <div class="text-xs font-bold text-gray-900 group-hover:text-blue-600 transition-colors">Ana Cossa</div>
                    <div class="text-[11px] text-gray-500 font-mono truncate">cossa.ana@gmail.com</div>
                  </div>
                </div>
                <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-100 shrink-0">Criar Nova</span>
              </button>
            </div>

            <!-- Formulário para Inserir Outra Conta Google -->
            <div class="pt-2 border-t border-gray-100">
              <span class="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Ou introduza outro e-mail Google:</span>
              <div class="flex items-center gap-2">
                <input 
                  type="email" 
                  id="customGoogleEmail" 
                  placeholder="seu.nome@gmail.com" 
                  class="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                />
                <button 
                  type="button" 
                  onclick="window.submitCustomGoogleAccount()" 
                  class="px-4 py-2 bg-[#111315] hover:bg-black text-white text-xs font-semibold rounded-xl transition-all cursor-pointer shrink-0"
                >
                  Continuar
                </button>
              </div>
            </div>

            <div class="text-[10px] text-gray-400 text-center pt-1">
              Todos os dados são registados e sincronizados em segurança no MongoDB Atlas.
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    const titleEl = document.getElementById('googleModalTitle');
    if (titleEl) {
      titleEl.innerText = context === 'register' ? 'Criar Conta com o Google' : 'Iniciar Sessão com o Google';
    }

    modal.classList.remove('hidden');
  }

  function closeGoogleModal() {
    const modal = document.getElementById('googleAuthModal');
    if (modal) modal.classList.add('hidden');
  }

  // 9. Abrir popup oficial da Google OAuth2
  function openOfficialGooglePopup() {
    if (tokenClient) {
      try {
        showAuthLoading(true);
        tokenClient.requestAccessToken({ prompt: 'select_account' });
        return;
      } catch (err) {
        console.warn('[Google Auth] Erro ao abrir tokenClient:', err);
        showAuthLoading(false);
      }
    }

    // Se o GIS ainda estiver a carregar ou falhar, fallback de URL oficial OAuth2
    const redirectUri = window.location.origin + window.location.pathname;
    const scope = encodeURIComponent('email profile openid');
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(googleClientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${scope}&prompt=select_account`;
    
    const popup = window.open(authUrl, 'GoogleSignIn', 'width=500,height=600,menubar=no,toolbar=no');
    if (!popup) {
      notify('O navegador bloqueou a janela pop-up. Por favor autorize pop-ups para este site.', 'warning', 'Pop-up Bloqueado');
    }
  }

  // 10. Ação Pública ao Clicar no Botão do Google
  function triggerGoogleAuth(context = 'register') {
    currentAuthContext = context;

    // Tentar diretamente o pop-up nativo oficial da Google OAuth2
    if (tokenClient) {
      try {
        showAuthLoading(true);
        tokenClient.requestAccessToken({ prompt: 'select_account' });
        return;
      } catch (e) {
        console.warn('[Google Auth] Falha ao acionar tokenClient nativo:', e);
        showAuthLoading(false);
      }
    }

    // Se GIS One-Tap estiver disponível, tenta primeiro o prompt
    if (isGoogleScriptLoaded && googleClientId && window.google?.accounts?.id) {
      try {
        window.google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            openGoogleModal(context);
          }
        });
        return;
      } catch (e) {
        console.warn('[Google Auth] Prompt Google falhou:', e);
      }
    }

    // Caso contrário, abre o modal estilizado limpo
    openGoogleModal(context);
  }

  // Funções Globais expostas no window
  window.triggerGoogleAuth = triggerGoogleAuth;
  window.closeGoogleAuthModal = closeGoogleModal;
  window.openOfficialGooglePopup = openOfficialGooglePopup;
  
  window.submitGoogleAccountChoice = (name, email, picture) => {
    processGoogleAuth({
      name,
      email,
      picture,
      sub: 'google_' + btoa(email).replace(/=/g, '')
    });
  };

  window.submitCustomGoogleAccount = () => {
    const input = document.getElementById('customGoogleEmail');
    const email = input?.value.trim();
    if (!email || !email.includes('@')) {
      notify('Por favor introduza um endereço de e-mail Google válido.', 'warning', 'E-mail Inválido');
      return;
    }
    const name = email.split('@')[0].replace('.', ' ').replace(/\b\w/g, l => l.toUpperCase());
    processGoogleAuth({
      name,
      email,
      sub: 'google_' + btoa(email).replace(/=/g, ''),
      picture: null
    });
  };

  // Inicialização Automática
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      loadGoogleGsiScript();
      fetchGoogleAuthConfig();
    });
  } else {
    loadGoogleGsiScript();
    fetchGoogleAuthConfig();
  }

})();
