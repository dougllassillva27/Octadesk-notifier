// ==UserScript==
// @name         Octadesk Notifier
// @namespace    http://tampermonkey.net/
// @version      5.5.1
// @description  Sistema completo: Notificações + Logs + Atalhos personalizáveis + Detecção de URL + Conversas sem resposta
// @author       Douglas Silva
// @match        https://app.octadesk.com/*
// @grant        GM_notification
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        window.focus
// ==/UserScript==

(function () {
  'use strict';

  // CONFIGURAÇÕES
  const TARGET_SECTION_NAME = 'Suas conversas';
  const UNANSWERED_SECTION_NAME = 'Não respondidas';
  const LOG_STORAGE_KEY = 'octadeskNotifierLogs';
  const NOTIFIER_SETTINGS_KEY = 'octadeskNotifierSettings';
  const SNOOZE_STORAGE_KEY = 'octadeskNotifierSnoozeUntil';
  const ATALHOS_CONFIG_KEY = 'octadeskAtalhosConfig';
  const BUTTON_POSITION_KEY = 'octadeskNotifierButtonPosition';

  const CONFIG_PADRAO_ATALHOS = {
    nomeAtendente: 'Douglas Silva',
    mensagemDia: '{saudacao} {tecnico}, tudo bem?\\n\\nMe chamo {atendente} e vou seguir com seu atendimento.\\n\\nComo posso ajudar?',
    mensagemTarde: '{saudacao} {tecnico}, tudo bem?\\n\\nMe chamo {atendente} e vou seguir com seu atendimento.\\n\\nComo posso ajudar?',
  };

  let notifierSettings = {};
  let notificationIntervalId = null;
  let notificacaoSemRespostaIntervalId = null;
  let ultimasNotificacoesSemResposta = {};
  let isChecking = false;
  let bufferDigitacao = '';

  // ===== NOVA FUNCIONALIDADE: DETECÇÃO DE URL =====

  function verificarURLValida() {
    return window.location.pathname.startsWith('/chat/');
  }

  function atualizarVisibilidadeInterface() {
    const urlValida = verificarURLValida();
    const floatingButton = document.getElementById('notifier-btn');
    const modal = document.getElementById('notifier-modal');

    if (!floatingButton) return;

    if (urlValida) {
      floatingButton.style.display = 'flex';
      log('[URL] Interface ativada: área de chat detectada');

      if (!notificationIntervalId) {
        startPeriodicNotification();
      }
    } else {
      floatingButton.style.display = 'none';

      if (modal && modal.style.display === 'flex') {
        modal.style.display = 'none';
        log('[URL] Modal fechado automaticamente: fora da área de chat');
      }

      if (notificationIntervalId) {
        clearInterval(notificationIntervalId);
        notificationIntervalId = null;
        log('[URL] Monitoramento pausado: fora da área de chat');
      }

      log('[URL] Interface ocultada: fora da área de chat');
    }
  }

  function iniciarMonitoramentoURL() {
    let urlAnterior = window.location.pathname;

    atualizarVisibilidadeInterface();

    const observerDOM = new MutationObserver(() => {
      if (urlAnterior !== window.location.pathname) {
        urlAnterior = window.location.pathname;
        atualizarVisibilidadeInterface();
      }
    });

    observerDOM.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setInterval(() => {
      if (urlAnterior !== window.location.pathname) {
        urlAnterior = window.location.pathname;
        atualizarVisibilidadeInterface();
      }
    }, 500);

    window.addEventListener('popstate', atualizarVisibilidadeInterface);
    window.addEventListener('hashchange', atualizarVisibilidadeInterface);

    log('[URL] Sistema de monitoramento de URL inicializado');
  }

  // ===== FIM DA DETECÇÃO DE URL =====

  // ===== NOVA FUNCIONALIDADE: CONVERSAS SEM RESPOSTA (CORRIGIDA) =====

  function encontrarSecaoSuasConversas() {
    log('[SEM RESPOSTA] Iniciando busca pela seção "Suas conversas"...');

    // ESTRATÉGIA 1: Buscar pelo data-cy="conversation_list" (mais confiável)
    const conversationList = document.querySelector('[data-cy="conversation_list"]');
    if (conversationList) {
      log('[SEM RESPOSTA] Seção encontrada via data-cy="conversation_list"');
      return conversationList;
    }

    // ESTRATÉGIA 2: Buscar pelo texto "Suas conversas" no menu
    const items = document.querySelectorAll('div[class*="submenu-link"], div[class*="list-item"]');
    log(`[SEM RESPOSTA] Encontrados ${items.length} itens de menu para verificar`);

    for (const item of items) {
      const textEl = item.querySelector('div[class*="list-item-content"], span, div');

      if (textEl && textEl.textContent.trim().toLowerCase().includes('suas conversas')) {
        log('[SEM RESPOSTA] Menu "Suas conversas" encontrado, buscando container adjacente');

        let proximoElemento = item.parentElement?.nextElementSibling;
        let tentativas = 0;

        while (proximoElemento && tentativas < 5) {
          if (proximoElemento.querySelector('._sidebar-list_rsn54_5')) {
            log('[SEM RESPOSTA] Container de conversas encontrado!');
            return proximoElemento;
          }
          proximoElemento = proximoElemento.nextElementSibling;
          tentativas++;
        }
      }
    }

    // ESTRATÉGIA 3: Fallback - pegar qualquer container com conversas
    const fallbackContainer = document.querySelector('._sidebar-list-container_90sxa_1');
    if (fallbackContainer) {
      log('[SEM RESPOSTA] Usando container fallback (todas as conversas visíveis)');
      return fallbackContainer;
    }

    log('[SEM RESPOSTA] ERRO: Nenhuma seção encontrada!');
    return null;
  }

  function extrairMinutos(textoTempo) {
    const texto = textoTempo.toLowerCase().trim();

    log(`[SEM RESPOSTA] Extraindo tempo de: "${textoTempo}"`);

    if (texto.includes('agora') || texto.includes('segundo')) {
      log('[SEM RESPOSTA] Tempo detectado: 0 minutos (agora/segundos)');
      return 0;
    }

    const matchMin = texto.match(/(\d+)\s*min/);
    if (matchMin) {
      const minutos = parseInt(matchMin[1]);
      log(`[SEM RESPOSTA] Tempo detectado: ${minutos} minutos`);
      return minutos;
    }

    const matchHora = texto.match(/(\d+)\s*h(?:ora)?(?:s)?\s*(?:(\d+)\s*min)?/);
    if (matchHora) {
      const horas = parseInt(matchHora[1]);
      const mins = matchHora[2] ? parseInt(matchHora[2]) : 0;
      const total = horas * 60 + mins;
      log(`[SEM RESPOSTA] Tempo detectado: ${total} minutos (${horas}h ${mins}min)`);
      return total;
    }

    const matchHa = texto.match(/há\s+(\d+)\s*min/);
    if (matchHa) {
      const minutos = parseInt(matchHa[1]);
      log(`[SEM RESPOSTA] Tempo detectado: ${minutos} minutos (formato 'há X min')`);
      return minutos;
    }

    log(`[SEM RESPOSTA] AVISO: Formato de tempo não reconhecido: "${textoTempo}"`);
    return 0;
  }

  function verificarConversasSemResposta() {
    log('[SEM RESPOSTA] ========== VERIFICAÇÃO INICIADA ==========');

    if (!notifierSettings.notificarSemResposta) {
      log('[SEM RESPOSTA] Funcionalidade DESATIVADA nas configurações');
      log('[SEM RESPOSTA] ========== VERIFICAÇÃO FINALIZADA ==========');
      return;
    }

    log('[SEM RESPOSTA] Funcionalidade ATIVADA');

    if (!verificarURLValida()) {
      log('[SEM RESPOSTA] URL inválida (fora de /chat/*)');
      log('[SEM RESPOSTA] ========== VERIFICAÇÃO FINALIZADA ==========');
      return;
    }

    log('[SEM RESPOSTA] URL válida');

    const snoozeUntil = localStorage.getItem(SNOOZE_STORAGE_KEY);
    if (snoozeUntil && Date.now() < parseInt(snoozeUntil, 10)) {
      log('[SEM RESPOSTA] Sistema em modo SNOOZE');
      log('[SEM RESPOSTA] ========== VERIFICAÇÃO FINALIZADA ==========');
      return;
    }

    try {
      const secaoSuasConversas = encontrarSecaoSuasConversas();

      if (!secaoSuasConversas) {
        log('[SEM RESPOSTA] ERRO: Seção não encontrada, abortando verificação');
        log('[SEM RESPOSTA] ========== VERIFICAÇÃO FINALIZADA ==========');
        return;
      }

      const conversasRespondidas = secaoSuasConversas.querySelectorAll('._summary-body_c6ln8_41 .___answered_c6ln8_7');
      log(`[SEM RESPOSTA] Encontradas ${conversasRespondidas.length} conversas com status "respondida"`);

      if (conversasRespondidas.length === 0) {
        log('[SEM RESPOSTA] Nenhuma conversa respondida encontrada');
        log('[SEM RESPOSTA] ========== VERIFICAÇÃO FINALIZADA ==========');
        return;
      }

      const conversasCriticas = [];
      const agora = Date.now();

      conversasRespondidas.forEach((elemento, index) => {
        log(`[SEM RESPOSTA] Analisando conversa ${index + 1}/${conversasRespondidas.length}`);

        const card = elemento.closest('._sidebar-list_rsn54_5');
        if (!card) {
          log(`[SEM RESPOSTA] Card não encontrado para conversa ${index + 1}`);
          return;
        }

        // ===== NOVO FILTRO: VERIFICAR SE A CONVERSA É SUA =====
        const atendenteElemento = card.querySelector('.___agent-name_c6ln8_29 ._text-overflow_1or4k_14');
        const nomeAtendente = atendenteElemento ? atendenteElemento.textContent.trim() : '';

        // Pega o nome configurado nos atalhos
        const configAtalhos = loadAtalhosConfig();
        const seuNome = configAtalhos.nomeAtendente;

        if (nomeAtendente !== seuNome) {
          log(`[SEM RESPOSTA] ⏭️ Pulando conversa de outro atendente: ${nomeAtendente} (esperado: ${seuNome})`);
          return;
        }

        log(`[SEM RESPOSTA] ✅ Conversa confirmada como sua (Atendente: ${nomeAtendente})`);
        // ===== FIM DO FILTRO =====

        const nomeElemento = card.querySelector('.___name_c6ln8_4 span');
        const nomeCliente = nomeElemento ? nomeElemento.textContent.trim() : 'Cliente';
        log(`[SEM RESPOSTA] Cliente: ${nomeCliente}`);

        const tempoElemento = card.querySelector('.___time_c6ln8_69 span');
        if (!tempoElemento) {
          log(`[SEM RESPOSTA] Elemento de tempo não encontrado para ${nomeCliente}`);
          return;
        }

        const textoTempo = tempoElemento.textContent.trim();
        const minutos = extrairMinutos(textoTempo);

        log(`[SEM RESPOSTA] ${nomeCliente}: ${minutos} minutos sem resposta`);

        if (minutos >= 10) {
          log(`[SEM RESPOSTA] ⚠️ CRÍTICO: ${nomeCliente} está >= 10 minutos (${minutos}min)`);
          conversasCriticas.push({ nome: nomeCliente, minutos });
        }
      });

      log(`[SEM RESPOSTA] Total de conversas críticas: ${conversasCriticas.length}`);

      if (conversasCriticas.length > 0) {
        const INTERVALO_NOTIFICACAO = 60000; // 1 minuto

        Object.keys(ultimasNotificacoesSemResposta).forEach((key) => {
          if (agora - ultimasNotificacoesSemResposta[key] > 120000) {
            delete ultimasNotificacoesSemResposta[key];
            log(`[SEM RESPOSTA] Cache limpo para: ${key}`);
          }
        });

        conversasCriticas.forEach((conversa) => {
          const chaveCache = `${conversa.nome}_${conversa.minutos}`;
          const ultimaNotificacao = ultimasNotificacoesSemResposta[chaveCache];

          log(`[SEM RESPOSTA] Verificando cache para ${conversa.nome}: última notificação ${ultimaNotificacao ? 'há ' + Math.floor((agora - ultimaNotificacao) / 1000) + 's' : 'nunca'}`);

          if (!ultimaNotificacao || agora - ultimaNotificacao >= INTERVALO_NOTIFICACAO) {
            log(`[SEM RESPOSTA] 🔔 ENVIANDO NOTIFICAÇÃO para ${conversa.nome}`);

            if (Notification.permission === 'granted') {
              new Notification('🔔 Retorno pendente do cliente', {
                body: `${conversa.nome} - ${conversa.minutos} minuto${conversa.minutos > 1 ? 's' : ''} sem responder`,
                icon: 'https://www.octadesk.com/favicon.ico',
                tag: 'octadesk-sem-resposta',
                renotify: true,
              });
              log(`[SEM RESPOSTA] ✅ Notificação enviada com sucesso`);
            } else {
              log(`[SEM RESPOSTA] ❌ Permissão de notificação negada`);
            }

            ultimasNotificacoesSemResposta[chaveCache] = agora;
          } else {
            log(`[SEM RESPOSTA] ⏭️ Pulando notificação (já notificado recentemente)`);
          }
        });
      } else {
        log('[SEM RESPOSTA] Nenhuma conversa crítica para notificar');
      }

      log('[SEM RESPOSTA] ========== VERIFICAÇÃO FINALIZADA ==========');
    } catch (e) {
      log(`[SEM RESPOSTA] ❌ ERRO FATAL: ${e.message}`);
      console.error('[SEM RESPOSTA] Stack trace:', e);
      log('[SEM RESPOSTA] ========== VERIFICAÇÃO FINALIZADA (COM ERRO) ==========');
    }
  }

  function iniciarMonitoramentoSemResposta() {
    log('[SEM RESPOSTA] Inicializando monitoramento...');

    if (notificacaoSemRespostaIntervalId) {
      clearInterval(notificacaoSemRespostaIntervalId);
      notificacaoSemRespostaIntervalId = null;
      log('[SEM RESPOSTA] Intervalo anterior limpo');
    }

    if (notifierSettings.notificarSemResposta) {
      notificacaoSemRespostaIntervalId = setInterval(verificarConversasSemResposta, 60000);
      setTimeout(verificarConversasSemResposta, 5000);
      log('[SEM RESPOSTA] ✅ Monitoramento ATIVADO (intervalo: 60s, primeira execução em 5s)');
    } else {
      log('[SEM RESPOSTA] ⚠️ Monitoramento DESATIVADO (configuração desligada)');
    }
  }

  // ===== FIM CONVERSAS SEM RESPOSTA =====

  // ESTILOS
  const styles = `
        #notifier-btn {
            position: fixed;
            width: 42px;
            height: 42px;
            border-radius: 50%;
            background: #000000;
            color: white;
            border: 1px solid #333333;
            font-size: 18px;
            cursor: move;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 99998;
            transition: box-shadow 0.2s ease, transform 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            user-select: none;
        }

        #notifier-btn:hover {
            transform: scale(1.1);
            box-shadow: 0 6px 16px rgba(0, 0, 0, 0.5);
            background: #1a1a1a;
        }

        #notifier-btn.dragging {
            cursor: grabbing;
            transform: scale(1.15);
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
        }

        #notifier-btn.paused {
            background: #1a1a1a;
            border-color: #dc2626;
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0%, 100% { box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3); }
            50% { box-shadow: 0 6px 18px rgba(220, 38, 38, 0.6); }
        }

        #notifier-modal {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 90%;
            max-width: 900px;
            height: 92vh;
            max-height: 920px;
            background: linear-gradient(145deg, #1e1e1e, #151515);
            color: #e0e0e0;
            border: 1px solid #333;
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            z-index: 99999;
            display: none;
            flex-direction: column;
            font-family: system-ui, sans-serif;
            overflow: hidden;
        }

        #notifier-header {
            padding: 16px 20px;
            background: rgba(30, 30, 30, 0.8);
            border-bottom: 1px solid #2a2a2a;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: move;
            flex-shrink: 0;
        }

        #notifier-header > span {
            font-weight: 600;
            font-size: 18px;
            color: #ffffff;
        }

        #snooze-status {
            color: #f6ad55;
            font-size: 14px;
            font-weight: 500;
        }

        #notifier-header button {
            background: #e53e3e;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 8px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        #notifier-header button:hover {
            background: #c53030;
        }

        .notifier-tabs {
            display: flex;
            background: #1a1a1a;
            border-bottom: 1px solid #2a2a2a;
            flex-shrink: 0;
        }

        .tab-btn {
            flex: 1;
            background: transparent;
            color: #a0a0a0;
            border: none;
            padding: 14px 0;
            cursor: pointer;
            font-size: 15px;
            font-weight: 500;
            transition: all 0.2s ease;
            border-bottom: 3px solid transparent;
        }

        .tab-btn:hover {
            color: #d0d0d0;
            background: rgba(255, 255, 255, 0.03);
        }

        .tab-btn.active {
            color: #ffffff;
            border-bottom-color: #3182ce;
            font-weight: 600;
        }

        .tab-content {
            display: none;
            flex-direction: column;
            flex: 1;
            overflow: hidden;
        }

        .tab-content.active {
            display: flex;
        }

        .content-area {
            padding: 20px;
            flex: 1;
            overflow-y: auto;
            background: #181818;
            font-size: 14px;
            line-height: 1.6;
        }

        .settings-section {
            padding: 24px 20px;
            background: #181818;
            flex: 1;
            overflow-y: auto;
        }

        .settings-section h4 {
            margin: 0 0 16px 0;
            padding-bottom: 8px;
            color: #63b3ed;
            font-size: 16px;
            font-weight: 600;
            border-bottom: 1px solid #2a2a2a;
        }

        .settings-section label {
            display: flex;
            align-items: center;
            margin: 12px 0;
            cursor: pointer;
            padding: 8px 12px;
            border-radius: 8px;
            transition: background 0.2s ease;
        }

        .settings-section label:hover {
            background: rgba(255, 255, 255, 0.05);
        }

        .settings-section input[type="radio"],
        .settings-section input[type="checkbox"] {
            margin-right: 12px;
            accent-color: #3182ce;
            transform: scale(1.2);
        }

        .notifier-footer {
            padding: 16px 20px;
            background: #1a1a1a;
            border-top: 1px solid #2a2a2a;
            display: flex;
            gap: 12px;
            justify-content: flex-end;
            flex-shrink: 0;
            flex-wrap: wrap;
        }

        .notifier-footer button {
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 500;
            font-size: 14px;
            transition: all 0.2s ease;
        }

        .btn-snooze { background: #dd6b20; color: white; }
        .btn-snooze:hover { background: #c05621; }
        .btn-success { background: #38a169; color: white; }
        .btn-success:hover { background: #2f855a; }
        .btn-danger { background: #e53e3e; color: white; }
        .btn-danger:hover { background: #c53030; }
        .btn-primary { background: #3182ce; color: white; }
        .btn-primary:hover { background: #2c5aa0; }
        .btn-secondary { background: #6b7280; color: white; }
        .btn-secondary:hover { background: #4b5563; }

        .atalhos-form-group {
            margin-bottom: 20px;
        }

        .atalhos-label {
            display: block;
            margin-bottom: 10px;
            color: #e0e0e0;
            font-weight: 600;
            font-size: 14px;
        }

        .atalhos-input,
        .atalhos-textarea {
            width: 100%;
            padding: 12px;
            background: #111;
            border: 1px solid #333;
            border-radius: 8px;
            color: #e0e0e0;
            box-sizing: border-box;
            font-size: 14px;
            transition: border 0.2s;
        }

        .atalhos-input:focus,
        .atalhos-textarea:focus {
            border-color: #3182ce;
            outline: none;
        }

        .atalhos-textarea {
            font-family: 'Courier New', monospace;
            resize: vertical;
            min-height: 120px;
        }

        .info-box {
            background: #111;
            padding: 16px;
            border-radius: 8px;
            border: 1px solid #333;
            margin-bottom: 16px;
        }

        .info-box h5 {
            margin: 0 0 10px 0;
            color: #63b3ed;
            font-size: 14px;
        }

        .info-box code {
            background: #1a1a1a;
            padding: 2px 6px;
            border-radius: 4px;
            color: #60a5fa;
        }

        .preview-box {
            background: #111;
            padding: 12px;
            border-radius: 8px;
            white-space: pre-wrap;
            font-family: 'Courier New', monospace;
            color: #d0d0d0;
            font-size: 13px;
            min-height: 80px;
            border: 1px solid #333;
        }

        .content-area::-webkit-scrollbar,
        .settings-section::-webkit-scrollbar,
        .atalhos-textarea::-webkit-scrollbar {
            width: 6px;
        }

        .content-area::-webkit-scrollbar-track,
        .settings-section::-webkit-scrollbar-track,
        .atalhos-textarea::-webkit-scrollbar-track {
            background: transparent;
            border-radius: 10px;
        }

        .content-area::-webkit-scrollbar-thumb,
        .settings-section::-webkit-scrollbar-thumb,
        .atalhos-textarea::-webkit-scrollbar-thumb {
            background-color: #555;
            border-radius: 10px;
            border: 2px solid transparent;
            background-clip: content-box;
        }

        .content-area::-webkit-scrollbar-thumb:hover,
        .settings-section::-webkit-scrollbar-thumb:hover,
        .atalhos-textarea::-webkit-scrollbar-thumb:hover {
            background-color: #777;
        }

        .content-area,
        .settings-section,
        .atalhos-textarea {
            scrollbar-width: thin;
            scrollbar-color: #555 transparent;
        }

        @media (max-height: 900px) {
            #notifier-modal { height: 95vh; }
        }

        @media (max-height: 700px) {
            #notifier-modal { height: 98vh; }
            #notifier-header { padding: 12px 16px; }
            .notifier-footer { padding: 12px 16px; }
        }

        @media (max-width: 920px) {
            #notifier-modal { max-width: 95%; }
        }
    `;

  // FUNÇÕES AUXILIARES
  function getTimestamp() {
    const now = new Date();
    return `[${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}]`;
  }

  function log(msg) {
    const timestamped = `${getTimestamp()} ${msg}`;
    console.log(timestamped);
    try {
      const logs = JSON.parse(localStorage.getItem(LOG_STORAGE_KEY)) || [];
      logs.push(timestamped);
      localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logs));
    } catch (e) {}
  }

  function showToast(msg, duration = 3000) {
    const toast = document.createElement('div');
    toast.style.cssText = `position:fixed;bottom:80px;right:20px;background:#1e1e1e;color:#e0e0e0;padding:16px 24px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.4);border:1px solid #333;z-index:100000;font-size:14px;`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
  }

  function showConfirm(msg, onConfirm) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;justify-content:center;align-items:center;z-index:100001;`;
    const modal = document.createElement('div');
    modal.style.cssText = `background:#1e1e1e;padding:30px;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.5);text-align:center;min-width:350px;border:1px solid #333;`;
    modal.innerHTML = `
            <p style="margin:0 0 24px 0;color:#e0e0e0;font-size:16px;">${msg}</p>
            <div style="display:flex;gap:12px;justify-content:center;">
                <button id="confirm-no" style="background:#6b7280;color:white;border:none;padding:10px 24px;border-radius:8px;cursor:pointer;">Cancelar</button>
                <button id="confirm-yes" style="background:#e53e3e;color:white;border:none;padding:10px 24px;border-radius:8px;cursor:pointer;">Confirmar</button>
            </div>
        `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    modal.querySelector('#confirm-yes').onclick = () => {
      onConfirm();
      overlay.remove();
    };
    modal.querySelector('#confirm-no').onclick = () => overlay.remove();
  }

  // NOTIFICAÇÕES
  function loadNotifierSettings() {
    const saved = localStorage.getItem(NOTIFIER_SETTINGS_KEY);
    notifierSettings = saved
      ? JSON.parse(saved)
      : {
          notificationMode: 'unanswered',
          notificationInterval: 0.5,
          notificarSemResposta: true,
        };
    log('[LOGS] Configurações carregadas.');
  }

  function updateButtonState() {
    const btn = document.getElementById('notifier-btn');
    if (!btn) return;
    const snoozeUntil = localStorage.getItem(SNOOZE_STORAGE_KEY);
    const isPaused = snoozeUntil && Date.now() < parseInt(snoozeUntil, 10);
    btn.classList.toggle('paused', isPaused);
    btn.innerHTML = isPaused ? '⏸️' : '📊';
  }

  function snooze(minutes) {
    const expiryTimestamp = Date.now() + minutes * 60 * 1000;
    localStorage.setItem(SNOOZE_STORAGE_KEY, expiryTimestamp);
    let text = `${minutes} minutos`;
    if (minutes === 60) text = '1 hora';
    else if (minutes === 1440) text = '24 horas';
    log(`[LOGS] Notificações pausadas por ${text}.`);
    showToast(`Pausado por ${text}`);
    updateButtonState();
    updatePauseStateUI();
  }

  function cancelSnooze() {
    localStorage.removeItem(SNOOZE_STORAGE_KEY);
    log('[LOGS] Pausa cancelada.');
    showToast('Reativado!');
    updateButtonState();
    updatePauseStateUI();
  }

  function updatePauseStateUI() {
    const statusEl = document.getElementById('snooze-status');
    const cancelBtn = document.getElementById('cancel-snooze');
    const snoozeBtns = ['snooze-5m', 'snooze-1h', 'snooze-24h'].map((id) => document.getElementById(id));
    const snoozeUntil = localStorage.getItem(SNOOZE_STORAGE_KEY);
    if (!statusEl) return;
    const isPaused = snoozeUntil && Date.now() < parseInt(snoozeUntil, 10);
    if (isPaused) {
      const time = new Date(parseInt(snoozeUntil, 10)).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      statusEl.textContent = `Pausado até ${time}`;
      statusEl.style.display = 'inline';
    } else {
      statusEl.textContent = '';
      statusEl.style.display = 'none';
    }
    if (cancelBtn) cancelBtn.style.display = isPaused ? 'inline-block' : 'none';
    snoozeBtns.forEach((btn) => {
      if (btn) btn.style.display = isPaused ? 'none' : 'inline-block';
    });
  }

  function findTicketElement(sectionName) {
    const items = document.querySelectorAll('div[class*="_submenu-link"]');
    for (const item of items) {
      const textEl = item.querySelector('div[class*="_list-item-content"]');
      if (textEl && textEl.textContent.trim().toLowerCase() === sectionName.toLowerCase()) {
        const numEl = item.querySelector('div[class*="_list-item-actions"] span');
        if (numEl) return numEl;
      }
    }
    return null;
  }

  function checkTicketCount(sectionName) {
    const el = findTicketElement(sectionName);
    if (el) {
      const count = parseInt(el.textContent.trim(), 10);
      return { count: isNaN(count) ? 0 : count };
    }
    return null;
  }

  function clickRefreshButton() {
    const btn = document.querySelector("button[aria-label='refresh']");
    if (btn) btn.click();
  }

  function runNotificationCheck() {
    if (!verificarURLValida()) {
      return;
    }

    const snoozeUntil = localStorage.getItem(SNOOZE_STORAGE_KEY);
    if (snoozeUntil && Date.now() < parseInt(snoozeUntil, 10)) {
      return;
    } else if (snoozeUntil) {
      localStorage.removeItem(SNOOZE_STORAGE_KEY);
      log('[LOGS] Período de pausa finalizado.');
      updatePauseStateUI();
      updateButtonState();
    }

    if (isChecking) return;

    isChecking = true;
    log('[LOGS] Ciclo periódico iniciado.');
    clickRefreshButton();

    setTimeout(() => {
      const modeText = notifierSettings.notificationMode === 'unanswered' ? 'somente "Não respondidas"' : 'sempre que houver em "Suas conversas"';
      log(`[LOGS] Verificando contadores (Modo: ${modeText})...`);

      if (notifierSettings.notificationMode === 'unanswered') {
        const resultSuasConversas = checkTicketCount(TARGET_SECTION_NAME);
        if (resultSuasConversas && resultSuasConversas.count > 0) {
          const resultNaoRespondidas = checkTicketCount(UNANSWERED_SECTION_NAME);
          if (resultNaoRespondidas && resultNaoRespondidas.count > 0) {
            if (Notification.permission === 'granted') {
              new Notification('Octadesk - Atendimento Pendente!', {
                body: `Existem ${resultNaoRespondidas.count} conversa(s) em "Não respondidas"!`,
                icon: 'https://www.octadesk.com/favicon.ico',
                tag: 'octadesk-notifier',
                renotify: true,
              });
            }
          }
        }
      } else {
        const result = checkTicketCount(TARGET_SECTION_NAME);
        if (result && result.count > 0) {
          if (Notification.permission === 'granted') {
            new Notification('Octadesk - Atendimento Pendente!', {
              body: `Existem ${result.count} conversa(s) em "Suas conversas"!`,
              icon: 'https://www.octadesk.com/favicon.ico',
              tag: 'octadesk-notifier',
              renotify: true,
            });
          }
        }
      }

      isChecking = false;
    }, 1500);
  }

  function startPeriodicNotification() {
    if (!verificarURLValida()) {
      log('[URL] Tentativa de iniciar notificações bloqueada: fora da área de chat');
      return;
    }

    if (notificationIntervalId) {
      clearInterval(notificationIntervalId);
    }

    const intervalMs = notifierSettings.notificationInterval * 60 * 1000;
    runNotificationCheck();
    notificationIntervalId = setInterval(runNotificationCheck, intervalMs);

    log(`[LOGS] Timer de notificação (re)iniciado com intervalo de ${notifierSettings.notificationInterval} minuto(s).`);
  }

  // ATALHOS
  function loadAtalhosConfig() {
    const saved = GM_getValue(ATALHOS_CONFIG_KEY);
    return saved ? JSON.parse(saved) : CONFIG_PADRAO_ATALHOS;
  }

  function saveAtalhosConfig(config) {
    GM_setValue(ATALHOS_CONFIG_KEY, JSON.stringify(config));
  }

  function obterNomeTecnico() {
    const seletores = ['._message-text_1hhxc_1', 'span[class*="message-text"]', 'div[class*="message-text"]'];
    for (let seletor of seletores) {
      const elementos = document.querySelectorAll(seletor);
      for (let el of elementos) {
        if (el.offsetParent === null) continue;
        const texto = el.textContent;
        if (!texto.includes('Técnico em atendimento:')) continue;
        const strongs = el.querySelectorAll('strong');
        for (let strong of strongs) {
          const anterior = strong.previousSibling?.textContent || '';
          if (anterior.includes('Técnico em atendimento:')) return strong.textContent.trim();
        }
        const match = texto.match(/Técnico em atendimento:\s*([^\n\r<]+?)(?:Software|Atendimento|Dados|<br|$)/i);
        if (match && match[1]) return match[1].trim();
      }
    }
    return null;
  }

  function inserirMensagem(nomeTecnico, tipo, saudacao) {
    const seletores = ['textarea[data-cy="chat_message_textarea"]', 'textarea[class*="_comment__textarea_"]', 'textarea[placeholder*="Digite / para adicionar"]', 'footer textarea'];
    let campoTexto = null;
    for (let seletor of seletores) {
      campoTexto = document.querySelector(seletor);
      if (campoTexto) break;
    }
    if (!campoTexto) {
      showToast('❌ Campo de texto não encontrado');
      return;
    }
    const config = loadAtalhosConfig();
    const template = tipo === 'dia' ? config.mensagemDia : config.mensagemTarde;
    const mensagem = template
      .replace(/{tecnico}/g, nomeTecnico)
      .replace(/{atendente}/g, config.nomeAtendente)
      .replace(/{saudacao}/g, saudacao);
    campoTexto.value = mensagem;
    campoTexto.dispatchEvent(new Event('input', { bubbles: true }));
    campoTexto.dispatchEvent(new Event('change', { bubbles: true }));
    campoTexto.focus();
    campoTexto.setSelectionRange(mensagem.length, mensagem.length);
    log(`[ATALHOS] Mensagem inserida: ${saudacao} para ${nomeTecnico}`);
  }

  // BOTÃO ARRASTÁVEL
  function makeButtonDraggable(btn) {
    let isDragging = false;
    let startX, startY, initialLeft, initialRight, initialTop, initialBottom;
    let hasMoved = false;

    const savedPos = localStorage.getItem(BUTTON_POSITION_KEY);
    if (savedPos) {
      const pos = JSON.parse(savedPos);
      if (pos.right !== undefined) {
        btn.style.right = pos.right + 'px';
        btn.style.left = 'auto';
      } else if (pos.left !== undefined) {
        btn.style.left = pos.left + 'px';
        btn.style.right = 'auto';
      }
      if (pos.bottom !== undefined) {
        btn.style.bottom = pos.bottom + 'px';
        btn.style.top = 'auto';
      } else if (pos.top !== undefined) {
        btn.style.top = pos.top + 'px';
        btn.style.bottom = 'auto';
      }
    } else {
      btn.style.right = '20px';
      btn.style.bottom = '20px';
    }

    btn.addEventListener('mousedown', (e) => {
      isDragging = true;
      hasMoved = false;
      btn.classList.add('dragging');

      startX = e.clientX;
      startY = e.clientY;

      const rect = btn.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      initialRight = window.innerWidth - rect.right;
      initialBottom = window.innerHeight - rect.bottom;

      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        hasMoved = true;
      }

      let newLeft = initialLeft + deltaX;
      let newTop = initialTop + deltaY;

      const maxLeft = window.innerWidth - btn.offsetWidth;
      const maxTop = window.innerHeight - btn.offsetHeight;

      newLeft = Math.max(0, Math.min(newLeft, maxLeft));
      newTop = Math.max(0, Math.min(newTop, maxTop));

      btn.style.left = newLeft + 'px';
      btn.style.top = newTop + 'px';
      btn.style.right = 'auto';
      btn.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        btn.classList.remove('dragging');

        const rect = btn.getBoundingClientRect();
        const distRight = window.innerWidth - rect.right;
        const distBottom = window.innerHeight - rect.bottom;

        const useRight = distRight < rect.left;
        const useBottom = distBottom < rect.top;

        const pos = {};
        if (useRight) {
          pos.right = distRight;
          btn.style.right = distRight + 'px';
          btn.style.left = 'auto';
        } else {
          pos.left = rect.left;
          btn.style.left = rect.left + 'px';
          btn.style.right = 'auto';
        }

        if (useBottom) {
          pos.bottom = distBottom;
          btn.style.bottom = distBottom + 'px';
          btn.style.top = 'auto';
        } else {
          pos.top = rect.top;
          btn.style.top = rect.top + 'px';
          btn.style.bottom = 'auto';
        }

        localStorage.setItem(BUTTON_POSITION_KEY, JSON.stringify(pos));

        if (!hasMoved) {
          toggleModal();
        }
      }
    });
  }

  // INTERFACE
  function createFloatingButton() {
    const btn = document.createElement('button');
    btn.id = 'notifier-btn';
    btn.innerHTML = '📊';
    btn.title = 'Octadesk Notifier (Ctrl+Shift+L) - Arraste para mover';
    document.body.appendChild(btn);
    makeButtonDraggable(btn);
    updateButtonState();
  }

  function createModal() {
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);

    const modal = document.createElement('div');
    modal.id = 'notifier-modal';
    modal.innerHTML = `
            <div id="notifier-header">
                <span>Octadesk Notifier</span>
                <span id="snooze-status"></span>
                <button id="close-modal">Fechar</button>
            </div>

            <div class="notifier-tabs">
                <button class="tab-btn active" data-tab="logs">Logs</button>
                <button class="tab-btn" data-tab="notifier">Configurações</button>
                <button class="tab-btn" data-tab="atalhos">Atalhos</button>
            </div>

            <div id="tab-logs" class="tab-content active">
                <div class="content-area" id="logs-content" style="white-space:pre-wrap;word-wrap:break-word;"></div>
                <div class="notifier-footer">
                    <button class="btn-snooze" id="snooze-5m">Pausar 5m</button>
                    <button class="btn-snooze" id="snooze-1h">Pausar 1h</button>
                    <button class="btn-snooze" id="snooze-24h">Pausar 24h</button>
                    <button class="btn-success" id="cancel-snooze" style="display:none">Reativar</button>
                    <button class="btn-primary" id="refresh-logs">Atualizar Logs</button>
                    <button class="btn-danger" id="clear-logs">Limpar Logs</button>
                </div>
            </div>

            <div id="tab-notifier" class="tab-content">
                <div class="settings-section">
                    <h4>Modo de Notificação</h4>
                    <label><input type="radio" name="notifMode" value="unanswered"> Notificar apenas se houver em "Não respondidas"</label>
                    <label><input type="radio" name="notifMode" value="all"> Notificar sempre que houver em "Suas conversas"</label>
                    <hr style="border-color:#444;margin:20px 0;">
                    <h4>Intervalo de Verificação</h4>
                    <label><input type="radio" name="notifInterval" value="0.5"> 30 Segundos</label>
                    <label><input type="radio" name="notifInterval" value="1"> 1 Minuto</label>
                    <label><input type="radio" name="notifInterval" value="3"> 3 Minutos</label>
                    <label><input type="radio" name="notifInterval" value="5"> 5 Minutos</label>
                    <hr style="border-color:#444;margin:20px 0;">
                    <h4>🕒 Conversas Sem Resposta</h4>
                    <label><input type="checkbox" id="notificarSemResposta"> Notificar conversas sem retorno do cliente ≥ 10 minutos</label>
                    <div style="margin-left: 32px; margin-top: 8px; color: #a0a0a0; font-size: 12px; line-height: 1.5;">
                        Monitora apenas conversas em "Suas conversas" onde você enviou a última mensagem.<br>
                        Notificações são enviadas a cada 1 minuto enquanto o cliente não responder.
                    </div>
                </div>
                <div class="notifier-footer">
                    <button class="btn-success" id="save-notifier">Salvar e Aplicar</button>
                </div>
            </div>

            <div id="tab-atalhos" class="tab-content">
                <div class="settings-section">
                    <div class="atalhos-form-group">
                        <label class="atalhos-label">👤 Seu Nome</label>
                        <input type="text" id="atalhos-nome" class="atalhos-input" placeholder="Ex: João Silva">
                    </div>

                    <div class="atalhos-form-group">
                        <label class="atalhos-label">🌅 Mensagem "\\dia"</label>
                        <textarea id="atalhos-dia" class="atalhos-textarea"></textarea>
                    </div>

                    <div class="atalhos-form-group">
                        <label class="atalhos-label">🌆 Mensagem "\\tarde"</label>
                        <textarea id="atalhos-tarde" class="atalhos-textarea"></textarea>
                    </div>

                    <div class="info-box">
                        <h5>💡 Variáveis Disponíveis</h5>
                        <div style="font-size:13px;color:#a0a0a0;line-height:1.8;">
                            <code>{saudacao}</code> → "Bom dia" ou "Boa tarde"<br>
                            <code>{tecnico}</code> → Nome do técnico (auto-detectado)<br>
                            <code>{atendente}</code> → Seu nome configurado
                        </div>
                    </div>

                    <div class="info-box">
                        <h5>📝 Preview</h5>
                        <div id="atalhos-preview" class="preview-box"></div>
                    </div>
                </div>
                <div class="notifier-footer">
                    <button class="btn-secondary" id="reset-atalhos">🔄 Resetar</button>
                    <button class="btn-success" id="save-atalhos">✓ Salvar</button>
                </div>
            </div>
        `;

    document.body.appendChild(modal);

    document.getElementById('close-modal').onclick = toggleModal;

    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.onclick = () => {
        document.querySelectorAll('.tab-btn, .tab-content').forEach((el) => el.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');

        if (btn.dataset.tab === 'logs') displayLogs();
        if (btn.dataset.tab === 'notifier') populateNotifierSettings();
        if (btn.dataset.tab === 'atalhos') populateAtalhosSettings();
      };
    });

    document.getElementById('refresh-logs').onclick = displayLogs;
    document.getElementById('clear-logs').onclick = () => {
      showConfirm('Limpar todos os logs?', () => {
        localStorage.removeItem(LOG_STORAGE_KEY);
        displayLogs();
        log('[LOGS] Logs foram limpos pelo usuário.');
        showToast('Logs limpos');
      });
    };
    document.getElementById('snooze-5m').onclick = () => snooze(5);
    document.getElementById('snooze-1h').onclick = () => snooze(60);
    document.getElementById('snooze-24h').onclick = () => snooze(1440);
    document.getElementById('cancel-snooze').onclick = cancelSnooze;

    document.getElementById('save-notifier').onclick = () => {
      notifierSettings.notificationMode = document.querySelector('input[name="notifMode"]:checked').value;
      notifierSettings.notificationInterval = parseFloat(document.querySelector('input[name="notifInterval"]:checked').value);
      notifierSettings.notificarSemResposta = document.getElementById('notificarSemResposta').checked;
      localStorage.setItem(NOTIFIER_SETTINGS_KEY, JSON.stringify(notifierSettings));

      const modeText = notifierSettings.notificationMode === 'unanswered' ? 'somente "Não respondidas"' : 'sempre que houver em "Suas conversas"';
      log(`[LOGS] Configurações salvas! Modo: ${modeText}, Intervalo: ${notifierSettings.notificationInterval} min.`);

      startPeriodicNotification();
      iniciarMonitoramentoSemResposta();
      showToast('✓ Configurações salvas!');
    };

    document.getElementById('save-atalhos').onclick = () => {
      const config = {
        nomeAtendente: document.getElementById('atalhos-nome').value.trim(),
        mensagemDia: document.getElementById('atalhos-dia').value,
        mensagemTarde: document.getElementById('atalhos-tarde').value,
      };
      if (!config.nomeAtendente) {
        showToast('❌ Preencha seu nome');
        return;
      }
      if (!config.mensagemDia.includes('{atendente}') || !config.mensagemTarde.includes('{atendente}')) {
        showToast('❌ Templates devem conter {atendente}');
        return;
      }
      saveAtalhosConfig(config);
      showToast('✓ Atalhos salvos!');
      log('[ATALHOS] Configurações salvas');
    };

    document.getElementById('reset-atalhos').onclick = () => {
      showConfirm('Restaurar valores padrão?', () => {
        document.getElementById('atalhos-nome').value = CONFIG_PADRAO_ATALHOS.nomeAtendente;
        document.getElementById('atalhos-dia').value = CONFIG_PADRAO_ATALHOS.mensagemDia;
        document.getElementById('atalhos-tarde').value = CONFIG_PADRAO_ATALHOS.mensagemTarde;
        updateAtalhosPreview();
        showToast('Valores restaurados. Clique em Salvar.');
      });
    };

    [document.getElementById('atalhos-nome'), document.getElementById('atalhos-dia')].forEach((input) => {
      input.oninput = updateAtalhosPreview;
    });
  }

  function toggleModal() {
    const modal = document.getElementById('notifier-modal');
    const isVisible = modal.style.display === 'flex';
    if (!isVisible) {
      displayLogs();
      populateNotifierSettings();
    }
    modal.style.display = isVisible ? 'none' : 'flex';
  }

  function displayLogs() {
    const content = document.getElementById('logs-content');
    const logs = JSON.parse(localStorage.getItem(LOG_STORAGE_KEY)) || [];
    content.textContent = logs.join('\n') || 'Nenhum log disponível.';
    setTimeout(() => (content.scrollTop = content.scrollHeight), 10);
    updatePauseStateUI();
  }

  function populateNotifierSettings() {
    document.querySelector(`input[name="notifMode"][value="${notifierSettings.notificationMode}"]`).checked = true;
    document.querySelector(`input[name="notifInterval"][value="${notifierSettings.notificationInterval}"]`).checked = true;
    document.getElementById('notificarSemResposta').checked = notifierSettings.notificarSemResposta !== false;
  }

  function populateAtalhosSettings() {
    const config = loadAtalhosConfig();
    document.getElementById('atalhos-nome').value = config.nomeAtendente;
    document.getElementById('atalhos-dia').value = config.mensagemDia;
    document.getElementById('atalhos-tarde').value = config.mensagemTarde;
    updateAtalhosPreview();
  }

  function updateAtalhosPreview() {
    const nome = document.getElementById('atalhos-nome').value || '[Seu Nome]';
    const template = document.getElementById('atalhos-dia').value;
    const preview = template
      .replace(/{saudacao}/g, 'Bom dia')
      .replace(/{tecnico}/g, 'João')
      .replace(/{atendente}/g, nome);
    document.getElementById('atalhos-preview').textContent = preview;
  }

  // INICIALIZAÇÃO
  function init() {
    if (window.octadeskNotifierStarted) return;
    window.octadeskNotifierStarted = true;

    loadNotifierSettings();
    createFloatingButton();
    createModal();

    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyL') {
        e.preventDefault();
        toggleModal();
      }

      bufferDigitacao += e.key;
      if (bufferDigitacao.length > 6) bufferDigitacao = bufferDigitacao.slice(-6);

      if (bufferDigitacao.endsWith('\\dia') || bufferDigitacao.endsWith('\\tarde')) {
        const ehDia = bufferDigitacao.endsWith('\\dia');
        const saudacao = ehDia ? 'Bom dia' : 'Boa tarde';
        const tipo = ehDia ? 'dia' : 'tarde';
        bufferDigitacao = '';

        const nomeTecnico = obterNomeTecnico();
        if (nomeTecnico) {
          setTimeout(() => {
            const campo = document.querySelector('textarea[data-cy="chat_message_textarea"]');
            if (campo && campo.value.includes(ehDia ? '\\dia' : '\\tarde')) {
              campo.value = campo.value.replace(ehDia ? '\\dia' : '\\tarde', '');
            }
            inserirMensagem(nomeTecnico, tipo, saudacao);
          }, 50);
        } else {
          showToast('⚠️ Técnico não encontrado');
        }
      }
    });

    setInterval(updateButtonState, 5000);

    if (Notification.permission !== 'granted') Notification.requestPermission();

    log('[LOGS] Monitoramento iniciado.');
    startPeriodicNotification();
    iniciarMonitoramentoURL();
    iniciarMonitoramentoSemResposta();

    log('[NOTIFIER] Octadesk Notifier v5.5.1 inicializado com sucesso');
    console.log('✅ Octadesk Notifier v5.5.1 carregado');
  }

  if (window.top === window.self) {
    window.addEventListener('load', init, false);
  }
})();
