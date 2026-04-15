const canvas = document.getElementById('editorCanvas');
const ctx = canvas.getContext('2d');
const imageLoader = document.getElementById('imageLoader');
const uploadBtn = document.getElementById('uploadBtn');
const downloadBtn = document.getElementById('downloadBtn');
const saveStateBtn = document.getElementById('saveStateBtn');
const loadStateBtn = document.getElementById('loadStateBtn');
const applyCropBtn = document.getElementById('applyCropBtn');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const rotateLeftBtn = document.getElementById('rotateLeftBtn');
const rotateRightBtn = document.getElementById('rotateRightBtn');
const flipXBtn = document.getElementById('flipXBtn');
const flipYBtn = document.getElementById('flipYBtn');
const clearObjectsBtn = document.getElementById('clearObjectsBtn');
const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
const duplicateSelectedBtn = document.getElementById('duplicateSelectedBtn');
const bringFrontBtn = document.getElementById('bringFrontBtn');
const resizeCanvasBtn = document.getElementById('resizeCanvasBtn');
const addTextBtn = document.getElementById('addTextBtn');
const grayscaleBtn = document.getElementById('grayscaleBtn');
const resetFiltersBtn = document.getElementById('resetFiltersBtn');
const layersList = document.getElementById('layersList');
const historyList = document.getElementById('historyList');
const activeToolLabel = document.getElementById('activeToolLabel');
const imageMeta = document.getElementById('imageMeta');
const installBtn = document.getElementById('installBtn');

let deferredPrompt = null;

let state = {
  tool: 'select',
  image: null,
  imageName: '',
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: false,
  rotation: 0,
  flipX: false,
  flipY: false,
  layers: [],
  selectedLayerId: null,
  history: [],
  redo: [],
  crop: {
    active: false,
    dragging: false,
    startX: 0,
    startY: 0,
    x: 0,
    y: 0,
    width: 0,
    height: 0
  }
};

function uid(){ return Math.random().toString(36).slice(2,10); }
function getSelectedLayer(){ return state.layers.find(x => x.id === state.selectedLayerId) || null; }

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installBtn) {
    installBtn.style.display = 'inline-flex';
  }
});

if (installBtn) {
  installBtn.onclick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.style.display = 'none';
  };
}

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  if (installBtn) {
    installBtn.style.display = 'none';
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(reg => {
        console.log('Service worker registered:', reg.scope);
      })
      .catch(err => {
        console.error('Service worker registration failed:', err);
      });
  });
}

function pushHistory(label){
  const snapshot = JSON.stringify({
    imageName: state.imageName,
    brightness: state.brightness,
    contrast: state.contrast,
    saturation: state.saturation,
    grayscale: state.grayscale,
    rotation: state.rotation,
    flipX: state.flipX,
    flipY: state.flipY,
    layers: state.layers,
    selectedLayerId: state.selectedLayerId,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    crop: state.crop
  });
  state.history.push({ label, snapshot });
  if(state.history.length > 40) state.history.shift();
  state.redo = [];
  renderHistory();
}

function restoreSnapshot(snapshot){
  const data = JSON.parse(snapshot);
  state.imageName = data.imageName;
  state.brightness = data.brightness;
  state.contrast = data.contrast;
  state.saturation = data.saturation;
  state.grayscale = data.grayscale;
  state.rotation = data.rotation;
  state.flipX = data.flipX;
  state.flipY = data.flipY;
  state.layers = data.layers || [];
  state.selectedLayerId = data.selectedLayerId || null;
  state.crop = data.crop || {
    active: false,
    dragging: false,
    startX: 0,
    startY: 0,
    x: 0,
    y: 0,
    width: 0,
    height: 0
  };
  canvas.width = data.canvasWidth || 1000;
  canvas.height = data.canvasHeight || 650;
  document.getElementById('canvasWidth').value = canvas.width;
  document.getElementById('canvasHeight').value = canvas.height;
  syncControls();
  render();
}

