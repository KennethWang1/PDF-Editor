import './pdf.css';
import React, { useState, useEffect, useRef } from 'react';
import { line, rectangle, oval } from './shapes.js';

let backgroundCanvas = null, foregroundCanvas = null, lastClick = null, shapes = [], drawType = null, selectedShape = null, selectedHandle = null, interactionMode = null, createDragged = false;
const createDragThreshold = 2;
let inlineTextInput = null, inlineTextShape = null;
let syncStateCallback = null;
let updateFormattingRef = null;

let defaultFormatting = {
  textSize: 14,
  isBold: false,
  isItalic: false,
  isUnderline: false,
  textColor: "#000000",
  borderColor: "#000000",
  fillColor: null
};

function checkHtmlFormattingState(htmlText, command) {
  if (!htmlText || typeof document === 'undefined') return false;
  const div = document.createElement('div');
  div.innerHTML = htmlText;
  div.style.position = 'absolute';
  div.style.left = '-9999px';
  div.contentEditable = 'true';
  document.body.appendChild(div);
  
  div.focus();
  
  const range = document.createRange();
  range.selectNodeContents(div);
  const sel = window.getSelection();
  
  const savedRanges = [];
  if (sel) {
    for (let i = 0; i < sel.rangeCount; i++) {
      savedRanges.push(sel.getRangeAt(i));
    }
    sel.removeAllRanges();
    sel.addRange(range);
  }
  
  const state = document.queryCommandState(command);
  
  document.body.removeChild(div);
  if (sel) {
    sel.removeAllRanges();
    savedRanges.forEach(r => sel.addRange(r));
  }
  return state;
}

function toggleHtmlFormatting(htmlText, command) {
  if (typeof document === 'undefined') return htmlText;
  const div = document.createElement('div');
  div.innerHTML = htmlText || '';
  div.style.position = 'absolute';
  div.style.left = '-9999px';
  div.contentEditable = 'true';
  document.body.appendChild(div);
  
  div.focus();
  
  const range = document.createRange();
  range.selectNodeContents(div);
  const sel = window.getSelection();
  const savedRanges = [];
  if (sel) {
    for (let i = 0; i < sel.rangeCount; i++) {
      savedRanges.push(sel.getRangeAt(i));
    }
    sel.removeAllRanges();
    sel.addRange(range);
  }
  
  document.execCommand(command, false, null);
  
  const result = div.innerHTML;
  document.body.removeChild(div);
  
  if (sel) {
    sel.removeAllRanges();
    savedRanges.forEach(r => sel.addRange(r));
  }
  
  return result;
}

function onMount() {
  if(foregroundCanvas !== null && backgroundCanvas !== null) return; 
  foregroundCanvas = document.getElementById("document_foreground");
  backgroundCanvas = document.getElementById("document_background");
  if (foregroundCanvas) foregroundCanvas = foregroundCanvas.getContext("2d");
  if (backgroundCanvas) backgroundCanvas = backgroundCanvas.getContext("2d");
}

function redrawScene(showSelectedOnForeground = true) {
  const canvas = document.getElementById("document_foreground");
  if (!canvas) return;

  const dpr = window.devicePixelRatio || 1;

  if (backgroundCanvas) backgroundCanvas.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (foregroundCanvas) foregroundCanvas.setTransform(dpr, 0, 0, dpr, 0, 0);

  const logicalWidth = canvas.width / dpr;
  const logicalHeight = canvas.height / dpr;

  if (backgroundCanvas) {
    backgroundCanvas.clearRect(0, 0, logicalWidth, logicalHeight);
    shapes.forEach((item) => {
      if (item !== selectedShape) {
        item.draw(backgroundCanvas);
      }
    });
  }

  if (foregroundCanvas) {
    foregroundCanvas.clearRect(0, 0, logicalWidth, logicalHeight);
    if (showSelectedOnForeground && selectedShape !== null) {
      selectedShape.draw(foregroundCanvas, true); 
      selectedShape.drawHighlightBox(foregroundCanvas);
    }
  }

  updateInlineTextInputPosition();
}

