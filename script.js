console.log('My script.js is loaded!');

let canvas   = document.getElementById('canvas');
let ctx      = canvas.getContext('2d');
let mode     = 'box';        // 'box' or 'polygon'
let image    = new Image();
let imageName = '';
let annotations = [];

// --- adjustable styling parameters ---
let strokeWidth = 3;          // line thickness
let labelFontSize = 50;       // text label size in px

let boxStart      = null;    // first corner of box
let polygonPoints = [];      // point list for current polygon
let currentMouse  = null;    // used for live preview
let maxDisplayWidth = 800;   // maximum CSS display width in pixels
let selectedIdx = null;      // index of selected shape (null if none)

// --- Helpers for coordinate mapping ---
function getMousePos(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top ) * scaleY
  };
}

// --- Load image, record its filename, and fit display size ---
document.getElementById('imageLoader').addEventListener('change', handleImage);

function handleImage(e) {
  const file = e.target.files[0];
  if (!file) return;
  const parts = file.name.split('.'); parts.pop();
  imageName = parts.join('.') || 'image';

  const reader = new FileReader();
  reader.onload = function(ev) {
    image.onload = function() {
      canvas.width  = image.width;
      canvas.height = image.height;
      const displayW = Math.min(image.width, maxDisplayWidth);
      const displayH = displayW * (image.height / image.width);
      canvas.style.width  = displayW + 'px';
      canvas.style.height = displayH + 'px';
      draw();
    };
    image.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

// --- Drawing logic ---
canvas.addEventListener('mousedown', e => {
  // Prevent adding points if selecting a shape
  if (selectedIdx !== null) return;
  currentMouse = null;
  const { x, y } = getMousePos(e);

  if (mode === 'box') {
    if (!boxStart) {
      boxStart = { x, y };
    } else {
      const label = prompt("Enter label for this box:");
      if (label) {
        annotations.push({ type:'box', label, x:Math.min(boxStart.x,x), y:Math.min(boxStart.y,y), width:Math.abs(x-boxStart.x), height:Math.abs(y-boxStart.y) });
      }
      boxStart = null; currentMouse = null; draw();
    }
  } else {
    polygonPoints.push({ x, y }); draw();
  }
});


// --- Point-in-polygon helper ---
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

canvas.addEventListener('mousemove', e => {
  const { x, y } = getMousePos(e);
  if (mode === 'box' && boxStart) { currentMouse = { x, y }; draw(); }
  if (mode === 'polygon' && polygonPoints.length > 0) { currentMouse = { x, y }; draw(); }
});

canvas.addEventListener('dblclick', () => {
  if (mode === 'polygon' && polygonPoints.length >= 3) {
    const label = prompt("Enter label for this polygon:");
    if (label) { annotations.push({ type:'polygon', label, points:polygonPoints.slice() }); }
    polygonPoints = []; currentMouse = null; draw();
  }
});

canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  const { x, y } = getMousePos(e);

  annotations.forEach((a, i) => {
    if (a.type === 'box') {
      console.log(`Testing box #${i}: x=${a.x}, y=${a.y}, w=${a.width}, h=${a.height}`);
    } else if (a.type === 'polygon') {
      console.log(`Testing polygon #${i}: points=`, a.points);
    }
  });

  if (boxStart || polygonPoints.length > 0) {
  // Cancel drawing mode, then continue to shape selection below!
  boxStart = null;
  polygonPoints = [];
  currentMouse = null;
  draw();
  // DO NOT return! Let the code continue to shape detection
  }


  let found = false;
  for (let i = 0; i < annotations.length; i++) {
    const a = annotations[i];
    if (a.type === 'box') {
      // Debug logs for math
      console.log('x:', x, 'a.x:', a.x, 'a.x+a.width:', a.x + a.width);
      console.log('y:', y, 'a.y:', a.y, 'a.y+a.height:', a.y + a.height);
      console.log(
        'Test: (x >= a.x)', x >= a.x,
        '&& (x <= a.x + a.width)', x <= a.x + a.width,
        '&& (y >= a.y)', y >= a.y,
        '&& (y <= a.y + a.height)', y <= a.y + a.height
      );
      if (x >= a.x && x <= a.x + a.width && y >= a.y && y <= a.y + a.height) {
        console.log('Box hit! Index:', i);
        selectedIdx = i;
        found = true;
        break;
      }
    } else if (a.type === 'polygon') {
      // Polygon math and debug logs
      console.log('Testing polygon:', a.points);
      if (pointInPolygon({x, y}, a.points)) {
        console.log('Polygon hit! Index:', i);
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




// central drawing function
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (image.src) ctx.drawImage(image, 0, 0);

  ctx.font = `${labelFontSize}px Arial`;
  ctx.fillStyle = 'black';

  annotations.forEach((a, i) => {
    if (i === selectedIdx) {
      ctx.save();
      ctx.strokeStyle = 'orange';
      ctx.lineWidth = strokeWidth + 2;
      ctx.shadowColor = 'yellow';
      ctx.shadowBlur = 10;
    } else {
      ctx.strokeStyle = a.type === 'box' ? 'red' : 'blue';
      ctx.lineWidth = strokeWidth;
      ctx.shadowBlur = 0;
    }
    if (a.type === 'box') {
      ctx.strokeRect(a.x, a.y, a.width, a.height);
      ctx.fillText(a.label, a.x + 4, a.y - 6);
    } else {
      ctx.beginPath(); ctx.moveTo(a.points[0].x, a.points[0].y);
      a.points.forEach(p => ctx.lineTo(p.x, p.y)); ctx.closePath(); ctx.stroke();
      ctx.fillText(a.label, a.points[0].x + 4, a.points[0].y - 6);
    }
    if (i === selectedIdx) ctx.restore();
  });

  // preview polygon
  if (mode === 'polygon' && polygonPoints.length > 0) {
    ctx.strokeStyle = 'blue'; ctx.lineWidth = strokeWidth;
    ctx.beginPath(); ctx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
    polygonPoints.forEach(p => ctx.lineTo(p.x, p.y));
    if (currentMouse) ctx.lineTo(currentMouse.x, currentMouse.y);
    ctx.stroke();
  }

  // preview box
  if (mode === 'box' && boxStart && currentMouse) {
    const x0 = boxStart.x, y0 = boxStart.y, x1 = currentMouse.x, y1 = currentMouse.y;
    const px = Math.min(x0, x1), py = Math.min(y0, y1);
    const pw = Math.abs(x1 - x0), ph = Math.abs(y1 - y0);
    ctx.strokeStyle = 'green'; ctx.setLineDash([6]); ctx.lineWidth = strokeWidth;
    ctx.strokeRect(px, py, pw, ph); ctx.setLineDash([]);
  }
}

// --- Actions panel helpers ---
function showActions() { document.getElementById('actions').style.display = 'flex'; }
function hideActions() { document.getElementById('actions').style.display = 'none'; }

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
document.getElementById('boxBtn').addEventListener('click', () => { setMode('box'); document.getElementById('boxBtn').classList.add('active'); document.getElementById('polyBtn').classList.remove('active'); selectedIdx = null; hideActions(); });
document.getElementById('polyBtn').addEventListener('click', () => { setMode('polygon'); document.getElementById('polyBtn').classList.add('active'); document.getElementById('boxBtn').classList.remove('active'); selectedIdx = null; hideActions(); });
document.getElementById('exportBtn').addEventListener('click', exportAnnotations);

function setMode(m) { mode = m; boxStart = null; polygonPoints = []; currentMouse = null; selectedIdx = null; hideActions(); document.getElementById('currentMode').textContent = m==='box'?'Box':'Polygon'; draw(); }

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
    // Open the save file picker dialog
    const handle = await window.showSaveFilePicker(options);
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  } catch (err) {
    // If the user cancels or the API is not available
    alert('Export cancelled or not supported in this browser.');
    console.error(err);
  }
}