function syncControls(){
  document.getElementById('brightness').value = state.brightness;
  document.getElementById('contrast').value = state.contrast;
  document.getElementById('saturation').value = state.saturation;
  document.getElementById('brightnessVal').innerText = state.brightness + '%';
  document.getElementById('contrastVal').innerText = state.contrast + '%';
  document.getElementById('saturationVal').innerText = state.saturation + '%';
  activeToolLabel.innerText = 'Tool: ' + state.tool.charAt(0).toUpperCase() + state.tool.slice(1);
  imageMeta.innerText = state.image ? state.imageName + ' · ' + state.image.width + '×' + state.image.height : 'No image loaded';
  document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tool === state.tool));
  renderLayers();
  renderHistory();
}

function getImageDrawBounds() {
  if (!state.image) return null;

  const ratio = Math.min(canvas.width / state.image.width, canvas.height / state.image.height);
  const drawW = state.image.width * ratio;
  const drawH = state.image.height * ratio;
  const x = (canvas.width - drawW) / 2;
  const y = (canvas.height - drawH) / 2;

  return { x, y, width: drawW, height: drawH, ratio };
}

function resetCropBox() {
  state.crop.active = false;
  state.crop.dragging = false;
  state.crop.startX = 0;
  state.crop.startY = 0;
  state.crop.x = 0;
  state.crop.y = 0;
  state.crop.width = 0;
  state.crop.height = 0;
}

function drawCropOverlay() {
  if (state.tool !== 'crop' || !state.crop.active || state.crop.width <= 0 || state.crop.height <= 0) return;

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.clearRect(state.crop.x, state.crop.y, state.crop.width, state.crop.height);

  ctx.strokeStyle = '#6d5efc';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.strokeRect(state.crop.x, state.crop.y, state.crop.width, state.crop.height);
  ctx.setLineDash([]);

  ctx.fillStyle = '#6d5efc';
  const size = 8;
  ctx.fillRect(state.crop.x - size / 2, state.crop.y - size / 2, size, size);
  ctx.fillRect(state.crop.x + state.crop.width - size / 2, state.crop.y - size / 2, size, size);
  ctx.fillRect(state.crop.x - size / 2, state.crop.y + state.crop.height - size / 2, size, size);
  ctx.fillRect(state.crop.x + state.crop.width - size / 2, state.crop.y + state.crop.height - size / 2, size, size);

  ctx.restore();
}

function applyCrop() {
  if (!state.image || !state.crop.active || state.crop.width < 5 || state.crop.height < 5) {
    alert('Draw a crop area first.');
    return;
  }

  const bounds = getImageDrawBounds();
  if (!bounds) return;

  const cropX = Math.max(state.crop.x, bounds.x);
  const cropY = Math.max(state.crop.y, bounds.y);
  const cropRight = Math.min(state.crop.x + state.crop.width, bounds.x + bounds.width);
  const cropBottom = Math.min(state.crop.y + state.crop.height, bounds.y + bounds.height);

  const finalW = cropRight - cropX;
  const finalH = cropBottom - cropY;

  if (finalW <= 0 || finalH <= 0) {
    alert('Crop area must overlap the image.');
    return;
  }

  const scaleX = state.image.width / bounds.width;
  const scaleY = state.image.height / bounds.height;

  const sx = (cropX - bounds.x) * scaleX;
  const sy = (cropY - bounds.y) * scaleY;
  const sw = finalW * scaleX;
  const sh = finalH * scaleY;

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = Math.round(sw);
  tempCanvas.height = Math.round(sh);
  const tempCtx = tempCanvas.getContext('2d');

  tempCtx.drawImage(
    state.image,
    sx, sy, sw, sh,
    0, 0, tempCanvas.width, tempCanvas.height
  );

  const croppedImg = new Image();
  croppedImg.onload = () => {
    state.image = croppedImg;
    state.imageName = state.imageName || 'cropped-image.png';
    state.rotation = 0;
    state.flipX = false;
    state.flipY = false;
    resetCropBox();
    pushHistory('Applied crop');
    syncControls();
    render();
  };
  croppedImg.src = tempCanvas.toDataURL('image/png');
}