function ensureInlineTextDefaults(shape) {
  if (shape.textSize == null || shape.textSize === 0) {
    shape.textSize = defaultFormatting.textSize;
  }
  if (shape.color == null) {
    shape.color = shape.borderColor || defaultFormatting.textColor;
  }
  if (shape.textFont == null) {
    shape.textFont = "Arial";
  }
}

function commitInlineTextInput() {
  if (!inlineTextInput || !inlineTextShape) return;

  const rawText = inlineTextInput.innerHTML;
  const plainText = inlineTextInput.textContent || inlineTextInput.innerText || "";
  
  inlineTextShape.text = plainText.trim() === "" ? null : rawText;
  removeInlineTextInput();
  redrawScene(interactionMode === "edit");
}

function removeInlineTextInput() {
  const input = inlineTextInput;
  
  if (inlineTextShape) {
    inlineTextShape.isEditingText = false; 
  }
  
  inlineTextInput = null;
  inlineTextShape = null;

  if (!input) return;
  if (input.parentNode) {
    input.parentNode.removeChild(input);
  }
}

function updateInlineTextInputPosition() {
  if (!inlineTextInput || !inlineTextShape) return;

  const canvas = document.getElementById("document_foreground");
  const editor = document.getElementById("pdf-editor");
  if (!canvas || !editor) return;

  const info = inlineTextShape.getTextEditorInfo();
  ensureInlineTextDefaults(inlineTextShape);

  const canvasRect = canvas.getBoundingClientRect();
  const editorRect = editor.getBoundingClientRect();
  
  const left = canvasRect.left - editorRect.left + info.point.x;
  const top = canvasRect.top - editorRect.top + info.point.y;

  inlineTextInput.style.width = `${info.width}px`;
  
  if (inlineTextShape instanceof rectangle || inlineTextShape instanceof oval) {
    inlineTextInput.style.minHeight = `${info.height}px`;
    inlineTextInput.style.height = "auto";
    inlineTextInput.style.display = "flex";
    inlineTextInput.style.flexDirection = "column";
    inlineTextInput.style.justifyContent = info.vAlign === "center" ? "center" : (info.vAlign === "bottom" ? "flex-end" : "flex-start");
    inlineTextInput.style.textAlign = info.align || "left";
  } else {
    inlineTextInput.style.height = `${info.height}px`;
    inlineTextInput.style.display = "block";
    inlineTextInput.style.textAlign = "left";
  }
  
  inlineTextInput.style.left = `${left}px`;
  inlineTextInput.style.top = `${top}px`;
  
  inlineTextInput.style.transform = `rotate(${info.angle || 0}rad)`;
}

