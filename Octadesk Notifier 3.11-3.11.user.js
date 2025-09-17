// ==UserScript==
// @name         Octadesk Notifier 3.11
// @namespace    http://tampermonkey.net/
// @version      3.11
// @description  Ferramenta configurável com notificações persistentes e painel de logs (Ctrl+Shift+L)
// @author       Douglas Silva
// @match        https://app.octadesk.com/chat/*
// @grant        GM_notification
// @grant        window.focus
// ==/UserScript==

(function() {
    'use strict';

    // --- CONFIGURAÇÕES ---
    const TARGET_SECTION_NAME = 'Suas conversas';
    const UNANSWERED_SECTION_NAME = 'Não respondidas';
    const LOG_STORAGE_KEY = 'octadeskNotifierLogs';
    const SETTINGS_STORAGE_KEY = 'octadeskNotifierSettings';

    // --- VARIÁVEIS GLOBAIS ---
    let settings = {};
    let notificationIntervalId = null;
    let isChecking = false; // Flag para evitar execuções simultâneas

    // --- ESTILOS (Atualizados para Design Clean/Minimalista) ---
    const logViewerStyles = `
        /* Container Principal - CENTRALIZADO */
        #log-viewer-container {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 720px;
            max-height: 85vh;
            background: linear-gradient(145deg, #1e1e1e, #151515);
            color: #e0e0e0;
            border: 1px solid #333;
            border-radius: 16px;
            backdrop-filter: blur(10px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            z-index: 99999;
            display: none;
            flex-direction: column;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue',sans-serif;
            overflow: hidden;
        }

        /* Cabeçalho Arrastável */
        #log-viewer-header {
            padding: 16px 20px;
            background: rgba(30, 30, 30, 0.8);
            border-bottom: 1px solid #2a2a2a;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: move;
        }
        #log-viewer-header span {
            font-weight: 600;
            font-size: 18px;
            letter-spacing: -0.5px;
            color: #ffffff;
        }
        #log-viewer-header button {
            background: #e53e3e;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 8px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        #log-viewer-header button:hover {
            background: #c53030;
            transform: translateY(-1px);
        }
        #log-viewer-header button:active {
            transform: translateY(0);
        }

        /* Abas */
        .log-viewer-tabs {
            display: flex;
            background: #1a1a1a;
            border-bottom: 1px solid #2a2a2a;
        }
        .tab-button {
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
        .tab-button:hover {
            color: #d0d0d0;
            background: rgba(255, 255, 255, 0.03);
        }
        .tab-button.active {
            color: #ffffff;
            background: #1a1a1a;
            border-bottom: 3px solid #3182ce;
            font-weight: 600;
        }

        /* Conteúdo das Abas */
        .tab-content {
            display: none;
            flex-direction: column;
            flex-grow: 1;
        }
        .tab-content.active {
            display: flex;
        }

        /* Área de Logs - Altura Fixa com Scroll */
        #log-viewer-content {
            padding: 20px;
            height: 700px; /* Altura fixa para garantir o scroll */
            overflow-y: auto; /* Scroll ativo quando o conteúdo excede a altura */
            background: #181818;
            font-size: 14px;
            line-height: 1.6;
            white-space: pre-wrap;
            word-wrap: break-word;
        }

        /* Seção de Configurações - Altura Fixa */
        .settings-section {
            padding: 24px 20px;
            text-align: left;
            background: #181818;
            height: 700px; /* Altura fixa definida */
            overflow-y: auto; /* Scroll ativo quando o conteúdo excede a altura */
        }
        .settings-section h4 {
            margin: 0 0 16px 0;
            padding-bottom: 8px;
            color: #63b3ed;
            font-size: 16px;
            font-weight: 600;
            border-bottom: 1px solid #2a2a2a;
        }

        /* Labels e Inputs de Rádio (Estilizados) */
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
        .settings-section input[type="radio"] {
            margin-right: 12px;
            accent-color: #3182ce;
            transform: scale(1.2);
        }

        /* Rodapé do Painel */
        #log-viewer-footer {
            padding: 16px 20px;
            background: #1a1a1a;
            border-top: 1px solid #2a2a2a;
            text-align: right;
            display: flex;
            gap: 12px;
            justify-content: flex-end;
        }
        #log-viewer-footer button {
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 500;
            font-size: 14px;
            transition: all 0.2s ease;
        }
        #clear-logs-btn {
            background: #e53e3e;
            color: white;
        }
        #clear-logs-btn:hover {
            background: #c53030;
        }
        #refresh-logs-btn {
            background: #3182ce;
            color: white;
        }
        #refresh-logs-btn:hover {
            background: #2c5aa0;
        }
        #save-settings-btn {
            background: #38a169;
            color: white;
        }
        #save-settings-btn:hover {
            background: #2f855a;
        }

        /* Barra de Rolagem Personalizada (Refinada e Garantida) */
        #log-viewer-content::-webkit-scrollbar {
            width: 6px;
            height: 6px;
        }
        #log-viewer-content::-webkit-scrollbar-track {
            background: transparent;
            border-radius: 10px;
        }
        #log-viewer-content::-webkit-scrollbar-thumb {
            background-color: #555;
            border-radius: 10px;
            border: 2px solid transparent;
            background-clip: content-box;
        }
        #log-viewer-content::-webkit-scrollbar-thumb:hover {
            background-color: #777;
        }

        /* Estilos para Firefox */
        #log-viewer-content {
            scrollbar-width: thin;
            scrollbar-color: #555 transparent;
        }
    `;

    // --- FUNÇÕES DE LOG ---
    function getFormattedTimestamp() {
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        return `[${day}/${month}/${year} ${hours}:${minutes}]`;
    }

    function log(message) {
        const timestampedMessage = `${getFormattedTimestamp()} ${message}`;
        console.log(timestampedMessage);
        try {
            const logs = JSON.parse(localStorage.getItem(LOG_STORAGE_KEY)) || [];
            logs.push(timestampedMessage);
            localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logs));
        } catch (e) { console.error("Erro ao salvar logs:", e); }
    }

    // --- FUNÇÃO PARA MODAL PERSONALIZADO ---
    function showCustomModal(message, duration = 3000) {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 100000;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            background: linear-gradient(145deg, #1e1e1e, #151515);
            color: #e0e0e0;
            padding: 24px 32px;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
            text-align: center;
            font-family: system-ui, sans-serif;
            font-size: 16px;
            font-weight: 500;
            letter-spacing: -0.3px;
            opacity: 0;
            transform: translateY(20px);
            transition: all 0.3s ease;
        `;

        modal.textContent = message;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        setTimeout(() => {
            overlay.style.opacity = '1';
            modal.style.opacity = '1';
            modal.style.transform = 'translateY(0)';
        }, 10);

        setTimeout(() => {
            overlay.style.opacity = '0';
            modal.style.opacity = '0';
            modal.style.transform = 'translateY(20px)';
            setTimeout(() => {
                if (overlay.parentNode) {
                    document.body.removeChild(overlay);
                }
            }, 300);
        }, duration);
    }

    // --- FUNÇÃO PARA MODAL DE CONFIRMAÇÃO ---
    function showConfirmModal(message, onConfirm, onCancel = () => {}) {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 100001;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            background: linear-gradient(145deg, #1e1e1e, #151515);
            color: #e0e0e0;
            padding: 32px;
            border-radius: 16px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
            text-align: center;
            font-family: system-ui, sans-serif;
            font-size: 16px;
            font-weight: 500;
            letter-spacing: -0.3px;
            opacity: 0;
            transform: translateY(20px);
            transition: all 0.3s ease;
            min-width: 300px;
        `;

        const messageEl = document.createElement('p');
        messageEl.textContent = message;
        messageEl.style.margin = '0 0 24px 0';

        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            display: flex;
            gap: 16px;
            justify-content: center;
        `;

        const btnSim = document.createElement('button');
        btnSim.textContent = 'Sim';
        btnSim.style.cssText = `
            background: #38a169;
            color: white;
            border: none;
            padding: 10px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s ease;
        `;
        btnSim.onclick = () => {
            onConfirm();
            closeModal();
        };

        const btnNao = document.createElement('button');
        btnNao.textContent = 'Não';
        btnNao.style.cssText = `
            background: #e53e3e;
            color: white;
            border: none;
            padding: 10px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s ease;
        `;
        btnNao.onclick = () => {
            onCancel();
            closeModal();
        };

        buttonContainer.appendChild(btnSim);
        buttonContainer.appendChild(btnNao);
        modal.appendChild(messageEl);
        modal.appendChild(buttonContainer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        function closeModal() {
            overlay.style.opacity = '0';
            modal.style.opacity = '0';
            modal.style.transform = 'translateY(20px)';
            setTimeout(() => {
                if (overlay.parentNode) {
                    document.body.removeChild(overlay);
                }
            }, 300);
        }

        setTimeout(() => {
            overlay.style.opacity = '1';
            modal.style.opacity = '1';
            modal.style.transform = 'translateY(0)';
        }, 10);
    }

    // --- LÓGICA DO PAINEL DE CONTROLE ---
    function createLogViewer() {
        const styleSheet = document.createElement("style");
        styleSheet.innerText = logViewerStyles;
        document.head.appendChild(styleSheet);
        const viewer = document.createElement('div');
        viewer.id = 'log-viewer-container';
        viewer.innerHTML = `
            <div id="log-viewer-header"><span>Painel de Controle</span><button id="close-log-viewer">Fechar</button></div>
            <div class="log-viewer-tabs">
                <button class="tab-button active" data-tab="logs">Logs</button>
                <button class="tab-button" data-tab="settings">Configurações</button>
            </div>
            <div id="logs" class="tab-content active">
                <div id="log-viewer-content"></div>
                <div id="log-viewer-footer">
                    <button id="refresh-logs-btn">Atualizar Logs</button>
                    <button id="clear-logs-btn">Limpar Logs</button>
                </div>
            </div>
            <div id="settings" class="tab-content">
                <div class="settings-section" style="flex-grow:1; overflow-y:auto;">
                    <h4>Modo de Notificação</h4>
                    <label><input type="radio" name="notificationMode" value="unanswered"> Notificar apenas se houver em "Não respondidas"</label>
                    <label><input type="radio" name="notificationMode" value="all"> Notificar sempre que houver em "Suas conversas"</label>
                    <hr style="border-color:#444; margin: 20px 0;">
                    <h4>Intervalo de Verificação</h4>
                    <label><input type="radio" name="notificationInterval" value="0.5"> 30 Segundos</label>
                    <label><input type="radio" name="notificationInterval" value="1"> 1 Minuto</label>
                    <label><input type="radio" name="notificationInterval" value="3"> 3 Minutos</label>
                    <label><input type="radio" name="notificationInterval" value="5"> 5 Minutos</label>
                </div>
                <div id="log-viewer-footer"><button id="save-settings-btn">Salvar e Aplicar</button></div>
            </div>
        `;
        document.body.appendChild(viewer);
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', () => {
                document.querySelectorAll('.tab-button, .tab-content').forEach(el => el.classList.remove('active'));
                button.classList.add('active');
                document.getElementById(button.dataset.tab).classList.add('active');
            });
        });
        document.getElementById('close-log-viewer').onclick = toggleLogViewer;
        document.getElementById('clear-logs-btn').onclick = clearLogs;
        document.getElementById('refresh-logs-btn').onclick = displayLogs;
        document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
        makeDraggable(viewer);
    }
    function toggleLogViewer() { const viewer = document.getElementById('log-viewer-container'); const isVisible = viewer.style.display === 'flex'; if (!isVisible) { displayLogs(); populateSettingsUI(); } viewer.style.display = isVisible ? 'none' : 'flex'; }
    function displayLogs() {
        const contentDiv = document.getElementById('log-viewer-content');
        try {
            const logs = JSON.parse(localStorage.getItem(LOG_STORAGE_KEY)) || [];
            contentDiv.textContent = logs.join('\n');
            // Aguarda um pequeno momento para o DOM ser atualizado
            setTimeout(() => {
                contentDiv.scrollTop = contentDiv.scrollHeight;
            }, 10);
        } catch (e) {
            contentDiv.textContent = 'Erro ao carregar logs.';
        }
    }
    function clearLogs() {
        showConfirmModal(
            "Tem certeza de que deseja limpar todos os logs?",
            () => {
                localStorage.removeItem(LOG_STORAGE_KEY);
                displayLogs();
                log('[LOGS] Logs foram limpos pelo usuário.');
                showCustomModal('Logs limpos com sucesso!', 3000);
            },
            () => {
                log('[LOGS] Ação de limpeza de logs cancelada pelo usuário.');
            }
        );
    }
    function makeDraggable(element) { let p1=0, p2=0, p3=0, p4=0; const h = document.getElementById("log-viewer-header"); if(h){h.onmousedown=dmd;} function dmd(e){e.preventDefault();p3=e.clientX;p4=e.clientY;document.onmouseup=ced;document.onmousemove=ed;} function ed(e){e.preventDefault();p1=p3-e.clientX;p2=p4-e.clientY;p3=e.clientX;p4=e.clientY;element.style.top=(element.offsetTop-p2)+"px";element.style.left=(element.offsetLeft-p1)+"px";} function ced(){document.onmouseup=null;document.onmousemove=null;} }

    // --- LÓGICA DE CONFIGURAÇÕES ---
    function loadSettings() {
        const savedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
        const defaultSettings = { notificationMode: 'unanswered', notificationInterval: 0.5 };
        settings = savedSettings ? JSON.parse(savedSettings) : defaultSettings;
        log('[LOGS] Configurações carregadas.');
    }
    function populateSettingsUI() {
        document.querySelector(`input[name="notificationMode"][value="${settings.notificationMode}"]`).checked = true;
        document.querySelector(`input[name="notificationInterval"][value="${settings.notificationInterval}"]`).checked = true;
    }
    function saveSettings() {
        settings.notificationMode = document.querySelector('input[name="notificationMode"]:checked').value;
        settings.notificationInterval = parseFloat(document.querySelector('input[name="notificationInterval"]:checked').value);
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));

        const modeText = settings.notificationMode === 'unanswered' ? 'somente "Não respondidas"' : 'somente "Suas conversas"';
        log(`[LOGS] Configurações salvas! Modo: ${modeText}, Intervalo: ${settings.notificationInterval} min.`);

        startPeriodicNotification();
        showCustomModal('Configurações salvas e aplicadas!', 3000); // EXATAMENTE 3 SEGUNDOS
    }

    // --- LÓGICA PRINCIPAL DO SCRIPT ---
    function requestNotificationPermission() { if (Notification.permission !== 'granted' && Notification.permission !== 'denied') { Notification.requestPermission().then(p => log(`[LOGS] Permissão: ${p}`)); } }

    function showNotification(count, sectionName) {
        if (Notification.permission === 'granted') {
            new Notification(`Octadesk - Atendimento Pendente!`, {
                body: `Existem ${count} conversa(s) em "${sectionName}"!`,
                icon: 'https://www.octadesk.com/favicon.ico    ',
                tag: 'octadesk-notifier-tag',
                renotify: true
            });
            log(`[LOGS] Notificação enviada para ${count} em "${sectionName}".`);
        }
    }

    function clickRefreshButton() { const btn = document.querySelector("button[aria-label='refresh']"); if (btn) { log('[LOGS] Clicando em Atualizar...'); btn.click(); } }

    // ########## FUNÇÃO CORRIGIDA ##########
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
    // #####################################

    function checkTicketCount(source, sectionName) { const el = findTicketElement(sectionName); if (el) { const count = parseInt(el.textContent.trim(), 10); return { element: el, count: isNaN(count) ? 0 : count }; } return null; }

    function runNotificationCheck() {
        // Evita execução simultânea
        if (isChecking) {
            log('[LOGS] Verificação ignorada (já em execução).');
            return;
        }

        isChecking = true;
        log('[LOGS] Ciclo periódico iniciado.');

        clickRefreshButton();
        setTimeout(() => {
            const modeText = settings.notificationMode === 'unanswered' ? 'somente "Não respondidas"' : 'somente "Suas conversas"';
            log(`[LOGS] Verificando contadores (Modo: ${modeText})...`);

            if (settings.notificationMode === 'unanswered') {
                const resultSuasConversas = checkTicketCount('periodic', TARGET_SECTION_NAME);
                if (resultSuasConversas && resultSuasConversas.count > 0) {
                    const resultNaoRespondidas = checkTicketCount('periodic', UNANSWERED_SECTION_NAME);
                    if (resultNaoRespondidas && resultNaoRespondidas.count > 0) {
                        showNotification(resultNaoRespondidas.count, UNANSWERED_SECTION_NAME);
                    } else {
                        log('[LOGS] 0 conversas encontradas em "Não respondidas". Nenhuma ação necessária.');
                    }
                } else {
                    log('[LOGS] 0 conversas encontradas em "Suas conversas". Nenhuma ação necessária.');
                }
            } else {
                const result = checkTicketCount('periodic', TARGET_SECTION_NAME);
                if (result && result.count > 0) {
                    showNotification(result.count, TARGET_SECTION_NAME);
                } else {
                    log('[LOGS] 0 conversas encontradas em "Suas conversas". Nenhuma ação necessária.');
                }
            }

            // Libera o bloqueio após a verificação
            isChecking = false;
        }, 1500);
    }

    function startPeriodicNotification() {
        // Limpa qualquer timer existente, independentemente do estado
        if (notificationIntervalId) {
            clearInterval(notificationIntervalId);
            log('[LOGS] Timer anterior limpo com sucesso.');
        } else {
            log('[LOGS] Nenhum timer anterior ativo.');
        }

        // Zera o ID antes de criar um novo
        notificationIntervalId = null;

        const intervalMs = settings.notificationInterval * 60 * 1000;
        runNotificationCheck(); // Executa imediatamente a primeira verificação
        notificationIntervalId = setInterval(runNotificationCheck, intervalMs);

        log(`[LOGS] Timer de notificação (re)iniciado com intervalo de ${settings.notificationInterval} minuto(s).`);
    }

    function startMonitoring() {
        // Verificação dupla: variável global + propriedade window
        if (window.octadeskNotifierStarted) {
            log('[LOGS] Script já foi iniciado. Ignorando nova tentativa.');
            return;
        }

        window.octadeskNotifierStarted = true;
        loadSettings();
        createLogViewer();
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.code === 'KeyL') {
                e.preventDefault();
                toggleLogViewer();
            }
        });
        log("[LOGS] Monitoramento iniciado. Pressione Ctrl+Shift+L para ver o painel.");
        requestNotificationPermission();
        startPeriodicNotification();
    }

    if (window.top === window.self) {
        window.addEventListener('load', function() {
            // Verifica novamente dentro do evento load
            if (!window.octadeskNotifierStarted) {
                startMonitoring();
            } else {
                log('[LOGS] Tentativa de inicialização bloqueada (já iniciado).');
            }
        }, false);
    }
})();