function render(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  if(state.image){
    ctx.save();
    ctx.translate(canvas.width/2, canvas.height/2);
    ctx.scale(state.flipX ? -1 : 1, state.flipY ? -1 : 1);
    ctx.rotate(state.rotation * Math.PI / 180);
    ctx.filter = `brightness(${state.brightness}%) contrast(${state.contrast}%) saturate(${state.saturation}%) ${state.grayscale ? 'grayscale(100%)' : 'grayscale(0%)'}`;

    const ratio = Math.min(canvas.width / state.image.width, canvas.height / state.image.height);
    const drawW = state.image.width * ratio;
    const drawH = state.image.height * ratio;
    ctx.drawImage(state.image, -drawW/2, -drawH/2, drawW, drawH);
    ctx.restore();
  }

  state.layers.forEach(layer => {
    ctx.save();
    ctx.translate(layer.x, layer.y);
    ctx.rotate((layer.rotation || 0) * Math.PI / 180);
    if(layer.type === 'text'){
      ctx.fillStyle = layer.color || '#ffffff';
      ctx.font = `${layer.fontSize || 42}px Inter`;
      ctx.textBaseline = 'top';
      ctx.fillText(layer.text || 'Text', 0, 0);
    }
    if(layer.type === 'shape'){
      ctx.fillStyle = layer.color || '#6d5efc';
      if(layer.shape === 'circle'){
        ctx.beginPath();
        ctx.arc((layer.width || 120)/2, (layer.height || 120)/2, Math.min(layer.width || 120, layer.height || 120)/2, 0, Math.PI*2);
        ctx.fill();
      } else {
        ctx.fillRect(0,0,layer.width || 140, layer.height || 100);
      }
    }
    if(layer.type === 'sticker'){
      ctx.font = `${layer.fontSize || 72}px Inter`;
      ctx.textBaseline = 'top';
      ctx.fillText(layer.sticker || '⭐', 0, 0);
    }
    if(state.selectedLayerId === layer.id){
      ctx.strokeStyle = '#6d5efc';
      ctx.lineWidth = 2;
      const w = layer.width || 160;
      const h = layer.height || 80;
      ctx.strokeRect(-4,-4,w+8,h+8);
    }
    ctx.restore();
  });

  drawCropOverlay();
}

function renderLayers(){
  if(!state.layers.length){
    layersList.innerHTML = '<div class="empty">No editable layers yet.</div>';
    return;
  }
  layersList.innerHTML = state.layers.map(layer => `
    <div class="layer-item" onclick="selectLayer('${layer.id}')">
      <div>
        <div class="layer-name">${layer.type.charAt(0).toUpperCase() + layer.type.slice(1)}</div>
        <div class="layer-meta">${layer.text || layer.shape || layer.sticker || ''}</div>
      </div>
      <div>${state.selectedLayerId === layer.id ? '✅' : '•'}</div>
    </div>
  `).join('');
}

function renderHistory(){
  if(!state.history.length){
    historyList.innerHTML = '<div class="empty">Your changes will appear here.</div>';
    return;
  }
  historyList.innerHTML = state.history.slice().reverse().map(item => `
    <div class="history-item">
      <div>
        <div class="layer-name">${item.label}</div>
        <div class="layer-meta">Saved state</div>
      </div>
      <div>↺</div>
    </div>
  `).join('');
}

window.selectLayer = function(id){
  state.selectedLayerId = id;
  render();
  renderLayers();
};

function addTextLayer(){
  const value = document.getElementById('textValue').value.trim() || 'Add your text';
  const color = document.getElementById('textColor').value;
  const fontSize = parseInt(document.getElementById('textSize').value, 10) || 42;
  const width = Math.max(160, value.length * (fontSize * 0.58));
  const height = fontSize + 16;
  const layer = { id: uid(), type:'text', text:value, color, fontSize, x:80, y:80, width, height, rotation:0 };
  state.layers.push(layer);
  state.selectedLayerId = layer.id;
  pushHistory('Added text');
  render();
  syncControls();
}

function addShapeLayer(shape){
  const color = document.getElementById('shapeColor').value;
  const layer = { id: uid(), type:'shape', shape, color, x:110, y:110, width:140, height:100, rotation:0 };
  if(shape === 'circle'){ layer.width = 120; layer.height = 120; }
  state.layers.push(layer);
  state.selectedLayerId = layer.id;
  pushHistory('Added shape');
  render();
  syncControls();
}

