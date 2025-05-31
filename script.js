console.log('My script.js is loaded!');

let canvas    = document.getElementById('canvas');
let ctx       = canvas.getContext('2d');
let mode      = 'box';         // 'box' or 'polygon'
let image     = new Image();
let imageName = '';
let annotations = [];

// --- adjustable styling parameters ---
let strokeWidth    = 3;         // line thickness
let labelFontSize  = 50;        // text label size in px

let boxStart       = null;      // first corner of box (in world coords)
let polygonPoints  = [];        // point list for current polygon (in world coords)
let currentMouse   = null;      // used for live preview (in world coords)
let maxDisplayWidth = 800;      // maximum CSS display width in pixels
let selectedIdx    = null;      // index of selected shape (null if none)

// --- Drag/move/resize state ---
let isDragging       = false;
let dragOffset       = { x: 0, y: 0 };
let dragType         = null;     // "box", "polygon", "handle", "polyvertex"
let dragPolyStart    = null;     // starting polygon points for move
let resizeHandleIdx  = null;
let resizePolyVertex = null;

const HANDLE_SIZE = 18;

// *** ZOOM/PAN ***
let scale     = 1;                  // overall scale factor (1 = 100%)
let translate = { x: 0, y: 0 };     // panning offset (in canvas pixels)
let isPanning = false;
let panStart  = { x: 0, y: 0 };      // mouse screen coords when pan starts

// --- Helpers ---
function getMousePos(e) {
  // Returns canvas-pixel coords (not yet adjusted for our world transform).
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top ) * scaleY
  };
}

// *** ZOOM/PAN ***
// Convert an event's mouse position into "world" coordinates,
// i.e. factoring out the current scale & translate.
function getTransformedPos(e) {
  const pos = getMousePos(e);
  return {
    x: (pos.x - translate.x) / scale,
    y: (pos.y - translate.y) / scale
  };
}

function getBoxHandles(box) {
  // returns 4 corners: tl, tr, br, bl (in world coords)
  return [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height }
  ];
}

function handleHitTest(pt, handles) {
  for (let i = 0; i < handles.length; ++i) {
    if (
      Math.abs(pt.x - handles[i].x) <= HANDLE_SIZE/2 &&
      Math.abs(pt.y - handles[i].y) <= HANDLE_SIZE/2
    ) {
      return i;
    }
  }
  return null;
}

// --- Load image ---
document.getElementById('imageLoader').addEventListener('change', handleImage);

