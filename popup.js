'use strict';

function loadSignatures() {
  chrome.storage.local.get('signatures', ({ signatures = [] }) => {
    const list = document.getElementById('sig-list');
    list.innerHTML = '';
    signatures.forEach((sig, i) => {
      const item = document.createElement('div');
      item.className = 'sig-item';
      item.innerHTML = `
        <img src="${sig.dataUrl}" alt="${sig.name}">
        <span title="${sig.name}">${sig.name}</span>
        <button data-i="${i}" title="Delete">×</button>`;
      item.querySelector('button').addEventListener('click', () => deleteSig(i));
      list.appendChild(item);
    });
  });
}

function deleteSig(index) {
  chrome.storage.local.get('signatures', ({ signatures = [] }) => {
    signatures.splice(index, 1);
    chrome.storage.local.set({ signatures }, loadSignatures);
  });
}

document.getElementById('sig-upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    chrome.storage.local.get('signatures', ({ signatures = [] }) => {
      signatures.push({ name: file.name, dataUrl: ev.target.result });
      chrome.storage.local.set({ signatures }, loadSignatures);
    });
  };
  reader.readAsDataURL(file);
  e.target.value = '';
});

document.getElementById('open-pdf').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('viewer.html') });
});

loadSignatures();
