import { marked } from 'marked';
import {
  getAllNotes,
  getActiveNoteId,
  setActiveNoteId,
  createNote,
  updateNote,
  deleteNote,
  duplicateNote,
  togglePin,
  sortNotes,
  searchNotes,
  extractPreview,
  formatDate,
} from './notes.js';
import {
  setContent,
  setContentWithImages,
  focusEditor,
  getMarkdown,
  getMarkdownForStorage,
  getEditor,
  toggleBold,
  toggleItalic,
  toggleUnderline,
  toggleStrike,
  toggleTaskList,
  toggleCode,
  toggleLink,
} from './editor.js';
import { exportCurrentNote } from './export.js';
import { storage } from './storage.js';
import { runInlineAction, streamChat, getNoteContext, AI_MODELS, getSelectedModel, setSelectedModel, exportChatAsMarkdown } from './ai.js';

marked.setOptions({ breaks: true, gfm: true });

const SCROLL_KEY = 'sidebar_scroll_positions';
let currentNoteId = null;
let isListOpen = false;
let scrollSaveTimer = null;

// Debounce auto-save
let saveTimer = null;
function debounceSave(content) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    if (currentNoteId) {
      await updateNote(currentNoteId, { content });
      saveScrollPosition();
    }
  }, 400);
}

// Scroll position persistence
async function getScrollPositions() {
  return (await storage.get(SCROLL_KEY)) || {};
}

async function saveScrollPosition() {
  if (!currentNoteId) return;
  const container = document.getElementById('editor-container');
  if (!container) return;
  const positions = await getScrollPositions();
  positions[currentNoteId] = container.scrollTop;
  await storage.set(SCROLL_KEY, positions);
}

async function restoreScrollPosition(noteId) {
  const positions = await getScrollPositions();
  const scrollTop = positions[noteId] || 0;
  const container = document.getElementById('editor-container');
  if (container) {
    // Delay to let editor render first
    requestAnimationFrame(() => {
      container.scrollTop = scrollTop;
    });
  }
}

function setupScrollPersistence() {
  const container = document.getElementById('editor-container');
  container.addEventListener('scroll', () => {
    clearTimeout(scrollSaveTimer);
    scrollSaveTimer = setTimeout(() => saveScrollPosition(), 300);
  });
}

// Title change handler
function setupTitleInput() {
  const titleInput = document.getElementById('note-title');
  let titleTimer = null;
  titleInput.addEventListener('input', () => {
    clearTimeout(titleTimer);
    titleTimer = setTimeout(async () => {
      if (currentNoteId) {
        await updateNote(currentNoteId, { title: titleInput.value });
      }
    }, 400);
  });
  titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      focusEditor();
    }
  });
}

