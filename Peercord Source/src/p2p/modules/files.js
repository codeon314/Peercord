const b4a = window.require('b4a');
import { generateUUID, fs, path, os } from '../utils.js';

async function _hostFile(network, id, fileObj, fileCore) {
  network.transfers[id] = { progress: 0, speed: 0, state: 'processing' };
  if (network.onTransfersUpdate) network.onTransfersUpdate(network.transfers);

  let processedBytes = 0;
  let lastTime = Date.now();
  let lastBytes = 0;

  const updateProcessingProgress = (chunkLength) => {
    processedBytes += chunkLength;
    const now = Date.now();
    if (now - lastTime >= 250 || processedBytes >= fileObj.size) {
      const timeDiff = (now - lastTime) / 1000;
      const speed = timeDiff > 0 ? (processedBytes - lastBytes) / timeDiff : 0;
      const progress = Math.min(1, processedBytes / fileObj.size);
      
      network.transfers[id] = { progress, speed, state: 'processing' };
      if (network.onTransfersUpdate) network.onTransfersUpdate(network.transfers);
      
      lastTime = now;
      lastBytes = processedBytes;
    }
  };

  // Append to local core (fast local disk I/O)
  if (fileObj.path && fs) {
    const stream = fs.createReadStream(fileObj.path, { highWaterMark: 64 * 1024 });
    for await (const chunk of stream) {
      await fileCore.append(chunk);
      updateProcessingProgress(chunk.length);
    }
  } else if (fileObj.fileObj && typeof fileObj.fileObj.stream === 'function') {
    const stream = fileObj.fileObj.stream();
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await fileCore.append(b4a.from(value));
      updateProcessingProgress(value.length);
    }
  } else if (fileObj.buffer) {
    const buf = b4a.from(fileObj.buffer);
    const chunkSize = 64 * 1024;
    for(let i=0; i<buf.length; i+=chunkSize) {
      const chunk = buf.subarray(i, i+chunkSize);
      await fileCore.append(chunk);
      updateProcessingProgress(chunk.length);
    }
  }
  
  const msg = network.messages.get(id);
  if (msg) {
    if (fileObj.path) {
      msg.localPath = fileObj.path;
      msg.isMediaInDB = false; // Do not count sent files towards storage limits
      await network.localFilesDb.put(id, fileObj.path); // Remember original path across restarts
    } else if (fileObj.fileObj && typeof URL !== 'undefined') {
      msg.localBlobUrl = URL.createObjectURL(fileObj.fileObj);
      msg.isMediaInDB = false;
    } else if (fileObj.buffer && typeof URL !== 'undefined') {
      const blob = new Blob([fileObj.buffer], { type: fileObj.type });
      msg.localBlobUrl = URL.createObjectURL(blob);
      msg.isMediaInDB = false;
    } else {
      msg.isMediaInDB = false;
    }
    network._emitMessages();
  }

  // Set state to uploading, wait for receiver to send ephemeral progress messages
  // Fix: Do not overwrite if the receiver already finished downloading it concurrently
  const currentTransfer = network.transfers[id] || {};
  if (currentTransfer.state !== 'completed') {
    network.transfers[id] = { 
      progress: currentTransfer.progress || 0, 
      speed: currentTransfer.speed || 0, 
      state: 'uploading' 
    };
    if (network.onTransfersUpdate) network.onTransfersUpdate(network.transfers);
  }
}

export async function sendFile(network, channel, text, fileObj) {
  const id = generateUUID();
  const fileCore = network.store.get({ name: 'file-' + id });
  await fileCore.ready();
  const coreKey = b4a.toString(fileCore.key, 'hex');
  
  network.transfers[id] = { progress: 0, speed: 0, state: 'processing' };
  if (network.onTransfersUpdate) network.onTransfersUpdate(network.transfers);

  await network._appendSignedMessage({
    type: 'file', id, channel, text,
    file: { name: fileObj.name, size: fileObj.size, mimeType: fileObj.type, coreKey },
    timestamp: Date.now()
  });
  
  await _hostFile(network, id, fileObj, fileCore);
}

export async function sendDMFile(network, targetKey, text, fileObj) {
  const id = generateUUID();
  const fileCore = network.store.get({ name: 'file-' + id });
  await fileCore.ready();
  const coreKey = b4a.toString(fileCore.key, 'hex');
  
  network.transfers[id] = { progress: 0, speed: 0, state: 'processing' };
  if (network.onTransfersUpdate) network.onTransfersUpdate(network.transfers);

  await network._appendEncryptedMessage(targetKey, {
    type: 'file', id, text,
    file: { name: fileObj.name, size: fileObj.size, mimeType: fileObj.type, coreKey },
    timestamp: Date.now()
  });
  
  await _hostFile(network, id, fileObj, fileCore);
}

