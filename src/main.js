import { createEditor } from './editor.js';
import { initTheme, applyTheme, toggleTheme } from './theme.js';
import { initUI, loadInitialNote } from './ui.js';
import { initChat, activateTerminal } from './chat.js';
import { initSync } from './sync.js';
import { setSelectedModel, AI_MODELS } from './ai.js';

const VIEW_KEY = 'sidebar_active_view';

function switchToView(view) {
  const tabs = document.querySelectorAll('#view-tabs button');
  const chatContainer = document.getElementById('chat-container');

  tabs.forEach((t) => t.classList.toggle('active', t.dataset.view === view));

  if (view === 'terminal') {
    document.getElementById('topbar').style.display = 'none';
    document.getElementById('editor-container').style.display = 'none';
    // Hide the note-list-panel visually but don't set display:none
    // so it can still be toggled when switching back to notes
    document.getElementById('note-list-panel').style.visibility = 'hidden';
    chatContainer.classList.add('active');
    activateTerminal();
  } else {
    chatContainer.classList.remove('active');
    document.getElementById('topbar').style.display = '';
    document.getElementById('editor-container').style.display = '';
    document.getElementById('note-list-panel').style.visibility = '';
  }

  chrome.storage.local.set({ [VIEW_KEY]: view });
}

function setupViewTabs() {
  const tabs = document.querySelectorAll('#view-tabs button');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      switchToView(tab.dataset.view);
    });
  });

  // Restore last active view
  chrome.storage.local.get(VIEW_KEY, (result) => {
    const savedView = result[VIEW_KEY];
    if (savedView === 'terminal') {
      switchToView('terminal');
    }
  });
}

async function init() {
  await initTheme();

  const { debounceSave, updateFormatToolbar, handleExternalNotesChange } = initUI();

  const editorEl = document.getElementById('editor');
  const editor = createEditor(editorEl, (content) => {
    debounceSave(content);
  });

  editor.on('selectionUpdate', () => updateFormatToolbar());
  editor.on('blur', () => {
    setTimeout(() => {
      const toolbar = document.getElementById('format-toolbar');
      // Don't hide if custom input is focused
      if (toolbar.contains(document.activeElement)) return;
      toolbar.classList.add('hidden');
      toolbar.querySelector('.toolbar-custom-row')?.classList.remove('visible');
    }, 200);
  });

  document.getElementById('btn-theme').addEventListener('click', toggleTheme);

  await loadInitialNote();

  initSync({
    onNotesChanged: handleExternalNotesChange,
    onThemeChanged: (newTheme) => applyTheme(newTheme),
    onModelChanged: (newModel) => {
      if (newModel && AI_MODELS.some((m) => m.id === newModel)) {
        setSelectedModel(newModel);
        const modelSelect = document.getElementById('ai-model-select');
        if (modelSelect) modelSelect.value = newModel;
      }
    },
  });

  initChat();
  setupViewTabs();
}

document.addEventListener('DOMContentLoaded', init);