function addStickerLayer(sticker){
  const layer = { id: uid(), type:'sticker', sticker, x:140, y:140, width:86, height:86, fontSize:72, rotation:0 };
  state.layers.push(layer);
  state.selectedLayerId = layer.id;
  pushHistory('Added sticker');
  render();
  syncControls();
}

function deleteSelected(){
  if(!state.selectedLayerId) return;
  state.layers = state.layers.filter(x => x.id !== state.selectedLayerId);
  state.selectedLayerId = null;
  pushHistory('Deleted layer');
  render();
  syncControls();
}

function duplicateSelected(){
  const layer = getSelectedLayer();
  if(!layer) return;
  const copy = JSON.parse(JSON.stringify(layer));
  copy.id = uid();
  copy.x += 24;
  copy.y += 24;
  state.layers.push(copy);
  state.selectedLayerId = copy.id;
  pushHistory('Duplicated layer');
  render();
  syncControls();
}

function bringFront(){
  const layer = getSelectedLayer();
  if(!layer) return;
  state.layers = state.layers.filter(x => x.id !== layer.id);
  state.layers.push(layer);
  pushHistory('Brought layer to front');
  render();
  syncControls();
}

function downloadCanvas(){
  const link = document.createElement('a');
  link.download = 'edited-image.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function saveState(){
  const exportData = {
    imageName: state.imageName,
    brightness: state.brightness,
    contrast: state.contrast,
    saturation: state.saturation,
    grayscale: state.grayscale,
    rotation: state.rotation,
    flipX: state.flipX,
    flipY: state.flipY,
    layers: state.layers,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    crop: state.crop
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'editor-state.json';
  a.click();
  URL.revokeObjectURL(url);
}

function loadState(){
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = e => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        state.imageName = data.imageName || '';
        state.brightness = data.brightness || 100;
        state.contrast = data.contrast || 100;
        state.saturation = data.saturation || 100;
        state.grayscale = !!data.grayscale;
        state.rotation = data.rotation || 0;
        state.flipX = !!data.flipX;
        state.flipY = !!data.flipY;
        state.layers = data.layers || [];
        state.crop = data.crop || {
          active: false,
          dragging: false,
          startX: 0,
          startY: 0,
          x: 0,
          y: 0,
          width: 0,
          height: 0
        };
        canvas.width = data.canvasWidth || 1000;
        canvas.height = data.canvasHeight || 650;
        document.getElementById('canvasWidth').value = canvas.width;
        document.getElementById('canvasHeight').value = canvas.height;
        pushHistory('Loaded JSON state');
        syncControls();
        render();
      } catch(err){
        alert('Invalid JSON state file.');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

uploadBtn.onclick = () => imageLoader.click();

imageLoader.onchange = e => {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      state.image = img;
      state.imageName = file.name;
      resetCropBox();
      pushHistory('Opened image');
      syncControls();
      render();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
};

document.querySelectorAll('.tool-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (state.tool === 'crop' && btn.dataset.tool !== 'crop') {
      resetCropBox();
    }
    state.tool = btn.dataset.tool;
    syncControls();
    render();
  });
});

document.getElementById('brightness').oninput = e => {
  state.brightness = parseInt(e.target.value,10);
  document.getElementById('brightnessVal').innerText = state.brightness + '%';
  render();
};
document.getElementById('contrast').oninput = e => {
  state.contrast = parseInt(e.target.value,10);
  document.getElementById('contrastVal').innerText = state.contrast + '%';
  render();
};
document.getElementById('saturation').oninput = e => {
  state.saturation = parseInt(e.target.value,10);
  document.getElementById('saturationVal').innerText = state.saturation + '%';
  render();
};
document.getElementById('brightness').onchange = () => pushHistory('Changed brightness');
document.getElementById('contrast').onchange = () => pushHistory('Changed contrast');
document.getElementById('saturation').onchange = () => pushHistory('Changed saturation');

grayscaleBtn.onclick = () => {
  state.grayscale = !state.grayscale;
  pushHistory('Toggled grayscale');
  syncControls();
  render();
};