export async function downloadFile(network, msgId, fileMeta, isSender) {
  if (typeof window !== 'undefined') {
    const localDeleted = JSON.parse(localStorage.getItem('pear_local_deleted_msgs') || '[]');
    if (localDeleted.includes(msgId)) return;
  }

  if (isSender) {
    if (network.transfers[msgId] && network.transfers[msgId].state === 'processing') {
      return; // Currently being hosted
    }
  }

  // Check localFilesDb for BOTH sender and receiver to instantly restore paths on startup
  const storedPath = await network.localFilesDb.get(msgId);
  if (storedPath && storedPath.value && fs && fs.existsSync(storedPath.value)) {
    const msg = network.messages.get(msgId);
    if (msg) {
      msg.localPath = storedPath.value;
      msg.isMediaInDB = fileMeta.mimeType?.startsWith('image/') || fileMeta.mimeType?.startsWith('video/');
      network._emitMessages();
    }
    network.transfers[msgId] = { progress: 1, speed: 0, state: 'completed' };
    if (network.onTransfersUpdate) network.onTransfersUpdate(network.transfers);
    return;
  }

  const core = network.store.get({ key: b4a.from(fileMeta.coreKey, 'hex') });
  await core.ready();

  const isMedia = fileMeta.mimeType?.startsWith('image/') || fileMeta.mimeType?.startsWith('video/');
  let downloadsDir;
  let filePath;

  if (isMedia) {
    downloadsDir = path.join(network.storagePath, 'downloads');
    if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
    const safeName = fileMeta.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    filePath = path.join(downloadsDir, `${msgId}-${safeName}`);
  } else {
    downloadsDir = path.join(os.homedir(), 'Downloads');
    if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
    const safeName = fileMeta.name.replace(/[^a-zA-Z0-9.\-_ ]/g, '');
    filePath = path.join(downloadsDir, safeName);
    
    const existingMsg = network.messages.get(msgId);
    if (existingMsg && existingMsg.localPath) {
      filePath = existingMsg.localPath;
    } else if (fs.existsSync(filePath)) {
      // Collision handling: Rename if a file exists and isn't exactly our target size
      const stats = fs.statSync(filePath);
      if (stats.size !== fileMeta.size) {
        let baseName = path.basename(safeName, path.extname(safeName));
        let ext = path.extname(safeName);
        let counter = 1;
        while (fs.existsSync(filePath)) {
          filePath = path.join(downloadsDir, `${baseName} (${counter})${ext}`);
          counter++;
        }
      }
    }
  }

  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    if (stats.size >= fileMeta.size) {
      const msg = network.messages.get(msgId);
      if (msg) {
        msg.localPath = filePath;
        msg.isMediaInDB = isMedia; 
        network._emitMessages();
      }
      await network.localFilesDb.put(msgId, filePath);
      network.transfers[msgId] = { progress: 1, speed: 0, state: 'completed' };
      if (network.onTransfersUpdate) network.onTransfersUpdate(network.transfers);
      return;
    } else {
      // Partial file exists, delete it to restart cleanly
      try { fs.unlinkSync(filePath); } catch(e) {}
    }
  }

  network.transfers[msgId] = { progress: 0, speed: 0, state: 'downloading' };
  if (network.onTransfersUpdate) network.onTransfersUpdate(network.transfers);

  const readStream = core.createReadStream({ live: true });
  const writeStream = fs.createWriteStream(filePath);

  let downloadedBytes = 0;
  let lastTime = Date.now();
  let lastBytes = 0;
  let isFinished = false;

  const sendProgress = (progress, speed) => {
    network.transfers[msgId] = { progress, speed, state: 'downloading' };
    if (network.onTransfersUpdate) network.onTransfersUpdate(network.transfers);
    
    // Send ephemeral progress to the sender
    network.sendEphemeral({ type: 'transfer_progress', id: msgId, progress, speed });
  };

  writeStream.on('finish', async () => {
    const msg = network.messages.get(msgId);
    if (msg) {
      msg.localPath = filePath;
      msg.isMediaInDB = isMedia;
      network._emitMessages();
    }
    await network.localFilesDb.put(msgId, filePath);
    network.transfers[msgId] = { progress: 1, speed: 0, state: 'completed' };
    if (network.onTransfersUpdate) network.onTransfersUpdate(network.transfers);
    
    // Final progress sync
    sendProgress(1, 0);
  });

  writeStream.on('error', (err) => {
    console.error("File write error:", err);
  });

  if (fileMeta.size === 0) {
    writeStream.end();
    return;
  }

  // Manually pump the stream to avoid pipe race conditions
  readStream.on('data', (chunk) => {
    if (isFinished) return;
    
    downloadedBytes += chunk.length;
    writeStream.write(chunk);

    const now = Date.now();
    if (now - lastTime >= 500 || downloadedBytes >= fileMeta.size) {
      const timeDiff = (now - lastTime) / 1000;
      const speed = timeDiff > 0 ? (downloadedBytes - lastBytes) / timeDiff : 0;
      const progress = Math.min(1, downloadedBytes / fileMeta.size);
      
      sendProgress(progress, Math.max(0, speed));
      
      lastTime = now;
      lastBytes = downloadedBytes;
    }

    if (downloadedBytes >= fileMeta.size) {
      isFinished = true;
      readStream.destroy(); // Stop reading from hypercore
      writeStream.end();    // Close file safely to trigger finish event
    }
  });
}