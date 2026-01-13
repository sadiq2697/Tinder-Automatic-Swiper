// Track debugger attachment state per tab
const debuggerAttached = new Map();

chrome.storage.onChanged.addListener((changes, namespace) => {
  for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
    console.log(`Storage key "${key}" changed: ${oldValue} -> ${newValue}`);
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'debuggerClick') {
    handleDebuggerClick(sender.tab.id, message.x, message.y)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }

  if (message.action === 'attachDebugger') {
    attachDebugger(sender.tab.id)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'detachDebugger') {
    detachDebugger(sender.tab.id)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function attachDebugger(tabId) {
  if (debuggerAttached.get(tabId)) {
    console.log(`Debugger already attached to tab ${tabId}`);
    return;
  }

  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    debuggerAttached.set(tabId, true);
    console.log(`Debugger attached to tab ${tabId}`);
  } catch (err) {
    console.error(`Failed to attach debugger: ${err.message}`);
    throw err;
  }
}

async function detachDebugger(tabId) {
  if (!debuggerAttached.get(tabId)) {
    return;
  }

  try {
    await chrome.debugger.detach({ tabId });
    debuggerAttached.set(tabId, false);
    console.log(`Debugger detached from tab ${tabId}`);
  } catch (err) {
    console.error(`Failed to detach debugger: ${err.message}`);
  }
}

async function handleDebuggerClick(tabId, x, y) {
  // Ensure debugger is attached
  if (!debuggerAttached.get(tabId)) {
    await attachDebugger(tabId);
  }

  try {
    // Send mouse pressed event
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: x,
      y: y,
      button: 'left',
      clickCount: 1
    });

    // Small delay
    await new Promise(r => setTimeout(r, 50));

    // Send mouse released event
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: x,
      y: y,
      button: 'left',
      clickCount: 1
    });

    console.log(`Debugger click sent at (${x}, ${y})`);
  } catch (err) {
    console.error(`Debugger click failed: ${err.message}`);
    throw err;
  }
}

// Clean up debugger when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (debuggerAttached.get(tabId)) {
    debuggerAttached.delete(tabId);
  }
});

// Handle debugger detach events
chrome.debugger.onDetach.addListener((source, reason) => {
  debuggerAttached.set(source.tabId, false);
  console.log(`Debugger detached from tab ${source.tabId}: ${reason}`);
});
