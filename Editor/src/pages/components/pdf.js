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
  fillColor: null,
  textAlign: "left",
  verticalAlign: "top",
  letterSpacing: 0,
  lineHeight: 1.2,
  isStrikethrough: false,
  textTransform: "none",
  padding: 5
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
    const calculatedLineHeight = Math.max(12 * zoomLevel, Math.ceil(scaledFontSize * (inlineTextShape.lineHeight || 1.2)));
    inlineTextInput.style.lineHeight = `${calculatedLineHeight}px`;
    inlineTextInput.style.letterSpacing = `${(inlineTextShape.letterSpacing || 0) * zoomLevel}px`;
    inlineTextInput.style.textTransform = inlineTextShape.textTransform || 'none';
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

  const calculatedLineHeight = Math.max(12 * zoomLevel, Math.ceil(scaledFontSize * (shape.lineHeight || 1.2)));
  input.style.lineHeight = `${calculatedLineHeight}px`;
  input.style.letterSpacing = `${(shape.letterSpacing || 0) * zoomLevel}px`;
  input.style.textTransform = shape.textTransform || 'none';
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

  interactionMode = null;
  selectedHandle = null;
  lastClick = null;
  createDragged = false;
  if (syncStateCallback) syncStateCallback();
  redrawScene(true);
}

function mouseDownHandler(event, pageIndex = 0){
  let canvas = document.getElementById(`document_foreground_${pageIndex}`);
  if (!canvas) return;

  if (event.button !== 0) return;

  let rect = canvas.getBoundingClientRect();
  let clickX = (event.clientX - rect.left) / zoomLevel;
  let clickY = (event.clientY - rect.top) / zoomLevel;
  const clickPoint = { x: clickX, y: clickY };

  if (interactionMode === "create-click" && selectedShape) {
    finishInteraction();
    return;
  }

  commitInlineTextInput();

  lastClick = { x: clickX, y: clickY };

  if (selectedShape !== null && (selectedShape.pageIndex || 0) === pageIndex) {
    const handle = selectedShape.getHandleAtPoint(clickPoint);
    if (handle !== null) {
      if (handle === "rotate") {
        interactionMode = "rotate";
      } else {
        interactionMode = "resize";
        selectedHandle = handle;
      }
      canvas.addEventListener("mousemove", mouseMoveHandler);
      canvas.addEventListener("mouseup", finishInteraction);
      window.addEventListener("mousemove", mouseMoveHandler);
      window.addEventListener("mouseup", finishInteraction);
      return;
    }
  }

  switch(drawType) {
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
        if (syncStateCallback) syncStateCallback();
      } else {
        selectedShape = null;
        interactionMode = null;
        if (syncStateCallback) syncStateCallback();
      }
      break;
  }

  canvas.addEventListener("mousemove", mouseMoveHandler);
  canvas.addEventListener("mouseup", finishInteraction);
  window.addEventListener("mousemove", mouseMoveHandler);
  window.addEventListener("mouseup", finishInteraction);
  redrawScene(true);
}