// Note list rendering
async function renderNoteList(query = '') {
  const noteList = document.getElementById('note-list');
  const emptyState = document.getElementById('note-list-empty');
  let notes = await getAllNotes();

  if (query) {
    notes = searchNotes(notes, query);
  }
  notes = sortNotes(notes);

  if (notes.length === 0 && !query) {
    noteList.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  noteList.classList.remove('hidden');

  noteList.innerHTML = notes
    .map(
      (note) => `
    <div class="note-item ${note.id === currentNoteId ? 'active' : ''}" data-id="${note.id}">
      <div class="note-item-content">
        ${note.pinned ? '<span class="pin-indicator">📌</span>' : ''}
        <div class="note-item-title">${escapeHtml(note.title || 'Untitled')}</div>
        <div class="note-item-preview">${escapeHtml(extractPreview(note.content))}</div>
      </div>
      <div class="note-item-date">${formatDate(note.updatedAt)}</div>
    </div>
  `
    )
    .join('');

  // Attach click handlers
  noteList.querySelectorAll('.note-item').forEach((el) => {
    el.addEventListener('click', () => loadNote(el.dataset.id));
  });
}

// Load a note into the editor
async function loadNote(id) {
  const notes = await getAllNotes();
  const note = notes.find((n) => n.id === id);
  if (!note) return;

  currentNoteId = note.id;
  await setActiveNoteId(note.id);

  const titleInput = document.getElementById('note-title');
  titleInput.value = note.title || '';
  await setContentWithImages(note.content || '');
  updatePinButton(note.pinned);
  closeNoteList();
  focusEditor();
  await restoreScrollPosition(note.id);
}

// Open / close note list
function openNoteList() {
  const panel = document.getElementById('note-list-panel');
  panel.classList.remove('panel-hidden');
  isListOpen = true;
  renderNoteList();
}

function closeNoteList() {
  const panel = document.getElementById('note-list-panel');
  panel.classList.add('panel-hidden');
  isListOpen = false;
  const searchBar = document.getElementById('search-bar');
  const searchInput = document.getElementById('search-input');
  searchBar.classList.add('hidden');
  searchInput.value = '';
}

function toggleNoteList() {
  if (isListOpen) closeNoteList();
  else openNoteList();
}

// New note
async function handleNewNote() {
  const note = await createNote();
  currentNoteId = note.id;
  const titleInput = document.getElementById('note-title');
  titleInput.value = note.title || '';
  setContent('');
  updatePinButton(false);
  closeNoteList();
  titleInput.focus();
}

// Delete current note
async function handleDeleteNote() {
  if (!currentNoteId) return;
  const notes = await deleteNote(currentNoteId);
  closeDropdown();

  if (notes.length > 0) {
    const sorted = sortNotes(notes);
    await loadNote(sorted[0].id);
  } else {
    await handleNewNote();
  }
}

// Duplicate current note
async function handleDuplicate() {
  if (!currentNoteId) return;
  const note = await duplicateNote(currentNoteId);
  if (note) {
    currentNoteId = note.id;
    const titleInput = document.getElementById('note-title');
    titleInput.value = note.title || '';
    await setContentWithImages(note.content || '');
    updatePinButton(note.pinned);
  }
  closeDropdown();
}

// Pin/unpin
async function handleTogglePin() {
  if (!currentNoteId) return;
  const note = await togglePin(currentNoteId);
  if (note) updatePinButton(note.pinned);
  closeDropdown();
}

function updatePinButton(pinned) {
  const btn = document.getElementById('btn-pin');
  const span = btn.querySelector('span');
  span.textContent = pinned ? 'Unpin note' : 'Pin note';
}

// Export
function handleExport() {
  const title = document.getElementById('note-title').value;
  exportCurrentNote(title);
}

async function handleCopyMarkdown() {
  const content = getMarkdown();
  const btn = document.getElementById('btn-copy');
  const originalTitle = btn.title;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(content);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = content;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    btn.title = 'Copied';
  } catch (error) {
    console.error('Failed to copy markdown:', error);
    btn.title = 'Copy failed';
  } finally {
    closeDropdown();
    setTimeout(() => {
      btn.title = originalTitle;
    }, 1200);
  }
}

// Search
function setupSearch() {
  const btnSearch = document.getElementById('btn-search');
  const searchBar = document.getElementById('search-bar');
  const searchInput = document.getElementById('search-input');

  btnSearch.addEventListener('click', () => {
    searchBar.classList.toggle('hidden');
    if (!searchBar.classList.contains('hidden')) {
      searchInput.focus();
    }
  });

  let searchTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      renderNoteList(searchInput.value);
    }, 200);
  });
}

// Dropdown menu
function toggleDropdown() {
  const dropdown = document.getElementById('dropdown-more');
  dropdown.classList.toggle('hidden');
}

function closeDropdown() {
  document.getElementById('dropdown-more').classList.add('hidden');
}

// Floating format toolbar
function setupFormatToolbar() {
  const toolbar = document.getElementById('format-toolbar');

  toolbar.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const actions = {
        bold: toggleBold,
        italic: toggleItalic,
        underline: toggleUnderline,
        strike: toggleStrike,
        task: toggleTaskList,
        code: toggleCode,
        link: toggleLink,
      };
      const action = actions[btn.dataset.action];
      if (action) action();
    });
  });

  // AI action buttons
  toolbar.querySelectorAll('button[data-ai-action]').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      runInlineAction(btn.dataset.aiAction);
    });
  });

  // Custom AI prompt toggle & send
  const customRow = toolbar.querySelector('.toolbar-custom-row');
  const customInput = document.getElementById('ai-custom-input');
  const btnCustomToggle = document.getElementById('btn-ai-custom-toggle');
  const btnCustomSend = document.getElementById('btn-ai-custom-send');

  btnCustomToggle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    customRow.classList.toggle('visible');
    if (customRow.classList.contains('visible')) {
      setTimeout(() => customInput.focus(), 0);
    }
  });

  function sendCustomPrompt() {
    const prompt = customInput.value.trim();
    if (!prompt) return;
    runInlineAction('custom', prompt);
    customInput.value = '';
    customRow.classList.remove('visible');
  }

  btnCustomSend.addEventListener('mousedown', (e) => {
    e.preventDefault();
    sendCustomPrompt();
  });

  customInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendCustomPrompt();
    }
    e.stopPropagation();
  });

  // Prevent toolbar from closing when interacting with custom input
  customInput.addEventListener('mousedown', (e) => e.stopPropagation());
  customInput.addEventListener('focus', (e) => e.stopPropagation());
}