function openInlineTextInput(shape) {
  const editor = document.getElementById("pdf-editor");
  if (!editor) return;

  removeInlineTextInput();
  ensureInlineTextDefaults(shape);

  shape.isEditingText = true; 

  const info = shape.getTextEditorInfo ? shape.getTextEditorInfo() : {};

  const input = document.createElement("div");
  input.contentEditable = "true";
  
  input.innerHTML = shape.text == null ? "" : shape.text;
  
  input.style.position = "absolute";
  input.style.zIndex = "10";
  input.style.padding = "0px";
  input.style.margin = "0px";
  input.style.fontSize = `${shape.textSize}px`;
  input.style.fontFamily = shape.textFont;
  
  const calculatedLineHeight = Math.max(12, Math.ceil((shape.textSize || 14) * 1.2));
  input.style.lineHeight = `${calculatedLineHeight}px`;
  input.style.color = shape.color;
  input.style.border = "1px dashed blue";
  input.style.background = "transparent";
  input.style.outline = "none";
  input.style.transformOrigin = "left top";
  input.style.overflow = "hidden";
  input.style.boxSizing = "border-box";
  input.style.whiteSpace = "pre-wrap";
  input.style.wordBreak = "break-word";

  if (shape instanceof rectangle || shape instanceof oval) {
    input.style.display = "flex";
    input.style.flexDirection = "column";
    input.style.justifyContent = info.vAlign === "center" ? "center" : (info.vAlign === "bottom" ? "flex-end" : "flex-start");
    input.style.textAlign = info.align || "left";
  }

  input.addEventListener("input", () => {
    shape.text = input.innerHTML;
    if (syncStateCallback) syncStateCallback(); 
    redrawScene(interactionMode === "edit");
  });

  input.addEventListener("keyup", () => {
    if (syncStateCallback) syncStateCallback();
  });

  input.addEventListener("click", (evt) => {
    const link = evt.target && evt.target.closest ? evt.target.closest("a") : null;
    if (link && evt.button === 0) {
      evt.preventDefault(); // Prevent opening links on left click
    }
    if (syncStateCallback) syncStateCallback();
  });

  input.addEventListener("contextmenu", (evt) => {
    const link = evt.target && evt.target.closest ? evt.target.closest("a") : null;
    if (!link) {
      evt.preventDefault(); // Suppress default right-click menu unless right-clicking a link
    }
  });

  input.addEventListener("mouseup", () => {
    if (syncStateCallback) syncStateCallback();
  });

  input.addEventListener("keydown", (evt) => {
    if (evt.ctrlKey || evt.metaKey) {
      if (evt.key === 'b') {
        evt.preventDefault();
        if (updateFormattingRef) {
          updateFormattingRef('isBold', !document.queryCommandState('bold'));
        }
      } else if (evt.key === 'i') {
        evt.preventDefault();
        if (updateFormattingRef) {
          updateFormattingRef('isItalic', !document.queryCommandState('italic'));
        }
      } else if (evt.key === 'u') {
        evt.preventDefault();
        if (updateFormattingRef) {
          updateFormattingRef('isUnderline', !document.queryCommandState('underline'));
        }
      }
    }
    
    if (!(shape instanceof rectangle || shape instanceof oval) && evt.key === "Enter") {
      evt.preventDefault();
      commitInlineTextInput();
    }
    if (evt.key === "Escape") {
      removeInlineTextInput();
      redrawScene(interactionMode === "edit");
    }
  });

  editor.appendChild(input);
  inlineTextInput = input;
  inlineTextShape = shape;
  
  updateInlineTextInputPosition();
  redrawScene(interactionMode === "edit"); 
  
  input.focus();
  
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(input);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);

  if (!shape.text || shape.text.trim() === "") {
    if (defaultFormatting.isBold) document.execCommand('bold', false, null);
    if (defaultFormatting.isItalic) document.execCommand('italic', false, null);
    if (defaultFormatting.isUnderline) document.execCommand('underline', false, null);
  }
}

function closeInlineTextInput() {
  if (!inlineTextInput || !inlineTextShape) return;
  const rawText = inlineTextInput.innerHTML;
  const plainText = inlineTextInput.textContent || inlineTextInput.innerText || "";
  inlineTextShape.text = plainText.trim() === "" ? null : rawText;
  
  if (inlineTextInput.parentNode) {
    inlineTextInput.parentNode.removeChild(inlineTextInput);
  }
  inlineTextInput = null;
  inlineTextShape = null;
  redrawScene();
  if (syncStateCallback) syncStateCallback();
}

function findNearestShapeAtPoint(point) {
  let minDist = Infinity;
  let nearestShape = null;

  for (let i = 0; i < shapes.length; i++) {
    if (shapes[i].collissionCheck(point)) {
      let dist = typeof shapes[i].distanceToPoint === 'function'
        ? shapes[i].distanceToPoint(point)
        : Infinity;
      if (dist < minDist) {
        minDist = dist;
        nearestShape = shapes[i];
      }
    }
  }

  return nearestShape;
}

function getUrlFromShape(shape) {
  if (!shape || !shape.text) return null;
  
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = shape.text;
  const anchor = tempDiv.querySelector('a');
  
  return anchor ? anchor.getAttribute('href') : null;
}

function removeZeroSizeSelectedShape() {
  if (selectedShape === null) return false;
  if (typeof selectedShape.hasZeroSize !== 'function') return false;
  if (!selectedShape.hasZeroSize()) return false;

  shapes = shapes.filter((item) => item !== selectedShape);
  selectedShape = null;
  selectedHandle = null;
  interactionMode = null;
  lastClick = null;
  createDragged = false;
  if (syncStateCallback) syncStateCallback();
  return true;
}

