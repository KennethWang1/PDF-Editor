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
    redrawScene(interactionMode === "edit");
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
      redrawScene(interactionMode === "edit");
    }
  });

  wrapper.appendChild(input);
  editor.appendChild(wrapper);

  inlineTextInput = input;
  inlineTextInputWrapper = wrapper;
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

function mouseDownHandler(event, pageIndex = 0){
  if (event.button !== 0) return;

  commitInlineTextInput();

  let canvas = document.getElementById(`document_foreground_${pageIndex}`);
  if (!canvas) return;
  let rect = canvas.getBoundingClientRect();
  let clickX = (event.clientX - rect.left) / zoomLevel;
  let clickY = (event.clientY - rect.top) / zoomLevel;
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
    window.removeEventListener("mousemove", mouseMoveHandler);
    redrawScene(interactionMode === "edit");
    return;
  }

  if (selectedShape !== null && interactionMode === "edit") {
    if ((selectedShape.pageIndex || 0) === pageIndex) {
      const handle = typeof selectedShape.getHandleAtPoint === 'function'
        ? selectedShape.getHandleAtPoint(clickPoint)
        : null;

      if (handle !== null) {
        drawType = null;
        interactionMode = handle === "rotate" ? "rotate" : "resize";
        selectedHandle = handle;
        lastClick = clickPoint;
        window.addEventListener("mousemove", mouseMoveHandler);
        window.addEventListener("mouseup", finishInteraction);
        return;
      }

      if (typeof selectedShape.collissionCheck === 'function' && selectedShape.collissionCheck(clickPoint)) {
        drawType = null;
        interactionMode = "move";
        selectedHandle = null;
        lastClick = clickPoint;
        window.addEventListener("mousemove", mouseMoveHandler);
        window.addEventListener("mouseup", finishInteraction);
        return;
      }
    }
  }

  if (lastClick === null){
    switch(drawType){
      case "line":
        interactionMode = "create";
        selectedShape = new line([{x: clickX, y: clickY}, {x: clickX, y: clickY}], defaultFormatting.borderColor, 1, null, defaultFormatting.textSize, defaultFormatting.textColor, defaultFormatting.fillColor, "Arial");
        selectedShape.pageIndex = pageIndex;
        createDragged = false;
        if (syncStateCallback) syncStateCallback();
        break;
      case "rectangle":
        interactionMode = "create";
        selectedShape = new rectangle([{x: clickX, y: clickY}, {x: clickX, y: clickY}], defaultFormatting.borderColor, 1, null, defaultFormatting.textSize, defaultFormatting.textColor, defaultFormatting.fillColor, "Arial");
        selectedShape.pageIndex = pageIndex;
        createDragged = false;
        if (syncStateCallback) syncStateCallback();
        break;
      case "oval":
        interactionMode = "create";
        selectedShape = new oval([{x: clickX, y: clickY}, {x: clickX, y: clickY}], defaultFormatting.borderColor, 1, null, defaultFormatting.textSize, defaultFormatting.textColor, defaultFormatting.fillColor, "Arial");
        selectedShape.pageIndex = pageIndex;
        createDragged = false;
        if (syncStateCallback) syncStateCallback();
        break;
      case "textbox":
        interactionMode = "create";
        selectedShape = new rectangle([{x: clickX, y: clickY}, {x: clickX, y: clickY}], "transparent", 0, "", defaultFormatting.textSize, defaultFormatting.textColor, null, "Arial");
        selectedShape.pageIndex = pageIndex;
        createDragged = false;
        if (syncStateCallback) syncStateCallback();
        break;
      default:
        let nearestShape = findNearestShapeAtPoint(clickPoint, pageIndex);
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
      window.addEventListener("mousemove", mouseMoveHandler);
      window.addEventListener("mouseup", finishInteraction);
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
        fillColor: null,
        pageIndex: 0
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
        fillColor: null,
        pageIndex: 0
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
        fillColor: null,
        pageIndex: 0
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
        fillColor: null,
        pageIndex: 0
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
      case "image":
        temp = new image(item.location, item.borderColor || "transparent", item.borderWidth || 0, item.text, item.textSize, item.color, item.fillColor, item.textFont, item.imageSrc);
        break;
      default:
        temp = null
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
  const [pages, setPages] = useState([0]);
  const [formatting, setFormatting] = useState(defaultFormatting);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const fileInputRef = useRef(null);
  const viewportRef = useRef(null);
  const [zoom, setZoom] = useState(1.0);
  const zoomRef = useRef(1.0);
  const [dimensions, setDimensions] = useState({
    width: 816,
    height: 1056
  });
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
    const clamped = Math.min(Math.max(0.25, Math.round(newZoom * 100) / 100), 4.0);
    zoomLevel = clamped;
    zoomRef.current = clamped;
    setZoom(clamped);
    redrawScene(interactionMode === "edit");
  };

  const handleZoomIn = () => updateZoom(zoom + 0.1);
  const handleZoomOut = () => updateZoom(zoom - 0.1);
  const handleResetZoom = () => updateZoom(1.0);

  const handleAddPage = () => {
    if (pages.length >= MAX_PAGES) return;
    setPages((prev) => [...prev, prev.length]);
  };

  const handleOpenImagesModal = async () => {
    const jwt = getCookie('auth');
    const version = getCookie('version');

    if (!jwt) {
      alert('Please log in to manage your images.');
      return;
    }

    setShowImagesModal(true);

    try {
      const res = await fetch('/api/v1/my-images', {
        headers: { 'Authorization': `Bearer ${jwt}${version ? ',' + version : ''}` }
      });
      const data = await res.json();
      if (res.ok) {
        setUserImages(data.files || []);
      } else {
        console.error('Failed to load user images:', data.error);
      }
    } catch (err) {
      console.error('Error fetching gallery:', err);
    }
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const jwt = getCookie('auth');
    const version = getCookie('version');

    if (!jwt) {
      alert('You must be logged in to upload images.');
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/v1/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwt}${version ? ',' + version : ''}`
        },
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        alert(`Upload failed: ${data.error || response.statusText}`);
        return;
      }

      const newImageObj = { filename: data.url.split('/').pop(), url: data.url };
      setUserImages(prev => [newImageObj, ...prev]);

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
      "transparent", 0, null, null, null, null, "Arial", imageUrl
    );
    newImgShape.pageIndex = pageIndex;

    newImgShape.loadImage(imageUrl, () => {
      shapes.push(newImgShape);
      selectedShape = newImgShape;
      redrawScene(true);
    });

    setShowImagesModal(false);
  };

  const handleImageSelect = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    const authToken = getAuthTokenHeader();
    const headers = {};
    if (authToken) {
      headers['Authorization'] = authToken;
    }

    fetch('/api/v1/upload', {
      method: 'POST',
      headers,
      body: formData
    })
      .then((res) => {
        if (!res.ok) {
          return res.json().then((errData) => {
            throw new Error(errData.error || 'Upload failed');
          });
        }
        return res.json();
      })
      .then((data) => {
        const imageUrl = data.url;
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
          "Arial",
          imageUrl
        );
        newImgShape.pageIndex = pageIndex;

        newImgShape.loadImage(imageUrl, () => {
          redrawScene(true);
        }, authToken);

        shapes.push(newImgShape);
        selectedShape = newImgShape;
        interactionMode = "edit";
        if (syncStateCallback) syncStateCallback();
        redrawScene(true);

        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      })
      .catch((err) => {
        alert('Image upload failed: ' + err.message);
        console.error('Image upload error:', err);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      });
  };

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
    }
  }, []);

  useEffect(() => {
    redrawScene(interactionMode === "edit");
  }, [pages]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    let initialPinchDist = null;
    let initialPinchZoom = 1.0;

    const handleWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = -e.deltaY * 0.002;
        const currentZoom = zoomRef.current;
        const nextZoom = Math.min(Math.max(0.25, currentZoom + delta), 4.0);
        zoomLevel = nextZoom;
        zoomRef.current = nextZoom;
        setZoom(nextZoom);
        redrawScene(interactionMode === "edit");
      }
    };

    const handleTouchStart = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        initialPinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        initialPinchZoom = zoomRef.current;
      }
    };

    const handleTouchMove = (e) => {
      if (e.touches.length === 2 && initialPinchDist) {
        e.preventDefault();
        const currentDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const scale = currentDist / initialPinchDist;
        const nextZoom = Math.min(Math.max(0.25, initialPinchZoom * scale), 4.0);
        zoomLevel = nextZoom;
        zoomRef.current = nextZoom;
        setZoom(nextZoom);
        redrawScene(interactionMode === "edit");
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
    viewport.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      viewport.removeEventListener('wheel', handleWheel);
      viewport.removeEventListener('touchstart', handleTouchStart);
      viewport.removeEventListener('touchmove', handleTouchMove);
      viewport.removeEventListener('touchend', handleTouchEnd);
      viewport.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, []);

  useEffect(() => {
    redrawScene(false);
  }, [dimensions]);

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
  const isMaxPagesReached = pages.length >= MAX_PAGES;

  return (
    <div id="pdf-editor" style={{ display: "flex", flexDirection: "row", width: "100vw", height: "100vh", overflow: "hidden" }}>
      <div style={{ width: "240px", flexShrink: 0, height: "100%", background: "#f0f0f0", borderRight: "1px solid #ccc", padding: "10px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "10px", overflowY: "auto" }}>
        <h3>Controls</h3>
        <button onClick={() => { drawType = "line"; if(interactionMode === "edit") { selectedShape = null; interactionMode = null; redrawScene(false); } }}>Line</button>
        <button onClick={() => { drawType = "rectangle"; if(interactionMode === "edit") { selectedShape = null; interactionMode = null; redrawScene(false); } }}>Rectangle</button>
        <button onClick={() => { drawType = "oval"; if(interactionMode === "edit") { selectedShape = null; interactionMode = null; redrawScene(false); } }}>Oval</button>
        <button onClick={() => { drawType = "textbox"; if(interactionMode === "edit") { selectedShape = null; interactionMode = null; redrawScene(false); } }}>Textbox</button>
        <button onClick={deleteSelectedShape}>Delete</button>
        <input type="file" ref={fileInputRef} accept="image/*" style={{ display: 'none' }} onChange={handleImageSelect} />
        
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

          <TooltipWrapper text="Images">
            <button className="toolbar-btn" onClick={handleOpenImagesModal}>
              🖼️ Images
            </button>
          </TooltipWrapper>
          {showImagesModal && (
            <div style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <div style={{
                background: '#ffffff',
                padding: '24px',
                borderRadius: '8px',
                width: '520px',
                maxWidth: '90%',
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h2 style={{ margin: 0, fontSize: '18px' }}>Images</h2>
                  <button 
                    onClick={() => setShowImagesModal(false)}
                    style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}
                  >
                    ×
                  </button>
                </div>

                <div style={{
                  border: '2px dashed #cccccc',
                  padding: '16px',
                  borderRadius: '6px',
                  textAlign: 'center',
                  backgroundColor: '#fafafa',
                  marginBottom: '20px'
                }}>
                  <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', fontSize: '14px' }}>Upload New Image</p>
                  <label style={{
                    display: 'inline-block',
                    padding: '8px 16px',
                    backgroundColor: '#007bff',
                    color: '#ffffff',
                    borderRadius: '4px',
                    cursor: isUploading ? 'not-allowed' : 'pointer',
                    fontSize: '13px'
                  }}>
                    {isUploading ? 'Uploading...' : '📁 Choose File from Device'}
                    <input 
                      type="file" 
                      accept="image/*" 
                      style={{ display: 'none' }} 
                      onChange={handleImageUpload}
                      disabled={isUploading}
                    />
                  </label>
                </div>

                <div>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#555' }}>Your Saved Images</h4>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '10px',
                    maxHeight: '240px',
                    overflowY: 'auto',
                    paddingRight: '4px'
                  }}>
                    {userImages.length === 0 ? (
                      <p style={{ gridColumn: 'span 3', color: '#888', textAlign: 'center', margin: '20px 0' }}>
                        No images uploaded yet.
                      </p>
                    ) : (
                      userImages.map((img) => (
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
                          <img
                            src={img.url}
                            alt={img.filename}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div style={{ marginTop: '20px', textAlign: 'right' }}>
                  <button 
                    onClick={() => setShowImagesModal(false)}
                    style={{ padding: '6px 16px', borderRadius: '4px', border: '1px solid #ccc', cursor: 'pointer' }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
      <div 
        ref={viewportRef}
        style={{ 
          position: "relative", 
          flex: 1, 
          width: "100%", 
          height: "100%", 
          overflow: "auto", 
          background: "#ffffff", 
          display: "flex", 
          flexDirection: "column",
          alignItems: "center", 
          gap: "24px",
          padding: "40px 20px 80px 20px", 
          boxSizing: "border-box" 
        }}
      >
        {pages.map((pageIdx) => (
          <div 
            key={pageIdx} 
            style={{ 
              position: "relative", 
              width: `${canvasWidth * zoom}px`, 
              height: `${canvasHeight * zoom}px`, 
              flexShrink: 0 
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: `${canvasWidth}px`,
                height: `${canvasHeight}px`,
                transform: `scale(${zoom})`,
                transformOrigin: "0 0"
              }}
            >
              <canvas 
                id={`document_background_${pageIdx}`}
                width={canvasWidth * dpr} 
                height={canvasHeight * dpr}
                style={{ position: "absolute", left: 0, top: 0, width: `${canvasWidth}px`, height: `${canvasHeight}px` }}
              />
              <canvas 
                id={`document_foreground_${pageIdx}`}
                width={canvasWidth * dpr} 
                height={canvasHeight * dpr}
                onMouseDown={(e) => mouseDownHandler(e, pageIdx)}
                onDoubleClick={(e) => mouseDoubleClickHandler(e, pageIdx)}
                onContextMenu={(e) => contextMenuHandler(e, pageIdx)}
                style={{ position: "absolute", left: 0, top: 0, width: `${canvasWidth}px`, height: `${canvasHeight}px` }}
              />
            </div>
          </div>
        ))}

        <button
          onClick={handleAddPage}
          disabled={isMaxPagesReached}
          style={{
            backgroundColor: isMaxPagesReached ? "#e2e8f0" : "#007bff",
            color: isMaxPagesReached ? "#a0aec0" : "#ffffff",
            border: isMaxPagesReached ? "1px solid #a0aec0" : "none",
            borderRadius: "4px",
            padding: "10px 20px",
            fontWeight: "bold",
            cursor: isMaxPagesReached ? "not-allowed" : "pointer",
            opacity: isMaxPagesReached ? 0.5 : 1,
            flexShrink: 0
          }}
        >
          + Add Page
        </button>

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
            disabled={zoom >= 4.0}
            style={{ border: "none", background: "none", cursor: zoom >= 4.0 ? "default" : "pointer", fontSize: "16px", padding: "2px 6px", opacity: zoom >= 4.0 ? 0.4 : 1 }}
            title="Zoom In"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

export { RenderPDFEditor };