function updateFormatToolbar() {
  const toolbar = document.getElementById('format-toolbar');
  const editor = getEditor();
  if (!editor) return;

  const { state } = editor;
  const { from, to } = state.selection;

  if (from === to) {
    toolbar.classList.add('hidden');
    toolbar.querySelector('.toolbar-custom-row')?.classList.remove('visible');
    return;
  }

  // Get viewport-relative coordinates for the selection
  const coords = editor.view.coordsAtPos(from);
  const editorContainer = document.getElementById('editor-container');
  const containerRect = editorContainer.getBoundingClientRect();

  // Only show if selection is within the visible editor area
  if (coords.top < containerRect.top || coords.top > containerRect.bottom) {
    toolbar.classList.add('hidden');
    return;
  }

  toolbar.classList.remove('hidden');
  const toolbarHeight = toolbar.offsetHeight || 36;
  const toolbarWidth = toolbar.offsetWidth || 280;
  const topbarHeight = document.getElementById('topbar').offsetHeight;

  // Position relative to #app (which is at viewport origin)
  let top = coords.top - toolbarHeight - 8;
  // Clamp: don't overlap the topbar
  if (top < topbarHeight + 4) {
    // Show below selection instead
    const coordsEnd = editor.view.coordsAtPos(to);
    top = coordsEnd.bottom + 8;
  }

  let left = coords.left;
  // Clamp horizontally
  left = Math.max(8, Math.min(left, window.innerWidth - toolbarWidth - 8));

  toolbar.style.top = `${top}px`;
  toolbar.style.left = `${left}px`;
}

// AI Chat panel
let isChatOpen = false;
let chatMessages = []; // conversation history
let attachedImage = null; // { dataUrl, file }
let mentionedNotes = []; // notes referenced via @