function handleImage(e) {
  const file = e.target.files[0];
  if (!file) return;
  const parts = file.name.split('.');
  parts.pop();
  imageName = parts.join('.') || 'image';

  const reader = new FileReader();
  reader.onload = function(ev) {
    image.onload = function() {
      canvas.width  = image.width;
      canvas.height = image.height;
      // CSS display sizing
      const displayW  = Math.min(image.width, maxDisplayWidth);
      const displayH  = displayW * (image.height / image.width);
      canvas.style.width  = displayW + 'px';
      canvas.style.height = displayH + 'px';

      // Reset zoom & pan when a new image loads
      scale     = 1;
      translate = { x: 0, y: 0 };
      draw();
    };
    image.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

// --- mousedown ---
canvas.addEventListener('mousedown', e => {
  // --- PAN: middle mouse button OR Shift+left-click ---
  if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
    e.preventDefault();
    isPanning = true;
    panStart  = { x: e.clientX, y: e.clientY };
    return;
  }

  // Only proceed for left-click (button 0) when not panning
  if (e.button !== 0) return;

  // --- Box resize handle (world coords) ---
  if (
    selectedIdx !== null &&
    annotations[selectedIdx].type === 'box'
  ) {
    const box = annotations[selectedIdx];
    const { x, y } = getTransformedPos(e);
    const handles = getBoxHandles(box);
    let hIdx = handleHitTest({ x, y }, handles);
    if (hIdx !== null) {
      isDragging      = true;
      dragType        = "handle";
      resizeHandleIdx = hIdx;
      // Store offset in world-space so dragging is smooth
      dragOffset.x = x - handles[hIdx].x;
      dragOffset.y = y - handles[hIdx].y;
      return;
    }
    // --- Move box if click inside ---
    if (
      x >= box.x && x <= box.x + box.width &&
      y >= box.y && y <= box.y + box.height
    ) {
      isDragging = true;
      dragType   = "box";
      dragOffset.x = x - box.x;
      dragOffset.y = y - box.y;
      return;
    }
  }

  // --- Polygon vertex resize (world coords) ---
  if (
    selectedIdx !== null &&
    annotations[selectedIdx].type === 'polygon'
  ) {
    const poly = annotations[selectedIdx];
    const { x, y } = getTransformedPos(e);
    for (let i = 0; i < poly.points.length; ++i) {
      if (
        Math.abs(x - poly.points[i].x) <= HANDLE_SIZE/2 &&
        Math.abs(y - poly.points[i].y) <= HANDLE_SIZE/2
      ) {
        isDragging       = true;
        dragType         = "polyvertex";
        resizePolyVertex = i;
        return;
      }
    }
    // --- Move polygon if click inside shape ---
    if (pointInPolygon({ x, y }, poly.points)) {
      isDragging     = true;
      dragType       = "polygon";
      dragOffset.x   = x;
      dragOffset.y   = y;
      // Make a deep copy of original points to track delta
      dragPolyStart = poly.points.map(pt => ({ x: pt.x, y: pt.y }));
      return;
    }
  }

  // If a shape is already selected and we didn't hit a handle or move inside it, do nothing
  if (selectedIdx !== null) return;

  currentMouse = null;
  const { x, y } = getTransformedPos(e);

  if (mode === 'box') {
    if (!boxStart) {
      // First click sets one corner of the new box
      boxStart = { x, y };
    } else {
      // Second click: finalize the box
      const label = prompt("Enter label for this box:");
      if (label) {
        annotations.push({
          type:  'box',
          label: label,
          x: Math.min(boxStart.x, x),
          y: Math.min(boxStart.y, y),
          width:  Math.abs(x - boxStart.x),
          height: Math.abs(y - boxStart.y)
        });
      }
      boxStart = null;
      currentMouse = null;
      draw();
    }
  } else {
    // Polygon mode: add a new vertex
    polygonPoints.push({ x, y });
    draw();
  }
});

// --- mousemove ---
canvas.addEventListener('mousemove', function(e) {
  // *** ZOOM/PAN: if panning is active ***
  if (isPanning) {
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    translate.x += dx;
    translate.y += dy;
    panStart.x = e.clientX;
    panStart.y = e.clientY;
    draw();
    return;
  }

  // --- Resize box handle (world coords) ---
  if (
    isDragging &&
    dragType === "handle" &&
    selectedIdx !== null &&
    annotations[selectedIdx].type === 'box'
  ) {
    const { x, y } = getTransformedPos(e);
    const box = annotations[selectedIdx];
    const handles = getBoxHandles(box);
    const idx = resizeHandleIdx;
    // Opposite corner remains fixed
    const ox = handles[(idx + 2) % 4].x;
    const oy = handles[(idx + 2) % 4].y;
    box.x      = Math.min(x - dragOffset.x, ox);
    box.y      = Math.min(y - dragOffset.y, oy);
    box.width  = Math.abs((x - dragOffset.x) - ox);
    box.height = Math.abs((y - dragOffset.y) - oy);
    draw();
    return;
  }

  // --- Resize polygon vertex (world coords) ---
  if (
    isDragging &&
    dragType === "polyvertex" &&
    selectedIdx !== null &&
    annotations[selectedIdx].type === 'polygon'
  ) {
    const { x, y } = getTransformedPos(e);
    const poly = annotations[selectedIdx];
    const idx  = resizePolyVertex;
    poly.points[idx].x = x;
    poly.points[idx].y = y;
    draw();
    return;
  }

  // --- Move BOX (world coords) ---
  if (
    isDragging &&
    dragType === "box" &&
    selectedIdx !== null &&
    annotations[selectedIdx].type === 'box'
  ) {
    const { x, y } = getTransformedPos(e);
    const box = annotations[selectedIdx];
    box.x = x - dragOffset.x;
    box.y = y - dragOffset.y;
    draw();
    return;
  }

  // --- Move POLYGON (world coords) ---
  if (
    isDragging &&
    dragType === "polygon" &&
    selectedIdx !== null &&
    annotations[selectedIdx].type === 'polygon'
  ) {
    const { x, y } = getTransformedPos(e);
    const poly = annotations[selectedIdx];
    const dx = x - dragOffset.x;
    const dy = y - dragOffset.y;
    poly.points.forEach((pt, i) => {
      pt.x = dragPolyStart[i].x + dx;
      pt.y = dragPolyStart[i].y + dy;
    });
    draw();
    return;
  }

  // --- Live Preview for new shapes (world coords) ---
  const { x, y } = getTransformedPos(e);
  if (mode === 'box' && boxStart) {
    currentMouse = { x, y };
    draw();
  }
  if (mode === 'polygon' && polygonPoints.length > 0) {
    currentMouse = { x, y };
    draw();
  }
});

// --- mouseup ---
canvas.addEventListener('mouseup', function(e) {
  // End panning if it was active
  if (isPanning) {
    isPanning = false;
    return;
  }
  // End any dragging/resizing on left-click release
  if (e.button === 0 && isDragging) {
    isDragging       = false;
    dragType         = null;
    dragPolyStart    = null;
    resizeHandleIdx  = null;
    resizePolyVertex = null;
  }
});

// --- mouse wheel for zooming ---
canvas.addEventListener('wheel', function(e) {
  e.preventDefault();
  const zoomIn = e.deltaY < 0;
  const zoomFactor = 1.1;

  const pos = getMousePos(e);
  const wx = (pos.x - translate.x) / scale;
  const wy = (pos.y - translate.y) / scale;

  if (zoomIn) {
    scale *= zoomFactor;
  } else {
    scale /= zoomFactor;
  }
  scale = Math.min(Math.max(scale, 0.1), 10);

  translate.x = pos.x - wx * scale;
  translate.y = pos.y - wy * scale;

  draw();
});

// --- Point-in-polygon helper (unchanged) ---
function pointInPolygon(pt, verts) {
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const xi = verts[i].x, yi = verts[i].y;
    const xj = verts[j].x, yj = verts[j].y;
    const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
      (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi + 1e-10) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

canvas.addEventListener('dblclick', () => {
  if (mode === 'polygon' && polygonPoints.length >= 3) {
    const label = prompt("Enter label for this polygon:");
    if (label) {
      annotations.push({
        type:   'polygon',
        label:  label,
        points: polygonPoints.slice()
      });
    }
    polygonPoints = [];
    currentMouse  = null;
    draw();
  }
});

canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  const { x, y } = getTransformedPos(e);

  // If in-progress shape (box or polygon), cancel it
  if (boxStart || polygonPoints.length > 0) {
    boxStart      = null;
    polygonPoints = [];
    currentMouse  = null;
    draw();
    return;
  }

  // Otherwise, see if right-click falls inside an annotation
  let found = false;
  for (let i = 0; i < annotations.length; i++) {
    const a = annotations[i];
    if (a.type === 'box') {
      if (
        x >= a.x && x <= a.x + a.width &&
        y >= a.y && y <= a.y + a.height
      ) {
        selectedIdx = i;
        found = true;
        break;
      }
    } else if (a.type === 'polygon') {
      if (pointInPolygon({ x, y }, a.points)) {
        selectedIdx = i;
        found = true;
        break;
      }
    }
  }
  if (found) {
    showActions();
  } else {
    selectedIdx = null;
    hideActions();
  }
  draw();
});