function mouseMoveHandler(event){
  if(selectedShape === null) return;

  if (interactionMode === "create-click") {
    let canvas = document.getElementById("document_foreground");
    let rect = canvas.getBoundingClientRect();
    let eventX = event.clientX - rect.left;
    let eventY = event.clientY - rect.top;
    selectedShape.updateSecondLocation({x: eventX, y: eventY});
    redrawScene(true);
    return;
  }

  if(lastClick === null) return;
  let canvas = document.getElementById("document_foreground");
  let rect = canvas.getBoundingClientRect();
  let eventX = event.clientX - rect.left;
  let eventY = event.clientY - rect.top;

  if (interactionMode === "resize" && selectedHandle !== null) {
    selectedShape.resize(selectedHandle, {x: eventX, y: eventY});
  } else if (interactionMode === "rotate") {
    selectedShape.rotateToPoint({x: eventX, y: eventY});
  } else if (interactionMode === "move") {
    const deltaX = eventX - lastClick.x;
    const deltaY = eventY - lastClick.y;
    selectedShape.translate(deltaX, deltaY);
    lastClick = { x: eventX, y: eventY };
  } else if (interactionMode === "create") {
    if (Math.abs(eventX - lastClick.x) > createDragThreshold || Math.abs(eventY - lastClick.y) > createDragThreshold) {
      createDragged = true;
    }
    selectedShape.updateSecondLocation({x: eventX, y: eventY});
  } else {
    selectedShape.updateSecondLocation({x: eventX, y: eventY});
  }

  redrawScene(true);
}

function mouseDoubleClickHandler(event) {
  if (event.button !== 0) return; // Only process left double-click
  if (interactionMode === "create" || interactionMode === "create-click") return;

  let canvas = document.getElementById("document_foreground");
  let rect = canvas.getBoundingClientRect();
  let clickX = event.clientX - rect.left;
  let clickY = event.clientY - rect.top;
  const clickPoint = { x: clickX, y: clickY };

  const targetShape = findNearestShapeAtPoint(clickPoint);
  if (!targetShape) return;

  drawType = null;
  selectedShape = targetShape;
  selectedHandle = null;
  interactionMode = "edit";
  if (syncStateCallback) syncStateCallback();
  redrawScene(true);
  openInlineTextInput(targetShape);
}