function setupAIChat() {
  const panel = document.getElementById('ai-chat-panel');
  const btnAi = document.getElementById('btn-ai');
  const btnClose = document.getElementById('btn-ai-close');
  const input = document.getElementById('ai-chat-input');
  const btnSend = document.getElementById('btn-ai-send');
  const messagesEl = document.getElementById('ai-chat-messages');
  const imagePreview = document.getElementById('ai-image-preview');
  const imageThumb = document.getElementById('ai-image-thumb');
  const imageInput = document.getElementById('ai-image-input');
  const mentionDropdown = document.getElementById('ai-mention-dropdown');

  function toggleChatPanel() {
    isChatOpen = !isChatOpen;
    if (isChatOpen) {
      panel.classList.remove('panel-hidden-right');
      input.focus();
    } else {
      panel.classList.add('panel-hidden-right');
    }
  }

  // Populate model selector
  const modelSelect = document.getElementById('ai-model-select');
  AI_MODELS.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.label;
    modelSelect.appendChild(opt);
  });

  // Restore saved model
  const MODEL_KEY = 'sidebar_ai_model';
  storage.get(MODEL_KEY).then((saved) => {
    if (saved && AI_MODELS.some((m) => m.id === saved)) {
      modelSelect.value = saved;
      setSelectedModel(saved);
    }
  });

  modelSelect.addEventListener('change', () => {
    setSelectedModel(modelSelect.value);
    storage.set(MODEL_KEY, modelSelect.value);
  });

  btnAi.addEventListener('click', toggleChatPanel);
  btnClose.addEventListener('click', () => {
    isChatOpen = false;
    panel.classList.add('panel-hidden-right');
  });

  // Clear chat
  document.getElementById('btn-ai-clear').addEventListener('click', () => {
    chatMessages = [];
    messagesEl.innerHTML = '';
  });

  // Export chat
  document.getElementById('btn-ai-export').addEventListener('click', () => {
    if (chatMessages.length === 0) return;
    const md = exportChatAsMarkdown(chatMessages);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chat-export.md';
    a.click();
    URL.revokeObjectURL(url);
  });

  // --- Textarea auto-grow ---
  function autoGrow() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 96) + 'px';
  }
  input.addEventListener('input', autoGrow);

  // --- Image attach ---
  function attachImageFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      attachedImage = { dataUrl: reader.result, file };
      imageThumb.src = reader.result;
      imagePreview.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  }

  document.getElementById('btn-ai-attach').addEventListener('click', () => {
    imageInput.click();
  });

  imageInput.addEventListener('change', () => {
    if (imageInput.files[0]) attachImageFile(imageInput.files[0]);
    imageInput.value = '';
  });

  document.getElementById('btn-ai-image-remove').addEventListener('click', () => {
    attachedImage = null;
    imagePreview.classList.add('hidden');
    imageThumb.src = '';
  });

  // Paste image support
  input.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        attachImageFile(item.getAsFile());
        return;
      }
    }
  });

  // --- @-mention notes ---
  let mentionActive = false;
  let mentionStart = -1;

  function closeMentionDropdown() {
    mentionActive = false;
    mentionStart = -1;
    mentionDropdown.classList.add('hidden');
    mentionDropdown.innerHTML = '';
  }

  async function showMentionDropdown(query) {
    const notes = await getAllNotes();
    const q = query.toLowerCase();
    const filtered = notes.filter(n => n.title && n.title.toLowerCase().includes(q)).slice(0, 6);

    if (filtered.length === 0) {
      closeMentionDropdown();
      return;
    }

    mentionDropdown.innerHTML = filtered.map(n =>
      `<div class="ai-mention-item" data-id="${n.id}" data-title="${escapeHtml(n.title)}">${escapeHtml(n.title)}</div>`
    ).join('');
    mentionDropdown.classList.remove('hidden');

    mentionDropdown.querySelectorAll('.ai-mention-item').forEach(el => {
      el.addEventListener('click', () => {
        const title = el.dataset.title;
        const id = el.dataset.id;
        // Replace @query with @Title
        const before = input.value.slice(0, mentionStart);
        const after = input.value.slice(input.selectionStart);
        input.value = before + '@' + title + ' ' + after;
        mentionedNotes.push({ id, title });
        closeMentionDropdown();
        input.focus();
        autoGrow();
      });
    });
  }

  input.addEventListener('input', () => {
    const val = input.value;
    const cursor = input.selectionStart;

    // Check if we're in a @-mention
    const textBefore = val.slice(0, cursor);
    const atIdx = textBefore.lastIndexOf('@');

    if (atIdx !== -1 && (atIdx === 0 || textBefore[atIdx - 1] === ' ' || textBefore[atIdx - 1] === '\n')) {
      const query = textBefore.slice(atIdx + 1);
      if (!query.includes(' ') && !query.includes('\n')) {
        mentionActive = true;
        mentionStart = atIdx;
        showMentionDropdown(query);
        return;
      }
    }

    if (mentionActive) closeMentionDropdown();
  });

  // --- Message rendering helpers ---
  function appendUserMessage(text, imageDataUrl) {
    const div = document.createElement('div');
    div.className = 'ai-msg user';
    if (imageDataUrl) {
      const img = document.createElement('img');
      img.src = imageDataUrl;
      img.className = 'ai-msg-image';
      div.appendChild(img);
    }
    const textNode = document.createElement('span');
    textNode.textContent = text;
    div.appendChild(textNode);
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function appendAssistantMessage() {
    const wrapper = document.createElement('div');
    wrapper.className = 'ai-msg-wrapper';

    const bubble = document.createElement('div');
    bubble.className = 'ai-msg assistant';

    // Typing indicator
    const typing = document.createElement('div');
    typing.className = 'ai-typing-indicator';
    typing.innerHTML = '<span></span><span></span><span></span>';
    bubble.appendChild(typing);

    const actions = document.createElement('div');
    actions.className = 'ai-msg-actions';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'ai-msg-copy';
    copyBtn.title = 'Copy';
    copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="9" height="9" rx="1.4"/><path d="M6 6h9v9H6z"/></svg>`;
    actions.appendChild(copyBtn);

    wrapper.appendChild(bubble);
    wrapper.appendChild(actions);
    messagesEl.appendChild(wrapper);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // Copy handler
    copyBtn.addEventListener('click', async () => {
      const text = bubble.textContent;
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.innerHTML = '<span style="font-size:11px">Copied!</span>';
        setTimeout(() => {
          copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="9" height="9" rx="1.4"/><path d="M6 6h9v9H6z"/></svg>`;
        }, 1500);
      } catch { /* ignore */ }
    });

    return { bubble, typing };
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text && !attachedImage) return;
    input.value = '';
    input.style.height = 'auto';

    // Build user message content
    let userContent;
    const imageDataUrl = attachedImage?.dataUrl;
    if (attachedImage) {
      userContent = [
        { type: 'text', text: text || 'What is this image?' },
        { type: 'image_url', image_url: { url: attachedImage.dataUrl } },
      ];
      attachedImage = null;
      imagePreview.classList.add('hidden');
      imageThumb.src = '';
    } else {
      userContent = text;
    }

    appendUserMessage(text, imageDataUrl);
    chatMessages.push({ role: 'user', content: userContent });

    // Build system message with note context + mentioned notes
    const noteContent = getNoteContext();
    let systemContent = `You are a helpful writing assistant. The user is working on a note. Here is the current note content:\n\n${noteContent}`;

    if (mentionedNotes.length > 0) {
      const allNotes = await getAllNotes();
      for (const ref of mentionedNotes) {
        const refNote = allNotes.find(n => n.id === ref.id);
        if (refNote) {
          systemContent += `\n\n--- Referenced note: "${refNote.title}" ---\n${refNote.content || '(empty)'}`;
        }
      }
      mentionedNotes = [];
    }

    systemContent += '\n\nAnswer questions and help with the note. Be concise.';
    const systemMsg = { role: 'system', content: systemContent };

    const { bubble, typing } = appendAssistantMessage();
    let fullText = '';
    let firstToken = true;

    let renderTimer = null;
    streamChat([systemMsg, ...chatMessages], {
      onToken(token) {
        if (firstToken) {
          typing.remove();
          firstToken = false;
        }
        fullText += token;
        // Throttle markdown rendering to avoid jank during fast streaming
        if (!renderTimer) {
          renderTimer = setTimeout(() => {
            bubble.innerHTML = marked.parse(fullText);
            messagesEl.scrollTop = messagesEl.scrollHeight;
            renderTimer = null;
          }, 50);
        }
      },
      onDone() {
        if (firstToken) typing.remove();
        clearTimeout(renderTimer);
        bubble.innerHTML = marked.parse(fullText);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        chatMessages.push({ role: 'assistant', content: fullText });
      },
      onError(err) {
        typing.remove();
        bubble.textContent = 'Error: ' + err.message;
      },
    });
  }

  btnSend.addEventListener('click', sendMessage);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

