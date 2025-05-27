# Simple Web Image Annotation Tool

A browser-based tool for annotating images with bounding boxes and polygons, inspired by [LabelMe](http://labelme.csail.mit.edu/).  
Supports polygon and bounding box annotation, editing, deleting, **move, resize**, and JSON export.

## Features

- Draw bounding boxes (rectangles) and polygons on any uploaded image
- Assign custom text labels to each annotation
- **Move and resize boxes** (drag corners or shape body)
- **Move polygons by dragging inside; drag any vertex to reshape**
- Select, edit, and delete annotations using on-screen buttons

## Usage

1. **Open `index.html` in your browser** (preferably latest Chrome or Edge)
2. **Upload an image** with “Choose Image”
3. **Select drawing mode** (Box or Polygon)
   - *Box*: Click two corners
   - *Polygon*: Click for each point, double-click to finish
4. **Label**: Enter label for each shape as prompted
5. **Edit, Move, Resize, or Delete**:
   - Right-click on a shape to select (yellow highlight)
   - Use “Edit Label” or “Delete” buttons below the canvas
   - **Drag inside a selected shape to move it**
   - **Drag a box corner to resize it**
   - **Drag a polygon vertex (orange circle) to reshape**
6. **Export**:  
   - Click “Export JSON”
   - Choose location (can overwrite existing JSON in modern browsers)
   - *Tip*: Save JSON in same folder as your image for convenience

## Requirements

- No installation or backend required — runs locally!

## How to Run

1. **Download or clone** this repository to your computer.
2. Open the project folder.
3. **Double-click** `index.html` to open it in your web browser (Chrome or Edge recommended).
   - *Alternatively:* Right-click `index.html` and choose “Open with” → your browser.
4. **Start annotating!**

> ⚠️ *No server or command line needed — everything runs in your browser!*