function contextMenuHandler(event) {
  const canvas = document.getElementById("document_foreground");
  if (!canvas) return;

  let rect = canvas.getBoundingClientRect();
  let clickX = event.clientX - rect.left;
  let clickY = event.clientY - rect.top;
  const clickPoint = { x: clickX, y: clickY };

  const targetShape = findNearestShapeAtPoint(clickPoint);
  const url = getUrlFromShape(targetShape);

  if (url) {
    event.preventDefault();

    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

function finishInteraction(){
  const canvas = document.getElementById("document_foreground");
  if (!canvas) return;

  canvas.removeEventListener("mousemove", mouseMoveHandler);
  canvas.removeEventListener("mouseup", finishInteraction);
  commitInlineTextInput();

  if (selectedShape != null && interactionMode === "create") {
    if (createDragged) {
      if (!removeZeroSizeSelectedShape()) {
        shapes.push(selectedShape);
        drawType = null; 
      }
    } else {
      interactionMode = "create-click";
      redrawScene(true);
      canvas.addEventListener("mousemove", mouseMoveHandler);
      createDragged = false;
      lastClick = null;
      return;
    }
  }

  selectedHandle = null;
  interactionMode = selectedShape != null ? "edit" : null;
  lastClick = null;
  createDragged = false;
  if (syncStateCallback) syncStateCallback();

  if (removeZeroSizeSelectedShape()) {
    redrawScene(false);
    return;
  }

  redrawScene(interactionMode === "edit");
}

function mouseDownHandler(event){
  if (event.button !== 0) return; // Only process left-click for canvas operations

  commitInlineTextInput();

  let canvas = document.getElementById("document_foreground");
  let rect = canvas.getBoundingClientRect();
  let clickX = event.clientX - rect.left;
  let clickY = event.clientY - rect.top;
  const clickPoint = { x: clickX, y: clickY };

  if (interactionMode === "create-click" && selectedShape !== null) {
    selectedShape.updateSecondLocation(clickPoint);
    if (!removeZeroSizeSelectedShape()) {
      shapes.push(selectedShape);
      selectedHandle = null;
      interactionMode = "edit";
      lastClick = null;
      createDragged = false;
      drawType = null; 
      if (syncStateCallback) syncStateCallback();
    }
    canvas.removeEventListener("mousemove", mouseMoveHandler);
    redrawScene(interactionMode === "edit");
    return;
  }

  if (selectedShape !== null && interactionMode === "edit") {
    const handle = typeof selectedShape.getHandleAtPoint === 'function'
      ? selectedShape.getHandleAtPoint(clickPoint)
      : null;

    if (handle !== null) {
      drawType = null;
      interactionMode = handle === "rotate" ? "rotate" : "resize";
      selectedHandle = handle;
      lastClick = clickPoint;
      canvas.addEventListener("mousemove", mouseMoveHandler);
      canvas.addEventListener("mouseup", finishInteraction);
      return;
    }

    if (typeof selectedShape.collissionCheck === 'function' && selectedShape.collissionCheck(clickPoint)) {
      drawType = null;
      interactionMode = "move";
      selectedHandle = null;
      lastClick = clickPoint;
      canvas.addEventListener("mousemove", mouseMoveHandler);
      canvas.addEventListener("mouseup", finishInteraction);
      return;
    }
  }

  if (lastClick === null){
    switch(drawType){
      case "line":
        interactionMode = "create";
        selectedShape = new line([{x: clickX, y: clickY}, {x: clickX, y: clickY}], defaultFormatting.borderColor, 1, null, defaultFormatting.textSize, defaultFormatting.textColor, defaultFormatting.fillColor, "Arial");
        createDragged = false;
        if (syncStateCallback) syncStateCallback();
        break;
      case "rectangle":
        interactionMode = "create";
        selectedShape = new rectangle([{x: clickX, y: clickY}, {x: clickX, y: clickY}], defaultFormatting.borderColor, 1, null, defaultFormatting.textSize, defaultFormatting.textColor, defaultFormatting.fillColor, "Arial");
        createDragged = false;
        if (syncStateCallback) syncStateCallback();
        break;
      case "oval":
        interactionMode = "create";
        selectedShape = new oval([{x: clickX, y: clickY}, {x: clickX, y: clickY}], defaultFormatting.borderColor, 1, null, defaultFormatting.textSize, defaultFormatting.textColor, defaultFormatting.fillColor, "Arial");
        createDragged = false;
        if (syncStateCallback) syncStateCallback();
        break;
      case "textbox":
        interactionMode = "create";
        selectedShape = new rectangle([{x: clickX, y: clickY}, {x: clickX, y: clickY}], "transparent", 0, "", defaultFormatting.textSize, defaultFormatting.textColor, null, "Arial");
        createDragged = false;
        if (syncStateCallback) syncStateCallback();
        break;
      default:
        let nearestShape = findNearestShapeAtPoint(clickPoint);
        if (nearestShape) {
          drawType = null;
          interactionMode = "edit";
          selectedShape = nearestShape;
          selectedHandle = null;
          if (syncStateCallback) syncStateCallback();
          redrawScene(true);
          return;
        }

        if (selectedShape !== null || interactionMode === "edit") {
          selectedShape = null;
          selectedHandle = null;
          interactionMode = null;
          lastClick = null;
          createDragged = false;
          if (syncStateCallback) syncStateCallback();
          redrawScene(false);
        }
    }

    if (selectedShape != null) {
      lastClick = {x: clickX, y: clickY};
      canvas.addEventListener("mousemove", mouseMoveHandler);
      canvas.addEventListener("mouseup", finishInteraction);
    }
  }
}

function load(){
  const data = {
    items: [  
      {
        type: "line",
        location: [{x: 0, y: 0}, {x: 320, y: 100}],
        borderColor: "black",
        borderWidth: 1,
        text: null,
        textSize: null,
        color: "black",
        textFont: "Arial",
        fillColor: null
      },  
      {
        type: "line",
        location: [{x: 320, y: 100}, {x: 520, y: 300}],
        borderColor: "red",
        borderWidth: 3,
        text: "test",
        textSize: 20,
        color: "black",
        textFont: "Arial",
        fillColor: null
      },
      {
        type: "rectangle",
        location: [{x: 0, y: 0}, {x: 100, y: 100}],
        borderColor: "red",
        borderWidth: 3,
        text: "Hello World",
        textSize: 15,
        color: "black",
        textFont: "Calibri",
        fillColor: null
      },
      {
        type: "oval",
        location: [{x: 150, y: 150}, {x: 300, y: 250}],
        borderColor: "blue",
        borderWidth: 2,
        text: "Centered Oval Text",
        textSize: 16,
        color: "black",
        textFont: "Arial",
        fillColor: null
      }
    ]
  }

  shapes = data.items.map((item) => {
    var temp;
    switch(item.type){
      case "line":
        temp = new line(item.location, item.borderColor, item.borderWidth, item.text, item.textSize, item.color, item.fillColor, item.textFont);
        break;
      case "rectangle":
        temp = new rectangle(item.location, item.borderColor, item.borderWidth, item.text, item.textSize, item.color, item.fillColor, item.textFont);
        break;
      case "oval":
        temp = new oval(item.location, item.borderColor, item.borderWidth, item.text, item.textSize, item.color, item.fillColor, item.textFont);
        break;
      default:
        temp = null
        break;
    }
    return temp;
  });

  redrawScene(false);

  const canvas = document.getElementById("document_foreground");
  if (canvas) {
    canvas.addEventListener("mousedown", mouseDownHandler);
    canvas.addEventListener("dblclick", mouseDoubleClickHandler);
    canvas.addEventListener("contextmenu", contextMenuHandler);
  }
}

function TooltipWrapper({ text, children }) {
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef(null);

  const handleMouseEnter = () => {
    timerRef.current = setTimeout(() => {
      setIsVisible(true);
    }, 500);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setIsVisible(false);
  };

  return (
    <div 
      style={{ position: 'relative', display: 'inline-block', width: '100%' }} 
      onMouseEnter={handleMouseEnter} 
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {isVisible && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginTop: '5px',
          padding: '5px',
          background: 'rgba(0,0,0,0.8)',
          color: 'white',
          fontSize: '12px',
          borderRadius: '3px',
          whiteSpace: 'nowrap',
          zIndex: 1000,
          pointerEvents: 'none'
        }}>
          {text}
        </div>
      )}
    </div>
  );
}