// Escape HTML
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Initialize UI bindings
export function initUI(onContentChange) {
  // Menu
  document.getElementById('btn-menu').addEventListener('click', toggleNoteList);
  document.getElementById('btn-back').addEventListener('click', closeNoteList);

  // New note
  document.getElementById('btn-new-note').addEventListener('click', handleNewNote);
  document.getElementById('btn-new-note-empty')?.addEventListener('click', handleNewNote);

  // Actions
  document.getElementById('btn-export').addEventListener('click', handleExport);
  document.getElementById('btn-more').addEventListener('click', toggleDropdown);
  document.getElementById('btn-pin').addEventListener('click', handleTogglePin);
  document.getElementById('btn-duplicate').addEventListener('click', handleDuplicate);
  document.getElementById('btn-copy').addEventListener('click', handleCopyMarkdown);
  document.getElementById('btn-delete').addEventListener('click', handleDeleteNote);

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('dropdown-more');
    const btnMore = document.getElementById('btn-more');
    if (!dropdown.contains(e.target) && !btnMore.contains(e.target)) {
      closeDropdown();
    }
  });

  setupTitleInput();
  setupSearch();
  setupFormatToolbar();
  setupAIChat();
  setupScrollPersistence();

  return { debounceSave, loadNote, handleNewNote, updateFormatToolbar };
}

// Load initial note or create first one
export async function loadInitialNote() {
  const notes = await getAllNotes();
  const activeId = await getActiveNoteId();

  if (notes.length === 0) {
    await handleNewNote();
    return;
  }

  const target = activeId && notes.find((n) => n.id === activeId) ? activeId : sortNotes(notes)[0].id;
  await loadNote(target);
}