function drawHandle(x, y) {
  ctx.save();
  ctx.fillStyle   = '#fff';
  ctx.strokeStyle = '#ff9900';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.arc(x, y, HANDLE_SIZE/2, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// --- Central drawing function (applies scale & translate) ---
function draw() {
  // 1) Clear entire canvas using identity transform
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  // 2) Apply our zoom + pan transform so all drawing is in world coords
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, translate.x, translate.y);

  // 3) Draw the image (if loaded)
  if (image.src) {
    ctx.drawImage(image, 0, 0);
  }

  // 4) Draw all annotations in world coordinates
  ctx.font      = `${labelFontSize}px Arial`;
  ctx.fillStyle = 'black';

  annotations.forEach((a, i) => {
    if (i === selectedIdx) {
      ctx.save();
      ctx.strokeStyle = 'orange';
      ctx.lineWidth   = strokeWidth + 2;
      ctx.shadowColor = 'yellow';
      ctx.shadowBlur  = 10;
    } else {
      ctx.strokeStyle = (a.type === 'box' ? 'red' : 'blue');
      ctx.lineWidth   = strokeWidth;
      ctx.shadowBlur  = 0;
    }

    if (a.type === 'box') {
      ctx.strokeRect(a.x, a.y, a.width, a.height);
      ctx.fillText(a.label, a.x + 4, a.y - 6);
      // Draw handles if selected
      if (i === selectedIdx) {
        let handles = getBoxHandles(a);
        handles.forEach(h => drawHandle(h.x, h.y));
      }
    } else {
      // Polygon
      ctx.beginPath();
      ctx.moveTo(a.points[0].x, a.points[0].y);
      a.points.forEach(p =>(ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.stroke();
      ctx.fillText(a.label, a.points[0].x + 4, a.points[0].y - 6);
      // Draw vertex handles if selected
      if (i === selectedIdx) {
        a.points.forEach(p => drawHandle(p.x, p.y));
      }
    }

    if (i === selectedIdx) ctx.restore();
  });

  // 5) Draw live-preview shapes in world coords
  if (mode === 'polygon' && polygonPoints.length > 0) {
    ctx.strokeStyle = 'blue';
    ctx.lineWidth   = strokeWidth;
    ctx.beginPath();
    ctx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
    polygonPoints.forEach(p => ctx.lineTo(p.x, p.y));
    if (currentMouse) {
      ctx.lineTo(currentMouse.x, currentMouse.y);
    }
    ctx.stroke();
  }
  if (mode === 'box' && boxStart && currentMouse) {
    const x0 = boxStart.x, y0 = boxStart.y;
    const x1 = currentMouse.x, y1 = currentMouse.y;
    const px = Math.min(x0, x1), py = Math.min(y0, y1);
    const pw = Math.abs(x1 - x0), ph = Math.abs(y1 - y0);
    ctx.strokeStyle = 'green';
    ctx.setLineDash([6]);
    ctx.lineWidth = strokeWidth;
    ctx.strokeRect(px, py, pw, ph);
    ctx.setLineDash([]);
  }

  ctx.restore();
}

// --- Actions panel helpers (unchanged) ---
function showActions() {
  document.getElementById('actions').style.display = 'flex';
}
function hideActions() {
  document.getElementById('actions').style.display = 'none';
}

document.getElementById('editLabelBtn').addEventListener('click', () => {
  if (selectedIdx !== null) {
    const label = prompt('Edit label:', annotations[selectedIdx].label || '');
    if (label) {
      annotations[selectedIdx].label = label;
      draw();
    }
  }
});

document.getElementById('deleteShapeBtn').addEventListener('click', () => {
  if (selectedIdx !== null) {
    annotations.splice(selectedIdx, 1);
    selectedIdx = null;
    hideActions();
    draw();
  }
});

// --- Toolbar wiring ---
document.getElementById('boxBtn').addEventListener('click', () => {
  setMode('box');
  document.getElementById('boxBtn').classList.add('active');
  document.getElementById('polyBtn').classList.remove('active');
  selectedIdx = null;
  hideActions();
});
document.getElementById('polyBtn').addEventListener('click', () => {
  setMode('polygon');
  document.getElementById('polyBtn').classList.add('active');
  document.getElementById('boxBtn').classList.remove('active');
  selectedIdx = null;
  hideActions();
});
document.getElementById('exportBtn').addEventListener('click', exportAnnotations);

function setMode(m) {
  mode = m;
  boxStart = null;
  polygonPoints = [];
  currentMouse = null;
  selectedIdx = null;
  hideActions();
  document.getElementById('currentMode').textContent = (m === 'box' ? 'Box' : 'Polygon');
  draw();
}

async function exportAnnotations() {
  const blob = new Blob([JSON.stringify(annotations, null, 2)], { type: 'application/json' });
  const options = {
    suggestedName: `${imageName}.json`,
    types: [{
      description: 'JSON Files',
      accept: { 'application/json': ['.json'] }
    }]
  };
  try {
    // Try the File System Access API first
    if ('showSaveFilePicker' in window) {
      const handle = await window.showSaveFilePicker(options);
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    } else {
      // Fallback: create a download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${imageName || 'annotations'}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    alert('Export cancelled or not supported in this browser.');
    console.error(err);
  }
}