function ColorPickerDropdown({ icon, value, onChange, allowTransparent, isOpen, onToggle }) {
  const presetColors = ["#000000", "#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#00FFFF", "#FF00FF", "#FFFFFF", "#888888"];

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px', cursor: 'pointer' }}>
        <span>{icon}</span>
        <div style={{ width: '16px', height: '16px', background: value || 'transparent', border: '1px solid #ccc' }} />
      </button>
      {isOpen && (
        <div style={{ position: "absolute", top: "100%", left: 0, background: "white", border: "1px solid #ccc", padding: "5px", zIndex: 100, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "5px" }}>
          {allowTransparent && (
            <div onClick={() => { onChange(null); onToggle(); }} style={{ width: '20px', height: '20px', background: 'transparent', border: '1px solid #ccc', cursor: 'pointer', textAlign: 'center', fontSize: '12px', lineHeight: '20px' }}>T</div>
          )}
          {presetColors.map(c => (
            <div key={c} onClick={() => { onChange(c); onToggle(); }} style={{ width: '20px', height: '20px', background: c, border: '1px solid #ccc', cursor: 'pointer' }} />
          ))}
          <input type="color" value={value || "#000000"} onChange={e => { onChange(e.target.value); onToggle(); }} style={{ width: '24px', height: '24px', padding: 0, border: 'none', cursor: 'pointer' }} />
        </div>
      )}
    </div>
  );
}

