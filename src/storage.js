const isExtension = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

// Track keys written by this window to ignore our own onChanged events
const pendingWrites = new Set();

export function wasLocalWrite(key) {
  if (pendingWrites.has(key)) {
    pendingWrites.delete(key);
    return true;
  }
  return false;
}

export const storage = {
  async get(key) {
    if (isExtension) {
      return new Promise((resolve) => {
        chrome.storage.local.get(key, (result) => resolve(result[key] ?? null));
      });
    }
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  },

  async set(key, value) {
    if (isExtension) {
      pendingWrites.add(key);
      return new Promise((resolve) => {
        chrome.storage.local.set({ [key]: value }, resolve);
      });
    }
    localStorage.setItem(key, JSON.stringify(value));
  },

  async remove(key) {
    if (isExtension) {
      pendingWrites.add(key);
      return new Promise((resolve) => {
        chrome.storage.local.remove(key, resolve);
      });
    }
    localStorage.removeItem(key);
  },
};
