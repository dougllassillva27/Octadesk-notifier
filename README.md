# Octadesk Notifier

**Versão:** 3.11  
**Autor:** Douglas Silva

Uma ferramenta de automação e monitoramento para o Octadesk, projetada para notificar proativamente sobre conversas que exigem atenção. O script é totalmente configurável através de uma interface própria, com design moderno e intuitivo, e mantém um histórico detalhado de suas operações.

---

## Visão Geral

Este UserScript para Tampermonkey foi criado para resolver um desafio comum em plataformas de chat: a necessidade de ser constantemente lembrado de conversas pendentes sem precisar manter a atenção fixa na tela. A ferramenta monitora ativamente a seção de chat do Octadesk, atualiza os dados automaticamente e envia notificações para o desktop do usuário com base em regras personalizáveis, garantindo que nenhuma conversa importante seja esquecida.

Além do sistema de notificação, o script conta com um **painel de controle redesenhado**, com visual dark e clean, que permite ao usuário visualizar um log de todas as ações e configurar o comportamento da ferramenta de forma elegante e eficiente.

img/Painel de Controle - Logs.png
img/Painel de Controle - Configurações.png

## Funcionalidades Principais

- **Notificações Persistentes e Inteligentes:** Alerta o usuário sobre conversas pendentes em intervalos regulares, garantindo que os avisos sejam vistos.
- **Dois Modos de Notificação:**
  1.  **Modo Condicional (Padrão):** Notifica apenas se houver conversas na fila principal E também na seção "Não respondidas".
  2.  **Modo Geral:** Notifica sempre que houver qualquer conversa na fila principal ("Suas conversas").
- **Intervalos Configuráveis:** O usuário pode escolher a frequência das verificações, com opções de **30 segundos, 1, 3 ou 5 minutos**.
- **Atualização Automática:** O script clica proativamente no botão "Atualizar" da interface do Octadesk antes de cada verificação, garantindo que os dados de contagem estejam sempre corretos.
- **Painel de Controle Modernizado:**
  - Acessível pelo atalho **`Ctrl+Shift+L`**.
  - **Aba de Logs:** Exibe um histórico detalhado e com timestamp de todas as ações executadas pelo script. A rolagem é automática, sempre levando ao final para mostrar as entradas mais recentes.
  - **Aba de Configurações:** Interface amigável e visualmente integrada para personalizar o modo de notificação e o intervalo.
  - **Painel Centralizado e Arrastável:** Abre no centro da tela e pode ser movido livremente.
  - **Limpeza de Logs com Confirmação por Modal:** Um botão para limpar o histórico, com confirmação via modal personalizado (sem alertas nativos).
- **Modais Personalizados:** Todas as mensagens de feedback (salvar configurações, limpar logs) são exibidas em modais elegantes, com auto-fechamento após 3 segundos.
- **Persistência de Dados:** Todas as configurações escolhidas pelo usuário são salvas no `localStorage` do navegador, mantendo suas preferências mesmo após fechar ou recarregar a página.
- **Escopo Otimizado:** O script é executado exclusivamente na página de chat do Octadesk, garantindo eficiência e não consumindo recursos em outras áreas do site.
- **Proteção contra Execução Múltipla:** Mecanismos robustos garantem que apenas um único timer esteja ativo, evitando notificações duplicadas ou comportamentos erráticos.

## Como Usar

### Requisitos

1.  Um navegador moderno como **Google Chrome** ou **Mozilla Firefox**.
2.  A extensão **Tampermonkey** instalada no navegador.

### Instalação

1.  Abra o painel do **Tampermonkey** no seu navegador e clique em **"Criar um novo script..."**.
2.  Apague todo o conteúdo padrão que aparece na tela de edição.
3.  Copie o código completo do arquivo `Octadesk Notifier-3.11.user.js`.
4.  Cole o código na tela de edição do Tampermonkey.
5.  Salve o script clicando em **Arquivo > Salvar**.
6.  Certifique-se de que o script está **ativado** no painel do Tampermonkey.

### Utilização Diária

1.  **Funcionamento Automático:** Com o script instalado e ativado, basta manter a página de chat do Octadesk (`https://app.octadesk.com/chat/`) aberta em uma aba do navegador. O script fará todo o trabalho de monitoramento e notificação em segundo plano.
2.  **Acessando o Painel de Controle:** A qualquer momento, pressione o atalho **`Ctrl+Shift+L`** para abrir o painel de controle. Com ele, você pode:
    - Verificar o histórico de ações na aba **Logs** (rolagem automática para o final).
    - Mudar o comportamento do script na aba **Configurações**.
3.  **Configurando o Script:**
    - Na aba "Configurações", selecione o "Modo de Notificação" e o "Intervalo de Verificação" de sua preferência.
    - Clique no botão **"Salvar e Aplicar"**. Um **modal elegante** confirmará que as novas configurações foram salvas e já estão em vigor.
4.  **Limpando os Logs:**
    - Na aba "Logs", clique em **"Limpar Logs"**.
    - Um **modal de confirmação** aparecerá. Clique em **"Sim"** para confirmar a ação.

## Solução de Problemas (Troubleshooting)

- **As notificações não aparecem na tela:**
  - Verifique se o seu sistema operacional (Windows ou macOS) não está com o modo "Não Incomodar" ou "Assistente de Foco" ativado, pois isso pode suprimir as notificações.
  - Na primeira vez que o script roda, o navegador pode pedir permissão para exibir notificações. Certifique-se de que você permitiu.
- **O painel não abre com `Ctrl+Shift+L`:**
  - Verifique se o script está realmente ativado no painel do Tampermonkey.
  - Recarregue a página do Octadesk (`Ctrl+F5`).
  - Verifique o console do desenvolvedor (F12) por possíveis mensagens de erro em vermelho.
- **Notificações estão duplicando ou com intervalos irregulares:**
  - Recarregue a página. A versão 3.11 inclui proteções contra múltiplos timers, mas um recarrego garante um estado limpo.