function RenderPDFEditor(){
  const [formatting, setFormatting] = useState(defaultFormatting);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth - 240,
    height: window.innerHeight
  });

  useEffect(() => {
    onMount();
    load();

    updateFormattingRef = updateFormatting;

    syncStateCallback = () => {
      if (selectedShape) {
        const isEditing = inlineTextInput !== null;
        setFormatting({
          textSize: selectedShape.textSize || 14,
          isBold: isEditing ? document.queryCommandState('bold') : checkHtmlFormattingState(selectedShape.text, 'bold'),
          isItalic: isEditing ? document.queryCommandState('italic') : checkHtmlFormattingState(selectedShape.text, 'italic'),
          isUnderline: isEditing ? document.queryCommandState('underline') : checkHtmlFormattingState(selectedShape.text, 'underline'),
          textColor: selectedShape.color || "#000000",
          borderColor: selectedShape.borderColor || "#000000",
          fillColor: selectedShape.fillColor || null
        });
      } else {
        setFormatting(defaultFormatting);
      }
    };

    function handleResize() {
      setDimensions({
        width: window.innerWidth - 240,
        height: window.innerHeight
      });
    }

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      let canvas = document.getElementById("document_foreground");
      if (canvas) {
        canvas.removeEventListener("mousedown", mouseDownHandler);
        canvas.removeEventListener("dblclick", mouseDoubleClickHandler);
        canvas.removeEventListener("mousemove", mouseMoveHandler);
        canvas.removeEventListener("mouseup", finishInteraction);
        canvas.removeEventListener("contextmenu", contextMenuHandler);
      }
      removeInlineTextInput();
      backgroundCanvas = null;
      foregroundCanvas = null;
      syncStateCallback = null;
      updateFormattingRef = null;
    }
  }, []);

  useEffect(() => {
    redrawScene(false);
  }, [dimensions]);

  const updateFormatting = (key, value) => {
    if (selectedShape) {
      if (key === 'textSize') {
        selectedShape.textSize = value;
        if (inlineTextInput) {
          inlineTextInput.style.fontSize = `${value}px`;
          inlineTextInput.style.lineHeight = `${Math.max(12, Math.ceil(value * 1.2))}px`;
        }
      }
      
      if (key === 'isBold' || key === 'isItalic' || key === 'isUnderline' || key === 'link') {
        if (key === 'link') {
          const url = prompt("Enter URL:", "https://");
          if (url && inlineTextInput) {
            document.execCommand('createLink', false, url);
            selectedShape.text = inlineTextInput.innerHTML;
            if (syncStateCallback) syncStateCallback();
            redrawScene(interactionMode === "edit");
          }
          return;
        }

        const cmdMap = { isBold: 'bold', isItalic: 'italic', isUnderline: 'underline' };
        const cmd = cmdMap[key];

        if (inlineTextInput) {
          document.execCommand(cmd, false, null);
          selectedShape.text = inlineTextInput.innerHTML;

          if (syncStateCallback) syncStateCallback();
          redrawScene(interactionMode === "edit");
          return;
        } else {
          selectedShape.text = toggleHtmlFormatting(selectedShape.text, cmd);
        }
      }
      
      if (key === 'textColor') {
        selectedShape.color = value;
        if (inlineTextInput) inlineTextInput.style.color = value;
      }
      if (key === 'borderColor') selectedShape.borderColor = value;
      if (key === 'fillColor') selectedShape.fillColor = value;
      
      redrawScene(interactionMode === "edit");
    } else {
      defaultFormatting[key] = value;
    }
    
    setFormatting(prev => ({ ...prev, [key]: value }));
  };

  const handleDropdownToggle = (dropdownName) => {
    setActiveDropdown(prev => prev === dropdownName ? null : dropdownName);
  };

  const dpr = window.devicePixelRatio || 1;
  const canvasWidth = dimensions.width;
  const canvasHeight = dimensions.height;

  return (
    <div id="pdf-editor" style={{ display: "flex", width: "100vw", height: "100vh", overflow: "hidden" }}>
      <div style={{ width: "240px", background: "#f0f0f0", borderRight: "1px solid #ccc", padding: "10px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "10px" }}>
        <h3>Controls</h3>
        <button onClick={() => { drawType = "line"; if(interactionMode === "edit") { selectedShape = null; interactionMode = null; redrawScene(false); } }}>Line</button>
        <button onClick={() => { drawType = "rectangle"; if(interactionMode === "edit") { selectedShape = null; interactionMode = null; redrawScene(false); } }}>Rectangle</button>
        <button onClick={() => { drawType = "oval"; if(interactionMode === "edit") { selectedShape = null; interactionMode = null; redrawScene(false); } }}>Oval</button>
        <button onClick={() => { drawType = "textbox"; if(interactionMode === "edit") { selectedShape = null; interactionMode = null; redrawScene(false); } }}>Textbox</button>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '10px', borderTop: '1px solid #ccc', paddingTop: '10px' }}>
          <h4>Formatting</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <label>Size:</label>
            <input 
              type="number" 
              value={formatting.textSize} 
              onChange={(e) => updateFormatting('textSize', parseInt(e.target.value) || 12)} 
              style={{ width: '50px' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '5px' }}>
            <button
              className={`toolbar-btn ${formatting.isBold ? 'active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                updateFormatting('isBold', !formatting.isBold);
              }}
            >
              <b>B</b>
            </button>
            <button
              className={`toolbar-btn ${formatting.isItalic ? 'active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                updateFormatting('isItalic', !formatting.isItalic);
              }}
            >
              <i>I</i>
            </button>
            <button
              className={`toolbar-btn ${formatting.isUnderline ? 'active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                updateFormatting('isUnderline', !formatting.isUnderline);
              }}
            >
              <u>U</u>
            </button>
            <button
              className="toolbar-btn"
              onMouseDown={(e) => {
                e.preventDefault();
                updateFormatting('link');
              }}
            >
              🔗
            </button>
          </div>

          <TooltipWrapper text="Text Color">
            <ColorPickerDropdown 
              icon="T" 
              value={formatting.textColor} 
              onChange={(c) => updateFormatting('textColor', c)} 
              allowTransparent={false}
              isOpen={activeDropdown === 'text'}
              onToggle={() => handleDropdownToggle('text')}
            />
          </TooltipWrapper>

          <TooltipWrapper text="Border Color">
            <ColorPickerDropdown 
              icon="🔲" 
              value={formatting.borderColor} 
              onChange={(c) => updateFormatting('borderColor', c)} 
              allowTransparent={true}
              isOpen={activeDropdown === 'border'}
              onToggle={() => handleDropdownToggle('border')}
            />
          </TooltipWrapper>
          
          {(selectedShape instanceof rectangle || selectedShape instanceof oval) && (
            <TooltipWrapper text="Fill Color">
              <ColorPickerDropdown 
                icon="■" 
                value={formatting.fillColor} 
                onChange={(c) => updateFormatting('fillColor', c)} 
                allowTransparent={true}
                isOpen={activeDropdown === 'fill'}
                onToggle={() => handleDropdownToggle('fill')}
              />
            </TooltipWrapper>
          )}
        </div>

      </div>
      <div style={{ position: "relative", flex: 1, height: "100%" }}>
        <canvas 
          id="document_background" 
          width={canvasWidth * dpr} 
          height={canvasHeight * dpr}
          style={{ position: "absolute", left: 0, top: 0, width: `${canvasWidth}px`, height: `${canvasHeight}px` }}
        />
        <canvas 
          id="document_foreground" 
          width={canvasWidth * dpr} 
          height={canvasHeight * dpr}
          style={{ position: "absolute", left: 0, top: 0, width: `${canvasWidth}px`, height: `${canvasHeight}px` }}
        />
      </div>
    </div>
  );
}

export { RenderPDFEditor };