function CustomColorPicker({ value, onChange, allowTransparent = false, isOpen, onToggle }) {
  const colors = [
    "#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc", "#d9d9d9", "#efefef", "#f3f3f3", "#ffffff",
    "#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#4a86e8", "#0000ff", "#9900ff", "#ff00ff",
    "#e6b8af", "#f4ccd0", "#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3", "#c9daf8", "#cfe2f3", "#d9d2e9", "#ead1dc",
    "#dd7e6b", "#ea9999", "#f9cb9c", "#ffe599", "#b6d7a8", "#a2c4c9", "#9fc5e8", "#8e7cc3", "#c27ba0", "#a64d79"
  ];

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={onToggle}
        style={{
          width: "24px",
          height: "24px",
          backgroundColor: value === "transparent" || !value ? "#fff" : value,
          border: "1px solid #ccc",
          borderRadius: "4px",
          cursor: "pointer",
          position: "relative",
          overflow: "hidden"
        }}
      >
        {(value === "transparent" || !value) && (
          <div style={{
            position: "absolute",
            top: "50%",
            left: "-20%",
            width: "140%",
            height: "1.5px",
            backgroundColor: "red",
            transform: "rotate(-45deg)"
          }} />
        )}
      </button>

      {isOpen && (
        <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 1000, backgroundColor: "#fff", border: "1px solid #ccc", boxShadow: "0 2px 8px rgba(0,0,0,0.15)", padding: "8px", borderRadius: "4px", width: "170px" }}>
          {allowTransparent && (
            <button
              onClick={() => {
                onChange("transparent");
                onToggle();
              }}
              style={{ width: "100%", padding: "4px", marginBottom: "6px", fontSize: "11px", cursor: "pointer", background: "#f0f0f0", border: "1px solid #ccc", borderRadius: "3px" }}
            >
              No Color (Transparent)
            </button>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: "2px" }}>
            {colors.map((c, i) => (
              <div
                key={i}
                onClick={() => {
                  onChange(c);
                  onToggle();
                }}
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
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const fileInputRef = useRef(null);
  const viewportRef = useRef(null);
  const zoomRef = useRef(1.0);

  const [showImagesModal, setShowImagesModal] = useState(false);
  const [userImages, setUserImages] = useState([]);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    updateFormattingRef = updateFormatting;
  });

  const handleAddPage = () => {
    if (pages.length < MAX_PAGES) {
      setPages((prev) => [...prev, { pageIndex: prev.length }]);
    }
  };

  const syncState = () => {
    if (selectedShape) {
      let isB = false;
      let isI = false;
      let isU = false;

      if (inlineTextInput) {
        isB = checkHtmlFormattingState(inlineTextInput.innerHTML, 'bold');
        isI = checkHtmlFormattingState(inlineTextInput.innerHTML, 'italic');
        isU = checkHtmlFormattingState(inlineTextInput.innerHTML, 'underline');
      } else if (selectedShape.text) {
        isB = checkHtmlFormattingState(selectedShape.text, 'bold');
        isI = checkHtmlFormattingState(selectedShape.text, 'italic');
        isU = checkHtmlFormattingState(selectedShape.text, 'underline');
      }

      setFormatting({
        textSize: selectedShape.textSize || defaultFormatting.textSize,
        fontFamily: selectedShape.textFont || defaultFormatting.fontFamily,
        isBold: isB,
        isItalic: isI,
        isUnderline: isU,
        textColor: selectedShape.color || defaultFormatting.textColor,
        borderColor: selectedShape.borderColor || defaultFormatting.borderColor,
        fillColor: selectedShape.fillColor || defaultFormatting.fillColor,
        textAlign: selectedShape.textAlign || "left",
        verticalAlign: selectedShape.verticalAlign || "top",
        letterSpacing: selectedShape.letterSpacing || 0,
        lineHeight: selectedShape.lineHeight || 1.2,
        isStrikethrough: selectedShape.isStrikethrough || false,
        textTransform: selectedShape.textTransform || "none",
        padding: selectedShape.padding != null ? selectedShape.padding : 5
      });
    }
  };

  useEffect(() => {
    syncStateCallback = syncState;
    onMount();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (inlineTextInput !== null) return;
        if (selectedShape !== null) {
          e.preventDefault();
          deleteSelectedShape();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleToolChange = (tool) => {
    if (activeTool === tool) {
      setActiveTool(null);
      drawType = null;
    } else {
      setActiveTool(tool);
      drawType = tool;
    }
    selectedShape = null;
    redrawScene(true);
  };

  const updateZoom = (newZoom) => {
    const clampedZoom = Math.min(Math.max(newZoom, 0.5), 2.5);
    zoomLevel = clampedZoom;
    zoomRef.current = clampedZoom;
    const documentContainer = document.getElementById('document-container');
    if (documentContainer) {
      documentContainer.style.transform = `scale(${clampedZoom})`;
      documentContainer.style.transformOrigin = 'top center';
    }
    updateInlineTextInputPosition();
    redrawScene(true);
  };

  const getAuthTokenHeader = () => {
    const token = getCookie('authtoken');
    return token ? `Bearer ${token}` : null;
  };

  const handleOpenImagesModal = async () => {
    setShowImagesModal(true);
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

  const handleImageUpload = async (event) => {
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
      'transparent',
      0,
      null,
      null,
      null,
      null,
      null,
      imageUrl
    );
    newImgShape.pageIndex = pageIndex;

    shapes.push(newImgShape);
    selectedShape = newImgShape;
    interactionMode = null;
    setShowImagesModal(false);
    if (syncStateCallback) syncStateCallback();
    redrawScene(true);
  };

  const handleSave = () => {
    const exportData = shapes.map((shape) => {
      let type = "line";
      if (shape instanceof rectangle && !(shape instanceof oval) && !(shape instanceof image)) type = "rectangle";
      if (shape instanceof oval) type = "oval";
      if (shape instanceof image) type = "image";

      return {
        type: type,
        location: shape.location,
        borderColor: shape.borderColor,
        borderWidth: shape.borderWidth,
        text: shape.text,
        textSize: shape.textSize,
        color: shape.color,
        fillColor: shape.fillColor,
        textFont: shape.textFont,
        imageSrc: shape instanceof image ? shape.imageSrc : undefined,
        pageIndex: shape.pageIndex || 0,
        textAlign: shape.textAlign,
        verticalAlign: shape.verticalAlign,
        letterSpacing: shape.letterSpacing,
        lineHeight: shape.lineHeight,
        isStrikethrough: shape.isStrikethrough,
        textTransform: shape.textTransform,
        padding: shape.padding
      };
    });

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "pdf_editor_shapes.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleLoadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (event) => {
    const fileObj = event.target.files && event.target.files[0];
    if (!fileObj) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (Array.isArray(parsed)) {
          loadShapesData(parsed);
        }
      } catch (err) {
        console.error("Invalid JSON format:", err);
      }
    };
    reader.readAsText(fileObj);
    event.target.value = "";
  };

  const loadShapesData = (data) => {
    shapes = data.map((item) => {
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
        temp.textAlign = item.textAlign || "left";
        temp.verticalAlign = item.verticalAlign || "top";
        temp.letterSpacing = item.letterSpacing || 0;
        temp.lineHeight = item.lineHeight || 1.2;
        temp.isStrikethrough = item.isStrikethrough || false;
        temp.textTransform = item.textTransform || "none";
        temp.padding = item.padding != null ? item.padding : 5;
      }
      return temp;
    });
    redrawScene(false);
  };

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
            backgroundColor: 'rgba(0,0,0,0.8)',
            color: '#fff',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '11px',
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

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    let initialPinchDist = null;
    let initialPinchZoom = 1.0;

    const handleWheel = (e) => {
      if (e.ctrlKey) {
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

      if (bgCanvas && fgCanvas) {
        const bgCtx = bgCanvas.getContext('2d');
        const fgCtx = fgCanvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        bgCanvas.width = 800 * dpr;
        bgCanvas.height = 1000 * dpr;
        fgCanvas.width = 800 * dpr;
        fgCanvas.height = 1000 * dpr;

        bgCanvas.style.width = '800px';
        bgCanvas.style.height = '1000px';
        fgCanvas.style.width = '800px';
        fgCanvas.style.height = '1000px';

        bgCtx.scale(dpr, dpr);
        fgCtx.scale(dpr, dpr);
      }
    });

    redrawScene(true);
  }, [pages]);

  const updateFormatting = (key, value) => {
    if (selectedShape) {
      selectedShape[key] = value;

      if (key === 'textSize') {
        selectedShape.textSize = parseInt(value, 10);
        if (inlineTextInput) inlineTextInput.style.fontSize = `${value * zoomLevel}px`;
      }
      if (key === 'fontFamily') {
        selectedShape.textFont = value;
        if (inlineTextInput) inlineTextInput.style.fontFamily = value;
      }
      if (key === 'isBold') {
        if (inlineTextInput) {
          inlineTextInput.focus();
          document.execCommand('bold', false, null);
          selectedShape.text = inlineTextInput.innerHTML;
        } else {
          selectedShape.text = toggleHtmlFormatting(selectedShape.text, 'bold');
        }
      }
      if (key === 'isItalic') {
        if (inlineTextInput) {
          inlineTextInput.focus();
          document.execCommand('italic', false, null);
          selectedShape.text = inlineTextInput.innerHTML;
        } else {
          selectedShape.text = toggleHtmlFormatting(selectedShape.text, 'italic');
        }
      }
      if (key === 'isUnderline') {
        if (inlineTextInput) {
          inlineTextInput.focus();
          document.execCommand('underline', false, null);
          selectedShape.text = inlineTextInput.innerHTML;
        } else {
          selectedShape.text = toggleHtmlFormatting(selectedShape.text, 'underline');
        }
      }
      if (key === 'textColor') {
        selectedShape.color = value;
        if (inlineTextInput) inlineTextInput.style.color = value;
      }
      if (key === 'borderColor') selectedShape.borderColor = value;
      if (key === 'fillColor') selectedShape.fillColor = value;
      if (key === 'textAlign') {
        selectedShape.textAlign = value;
        if (inlineTextInput) inlineTextInput.style.textAlign = value;
      }
      if (key === 'letterSpacing') {
        selectedShape.letterSpacing = parseFloat(value);
        if (inlineTextInput) inlineTextInput.style.letterSpacing = `${value * zoomLevel}px`;
      }
      if (key === 'lineHeight') {
        selectedShape.lineHeight = parseFloat(value);
      }
      if (key === 'isStrikethrough') {
        selectedShape.isStrikethrough = value;
      }
      if (key === 'textTransform') {
        selectedShape.textTransform = value;
        if (inlineTextInput) inlineTextInput.style.textTransform = value;
      }
      if (key === 'padding') {
        selectedShape.padding = parseInt(value, 10);
      }

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
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" style={{ display: 'none' }} />
      <header id="toolbar" style={{ display: 'flex', gap: '15px', alignItems: 'center', justifyContent: 'center' }}>
        <button className="toolbar-button" onClick={handleSave}>Save</button>
        <button className="toolbar-button" onClick={handleLoadClick}>Load</button>
        <div style={{ height: '20px', width: '1px', backgroundColor: '#ccc' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <label style={{ fontSize: '12px' }}>Font:</label>
          <select value={formatting.fontFamily} onChange={(e) => updateFormatting('fontFamily', e.target.value)} style={{ height: '26px', borderRadius: '4px', border: '1px solid #ccc', padding: '0 4px', fontSize: '12px' }}>
            <option value="Arial">Arial</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Courier New">Courier New</option>
            <option value="Georgia">Georgia</option>
            <option value="Verdana">Verdana</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <label style={{ fontSize: '12px' }}>Size:</label>
          <input type="number" value={formatting.textSize} onChange={(e) => updateFormatting('textSize', e.target.value)} style={{ width: '45px', height: '22px', borderRadius: '4px', border: '1px solid #ccc', padding: '0 4px', fontSize: '12px' }} />
        </div>

        <div style={{ display: 'flex', gap: '2px' }}>
          <button className={`toolbar-button ${formatting.isBold ? 'active' : ''}`} onClick={() => updateFormatting('isBold', !formatting.isBold)} style={{ fontWeight: 'bold', width: '28px', padding: '0' }}>B</button>
          <button className={`toolbar-button ${formatting.isItalic ? 'active' : ''}`} onClick={() => updateFormatting('isItalic', !formatting.isItalic)} style={{ fontStyle: 'italic', width: '28px', padding: '0' }}>I</button>
          <button className={`toolbar-button ${formatting.isUnderline ? 'active' : ''}`} onClick={() => updateFormatting('isUnderline', !formatting.isUnderline)} style={{ textDecoration: 'underline', width: '28px', padding: '0' }}>U</button>
        </div>

        <div style={{ height: '20px', width: '1px', backgroundColor: '#ccc' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <label style={{ fontSize: '12px' }}>Text:</label>
          <CustomColorPicker value={formatting.textColor} onChange={(c) => updateFormatting('textColor', c)} isOpen={activeDropdown === 'textColor'} onToggle={() => handleDropdownToggle('textColor')} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <label style={{ fontSize: '12px' }}>Border:</label>
          <CustomColorPicker value={formatting.borderColor} onChange={(c) => updateFormatting('borderColor', c)} allowTransparent={true} isOpen={activeDropdown === 'borderColor'} onToggle={() => handleDropdownToggle('borderColor')} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <label style={{ fontSize: '12px' }}>Fill:</label>
          <CustomColorPicker value={formatting.fillColor} onChange={(c) => updateFormatting('fillColor', c)} allowTransparent={true} isOpen={activeDropdown === 'fillColor'} onToggle={() => handleDropdownToggle('fillColor')} />
        </div>

        <div style={{ height: '20px', width: '1px', backgroundColor: '#ccc' }} />

        <div style={{ position: 'relative' }}>
          <button
            className={`toolbar-button ${showMoreOptions ? 'active' : ''}`}
            onClick={() => setShowMoreOptions(!showMoreOptions)}
            style={{ fontWeight: 'bold', width: '32px', padding: '0' }}
            title="More Options"
          >
            ...
          </button>

          {showMoreOptions && (
            <div className="more-options-popover">
              <div className="more-options-section">
                <span className="more-options-label">Horizontal Align</span>
                <div className="more-options-btn-group">
                  <button className={`toolbar-button ${formatting.textAlign === 'left' ? 'active' : ''}`} onClick={() => updateFormatting('textAlign', 'left')}>Left</button>
                  <button className={`toolbar-button ${formatting.textAlign === 'center' ? 'active' : ''}`} onClick={() => updateFormatting('textAlign', 'center')}>Center</button>
                  <button className={`toolbar-button ${formatting.textAlign === 'right' ? 'active' : ''}`} onClick={() => updateFormatting('textAlign', 'right')}>Right</button>
                  <button className={`toolbar-button ${formatting.textAlign === 'justify' ? 'active' : ''}`} onClick={() => updateFormatting('textAlign', 'justify')}>Justify</button>
                </div>
              </div>

              <div className="more-options-section">
                <span className="more-options-label">Vertical Align</span>
                <div className="more-options-btn-group">
                  <button className={`toolbar-button ${formatting.verticalAlign === 'top' ? 'active' : ''}`} onClick={() => updateFormatting('verticalAlign', 'top')}>Top</button>
                  <button className={`toolbar-button ${formatting.verticalAlign === 'center' ? 'active' : ''}`} onClick={() => updateFormatting('verticalAlign', 'center')}>Middle</button>
                  <button className={`toolbar-button ${formatting.verticalAlign === 'bottom' ? 'active' : ''}`} onClick={() => updateFormatting('verticalAlign', 'bottom')}>Bottom</button>
                </div>
              </div>

              <div className="more-options-section">
                <span className="more-options-label">Letter Spacing: {formatting.letterSpacing}px</span>
                <input
                  type="range"
                  min="0"
                  max="20"
                  step="1"
                  value={formatting.letterSpacing}
                  onChange={(e) => updateFormatting('letterSpacing', e.target.value)}
                  className="more-options-slider"
                />
              </div>

              <div className="more-options-section">
                <span className="more-options-label">Line Height: {formatting.lineHeight}x</span>
                <input
                  type="range"
                  min="1.0"
                  max="3.0"
                  step="0.1"
                  value={formatting.lineHeight}
                  onChange={(e) => updateFormatting('lineHeight', e.target.value)}
                  className="more-options-slider"
                />
              </div>

              <div className="more-options-section">
                <span className="more-options-label">Padding: {formatting.padding}px</span>
                <input
                  type="range"
                  min="0"
                  max="30"
                  step="1"
                  value={formatting.padding}
                  onChange={(e) => updateFormatting('padding', e.target.value)}
                  className="more-options-slider"
                />
              </div>

              <div className="more-options-section">
                <span className="more-options-label">Transform</span>
                <select
                  value={formatting.textTransform}
                  onChange={(e) => updateFormatting('textTransform', e.target.value)}
                  className="more-options-select"
                >
                  <option value="none">None</option>
                  <option value="uppercase">UPPERCASE</option>
                  <option value="lowercase">lowercase</option>
                  <option value="capitalize">Capitalize</option>
                </select>
              </div>

              <div className="more-options-section">
                <div className="more-options-btn-group">
                  <button
                    className={`toolbar-button ${formatting.isStrikethrough ? 'active' : ''}`}
                    onClick={() => updateFormatting('isStrikethrough', !formatting.isStrikethrough)}
                    style={{ textDecoration: 'line-through', width: '100%' }}
                  >
                    Strikethrough
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
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
          <div id="document-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center' }}>
            
            {pages.map(({ pageIndex }) => (
              <div
                key={pageIndex}
                style={{
                  position: 'relative',
                  width: '800px',
                  height: '1000px',
                  backgroundColor: '#ffffff',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                }}
              >
                <canvas
                  id={`document_background_${pageIndex}`}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1 }}
                />
                <canvas
                  id={`document_foreground_${pageIndex}`}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 2 }}
                  onMouseDown={(e) => mouseDownHandler(e, pageIndex)}
                  onDoubleClick={(e) => mouseDoubleClickHandler(e, pageIndex)}
                  onContextMenu={(e) => contextMenuHandler(e, pageIndex)}
                />
              </div>
            ))}
            {pages.length < MAX_PAGES && (
              <button
                onClick={handleAddPage}
                style={{
                  flexShrink: 0,
                  position: 'relative',
                  zIndex: 10,
                  padding: '12px 24px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  backgroundColor: '#ffffff',
                  border: '2px dashed #007bff',
                  color: '#007bff',
                  borderRadius: '6px',
                  marginTop: '10px',
                  marginBottom: '90px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
                  transition: 'all 0.2s ease'
                }}
              >
                + Add Page ({pages.length}/{MAX_PAGES})
              </button>
            )}
          </div>

          <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 1000, display: 'flex', gap: '8px' }}>
            <button
              onClick={() => updateZoom(zoomRef.current - 0.1)}
              style={{ padding: '6px 12px', backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
            >
              -
            </button>
            <span style={{ padding: '6px 12px', backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '4px', fontSize: '12px', lineHeight: '18px' }}>
              {Math.round(zoomRef.current * 100)}%
            </span>
            <button
              onClick={() => updateZoom(zoomRef.current + 0.1)}
              style={{ padding: '6px 12px', backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
            >
              +
            </button>
          </div>
        </main>
      </div>

      {showImagesModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '8px', width: '500px', maxWidth: '90%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#333' }}>Insert Image</h3>
              <button onClick={() => setShowImagesModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: '#999' }}>&times;</button>
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', fontWeight: 'bold', color: '#555' }}>Upload New Image:</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={isUploading}
                  style={{ fontSize: '12px' }}
                />
                {isUploading && <span style={{ marginLeft: '10px', fontSize: '12px', color: '#007bff' }}>Uploading...</span>}
              </div>

              <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', fontWeight: 'bold', color: '#555' }}>Choose from Previous Uploads:</label>
              {userImages.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#888', fontStyle: 'italic', padding: '10px 0' }}>No previous uploads found.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {userImages.map((img, idx) => (
                    <div
                      key={idx}
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