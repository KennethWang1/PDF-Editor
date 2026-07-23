import './pdf.css';
import React, { useState, useEffect, useRef } from 'react';
import { line, rectangle, oval, image } from './shapes.js';

let backgroundCanvas = null, foregroundCanvas = null, lastClick = null, shapes = [], drawType = null, selectedShape = null, selectedHandle = null, interactionMode = null, createDragged = false;
const createDragThreshold = 2;
let inlineTextInput = null, inlineTextInputWrapper = null, inlineTextShape = null;
let syncStateCallback = null;
let updateFormattingRef = null;
let zoomLevel = 1.0;
const MAX_PAGES = 10;

let defaultFormatting = {
  textSize: 14,
  fontFamily: "Arial",
  isBold: false,
  isItalic: false,
  isUnderline: false,
  textColor: "#000000",
  borderColor: "#000000",
  fillColor: null
};

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

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
}

function redrawScene(showSelectedOnForeground = true) {
  const dpr = window.devicePixelRatio || 1;
  const foregroundCanvases = document.querySelectorAll('[id^="document_foreground_"]');

  foregroundCanvases.forEach((fgCanvas) => {
    const pageIndex = parseInt(fgCanvas.id.replace('document_foreground_', ''), 10);
    const bgCanvas = document.getElementById(`document_background_${pageIndex}`);

    if (!fgCanvas || !bgCanvas) return;

    const bgCtx = bgCanvas.getContext('2d');
    const fgCtx = fgCanvas.getContext('2d');

    if (bgCtx) bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (fgCtx) fgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const logicalWidth = fgCanvas.width / dpr;
    const logicalHeight = fgCanvas.height / dpr;

    if (bgCtx) {
      bgCtx.clearRect(0, 0, logicalWidth, logicalHeight);
      shapes.forEach((item) => {
        if (item !== selectedShape && (item.pageIndex || 0) === pageIndex) {
          item.draw(bgCtx);
        }
      });
    }

    if (fgCtx) {
      fgCtx.clearRect(0, 0, logicalWidth, logicalHeight);
      if (showSelectedOnForeground && selectedShape !== null && (selectedShape.pageIndex || 0) === pageIndex) {
        selectedShape.draw(fgCtx, true);
        selectedShape.drawHighlightBox(fgCtx);
      }
    }
  });

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
    shape.textFont = defaultFormatting.fontFamily;
  }
}

function commitInlineTextInput() {
  if (!inlineTextInput || !inlineTextShape) return;

  const rawText = inlineTextInput.innerHTML;
  const plainText = inlineTextInput.textContent || inlineTextInput.innerText || "";
  
  inlineTextShape.text = plainText.trim() === "" ? null : rawText;
  removeInlineTextInput();
  redrawScene(true);
}

function removeInlineTextInput() {
  const input = inlineTextInput;
  const wrapper = inlineTextInputWrapper;

  if (inlineTextShape) {
    inlineTextShape.isEditingText = false; 
  }

  inlineTextInput = null;
  inlineTextInputWrapper = null;
  inlineTextShape = null;

  if (wrapper && wrapper.parentNode) {
    wrapper.parentNode.removeChild(wrapper);
  } else if (input && input.parentNode) {
    input.parentNode.removeChild(input);
  }
}

function updateInlineTextInputPosition() {
  if (!inlineTextInput || !inlineTextShape) return;

  const pageIndex = inlineTextShape.pageIndex || 0;
  const canvas = document.getElementById(`document_foreground_${pageIndex}`);
  const editor = document.getElementById("pdf-editor");
  if (!canvas || !editor) return;

  const info = inlineTextShape.getTextEditorInfo();
  ensureInlineTextDefaults(inlineTextShape);

  const canvasRect = canvas.getBoundingClientRect();
  const editorRect = editor.getBoundingClientRect();

  const left = canvasRect.left - editorRect.left + info.point.x * zoomLevel;
  const top = canvasRect.top - editorRect.top + info.point.y * zoomLevel;

  const wrapper = inlineTextInputWrapper || inlineTextInput;

  wrapper.style.left = `${left}px`;
  wrapper.style.top = `${top}px`;
  wrapper.style.width = `${info.width * zoomLevel}px`;
  wrapper.style.height = `${info.height * zoomLevel}px`;
  wrapper.style.transform = `rotate(${info.angle || 0}rad)`;

  if (inlineTextInput) {
    const scaledFontSize = (inlineTextShape.textSize || 14) * zoomLevel;
    inlineTextInput.style.fontSize = `${scaledFontSize}px`;
    const calculatedLineHeight = Math.max(12 * zoomLevel, Math.ceil(scaledFontSize * 1.2));
    inlineTextInput.style.lineHeight = `${calculatedLineHeight}px`;
  }

  if (inlineTextInputWrapper) {
    inlineTextInputWrapper.style.display = "flex";
    inlineTextInputWrapper.style.flexDirection = "column";
    inlineTextInputWrapper.style.justifyContent = info.vAlign === "center" ? "center" : (info.vAlign === "bottom" ? "flex-end" : "flex-start");

    inlineTextInput.style.width = "100%";
    inlineTextInput.style.display = "block";
    inlineTextInput.style.textAlign = info.align || "left";
  } else {
    inlineTextInput.style.height = `${info.height * zoomLevel}px`;
    inlineTextInput.style.display = "block";
    inlineTextInput.style.textAlign = info.align || "left";
  }
}

