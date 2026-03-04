import { createEditor } from './editor.js';
import { initTheme, toggleTheme } from './theme.js';
import { initUI, loadInitialNote } from './ui.js';
import { initChat, activateTerminal } from './chat.js';

function setupViewTabs() {
  const tabs = document.querySelectorAll('#view-tabs button');
  const notesEls = [document.getElementById('topbar'), document.getElementById('editor-container'), document.getElementById('note-list-panel')];
  const chatContainer = document.getElementById('chat-container');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      const view = tab.dataset.view;
      if (view === 'terminal') {
        notesEls.forEach((el) => el.style.display = 'none');
        chatContainer.classList.add('active');
        activateTerminal();
      } else {
        chatContainer.classList.remove('active');
        document.getElementById('topbar').style.display = '';
        document.getElementById('editor-container').style.display = '';
      }
    });
  });
}

async function init() {
  await initTheme();

  const { debounceSave, updateFormatToolbar } = initUI();

  const editorEl = document.getElementById('editor');
  const editor = createEditor(editorEl, (content) => {
    debounceSave(content);
  });

  editor.on('selectionUpdate', () => updateFormatToolbar());
  editor.on('blur', () => {
    setTimeout(() => {
      document.getElementById('format-toolbar').classList.add('hidden');
    }, 200);
  });

  document.getElementById('btn-theme').addEventListener('click', toggleTheme);

  await loadInitialNote();

  initChat();
  setupViewTabs();
}

document.addEventListener('DOMContentLoaded', init);