resetFiltersBtn.onclick = () => {
  state.brightness = 100;
  state.contrast = 100;
  state.saturation = 100;
  state.grayscale = false;
  pushHistory('Reset filters');
  syncControls();
  render();
};

addTextBtn.onclick = addTextLayer;
document.querySelectorAll('[data-shape]').forEach(btn => btn.addEventListener('click', () => addShapeLayer(btn.dataset.shape)));
document.querySelectorAll('.sticker-btn').forEach(btn => btn.addEventListener('click', () => addStickerLayer(btn.textContent.trim())));

downloadBtn.onclick = downloadCanvas;
saveStateBtn.onclick = saveState;
loadStateBtn.onclick = loadState;
applyCropBtn.onclick = applyCrop;

rotateLeftBtn.onclick = () => {
  state.rotation -= 90;
  pushHistory('Rotated left');
  render();
};

rotateRightBtn.onclick = () => {
  state.rotation += 90;
  pushHistory('Rotated right');
  render();
};

flipXBtn.onclick = () => {
  state.flipX = !state.flipX;
  pushHistory('Flipped X');
  render();
};

flipYBtn.onclick = () => {
  state.flipY = !state.flipY;
  pushHistory('Flipped Y');
  render();
};

clearObjectsBtn.onclick = () => {
  state.layers = [];
  state.selectedLayerId = null;
  pushHistory('Cleared layers');
  render();
  syncControls();
};

deleteSelectedBtn.onclick = deleteSelected;
duplicateSelectedBtn.onclick = duplicateSelected;
bringFrontBtn.onclick = bringFront;

resizeCanvasBtn.onclick = () => {
  const w = parseInt(document.getElementById('canvasWidth').value,10) || 1000;
  const h = parseInt(document.getElementById('canvasHeight').value,10) || 650;
  canvas.width = Math.max(100, w);
  canvas.height = Math.max(100, h);
  pushHistory('Resized canvas');
  render();
};

undoBtn.onclick = () => {
  if(state.history.length < 2) return;
  const current = state.history.pop();
  state.redo.push(current);
  const previous = state.history[state.history.length - 1];
  restoreSnapshot(previous.snapshot);
};

redoBtn.onclick = () => {
  if(!state.redo.length) return;
  const next = state.redo.pop();
  state.history.push(next);
  restoreSnapshot(next.snapshot);
};

let drag = null;

canvas.addEventListener('mousedown', e => {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);

  if (state.tool === 'crop') {
    state.crop.active = true;
    state.crop.dragging = true;
    state.crop.startX = x;
    state.crop.startY = y;
    state.crop.x = x;
    state.crop.y = y;
    state.crop.width = 0;
    state.crop.height = 0;
    render();
    return;
  }

  for(let i = state.layers.length - 1; i >= 0; i--){
    const layer = state.layers[i];
    const w = layer.width || 140;
    const h = layer.height || 80;
    if(x >= layer.x && x <= layer.x + w && y >= layer.y && y <= layer.y + h){
      state.selectedLayerId = layer.id;
      drag = { id: layer.id, offsetX: x - layer.x, offsetY: y - layer.y };
      render();
      renderLayers();
      return;
    }
  }

  state.selectedLayerId = null;
  render();
  renderLayers();
});

canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);

  if (state.tool === 'crop' && state.crop.dragging) {
    state.crop.x = Math.min(state.crop.startX, x);
    state.crop.y = Math.min(state.crop.startY, y);
    state.crop.width = Math.abs(x - state.crop.startX);
    state.crop.height = Math.abs(y - state.crop.startY);
    render();
    return;
  }

  if(!drag) return;
  const layer = getSelectedLayer();
  if(!layer) return;
  layer.x = x - drag.offsetX;
  layer.y = y - drag.offsetY;
  render();
});

window.addEventListener('mouseup', () => {
  if (state.tool === 'crop' && state.crop.dragging) {
    state.crop.dragging = false;
    render();
    return;
  }

  if(drag){
    pushHistory('Moved layer');
  }
  drag = null;
});

pushHistory('Initial state');
syncControls();
render();