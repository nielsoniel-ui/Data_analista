/**
 * Data Analista - Assistente Virtual & Chat de Atendimento Flutuante
 * Conhece toda a plataforma (Workspace IA, CSV/GCS, M-Pesa/E-Mola, Planos, Portal Cliente, Admin, Google Auth).
 * Auto-inicializável em qualquer página HTML.
 */

(function () {
  if (window.__dataAnalistaSupportChatLoaded) return;
  window.__dataAnalistaSupportChatLoaded = true;

  const STORAGE_KEY = 'data_analista_support_history_v1';

  // Injeta estilos específicos para animação e scrollbar do chat
  function injectStyles() {
    if (document.getElementById('da-support-chat-styles')) return;
    const style = document.createElement('style');
    style.id = 'da-support-chat-styles';
    style.textContent = `
      @keyframes da-chat-pop {
        0% { opacity: 0; transform: translateY(14px) scale(0.96); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }
      .da-chat-animate-in {
        animation: da-chat-pop 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      @keyframes da-typing-bounce {
        0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
        40% { transform: scale(1); opacity: 1; }
      }
      .da-typing-dot {
        animation: da-typing-bounce 1.2s infinite ease-in-out both;
      }
      .da-typing-dot:nth-child(2) { animation-delay: 0.15s; }
      .da-typing-dot:nth-child(3) { animation-delay: 0.3s; }
      .da-chat-scroll::-webkit-scrollbar { width: 5px; }
      .da-chat-scroll::-webkit-scrollbar-track { background: transparent; }
      .da-chat-scroll::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 9999px; }
      .da-chat-chips::-webkit-scrollbar { display: none; }
      .da-chat-chips { -ms-overflow-style: none; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
    `;
    document.head.appendChild(style);
  }

  // Normaliza texto para pesquisa sem acentos
  function normalizeText(str) {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  // Deteta o utilizador autenticado e a página atual
  function getUserContext() {
    let user = null;
    try {
      const raw = localStorage.getItem('data_analista_user');
      if (raw) user = JSON.parse(raw);
    } catch (e) {}
    const path = (window.location.pathname || '').toLowerCase();
    let page = 'workspace';
    if (path.includes('pricing')) page = 'pricing';
    else if (path.includes('client')) page = 'client';
    else if (path.includes('admin')) page = 'admin';
    else if (path.includes('login')) page = 'login';
    else if (path.includes('register')) page = 'register';
    return { user, page };
  }

  // Base de Conhecimento Inteligente do Sistema Data Analista
  const KNOWLEDGE_BASE = [
    {
      id: 'greeting',
      keywords: ['ola', 'oi', 'bom dia', 'boa tarde', 'boa noite', 'hello', 'hi', 'tudo bem', 'como vai', 'quem es', 'o que fazes', 'ajuda', 'ajudar', 'menu', 'opcoes'],
      weight: 1,
      answer: () => {
        const { user } = getUserContext();
        const nome = user && user.name ? `, <strong>${user.name.split(' ')[0]}</strong>` : '';
        return {
          text: `Olá${nome}! Sou o <strong>Assistente do Data Analista</strong>.<br><br>Posso ajudar com:<br>• Carregamento de ficheiros <strong>CSV</strong> e links <strong>Cloud (GCS)</strong><br>• Criação de <strong>Dashboards e Gráficos</strong> com IA<br>• Planos, <strong>1ª Análise Grátis</strong> e pagamentos <strong>M-Pesa / E-Mola</strong><br>• Faturas com IVA/NUIT, conta Google e Portal do Cliente.<br><br>Como posso ajudar agora?`
        };
      }
    },
    {
      id: 'upload_csv',
      keywords: ['csv', 'upload', 'carregar', 'ficheiro', 'arquivo', 'enviar dados', '1mb', 'maior que 1mb', 'limite', 'gcs', 'cloud storage', 'bucket', 'gs://', 'nuvem', 'excel', 'planilha', 'tamanho'],
      weight: 3,
      answer: () => ({
        text: `<strong>Como carregar os seus dados no Data Analista:</strong><br><br>1. <strong>Ficheiros CSV até 1MB:</strong> Arraste e largue o ficheiro diretamente na área de upload do <em>Workspace IA</em> (suporta múltiplos CSVs em simultâneo para cruzamento de dados).<br>2. <strong>Ficheiros acima de 1MB:</strong> Cole o link do Google Cloud Storage (ex.: <code>gs://meu-bucket-mz/vendas.csv</code>) no campo <em>Cloud GCS</em> para contornar o limite.<br><br>💡 <em>Dica:</em> Se tiver um ficheiro Excel (.xlsx), exporte-o primeiro como <strong>CSV (separado por vírgulas)</strong>.`,
        action: { label: 'Ir para Upload de Dados', href: 'index.html' }
      })
    },
    {
      id: 'analysis_dashboard',
      keywords: ['analise', 'analisar', 'dashboard', 'grafico', 'graficos', 'tabela', 'tabelas', 'prompt', 'pergunta', 'agente', 'ia', 'inteligencia', 'como funciona', 'usar', 'comecar', 'criar', 'provincia', 'maputo', 'matola', 'beira', 'nampula', 'boane', 'filtro'],
      weight: 2,
      answer: () => ({
        text: `<strong>Como gerar análises e dashboards automáticos:</strong><br><br>1. No <strong>Workspace IA</strong>, escolha o seu ficheiro CSV (ou use o ficheiro de demonstração <code>vendas.csv</code>).<br>2. Escreva uma instrução de negócio (ex.: <em>"Quais províncias geram maior receita em Meticais?"</em>) ou clique numa sugestão.<br>3. Clique em <strong>"Analisar e Criar Dashboard"</strong>.<br><br>O agente gera KPIs em <strong>Meticais (MT)</strong>, gráficos interativos, tabelas pesquisáveis, filtros por província (<em>Maputo, Matola, Beira, Nampula, Boane</em>) e recomendações estratégicas.`,
        action: { label: 'Abrir Workspace IA', href: 'index.html' }
      })
    },
    {
      id: 'export_pdf',
      keywords: ['pdf', 'json', 'exportar', 'baixar', 'download', 'imprimir', 'relatorio'],
      weight: 3,
      answer: () => ({
        text: `<strong>Exportação de Relatórios (PDF e JSON):</strong><br><br>Após gerar o seu dashboard no Workspace IA ou no Portal do Cliente:<br>• Clique em <strong>"Baixar PDF"</strong> no topo do relatório para guardar ou imprimir uma versão executiva.<br>• Clique em <strong>"JSON"</strong> para descarregar os dados estruturados da análise.<br><br><em>Nota:</em> A exportação em PDF/JSON está incluída nos planos <strong>Profissional</strong> e <strong>Corporativo</strong>.`,
        action: { label: 'Ver Planos Disponíveis', href: 'pricing.html' }
      })
    },
    {
      id: 'pricing_plans',
      keywords: ['plano', 'planos', 'preco', 'precos', 'valor', 'valores', 'custa', 'custo', 'mensal', 'anual', 'desconto', 'gratis', 'gratuita', 'gratuito', 'degustacao', 'trial', 'profissional', 'corporativo', 'subscricao', 'assinatura'],
      weight: 3,
      answer: () => ({
        text: `<strong>Planos do Data Analista (Moçambique):</strong><br><br>🎁 <strong>Degustação (0 MT):</strong> 1ª Análise 100% Gratuita sem necessidade de cartão!<br>🚀 <strong>Profissional (1.490 MT/mês):</strong> Análises ilimitadas até 1MB + links GCS, exportação PDF/JSON e suporte prioritário.<br>🏢 <strong>Corporativo (4.900 MT/mês):</strong> Multi-utilizadores, integração Cloud direta, relatórios personalizados e gestor dedicado.<br><br>✨ <em>Faturação Anual:</em> Poupe <strong>2 meses grátis</strong> ao optar pelo pagamento anual!`,
        action: { label: 'Comparar Planos & Subscrever', href: 'pricing.html' }
      })
    },
    {
      id: 'payments_mz',
      keywords: ['mpesa', 'm-pesa', 'emola', 'e-mola', 'pagar', 'pagamento', 'pagamentos', 'kivora', 'vodacom', 'movitel', '84', '85', '86', '87', 'celular', 'telemovel', 'pin', 'push', 'confirmar pagamento'],
      weight: 4,
      answer: () => ({
        text: `<strong>Pagamentos Locais via M-Pesa e E-Mola (Kivora):</strong><br><br>1. Aceda à página <strong>Planos & Preços</strong> e escolha o seu plano.<br>2. Selecione <strong>M-Pesa</strong> (números Vodacom <code>84/85</code>) ou <strong>E-Mola</strong> (números Movitel <code>86/87</code>).<br>3. Preencha o seu nome, e-mail, NUIT (opcional) e número de telemóvel.<br>4. Receberá um <strong>aviso Push USSD no telemóvel</strong> — basta inserir o seu PIN para ativar a subscrição na hora!`,
        action: { label: 'Ir para Checkout M-Pesa / E-Mola', href: 'pricing.html' }
      })
    },
    {
      id: 'invoices_nuit',
      keywords: ['fatura', 'faturas', 'recibo', 'recibos', 'iva', 'nuit', 'fiscal', 'imposto', '16%', 'comprovativo'],
      weight: 3,
      answer: () => ({
        text: `<strong>Faturas, Recibos e Dados Fiscais (IVA / NUIT):</strong><br><br>Todas as subscrições pagas por M-Pesa ou E-Mola geram automaticamente uma fatura oficial com discriminação de <strong>IVA (16%)</strong> e o seu <strong>NUIT</strong>.<br><br>Pode consultar, descarregar ou imprimir todas as suas faturas a qualquer momento no <strong>Portal do Cliente</strong> na secção <em>Minhas Faturas</em>.`,
        action: { label: 'Ver Minhas Faturas', href: 'client.html#invoicesSection' }
      })
    },
    {
      id: 'auth_google',
      keywords: ['conta', 'registar', 'registo', 'criar conta', 'login', 'entrar', 'iniciar sessao', 'google', 'oauth', 'gmail', 'senha', 'password', 'palavra-passe', 'esqueci', 'sair', 'logout'],
      weight: 3,
      answer: () => ({
        text: `<strong>Criação de Conta e Acesso Rápido:</strong><br><br>Pode entrar ou criar a sua conta de duas formas:<br>• <strong>Com Google (1 clique):</strong> Clique em <em>"Entrar com Google"</em> ou <em>"Criar com Google"</em> nas páginas de Login/Registo.<br>• <strong>E-mail e Palavra-passe:</strong> Registe os seus dados de empresa para acesso imediato.<br><br>As suas análises e faturas ficam associadas à sua conta.`,
        action: { label: 'Entrar / Criar Conta', href: 'login.html' }
      })
    },
    {
      id: 'client_admin_portal',
      keywords: ['portal', 'cliente', 'painel', 'admin', 'administrador', 'historico', 'meus ficheiros', 'gerir plano'],
      weight: 2,
      answer: () => ({
        text: `<strong>Portais da Plataforma:</strong><br><br>• <strong>Portal do Cliente:</strong> Acompanhe a sua facturação consolidada, faturas emitidas, ficheiros CSV enviados e diagnósticos de IA.<br>• <strong>Painel do Administrador:</strong> Área reservada à gestão global de clientes, subscrições, faturas, utilizadores e base de dados MongoDB Atlas.`,
        action: { label: 'Abrir Portal do Cliente', href: 'client.html' }
      })
    },
    {
      id: 'security_db',
      keywords: ['seguranca', 'seguro', 'privacidade', 'dados privados', 'mongodb', 'atlas', 'confidencial', 'protegido', 'protecao'],
      weight: 3,
      answer: () => ({
        text: `<strong>Segurança & Privacidade dos Dados:</strong><br><br>Os seus dados empresariais são tratados de forma confidencial em conformidade com as boas práticas de proteção de dados em Moçambique.<br>• As sessões e subscrições são armazenadas com segurança no cluster <strong>MongoDB Atlas</strong>.<br>• Pagamentos processados via gateway certificada <strong>Kivora</strong> sem armazenamento do seu PIN.`
      })
    },
    {
      id: 'human_support',
      keywords: ['erro', 'bug', 'problema', 'nao funciona', 'falhou', 'travou', 'lento', 'humano', 'atendente', 'pessoa', 'suporte', 'contacto', 'contato', 'whatsapp', 'email', 'telefone', 'falar'],
      weight: 3,
      answer: () => ({
        text: `<strong>Suporte Técnico & Atendimento Humano:</strong><br><br>Se encontrou algum erro ou precisa de apoio personalizado para a sua empresa:<br>• <strong>E-mail:</strong> <code>suporte@dataanalista.com</code><br>• <strong>Horário:</strong> Seg–Sex, 08h00–17h30 (Maputo / CAT)<br><br>💡 Se um pagamento M-Pesa/E-Mola demorar mais de 1 minuto a confirmar, utilize o botão <em>"Verificar Estado Agora"</em> na janela de checkout.`
      })
    }
  ];

  function findBestAnswer(userInput) {
    const norm = normalizeText(userInput);
    if (!norm) return null;

    let bestMatch = null;
    let highestScore = 0;

    for (const entry of KNOWLEDGE_BASE) {
      let score = 0;
      for (const kw of entry.keywords) {
        if (norm.includes(kw)) {
          // Pontuação extra para palavras maiores / mais específicas
          score += entry.weight + (kw.length > 5 ? 1 : 0);
        }
      }
      if (score > highestScore) {
        highestScore = score;
        bestMatch = entry;
      }
    }

    if (bestMatch && highestScore > 0) {
      return bestMatch.answer();
    }

    // Resposta fallback inteligente quando não há match direto
    return {
      text: `Compreendi a sua questão sobre <em>"${escapeHtml(userInput)}"</em>, mas não encontrei um tópico exato.<br><br>Posso explicar como:<br>• Carregar ficheiros <strong>CSV ou Cloud GCS</strong><br>• Gerar <strong>Dashboards e exportar PDF</strong><br>• Pagar com <strong>M-Pesa / E-Mola</strong><br>• Aceder às suas <strong>Faturas ou Conta Google</strong>.<br><br>Escolha um dos botões rápidos acima ou reformule a sua dúvida!`
    };
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Carrega histórico da sessão
  function loadHistory() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  function saveHistory(messages) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    } catch (e) {}
  }

  // Mensagem inicial contextualizada
  function getWelcomeMessage() {
    const { user, page } = getUserContext();
    const nome = user && user.name ? ` ${user.name.split(' ')[0]}` : '';
    let tip = 'Posso ajudar a carregar o seu CSV, criar gráficos com IA ou explicar os nossos planos.';
    if (page === 'pricing') tip = 'Posso tirar dúvidas sobre os planos, desconto anual ou pagamentos via <strong>M-Pesa e E-Mola</strong>.';
    else if (page === 'client') tip = 'Posso ajudar a consultar as suas <strong>faturas, recibos com IVA</strong> ou exportar relatórios.';
    else if (page === 'login' || page === 'register') tip = 'Posso ajudar com o acesso à sua conta ou login rápido com <strong>Google</strong>.';
    else if (page === 'admin') tip = 'Estou disponível para esclarecer dúvidas sobre clientes, faturas e métricas do sistema.';

    return {
      role: 'bot',
      text: `Olá${nome}! 👋 Bem-vindo ao suporte do <strong>Data Analista</strong>.<br><br>${tip}<br><br>Em que posso ajudar?`
    };
  }

  // Constrói o DOM do widget flutuante
  function initSupportChat() {
    injectStyles();

    if (document.getElementById('da-support-widget')) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'da-support-widget';
    wrapper.innerHTML = `
      <!-- Botão Flutuante de Atendimento -->
      <button
        id="da-chat-fab"
        type="button"
        aria-label="Abrir chat de atendimento"
        class="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[9990] flex items-center gap-2.5 bg-[#111315] hover:bg-black text-white pl-3.5 pr-4 py-3 sm:py-3.5 rounded-full shadow-2xl border border-gray-700/80 transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer group"
      >
        <span class="relative flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shrink-0">
          <svg id="da-fab-icon-chat" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
          </svg>
          <svg id="da-fab-icon-close" class="w-4 h-4 hidden" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
          <span class="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-[#111315] rounded-full animate-pulse"></span>
        </span>
        <span class="text-xs font-semibold tracking-wide hidden sm:inline">Assistente</span>
      </button>

      <!-- Janela do Chat de Atendimento -->
      <div
        id="da-chat-window"
        class="hidden fixed bottom-20 right-3 sm:bottom-24 sm:right-6 z-[9991] w-[calc(100vw-24px)] max-w-[385px] h-[72vh] max-h-[540px] bg-white rounded-2xl shadow-2xl border border-gray-200/90 flex flex-col overflow-hidden da-chat-animate-in"
      >
        <!-- Linha de gradiente característica do Data Analista -->
        <div class="h-1 w-full shrink-0" style="background: linear-gradient(90deg, #3B82F6 0%, #10B981 35%, #FBBF24 70%, #EF4444 100%);"></div>

        <!-- Cabeçalho do Chat -->
        <div class="bg-[#111315] text-white px-4 py-3 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shrink-0 shadow-sm">
              <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path>
              </svg>
            </div>
            <div class="min-w-0">
              <div class="text-xs font-bold tracking-wide truncate">Assistente Data Analista</div>
              <div class="flex items-center gap-1.5 text-[10px] text-emerald-400 font-medium">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Online &bull; Suporte MZ</span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button id="da-chat-reset" type="button" title="Reiniciar conversa" class="p-1.5 text-gray-400 hover:text-white hover:bg-[#25282C] rounded-lg transition-colors cursor-pointer">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
              </svg>
            </button>
            <button id="da-chat-close" type="button" title="Fechar chat" class="p-1.5 text-gray-400 hover:text-white hover:bg-[#25282C] rounded-lg transition-colors cursor-pointer">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>

        <!-- Sugestões Rápidas -->
        <div class="bg-slate-50 border-b border-gray-200/80 px-3 py-2 flex items-center gap-1.5 overflow-x-auto da-chat-chips shrink-0">
          <button type="button" data-q="Como carregar ficheiro CSV maior que 1MB?" class="da-quick-chip shrink-0 px-2.5 py-1 bg-white hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-full text-[11px] font-medium text-gray-700 transition-colors cursor-pointer">📁 CSV &gt; 1MB</button>
          <button type="button" data-q="Como pagar com M-Pesa ou E-Mola?" class="da-quick-chip shrink-0 px-2.5 py-1 bg-white hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-full text-[11px] font-medium text-gray-700 transition-colors cursor-pointer">💳 M-Pesa / E-Mola</button>
          <button type="button" data-q="Como funciona a 1ª análise gratuita e planos?" class="da-quick-chip shrink-0 px-2.5 py-1 bg-white hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-full text-[11px] font-medium text-gray-700 transition-colors cursor-pointer">🎁 Planos & Grátis</button>
          <button type="button" data-q="Onde vejo as minhas faturas com IVA e NUIT?" class="da-quick-chip shrink-0 px-2.5 py-1 bg-white hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-full text-[11px] font-medium text-gray-700 transition-colors cursor-pointer">🧾 Faturas</button>
          <button type="button" data-q="Como entrar ou criar conta com Google?" class="da-quick-chip shrink-0 px-2.5 py-1 bg-white hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-full text-[11px] font-medium text-gray-700 transition-colors cursor-pointer">🔐 Conta Google</button>
        </div>

        <!-- Área de Mensagens -->
        <div id="da-chat-messages" class="flex-1 overflow-y-auto p-3.5 space-y-3 bg-[#F8F9FA] da-chat-scroll text-xs"></div>

        <!-- Formulário de Envio -->
        <form id="da-chat-form" class="p-2.5 bg-white border-t border-gray-200/90 flex items-center gap-2 shrink-0">
          <input
            id="da-chat-input"
            type="text"
            autocomplete="off"
            placeholder="Escreva a sua dúvida..."
            class="flex-1 bg-slate-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl px-3 py-2 text-xs text-gray-800 placeholder-gray-400 outline-none transition-all"
          />
          <button
            type="submit"
            aria-label="Enviar mensagem"
            class="p-2 bg-[#111315] hover:bg-black text-white rounded-xl transition-colors cursor-pointer shrink-0 shadow-xs"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path>
            </svg>
          </button>
        </form>
      </div>
    `;

    document.body.appendChild(wrapper);

    const fab = document.getElementById('da-chat-fab');
    const chatWin = document.getElementById('da-chat-window');
    const closeBtn = document.getElementById('da-chat-close');
    const resetBtn = document.getElementById('da-chat-reset');
    const form = document.getElementById('da-chat-form');
    const input = document.getElementById('da-chat-input');
    const msgContainer = document.getElementById('da-chat-messages');
    const iconChat = document.getElementById('da-fab-icon-chat');
    const iconClose = document.getElementById('da-fab-icon-close');

    let messages = loadHistory() || [getWelcomeMessage()];

    function renderMessages() {
      msgContainer.innerHTML = '';
      messages.forEach(m => {
        const bubble = document.createElement('div');
        if (m.role === 'user') {
          bubble.className = 'flex justify-end';
          bubble.innerHTML = `
            <div class="max-w-[85%] bg-[#111315] text-white px-3.5 py-2.5 rounded-2xl rounded-br-xs shadow-xs leading-relaxed">
              ${escapeHtml(m.text)}
            </div>
          `;
        } else {
          bubble.className = 'flex justify-start';
          const actionHtml = m.action
            ? `<div class="mt-2.5 pt-2 border-t border-gray-100">
                 <a href="${m.action.href}" class="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline">
                   <span>${escapeHtml(m.action.label)}</span>
                   <span>&rarr;</span>
                 </a>
               </div>`
            : '';
          bubble.innerHTML = `
            <div class="max-w-[90%] bg-white border border-gray-200/90 text-gray-700 px-3.5 py-2.5 rounded-2xl rounded-bl-xs shadow-2xs leading-relaxed">
              ${m.text}
              ${actionHtml}
            </div>
          `;
        }
        msgContainer.appendChild(bubble);
      });
      msgContainer.scrollTop = msgContainer.scrollHeight;
    }

    function showTyping() {
      const typing = document.createElement('div');
      typing.id = 'da-chat-typing';
      typing.className = 'flex justify-start';
      typing.innerHTML = `
        <div class="bg-white border border-gray-200/90 px-3.5 py-2.5 rounded-2xl rounded-bl-xs shadow-2xs flex items-center gap-1">
          <span class="w-1.5 h-1.5 bg-gray-400 rounded-full da-typing-dot"></span>
          <span class="w-1.5 h-1.5 bg-gray-400 rounded-full da-typing-dot"></span>
          <span class="w-1.5 h-1.5 bg-gray-400 rounded-full da-typing-dot"></span>
        </div>
      `;
      msgContainer.appendChild(typing);
      msgContainer.scrollTop = msgContainer.scrollHeight;
    }

    function hideTyping() {
      const typing = document.getElementById('da-chat-typing');
      if (typing) typing.remove();
    }

    function sendUserMessage(text) {
      const clean = (text || '').trim();
      if (!clean) return;

      messages.push({ role: 'user', text: clean });
      saveHistory(messages);
      renderMessages();
      input.value = '';

      showTyping();
      setTimeout(() => {
        hideTyping();
        const reply = findBestAnswer(clean);
        messages.push({
          role: 'bot',
          text: reply.text,
          action: reply.action || null
        });
        saveHistory(messages);
        renderMessages();
      }, 360);
    }

    function toggleChat(forceState) {
      const isOpen = !chatWin.classList.contains('hidden');
      const nextOpen = typeof forceState === 'boolean' ? forceState : !isOpen;
      if (nextOpen) {
        chatWin.classList.remove('hidden');
        iconChat.classList.add('hidden');
        iconClose.classList.remove('hidden');
        renderMessages();
        setTimeout(() => input.focus(), 120);
      } else {
        chatWin.classList.add('hidden');
        iconChat.classList.remove('hidden');
        iconClose.classList.add('hidden');
      }
    }

    fab.addEventListener('click', () => toggleChat());
    closeBtn.addEventListener('click', () => toggleChat(false));

    resetBtn.addEventListener('click', () => {
      messages = [getWelcomeMessage()];
      saveHistory(messages);
      renderMessages();
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      sendUserMessage(input.value);
    });

    wrapper.querySelectorAll('.da-quick-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        sendUserMessage(btn.getAttribute('data-q'));
      });
    });

    // Fecha com tecla Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !chatWin.classList.contains('hidden')) {
        toggleChat(false);
      }
    });

    // Expõe API simples global caso alguma página queira abrir o chat programaticamente
    window.openDataAnalistaSupport = function (prefillQuestion) {
      toggleChat(true);
      if (prefillQuestion) {
        sendUserMessage(prefillQuestion);
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSupportChat);
  } else {
    initSupportChat();
  }
})();