function openInlineTextInput(shape) {
  const editor = document.getElementById("pdf-editor");
  if (!editor) return;

  removeInlineTextInput();
  ensureInlineTextDefaults(shape);

  shape.isEditingText = true; 

  const info = shape.getTextEditorInfo ? shape.getTextEditorInfo() : {};

  const wrapper = document.createElement("div");
  wrapper.style.position = "absolute";
  wrapper.style.zIndex = "10";
  wrapper.style.padding = "0px";
  wrapper.style.margin = "0px";
  wrapper.style.boxSizing = "border-box";
  wrapper.style.transformOrigin = "left top";
  wrapper.style.pointerEvents = "none";
  wrapper.style.display = "flex";
  wrapper.style.flexDirection = "column";
  wrapper.style.justifyContent = info.vAlign === "center" ? "center" : (info.vAlign === "bottom" ? "flex-end" : "flex-start");

  const input = document.createElement("div");
  input.contentEditable = "true";

  input.innerHTML = shape.text == null ? "" : shape.text;

  const scaledFontSize = (shape.textSize || 14) * zoomLevel;
  input.style.padding = "0px";
  input.style.margin = "0px";
  input.style.fontSize = `${scaledFontSize}px`;
  input.style.fontFamily = shape.textFont;

  const calculatedLineHeight = Math.max(12 * zoomLevel, Math.ceil(scaledFontSize * 1.2));
  input.style.lineHeight = `${calculatedLineHeight}px`;
  input.style.color = shape.color;
  input.style.border = "1px dashed blue";
  input.style.background = "transparent";
  input.style.outline = "none";
  input.style.boxSizing = "border-box";
  input.style.whiteSpace = "pre-wrap";
  input.style.wordBreak = "break-word";
  input.style.display = "block";
  input.style.width = "100%";
  input.style.textAlign = info.align || "left";
  input.style.pointerEvents = "auto";

  input.addEventListener("input", () => {
    shape.text = input.innerHTML;
    if (syncStateCallback) syncStateCallback(); 
    redrawScene(true);
  });

  input.addEventListener("keyup", () => {
    if (syncStateCallback) syncStateCallback();
  });

  input.addEventListener("click", (evt) => {
    const link = evt.target && evt.target.closest ? evt.target.closest("a") : null;
    if (link && evt.button === 0) {
      evt.preventDefault();
    }
    if (syncStateCallback) syncStateCallback();
  });

  input.addEventListener("contextmenu", (evt) => {
    const link = evt.target && evt.target.closest ? evt.target.closest("a") : null;
    if (!link) {
      evt.preventDefault();
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
      redrawScene(true);
    }
  });

  wrapper.appendChild(input);
  editor.appendChild(wrapper);

  inlineTextInput = input;
  inlineTextInputWrapper = wrapper;
  inlineTextShape = shape;

  updateInlineTextInputPosition();
  redrawScene(true); 

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

function findNearestShapeAtPoint(point, pageIndex = 0) {
  let minDist = Infinity;
  let nearestShape = null;

  for (let i = 0; i < shapes.length; i++) {
    if ((shapes[i].pageIndex || 0) === pageIndex && shapes[i].collissionCheck(point)) {
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

function deleteSelectedShape() {
  if (selectedShape === null) return;
  removeInlineTextInput();
  shapes = shapes.filter((item) => item !== selectedShape);
  selectedShape = null;
  selectedHandle = null;
  interactionMode = null;
  lastClick = null;
  createDragged = false;
  if (syncStateCallback) syncStateCallback();
  redrawScene(false);
}

function mouseMoveHandler(event){
  if(selectedShape === null) return;

  const pageIndex = selectedShape.pageIndex || 0;
  let canvas = document.getElementById(`document_foreground_${pageIndex}`);
  if (!canvas) return;

  if (interactionMode === "create-click") {
    let rect = canvas.getBoundingClientRect();
    let eventX = (event.clientX - rect.left) / zoomLevel;
    let eventY = (event.clientY - rect.top) / zoomLevel;
    selectedShape.updateSecondLocation({x: eventX, y: eventY});
    redrawScene(true);
    return;
  }

  if(lastClick === null) return;
  let rect = canvas.getBoundingClientRect();
  let eventX = (event.clientX - rect.left) / zoomLevel;
  let eventY = (event.clientY - rect.top) / zoomLevel;

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

function mouseDoubleClickHandler(event, pageIndex = 0) {
  if (event.button !== 0) return;
  if (interactionMode === "create" || interactionMode === "create-click") return;

  let canvas = document.getElementById(`document_foreground_${pageIndex}`);
  if (!canvas) return;
  let rect = canvas.getBoundingClientRect();
  let clickX = (event.clientX - rect.left) / zoomLevel;
  let clickY = (event.clientY - rect.top) / zoomLevel;

  const clickPoint = { x: clickX, y: clickY };
  const targetShape = findNearestShapeAtPoint(clickPoint, pageIndex);
  if (!targetShape) return;

  drawType = null;
  selectedShape = targetShape;
  selectedHandle = null;
  interactionMode = "edit";

  if (syncStateCallback) syncStateCallback();
  redrawScene(true);
  openInlineTextInput(targetShape);
}

function contextMenuHandler(event, pageIndex = 0) {
  const canvas = document.getElementById(`document_foreground_${pageIndex}`);
  if (!canvas) return;

  let rect = canvas.getBoundingClientRect();
  let clickX = (event.clientX - rect.left) / zoomLevel;
  let clickY = (event.clientY - rect.top) / zoomLevel;

  const clickPoint = { x: clickX, y: clickY };
  const targetShape = findNearestShapeAtPoint(clickPoint, pageIndex);

  const url = getUrlFromShape(targetShape);
  if (url) {
    event.preventDefault();
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

function finishInteraction(){
  const pageIndex = selectedShape ? (selectedShape.pageIndex || 0) : 0;
  const canvas = document.getElementById(`document_foreground_${pageIndex}`);

  if (canvas) {
    canvas.removeEventListener("mousemove", mouseMoveHandler);
    canvas.removeEventListener("mouseup", finishInteraction);
  }
  window.removeEventListener("mousemove", mouseMoveHandler);
  window.removeEventListener("mouseup", finishInteraction);

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
      if (canvas) canvas.addEventListener("mousemove", mouseMoveHandler);
      createDragged = false;
      return;
    }
  }

  if (selectedShape != null && interactionMode === "create-click") {
    if (!removeZeroSizeSelectedShape()) {
      shapes.push(selectedShape);
      drawType = null;
    }
  }

  lastClick = null;
  selectedHandle = null;
  interactionMode = null;
  createDragged = false;

  if (syncStateCallback) syncStateCallback();
  redrawScene(true);
}

function mouseDownHandler(event, pageIndex = 0){
  let canvas = document.getElementById(`document_foreground_${pageIndex}`);
  if (!canvas) return;

  let rect = canvas.getBoundingClientRect();
  let clickX = (event.clientX - rect.left) / zoomLevel;
  let clickY = (event.clientY - rect.top) / zoomLevel;

  if (event.button === 0) {
    if (inlineTextInput) {
      const inlineRect = inlineTextInput.getBoundingClientRect();
      if (
        event.clientX >= inlineRect.left &&
        event.clientX <= inlineRect.right &&
        event.clientY >= inlineRect.top &&
        event.clientY <= inlineRect.bottom
      ) {
        return;
      }
    }

    if (interactionMode === "create-click") {
      finishInteraction();
      return;
    }

    commitInlineTextInput();

    if (drawType !== null) {
      selectedShape = null;
      selectedHandle = null;
      interactionMode = null;
    }

    if (selectedShape !== null && (selectedShape.pageIndex || 0) === pageIndex) {
      const handle = selectedShape.getHandleAtPoint({x: clickX, y: clickY});
      if (handle !== null) {
        selectedHandle = handle;
        if (handle === "rotate") {
          interactionMode = "rotate";
        } else {
          interactionMode = "resize";
        }
        lastClick = { x: clickX, y: clickY };
        canvas.addEventListener("mousemove", mouseMoveHandler);
        canvas.addEventListener("mouseup", finishInteraction);
        window.addEventListener("mousemove", mouseMoveHandler);
        window.addEventListener("mouseup", finishInteraction);
        redrawScene(true);
        if (syncStateCallback) syncStateCallback();
        return;
      }
    }

    const clickPoint = { x: clickX, y: clickY };

    if (lastClick === null){
      switch(drawType){
        case "line":
          interactionMode = "create";
          selectedShape = new line([{x: clickX, y: clickY}, {x: clickX, y: clickY}], defaultFormatting.borderColor, 1, null, defaultFormatting.textSize, defaultFormatting.textColor, defaultFormatting.fillColor, defaultFormatting.fontFamily);
          selectedShape.pageIndex = pageIndex;
          createDragged = false;
          if (syncStateCallback) syncStateCallback();
          break;
        case "rectangle":
          interactionMode = "create";
          selectedShape = new rectangle([{x: clickX, y: clickY}, {x: clickX, y: clickY}], defaultFormatting.borderColor, 1, null, defaultFormatting.textSize, defaultFormatting.textColor, defaultFormatting.fillColor, defaultFormatting.fontFamily);
          selectedShape.pageIndex = pageIndex;
          createDragged = false;
          if (syncStateCallback) syncStateCallback();
          break;
        case "oval":
          interactionMode = "create";
          selectedShape = new oval([{x: clickX, y: clickY}, {x: clickX, y: clickY}], defaultFormatting.borderColor, 1, null, defaultFormatting.textSize, defaultFormatting.textColor, defaultFormatting.fillColor, defaultFormatting.fontFamily);
          selectedShape.pageIndex = pageIndex;
          createDragged = false;
          if (syncStateCallback) syncStateCallback();
          break;
        case "textbox":
          interactionMode = "create";
          selectedShape = new rectangle([{x: clickX, y: clickY}, {x: clickX, y: clickY}], "transparent", 0, "", defaultFormatting.textSize, defaultFormatting.textColor, null, defaultFormatting.fontFamily);
          selectedShape.pageIndex = pageIndex;
          createDragged = false;
          if (syncStateCallback) syncStateCallback();
          break;
        default:
          const targetShape = findNearestShapeAtPoint(clickPoint, pageIndex);
          if (targetShape) {
            selectedShape = targetShape;
            interactionMode = "move";
          } else {
            selectedShape = null;
            interactionMode = null;
          }
          if (syncStateCallback) syncStateCallback();
          break;
      }
    }

    lastClick = { x: clickX, y: clickY };
    canvas.addEventListener("mousemove", mouseMoveHandler);
    canvas.addEventListener("mouseup", finishInteraction);
    window.addEventListener("mousemove", mouseMoveHandler);
    window.addEventListener("mouseup", finishInteraction);

    redrawScene(true);
  }
}

function ColorPickerDropdown({ icon, value, onChange, allowTransparent = false, isOpen, onToggle }) {
  const dropdownRef = useRef(null);
  const colors = [
    "#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc", "#d9d9d9", "#efefef", "#f3f3f3", "#ffffff",
    "#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#4a86e8", "#0000ff", "#9900ff", "#ff00ff",
    "#e6b8af", "#f4ccd0", "#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3", "#c9daf8", "#cfe2f3", "#d9d2e9", "#ead1dc",
    "#dd7e6b", "#ea9999", "#f9cb9c", "#ffe599", "#b6d7a8", "#a2c4c9", "#a4c2f4", "#9fc5e8", "#b4a7d6", "#d5a6bd",
    "#cc4125", "#e06666", "#f6b26b", "#ffd966", "#93c47d", "#76a5af", "#6fa8dc", "#6fa8dc", "#8e7cc3", "#c27ba0",
    "#a61c1c", "#cc0000", "#e69138", "#f1c232", "#6aa84f", "#45818e", "#3d85c6", "#0b5394", "#351c75", "#741b47"
  ];

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        if (isOpen) onToggle();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onToggle]);

  return (
    <div ref={dropdownRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        className="toolbar-button"
        onClick={onToggle}
        style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2px 6px" }}
      >
        <span style={{ fontSize: "12px", lineHeight: "1" }}>{icon}</span>
        <div style={{ width: "14px", height: "3px", backgroundColor: value === "transparent" || !value ? "#ccc" : value, marginTop: "2px", border: "1px solid #999" }} />
      </button>

      {isOpen && (
        <div style={{
          position: "absolute",
          top: "100%",
          left: 0,
          zIndex: 1000,
          backgroundColor: "#fff",
          border: "1px solid #ccc",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          padding: "8px",
          borderRadius: "4px",
          width: "170px"
        }}>
          {allowTransparent && (
            <button
              onClick={() => { onChange("transparent"); onToggle(); }}
              style={{ width: "100%", padding: "4px", marginBottom: "6px", fontSize: "11px", cursor: "pointer", background: "#f0f0f0", border: "1px solid #ccc", borderRadius: "3px" }}
            >
              No Color (Transparent)
            </button>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: "2px" }}>
            {colors.map((c, i) => (
              <div
                key={i}
                onClick={() => { onChange(c); onToggle(); }}
                style={{
                  width: "12px",
                  height: "12px",
                  backgroundColor: c,
                  cursor: "pointer",
                  border: value === c ? "1px solid #000" : "1px solid #eee",
                  boxSizing: "border-box"
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RenderPDFEditor() {
  const [pages, setPages] = useState([{ pageIndex: 0 }]);
  const [activeTool, setActiveTool] = useState(null);
  const [formatting, setFormatting] = useState(defaultFormatting);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const fileInputRef = useRef(null);
  const viewportRef = useRef(null);
  const [zoom, setZoom] = useState(1.0);
  const zoomRef = useRef(1.0);
  const [dimensions, setDimensions] = useState({ width: 816, height: 1056 });
  const [showImagesModal, setShowImagesModal] = useState(false);
  const [userImages, setUserImages] = useState([]);
  const [isUploading, setIsUploading] = useState(false);

  const getAuthTokenHeader = () => {
    const getCookie = (name) => {
      if (typeof document === 'undefined') return null;
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop().split(';').shift();
      return null;
    };
    const auth = getCookie('auth') || (typeof localStorage !== 'undefined' ? localStorage.getItem('auth') : null);
    const version = getCookie('version') || (typeof localStorage !== 'undefined' ? localStorage.getItem('version') : '1');
    if (auth) {
      return `Bearer ${auth},${version}`;
    }
    return null;
  };

  const updateZoom = (newZoom) => {
    const clamped = Math.min(Math.max(0.25, Math.round(newZoom * 100) / 100), 3.0);
    zoomLevel = clamped;
    zoomRef.current = clamped;
    setZoom(clamped);
    redrawScene(true);
  };

  const handleZoomIn = () => updateZoom(zoom + 0.1);
  const handleZoomOut = () => updateZoom(zoom - 0.1);
  const handleResetZoom = () => updateZoom(1.0);

  const fetchUserImages = async () => {
    try {
      const authHeader = getAuthTokenHeader();
      const res = await fetch('/api/user-images', {
        headers: authHeader ? { 'Authorization': authHeader } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setUserImages(data.images || []);
      }
    } catch (err) {
      console.error('Failed to fetch user images:', err);
    }
  };

  const handleOpenImagesModal = () => {
    setShowImagesModal(true);
    fetchUserImages();
  };

  const handleUploadImage = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);

    setIsUploading(true);
    try {
      const authHeader = getAuthTokenHeader();
      const res = await fetch('/api/upload-image', {
        method: 'POST',
        headers: authHeader ? { 'Authorization': authHeader } : {},
        body: formData
      });

      if (!res.ok) {
        throw new Error('Upload failed');
      }

      const data = await res.json();
      const newImageObj = { filename: data.filename || file.name, url: data.url };
      setUserImages((prev) => [newImageObj, ...prev]);
      handleSelectImage(data.url);
    } catch (err) {
      console.error('Image upload error:', err);
      alert('An error occurred while uploading the image.');
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const handleSelectImage = (imageUrl) => {
    const pageIndex = 0;
    const canvas = document.getElementById(`document_foreground_${pageIndex}`);
    const cw = canvas ? canvas.width / (window.devicePixelRatio || 1) : 800;
    const ch = canvas ? canvas.height / (window.devicePixelRatio || 1) : 600;

    const imgWidth = 200;
    const imgHeight = 150;
    const startX = Math.max(20, (cw - imgWidth) / 2);
    const startY = Math.max(20, (ch - imgHeight) / 2);

    const newImgShape = new image(
      [{ x: startX, y: startY }, { x: startX + imgWidth, y: startY + imgHeight }],
      "transparent",
      0,
      null,
      null,
      null,
      null,
      defaultFormatting.fontFamily,
      imageUrl
    );
    newImgShape.pageIndex = pageIndex;
    newImgShape.loadImage(imageUrl, () => {
      shapes.push(newImgShape);
      selectedShape = newImgShape;
      redrawScene(true);
    });
    setShowImagesModal(false);
  };

  const handleToolChange = (tool) => {
    drawType = activeTool === tool ? null : tool;
    setActiveTool(drawType);
  };

  const handleAddPage = () => {
    if (pages.length < MAX_PAGES) {
      setPages([...pages, { pageIndex: pages.length }]);
    }
  };

  const handleSave = () => {
    const jsonString = JSON.stringify(shapes);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "document.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (Array.isArray(data)) {
          load(data);
        } else {
          alert("Invalid file format.");
        }
      } catch (err) {
        alert("Failed to parse JSON file.");
      }
    };
    reader.readAsText(file);
    e.target.value = null;
  };

  function load(dataToLoad) {
    if (!dataToLoad) return;
    selectedShape = null;
    shapes = dataToLoad.map((item) => {
      let temp = null;
      switch (item.type) {
        case "line":
          temp = new line(item.location, item.borderColor, item.borderWidth, item.text, item.textSize, item.color, item.fillColor, item.textFont);
          break;
        case "rectangle":
          temp = new rectangle(item.location, item.borderColor, item.borderWidth, item.text, item.textSize, item.color, item.fillColor, item.textFont);
          break;
        case "oval":
          temp = new oval(item.location, item.borderColor, item.borderWidth, item.text, item.textSize, item.color, item.fillColor, item.textFont);
          break;
        case "image":
          temp = new image(item.location, item.borderColor || "transparent", item.borderWidth || 0, item.text, item.textSize, item.color, item.fillColor, item.textFont, item.imageSrc);
          break;
        default:
          temp = null;
          break;
      }
      if (temp) {
        temp.pageIndex = item.pageIndex || 0;
      }
      return temp;
    });
    redrawScene(false);
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
            left: '100%',
            top: '50%',
            transform: 'translateY(-50%)',
            marginLeft: '8px',
            backgroundColor: '#333',
            color: '#fff',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            whiteSpace: 'nowrap',
            zIndex: 1000,
            pointerEvents: 'none',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}>
            {text}
          </div>
        )}
      </div>
    );
  }

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const target = e.target;
        const isInput = target && (
          target.tagName === 'INPUT' || 
          target.tagName === 'TEXTAREA' || 
          target.isContentEditable
        );

        if (!isInput) {
          e.preventDefault();
          deleteSelectedShape();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    onMount();
    load();
    updateFormattingRef = updateFormatting;

    syncStateCallback = () => {
      if (selectedShape) {
        const isEditing = inlineTextInput !== null;
        setFormatting({
          textSize: selectedShape.textSize || 14,
          fontFamily: selectedShape.textFont || defaultFormatting.fontFamily,
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

    return () => {
      removeInlineTextInput();
      backgroundCanvas = null;
      foregroundCanvas = null;
      syncStateCallback = null;
      updateFormattingRef = null;
    };
  }, []);

  useEffect(() => {
    redrawScene(true);
  }, [pages]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    let initialPinchDist = null;
    let initialPinchZoom = 1.0;

    const handleWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const zoomDelta = e.deltaY < 0 ? 0.05 : -0.05;
        updateZoom(zoomRef.current + zoomDelta);
      }
    };

    const handleTouchStart = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        initialPinchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        initialPinchZoom = zoomRef.current;
      }
    };

    const handleTouchMove = (e) => {
      if (e.touches.length === 2 && initialPinchDist !== null) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const factor = currentDist / initialPinchDist;
        updateZoom(initialPinchZoom * factor);
      }
    };

    const handleTouchEnd = (e) => {
      if (e.touches.length < 2) {
        initialPinchDist = null;
      }
    };

    viewport.addEventListener('wheel', handleWheel, { passive: false });
    viewport.addEventListener('touchstart', handleTouchStart, { passive: false });
    viewport.addEventListener('touchmove', handleTouchMove, { passive: false });
    viewport.addEventListener('touchend', handleTouchEnd);

    return () => {
      viewport.removeEventListener('wheel', handleWheel);
      viewport.removeEventListener('touchstart', handleTouchStart);
      viewport.removeEventListener('touchmove', handleTouchMove);
      viewport.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  useEffect(() => {
    pages.forEach(({ pageIndex }) => {
      const bgCanvas = document.getElementById(`document_background_${pageIndex}`);
      const fgCanvas = document.getElementById(`document_foreground_${pageIndex}`);
      if (!bgCanvas || !fgCanvas) return;

      const dpr = window.devicePixelRatio || 1;

      bgCanvas.width = dimensions.width * dpr;
      bgCanvas.height = dimensions.height * dpr;
      fgCanvas.width = dimensions.width * dpr;
      fgCanvas.height = dimensions.height * dpr;

      bgCanvas.style.width = `${dimensions.width}px`;
      bgCanvas.style.height = `${dimensions.height}px`;
      fgCanvas.style.width = `${dimensions.width}px`;
      fgCanvas.style.height = `${dimensions.height}px`;

      const bgCtx = bgCanvas.getContext('2d');
      const fgCtx = fgCanvas.getContext('2d');

      if (bgCtx) bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (fgCtx) fgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });

    redrawScene(true);
  }, [pages, dimensions]);

  const updateFormatting = (key, value) => {
    if (selectedShape) {
      if (key === 'textSize') {
        selectedShape.textSize = value;
        if (inlineTextInput) {
          const scaledSize = value * zoomLevel;
          inlineTextInput.style.fontSize = `${scaledSize}px`;
          inlineTextInput.style.lineHeight = `${Math.max(12 * zoomLevel, Math.ceil(scaledSize * 1.2))}px`;
        }
      }
      if (key === 'fontFamily') {
        selectedShape.textFont = value;
        if (inlineTextInput) {
          inlineTextInput.style.fontFamily = value;
        }
      }
      if (key === 'isBold' || key === 'isItalic' || key === 'isUnderline' || key === 'link') {
        if (key === 'link') {
          const url = prompt("Enter URL:", "https://");
          if (url && inlineTextInput) {
            document.execCommand('createLink', false, url);
            selectedShape.text = inlineTextInput.innerHTML;
            if (syncStateCallback) syncStateCallback();
            redrawScene(true);
          }
          return;
        }
        const cmdMap = { isBold: 'bold', isItalic: 'italic', isUnderline: 'underline' };
        const cmd = cmdMap[key];
        if (inlineTextInput) {
          document.execCommand(cmd, false, null);
          selectedShape.text = inlineTextInput.innerHTML;
          if (syncStateCallback) syncStateCallback();
          redrawScene(true);
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
      redrawScene(true);
    } else {
      defaultFormatting[key] = value;
    }
    setFormatting(prev => ({ ...prev, [key]: value }));
  };

  const handleDropdownToggle = (dropdownName) => {
    setActiveDropdown(prev => prev === dropdownName ? null : dropdownName);
  };

  return (
    <div id="pdf-editor" style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden', position: 'relative' }}>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".json"
        style={{ display: 'none' }}
      />

      <header id="toolbar" style={{ display: 'flex', gap: '15px', alignItems: 'center', justifyContent: 'center' }}>
        <button className="toolbar-button" onClick={handleSave}>Save</button>
        <div style={{ height: '20px', width: '1px', backgroundColor: '#ccc' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <label style={{ fontSize: '12px' }}>Font:</label>
          <select
            value={formatting.fontFamily}
            onChange={(e) => updateFormatting('fontFamily', e.target.value)}
            style={{ height: '26px', borderRadius: '4px', border: '1px solid #ccc', padding: '0 4px', fontSize: '12px' }}
          >
            <option value="Arial">Arial</option>
            <option value="Helvetica">Helvetica</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Courier New">Courier New</option>
            <option value="Georgia">Georgia</option>
            <option value="Verdana">Verdana</option>
            <option value="Trebuchet MS">Trebuchet MS</option>
            <option value="Comic Sans MS">Comic Sans MS</option>
            <option value="Impact">Impact</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <label style={{ fontSize: '12px' }}>Font Size:</label>
          <input
            type="number"
            value={formatting.textSize}
            onChange={(e) => updateFormatting('textSize', parseInt(e.target.value) || 12)}
            style={{ width: '50px' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '5px' }}>
          <button
            className={`toolbar-button ${formatting.isBold ? 'active' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); updateFormatting('isBold', !formatting.isBold); }}
          >
            <b>B</b>
          </button>
          <button
            className={`toolbar-button ${formatting.isItalic ? 'active' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); updateFormatting('isItalic', !formatting.isItalic); }}
          >
            <i>I</i>
          </button>
          <button
            className={`toolbar-button ${formatting.isUnderline ? 'active' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); updateFormatting('isUnderline', !formatting.isUnderline); }}
          >
            <u>U</u>
          </button>
          <button
            className="toolbar-button"
            onMouseDown={(e) => { e.preventDefault(); updateFormatting('link'); }}
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
              icon="🎨"
              value={formatting.fillColor}
              onChange={(c) => updateFormatting('fillColor', c)}
              allowTransparent={true}
              isOpen={activeDropdown === 'fill'}
              onToggle={() => handleDropdownToggle('fill')}
            />
          </TooltipWrapper>
        )}
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <aside id="button-col" style={{ zIndex: 10 }}>
          <TooltipWrapper text="Draw Line">
            <button className={`toolbar-button ${activeTool === 'line' ? 'active' : ''}`} onClick={() => handleToolChange('line')}>Line</button>
          </TooltipWrapper>
          <TooltipWrapper text="Draw Rectangle">
            <button className={`toolbar-button ${activeTool === 'rectangle' ? 'active' : ''}`} onClick={() => handleToolChange('rectangle')}>Rectangle</button>
          </TooltipWrapper>
          <TooltipWrapper text="Draw Oval">
            <button className={`toolbar-button ${activeTool === 'oval' ? 'active' : ''}`} onClick={() => handleToolChange('oval')}>Oval</button>
          </TooltipWrapper>
          <TooltipWrapper text="Add Text Box">
            <button className={`toolbar-button ${activeTool === 'textbox' ? 'active' : ''}`} onClick={() => handleToolChange('textbox')}>Text Box</button>
          </TooltipWrapper>
          <TooltipWrapper text="Insert Image">
            <button className="toolbar-button" onClick={handleOpenImagesModal}>Image</button>
          </TooltipWrapper>
        </aside>

        <main
          ref={viewportRef}
          style={{
            flex: 1,
            overflow: 'auto',
            backgroundColor: '#ffffff',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '20px 0'
          }}
        >
          {pages.map(({ pageIndex }) => (
            <div
              key={pageIndex}
              style={{
                position: 'relative',
                width: `${dimensions.width * zoom}px`,
                height: `${dimensions.height * zoom}px`,
                marginBottom: '20px',
                flexShrink: 0
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: `${dimensions.width}px`,
                  height: `${dimensions.height}px`,
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top left'
                }}
              >
                <canvas
                  id={`document_background_${pageIndex}`}
                  style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
                />
                <canvas
                  id={`document_foreground_${pageIndex}`}
                  onMouseDown={(e) => mouseDownHandler(e, pageIndex)}
                  onDoubleClick={(e) => mouseDoubleClickHandler(e, pageIndex)}
                  onContextMenu={(e) => contextMenuHandler(e, pageIndex)}
                  style={{ position: 'absolute', top: 0, left: 0 }}
                />
              </div>
            </div>
          ))}

          {pages.length < MAX_PAGES && (
            <button
              onClick={handleAddPage}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: 'pointer',
                backgroundColor: '#ffffff',
                border: '1px dashed #007bff',
                color: '#007bff',
                borderRadius: '4px',
                marginBottom: '40px'
              }}
            >
              + Add Page ({pages.length}/{MAX_PAGES})
            </button>
          )}

          <div style={{
            position: "fixed",
            bottom: "20px",
            left: "calc(50% + 120px)",
            transform: "translateX(-50%)",
            backgroundColor: "#ffffff",
            border: "1px solid #ccc",
            borderRadius: "20px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
            padding: "6px 16px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            zIndex: 100
          }}>
            <button 
              onClick={handleZoomOut}
              disabled={zoom <= 0.25}
              style={{ border: "none", background: "none", cursor: zoom <= 0.25 ? "default" : "pointer", fontSize: "16px", padding: "2px 6px", opacity: zoom <= 0.25 ? 0.4 : 1 }}
              title="Zoom Out"
            >
              −
            </button>
            <span 
              onClick={handleResetZoom}
              style={{ fontSize: "13px", fontWeight: "bold", minWidth: "45px", textAlign: "center", cursor: "pointer", userSelect: "none" }}
              title="Reset Zoom (100%)"
            >
              {Math.round(zoom * 100)}%
            </span>
            <button 
              onClick={handleZoomIn}
              disabled={zoom >= 3.0}
              style={{ border: "none", background: "none", cursor: zoom >= 3.0 ? "default" : "pointer", fontSize: "16px", padding: "2px 6px", opacity: zoom >= 3.0 ? 0.4 : 1 }}
              title="Zoom In"
            >
              +
            </button>
          </div>
        </main>
      </div>

      {showImagesModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.5)',
          zIndex: 2000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '8px',
            width: '500px',
            maxWidth: '90%',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '18px' }}>Select an Image</h3>
              <button onClick={() => setShowImagesModal(false)} style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer', color: '#666' }}>&times;</button>
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={{
                  padding: '8px 16px',
                  backgroundColor: '#007bff',
                  color: '#fff',
                  borderRadius: '4px',
                  cursor: isUploading ? 'not-allowed' : 'pointer',
                  fontSize: '14px'
                }}>
                  {isUploading ? 'Uploading...' : 'Upload New Image'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleUploadImage}
                    disabled={isUploading}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>

              {userImages.length === 0 ? (
                <p style={{ color: '#888', fontStyle: 'italic', textAlign: 'center', margin: '30px 0' }}>
                  No uploaded images yet.
                </p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  {userImages.map((img) => (
                    <div
                      key={img.filename}
                      onClick={() => handleSelectImage(img.url)}
                      style={{
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        height: '90px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#f9f9f9',
                        transition: 'border-color 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.borderColor = '#007bff'}
                      onMouseLeave={(e) => e.currentTarget.style.borderColor = '#ddd'}
                    >
                      <img src={img.url} alt={img.filename} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid #eee', textAlign: 'right' }}>
              <button
                onClick={() => setShowImagesModal(false)}
                style={{ padding: '6px 16px', borderRadius: '4px', border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { RenderPDFEditor };