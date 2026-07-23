const hitboxSize = 2;
const highlightBoxSize = 8;
const rotationStemLength = 24;
const rotationHandleRadius = 5;

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.sqrt(Math.pow(projX - px, 2) + Math.pow(projY - py, 2));
}

function getCookieValue(name) {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
} 

function makePoint(point) {
  return { x: point.x, y: point.y };
}

function normalizeVector(vector) {
  const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
  if (length === 0) {
    return { x: 0, y: -1 };
  }
  return { x: vector.x / length, y: vector.y / length };
}

function rotateOffset(offset, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: offset.x * cos - offset.y * sin,
    y: offset.x * sin + offset.y * cos,
  };
}

function stripHtmlTags(html) {
  if (typeof document === 'undefined') return html;
  const div = document.createElement("div");
  let formattedHtml = (html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<div>/gi, "");
  div.innerHTML = formattedHtml;
  return div.textContent || div.innerText || "";
}

function renderRichText(
  context,
  htmlText,
  x,
  y,
  maxWidth,
  defaultFontSize,
  defaultFontFamily,
  defaultColor,
  align = "left",
  vAlign = "top",
  boxHeight = null
) {
  if (!htmlText) return;
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlText;
  
  const lineHeight = Math.max(12, Math.ceil(defaultFontSize * 1.2));
  context.textBaseline = "top";

  const lines = [[]];

  function getLineWidth(lineItems) {
    let w = 0;
    for (const item of lineItems) {
      w += item.width;
    }
    return w;
  }

  function processNode(node, isBold, isItalic, isUnderline, currentLink = null) {
    if (node.nodeType === Node.TEXT_NODE) {
      const words = node.textContent.split(/(\s+)/);
      for (const word of words) {
        if (word === "") continue;
        if (word === '\n') {
          lines.push([]);
          continue;
        }
        
        const fontStr = `${isItalic ? 'italic ' : ''}${isBold ? 'bold ' : ''}${defaultFontSize}px ${defaultFontFamily}`;
        context.font = fontStr;
        const metrics = context.measureText(word);
        
        let currentLine = lines[lines.length - 1];
        let currentWidth = getLineWidth(currentLine);

        if (currentWidth + metrics.width > maxWidth && word.trim() !== "" && currentLine.length > 0) {
          lines.push([]);
          currentLine = lines[lines.length - 1];
        }

        currentLine.push({
          text: word,
          width: metrics.width,
          font: fontStr,
          isBold,
          isItalic,
          isUnderline,
          link: currentLink,
        });
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName.toLowerCase();
      let newBold = isBold;
      let newItalic = isItalic;
      let newUnderline = isUnderline;
      let newLink = currentLink;
      
      if (tag === 'b' || tag === 'strong') newBold = true;
      else if (tag === 'i' || tag === 'em') newItalic = true;
      else if (tag === 'u') newUnderline = true;
      else if (tag === 'a') {
        newLink = node.getAttribute('href') || node.href || null;
        newUnderline = true;
      }
      
      if (node.style) {
        if (node.style.fontWeight === 'bold' || node.style.fontWeight === '700') newBold = true;
        else if (node.style.fontWeight === 'normal' || node.style.fontWeight === '400') newBold = false;
        
        if (node.style.fontStyle === 'italic') newItalic = true;
        else if (node.style.fontStyle === 'normal') newItalic = false;
        
        if ((node.style.textDecoration && node.style.textDecoration.includes('underline')) || (node.style.textDecorationLine && node.style.textDecorationLine.includes('underline'))) {
          newUnderline = true;
        } else if (node.style.textDecoration === 'none' || node.style.textDecorationLine === 'none') {
          newUnderline = false;
        }
      }
      
      if (tag === 'br') {
        lines.push([]);
        return;
      }
      
      let lastLine = lines[lines.length - 1];
      if (tag === 'div' && lastLine && lastLine.length > 0) {
        lines.push([]);
      }

      for (const child of node.childNodes) {
        processNode(child, newBold, newItalic, newUnderline, newLink);
      }
      
      lastLine = lines[lines.length - 1];
      if (tag === 'div' && lastLine && lastLine.length > 0) {
        lines.push([]);
      }
    }
  }

  for (const child of tempDiv.childNodes) {
    processNode(child, false, false, false, null);
  }

  const totalHeight = lines.length * lineHeight;
  const effectiveBoxHeight = boxHeight != null ? boxHeight : totalHeight;
  let startY = y;

  if (vAlign === "bottom") {
    startY = Math.max(y, y + effectiveBoxHeight - totalHeight);
  } else if (vAlign === "center" || vAlign === "middle") {
    startY = y + (effectiveBoxHeight - totalHeight) / 2;
  }

  let currentY = startY;

  for (const lineItems of lines) {
    const lineWidth = getLineWidth(lineItems);
    let currentX = x;

    if (align === "center") {
      currentX = x + (maxWidth - lineWidth) / 2;
    } else if (align === "right") {
      currentX = x + maxWidth - lineWidth;
    }

    for (const item of lineItems) {
      context.font = item.font;
      const textColor = defaultColor;
      context.fillStyle = textColor;
      context.fillText(item.text, currentX, currentY);

      if (item.isUnderline || item.link) {
        context.save();
        context.strokeStyle = textColor;
        context.lineWidth = Math.max(1, Math.floor(defaultFontSize / 14));
        context.beginPath();
        context.moveTo(currentX, currentY + defaultFontSize);
        context.lineTo(currentX + item.width, currentY + defaultFontSize);
        context.stroke();
        context.restore();
      }

      currentX += item.width;
    }

    currentY += lineHeight;
  }
}

function getRichTextLinkAtPoint(
  htmlText,
  localPoint,
  x,
  y,
  maxWidth,
  defaultFontSize,
  defaultFontFamily,
  align = "left",
  vAlign = "top",
  boxHeight = null
) {
  if (!htmlText || typeof document === 'undefined') return null;

  const canvas = document.getElementById("document_foreground") || document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return null;

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlText;

  const lineHeight = Math.max(12, Math.ceil(defaultFontSize * 1.2));
  const lines = [[]];

  function getLineWidth(lineItems) {
    let w = 0;
    for (const item of lineItems) {
      w += item.width;
    }
    return w;
  }

  function processNode(node, isBold, isItalic, isUnderline, currentLink = null) {
    if (node.nodeType === Node.TEXT_NODE) {
      const words = node.textContent.split(/(\s+)/);
      for (const word of words) {
        if (word === "") continue;
        if (word === '\n') {
          lines.push([]);
          continue;
        }

        const fontStr = `${isItalic ? 'italic ' : ''}${isBold ? 'bold ' : ''}${defaultFontSize}px ${defaultFontFamily}`;
        context.font = fontStr;
        const metrics = context.measureText(word);

        let currentLine = lines[lines.length - 1];
        let currentWidth = getLineWidth(currentLine);

        if (currentWidth + metrics.width > maxWidth && word.trim() !== "" && currentLine.length > 0) {
          lines.push([]);
          currentLine = lines[lines.length - 1];
        }

        currentLine.push({
          text: word,
          width: metrics.width,
          font: fontStr,
          link: currentLink,
        });
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName.toLowerCase();
      let newBold = isBold;
      let newItalic = isItalic;
      let newUnderline = isUnderline;
      let newLink = currentLink;

      if (tag === 'b' || tag === 'strong') newBold = true;
      else if (tag === 'i' || tag === 'em') newItalic = true;
      else if (tag === 'u') newUnderline = true;
      else if (tag === 'a') {
        newLink = node.getAttribute('href') || node.href || null;
        newUnderline = true;
      }

      if (node.style) {
        if (node.style.fontWeight === 'bold' || node.style.fontWeight === '700') newBold = true;
        else if (node.style.fontWeight === 'normal' || node.style.fontWeight === '400') newBold = false;

        if (node.style.fontStyle === 'italic') newItalic = true;
        else if (node.style.fontStyle === 'normal') newItalic = false;

        if ((node.style.textDecoration && node.style.textDecoration.includes('underline')) || (node.style.textDecorationLine && node.style.textDecorationLine.includes('underline'))) {
          newUnderline = true;
        } else if (node.style.textDecoration === 'none' || node.style.textDecorationLine === 'none') {
          newUnderline = false;
        }
      }

      if (tag === 'br') {
        lines.push([]);
        return;
      }

      let lastLine = lines[lines.length - 1];
      if (tag === 'div' && lastLine && lastLine.length > 0) {
        lines.push([]);
      }

      for (const child of node.childNodes) {
        processNode(child, newBold, newItalic, newUnderline, newLink);
      }

      lastLine = lines[lines.length - 1];
      if (tag === 'div' && lastLine && lastLine.length > 0) {
        lines.push([]);
      }
    }
  }

  for (const child of tempDiv.childNodes) {
    processNode(child, false, false, false, null);
  }

  const totalHeight = lines.length * lineHeight;
  const effectiveBoxHeight = boxHeight != null ? boxHeight : totalHeight;
  let startY = y;

  if (vAlign === "bottom") {
    startY = Math.max(y, y + effectiveBoxHeight - totalHeight);
  } else if (vAlign === "center" || vAlign === "middle") {
    startY = y + (effectiveBoxHeight - totalHeight) / 2;
  }

  let currentY = startY;

  for (const lineItems of lines) {
    const lineWidth = getLineWidth(lineItems);
    let currentX = x;

    if (align === "center") {
      currentX = x + (maxWidth - lineWidth) / 2;
    } else if (align === "right") {
      currentX = x + maxWidth - lineWidth;
    }

    for (const item of lineItems) {
      if (
        item.link &&
        localPoint.x >= currentX &&
        localPoint.x <= currentX + item.width &&
        localPoint.y >= currentY &&
        localPoint.y <= currentY + lineHeight
      ) {
        return item.link;
      }
      currentX += item.width;
    }

    currentY += lineHeight;
  }

  return null;
}

function getRichTextHeight(htmlText, maxWidth, defaultFontSize, defaultFontFamily) {
  if (typeof document === 'undefined') return defaultFontSize * 1.2;
  const canvas = document.getElementById("document_foreground") || document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return defaultFontSize * 1.2;

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlText || "";
  
  let currentX = 0;
  let linesCount = 1;
  const lineHeight = Math.max(12, Math.ceil(defaultFontSize * 1.2));

  function processNode(node, isBold, isItalic, isUnderline) {
    if (node.nodeType === Node.TEXT_NODE) {
      const words = node.textContent.split(/(\s+)/);
      for (const word of words) {
        if (word === "") continue;
        if (word === '\n') {
          currentX = 0;
          linesCount++;
          continue;
        }
        context.font = `${isItalic ? 'italic ' : ''}${isBold ? 'bold ' : ''}${defaultFontSize}px ${defaultFontFamily}`;
        const metrics = context.measureText(word);
        if (currentX + metrics.width > maxWidth && word.trim() !== "") {
          currentX = 0;
          linesCount++;
        }
        currentX += metrics.width;
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName.toLowerCase();
      let newBold = isBold;
      let newItalic = isItalic;
      let newUnderline = isUnderline;
      
      if (tag === 'b' || tag === 'strong') {
        newBold = true;
      } else if (tag === 'i' || tag === 'em') {
        newItalic = true;
      } else if (tag === 'u' || tag === 'a') {
        newUnderline = true;
      }
      
      if (node.style) {
        if (node.style.fontWeight === 'bold' || node.style.fontWeight === '700') {
          newBold = true;
        } else if (node.style.fontWeight === 'normal' || node.style.fontWeight === '400') {
          newBold = false;
        }
        
        if (node.style.fontStyle === 'italic') {
          newItalic = true;
        } else if (node.style.fontStyle === 'normal') {
          newItalic = false;
        }
        
        if ((node.style.textDecoration && node.style.textDecoration.includes('underline')) || (node.style.textDecorationLine && node.style.textDecorationLine.includes('underline'))) {
          newUnderline = true;
        } else if (node.style.textDecoration === 'none' || node.style.textDecorationLine === 'none') {
          newUnderline = false;
        }
      }
      
      if (tag === 'br') {
        currentX = 0;
        linesCount++;
        return;
      }
      if (tag === 'div' && currentX !== 0) {
        currentX = 0;
        linesCount++;
      }
      for (const child of node.childNodes) {
        processNode(child, newBold, newItalic, newUnderline);
      }
      if (tag === 'div' && currentX !== 0) {
        currentX = 0;
        linesCount++;
      }
    }
  }

  for (const child of tempDiv.childNodes) {
    processNode(child, false, false, false);
  }

  return linesCount * lineHeight;
}

function approximateTextDimensions(text, textSize) {
  const plainText = stripHtmlTags(text);
  const lines = String(plainText).split(/\r?\n/);
  const longestLine = lines.reduce((longest, currentLine) => (
    currentLine.length > longest.length ? currentLine : longest
  ), "");

  return {
    width: Math.max(1, longestLine.length * textSize * 0.6),
    height: Math.max(1, lines.length * textSize * 1.2),
  };
}

class shape {
  constructor(location, borderColor, borderWidth, text, textSize, color, fillColor, textFont){
    this.location = location;
    this.borderColor = borderColor;
    this.borderWidth = borderWidth;
    this.text = text;
    this.textSize = textSize;
    this.color = color;
    this.fillColor = fillColor;
    this.textFont = textFont;
    this.isEditingText = false;
  }
  
  drawHighlightBox(contextCanvas){
    if (contextCanvas === null) throw new Error("Canvas Not Loaded");
    
    contextCanvas.save();
    contextCanvas.strokeStyle = "blue";
    contextCanvas.fillStyle = "white";
    contextCanvas.lineWidth = 1;

    for (const handle of this.getHighlightBoxes()) {
      contextCanvas.beginPath();
      contextCanvas.rect(
        handle.point.x - highlightBoxSize / 2,
        handle.point.y - highlightBoxSize / 2,
        highlightBoxSize,
        highlightBoxSize
      );
      contextCanvas.fill();
      contextCanvas.stroke();
    }

    const rotationHandle = this.getRotationHandle();
    if (rotationHandle !== null) {
      contextCanvas.beginPath();
      contextCanvas.moveTo(rotationHandle.anchor.x, rotationHandle.anchor.y);
      contextCanvas.lineTo(rotationHandle.circle.x, rotationHandle.circle.y);
      contextCanvas.stroke();

      contextCanvas.beginPath();
      contextCanvas.arc(
        rotationHandle.circle.x,
        rotationHandle.circle.y,
        rotationHandleRadius,
        0,
        Math.PI * 2
      );
      contextCanvas.fill();
      contextCanvas.stroke();
    }

    contextCanvas.restore();
  }

  getHandleAtPoint(point) {
    const halfSize = highlightBoxSize / 2;
    for (const handle of this.getHighlightBoxes()) {
      if (
        point.x >= handle.point.x - halfSize &&
        point.x <= handle.point.x + halfSize &&
        point.y >= handle.point.y - halfSize &&
        point.y <= handle.point.y + halfSize
      ) {
        return handle.name;
      }
    }

    const rotationHandle = this.getRotationHandle();
    if (rotationHandle !== null) {
      const dx = point.x - rotationHandle.circle.x;
      const dy = point.y - rotationHandle.circle.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= rotationHandleRadius + 2) {
        return "rotate";
      }
    }

    return null;
  }

  getCenter(){
    return {
      x: (this.location[0].x + this.location[1].x) / 2,
      y: (this.location[0].y + this.location[1].y) / 2,
    };
  }

  getRotationAnchor(){
    return null;
  }

  getRotationDirection(){
    return { x: 0, y: -1 };
  }

  getRotationHandle(){
    const anchor = this.getRotationAnchor();
    if (anchor === null) return null;
    const direction = normalizeVector(this.getRotationDirection());
    return {
      anchor,
      circle: {
        x: anchor.x + direction.x * rotationStemLength,
        y: anchor.y + direction.y * rotationStemLength,
      },
    };
  }

  resize(){
    return false;
  }

  translate(){
    return false;
  }

  rotateToPoint(){
    return false;
  }

  hasZeroSize(){
    return false;
  }

  getTextEditorInfo(){
    const dx = this.location[1].x - this.location[0].x;
    const dy = this.location[1].y - this.location[0].y;
    const angle = Math.atan2(dy, dx);
    const textSize = this.textSize || 14;
    const rotated = rotateOffset({ x: 5, y: -textSize - 5 }, angle);

    return {
      point: {
        x: this.location[0].x + rotated.x,
        y: this.location[0].y + rotated.y,
      },
      angle,
      width: 240,
      height: textSize,
      align: "left",
      vAlign: "top"
    };
  }

  collissionCheck(point){
    throw new Error("Method collissionCheck must be implemented by subclass");
  }

  getLinkAtPoint(point) {
    return null;
  }
}

class line extends shape{
  constructor(location, borderColor, borderWidth, text = null, textSize = null, color = null, fillColor = null, textFont = null){
    super(location, borderColor, borderWidth, text, textSize, color, fillColor, textFont);
  }

  getHighlightBoxes(){
    return [
      { name: "start", point: this.location[0] },
      { name: "end", point: this.location[1] },
    ];
  }

  getRotationAnchor(){
    return this.getCenter();
  }

  getRotationDirection(){
    const dx = this.location[1].x - this.location[0].x;
    const dy = this.location[1].y - this.location[0].y;
    return normalizeVector({ x: dy, y: -dx });
  }

  draw(contextCanvas, isSelected = false){
    if (contextCanvas === null) throw new Error("Canvas Not Loaded");

    contextCanvas.strokeStyle = this.borderColor;
    contextCanvas.lineWidth = this.borderWidth;
    contextCanvas.beginPath();
    contextCanvas.moveTo(this.location[0].x, this.location[0].y);
    contextCanvas.lineTo(this.location[1].x, this.location[1].y);
    contextCanvas.stroke();

    if(!this.isEditingText && this.text !== null && (this.textSize !== null && this.textSize != 0)){
      const dx = this.location[1].x - this.location[0].x;
      const dy = this.location[1].y - this.location[0].y;
      const angle = Math.atan2(dy, dx);
      const textHeight = getRichTextHeight(this.text, 240, this.textSize, this.textFont || "Arial");

      contextCanvas.save();
      contextCanvas.translate(this.location[0].x, this.location[0].y);
      contextCanvas.rotate(angle);
      renderRichText(contextCanvas, this.text, 5, -5 - textHeight, 240, this.textSize, this.textFont || "Arial", this.color, "left", "top");
      contextCanvas.restore();
    }
  }

  getTextEditorInfo(){
    const dx = this.location[1].x - this.location[0].x;
    const dy = this.location[1].y - this.location[0].y;
    const angle = Math.atan2(dy, dx);
    const textSize = this.textSize || 14;
    const textHeight = getRichTextHeight(this.text, 240, textSize, this.textFont || "Arial");
    const rotated = rotateOffset({ x: 5, y: -5 - textHeight }, angle);

    return {
      point: {
        x: this.location[0].x + rotated.x,
        y: this.location[0].y + rotated.y,
      },
      angle,
      width: 240,
      height: textHeight,
      align: "left",
      vAlign: "top"
    };
  }

  collissionCheck(point){
    const distance = pointToSegmentDistance(
      point.x,
      point.y,
      this.location[0].x,
      this.location[0].y,
      this.location[1].x,
      this.location[1].y
    );
    const textBounds = this.getTextBounds();
    let textHit = false;
    if (textBounds) {
      const localPoint = textBounds.worldToLocal(point);
      textHit = localPoint.x >= 0 && localPoint.x <= textBounds.width &&
                localPoint.y >= 0 && localPoint.y <= textBounds.height;
    }
    return distance <= hitboxSize + this.borderWidth / 2 || textHit;
  }

  distanceToPoint(point) {
    const segmentDist = pointToSegmentDistance(
      point.x,
      point.y,
      this.location[0].x,
      this.location[0].y,
      this.location[1].x,
      this.location[1].y
    );
    const textBounds = this.getTextBounds();
    if (textBounds) {
      const localPoint = textBounds.worldToLocal(point);
      if (localPoint.x >= 0 && localPoint.x <= textBounds.width &&
          localPoint.y >= 0 && localPoint.y <= textBounds.height) {
        return 0;
      }
    }
    return Math.max(0, segmentDist - this.borderWidth / 2);
  }

  getLinkAtPoint(point) {
    if (!this.text || this.isEditingText) return null;
    const dx = this.location[1].x - this.location[0].x;
    const dy = this.location[1].y - this.location[0].y;
    const angle = Math.atan2(dy, dx);

    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    const relX = point.x - this.location[0].x;
    const relY = point.y - this.location[0].y;
    const localX = relX * cos - relY * sin;
    const localY = relX * sin + relY * cos;

    const textSize = this.textSize || 14;
    const textHeight = getRichTextHeight(this.text, 240, textSize, this.textFont || "Arial");

    return getRichTextLinkAtPoint(
      this.text,
      { x: localX, y: localY },
      5,
      -5 - textHeight,
      240,
      textSize,
      this.textFont || "Arial",
      "left",
      "top"
    );
  }

  updateSecondLocation(secondLocation){
    this.location[1] = secondLocation;
  }

  resize(handleName, point){
    if (handleName === "start") {
      this.location[0] = makePoint(point);
      return true;
    }
    if (handleName === "end") {
      this.location[1] = makePoint(point);
      return true;
    }
    return false;
  }

  translate(deltaX, deltaY){
    this.location = this.location.map((point) => ({
      x: point.x + deltaX,
      y: point.y + deltaY,
    }));
    return true;
  }

  rotateToPoint(point){
    const center = this.getCenter();
    const angle = Math.atan2(point.y - center.y, point.x - center.x);
    const dx = this.location[1].x - this.location[0].x;
    const dy = this.location[1].y - this.location[0].y;
    const halfLength = Math.sqrt(dx * dx + dy * dy) / 2;
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };

    this.location = [
      {
        x: center.x - direction.x * halfLength,
        y: center.y - direction.y * halfLength,
      },
      {
        x: center.x + direction.x * halfLength,
        y: center.y + direction.y * halfLength,
      },
    ];
    return true;
  }

  hasZeroSize(){
    return this.location[0].x === this.location[1].x && this.location[0].y === this.location[1].y;
  }

  getTextBounds(){
    if (this.text === null || this.textSize === null || this.textSize === 0) {
      return null;
    }
    const dx = this.location[1].x - this.location[0].x;
    const dy = this.location[1].y - this.location[0].y;
    const angle = Math.atan2(dy, dx);
    const textSize = this.textSize || 14;
    const textHeight = getRichTextHeight(this.text, 240, textSize, this.textFont || "Arial");
    const origin = { x: this.location[0].x, y: this.location[0].y };

    return {
      width: 240,
      height: textHeight,
      worldToLocal: (point) => {
        const relX = point.x - origin.x;
        const relY = point.y - origin.y;
        const cos = Math.cos(-angle);
        const sin = Math.sin(-angle);
        const localX = relX * cos - relY * sin - 5;
        const localY = relX * sin + relY * cos - (-5 - textHeight);
        return { x: localX, y: localY };
      },
    };
  }
}

class rectangle extends shape{
  constructor(location, borderColor, borderWidth, text = null, textSize = null, color = null, fillColor = null, textFont = null){
    super(location, borderColor, borderWidth, text, textSize, color, fillColor, textFont);
    this.rotation = 0;
  }

  draw(contextCanvas, isSelected = false){
    if (contextCanvas === null) throw new Error("Canvas Not Loaded");

    const width = this.getWidth();
    const height = this.getHeight();
    const center = this.getCenter();

    contextCanvas.save();
    contextCanvas.translate(center.x, center.y);
    contextCanvas.rotate(this.rotation);

    if(this.fillColor !== null && this.fillColor !== undefined) {
      contextCanvas.fillStyle = this.fillColor;
      contextCanvas.fillRect(-width / 2, -height / 2, width, height);
    }

    let drawBorderColor = this.borderColor;
    let drawBorderWidth = this.borderWidth;
    if (isSelected && (drawBorderColor === "transparent" || drawBorderWidth === 0 || drawBorderWidth == null)) {
      drawBorderColor = "blue";
      drawBorderWidth = 1;
    }

    if(drawBorderWidth > 0 && drawBorderWidth != null){
      contextCanvas.strokeStyle = drawBorderColor;
      contextCanvas.lineWidth = drawBorderWidth;
      contextCanvas.strokeRect(-width / 2, -height / 2, width, height);
    }

    if(!this.isEditingText && this.text !== null && (this.textSize !== null && this.textSize != 0)){
      const padding = 5;
      const maxTextWidth = Math.max(0, width - padding * 2);
      const maxTextHeight = Math.max(0, height - padding * 2);
      const textSize = this.textSize || 14;
      const textHeight = getRichTextHeight(this.text, maxTextWidth, textSize, this.textFont || "Arial");

      contextCanvas.save();
      contextCanvas.beginPath();
      contextCanvas.rect(-width / 2, -height / 2, width, height);
      contextCanvas.clip();

      renderRichText(
        contextCanvas,
        this.text,
        -width / 2 + padding,
        -height / 2 + padding,
        maxTextWidth,
        this.textSize,
        this.textFont || "Arial",
        this.color,
        "left",
        "bottom",
        maxTextHeight
      );
      contextCanvas.restore();
    }

    contextCanvas.restore();
  }

  getWidth(){
    return Math.abs(this.location[1].x - this.location[0].x);
  }

  getHeight(){
    return Math.abs(this.location[1].y - this.location[0].y);
  }

  worldToLocal(point, customCenter = null){
    const center = customCenter || this.getCenter();
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const cos = Math.cos(-this.rotation);
    const sin = Math.sin(-this.rotation);
    return {
      x: dx * cos - dy * sin,
      y: dx * sin + dy * cos,
    };
  }

  localToWorld(localPoint, customCenter = null){
    const center = customCenter || this.getCenter();
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    return {
      x: center.x + localPoint.x * cos - localPoint.y * sin,
      y: center.y + localPoint.x * sin + localPoint.y * cos,
    };
  }

  getRotationAnchor(){
    const halfHeight = this.getHeight() / 2;
    return this.localToWorld({ x: 0, y: -halfHeight });
  }

  getRotationDirection(){
    const center = this.getCenter();
    const anchor = this.getRotationAnchor();
    return normalizeVector({
      x: anchor.x - center.x,
      y: anchor.y - center.y,
    });
  }

  getHighlightBoxes(){
    const halfWidth = this.getWidth() / 2;
    const halfHeight = this.getHeight() / 2;
    const handles = [
      { name: "topLeft", local: { x: -halfWidth, y: -halfHeight } },
      { name: "top", local: { x: 0, y: -halfHeight } },
      { name: "topRight", local: { x: halfWidth, y: -halfHeight } },
      { name: "left", local: { x: -halfWidth, y: 0 } },
      { name: "right", local: { x: halfWidth, y: 0 } },
      { name: "bottomLeft", local: { x: -halfWidth, y: halfHeight } },
      { name: "bottom", local: { x: 0, y: halfHeight } },
      { name: "bottomRight", local: { x: halfWidth, y: halfHeight } },
    ];

    return [
      ...handles.map((handle) => ({
        name: handle.name,
        point: this.localToWorld(handle.local),
      })),
    ];
  }

  updateSecondLocation(secondLocation){
    this.location[1] = secondLocation;
  }

  collissionCheck(point){
    const localPoint = this.worldToLocal(point);
    const halfWidth = this.getWidth() / 2;
    const halfHeight = this.getHeight() / 2;
    const hitrange = hitboxSize + this.borderWidth;

    if(
      localPoint.x >= -halfWidth - hitrange &&
      localPoint.x <= halfWidth + hitrange &&
      localPoint.y >= -halfHeight - hitrange &&
      localPoint.y <= halfHeight + hitrange
    ){
      return true;
    }
    return false;
  }

  distanceToPoint(point) {
    const localPoint = this.worldToLocal(point);
    const halfWidth = this.getWidth() / 2;
    const halfHeight = this.getHeight() / 2;
    const dx = Math.max(0, Math.abs(localPoint.x) - halfWidth);
    const dy = Math.max(0, Math.abs(localPoint.y) - halfHeight);
    return Math.sqrt(dx * dx + dy * dy);
  }

  getLinkAtPoint(point) {
    if (!this.text || this.isEditingText) return null;
    const width = this.getWidth();
    const height = this.getHeight();
    const padding = 5;
    const maxTextWidth = Math.max(0, width - padding * 2);
    const maxTextHeight = Math.max(0, height - padding * 2);
    const textSize = this.textSize || 14;

    const localPoint = this.worldToLocal(point);

    return getRichTextLinkAtPoint(
      this.text,
      localPoint,
      -width / 2 + padding,
      -height / 2 + padding,
      maxTextWidth,
      textSize,
      this.textFont || "Arial",
      "center",
      "center",
      maxTextHeight
    );
  }

  getTextEditorInfo() {
    const width = this.getWidth();
    const height = this.getHeight();
    const padding = 5;
    const maxTextWidth = Math.max(0, width - padding * 2);
    const maxTextHeight = Math.max(0, height - padding * 2);
    const textSize = this.textSize || 14;

    const textHeight = getRichTextHeight(this.text, maxTextWidth, textSize, this.textFont || "Arial");

    return {
      point: this.localToWorld({
        x: -width / 2 + padding,
        y: -height / 2 + padding,
      }),
      angle: this.rotation,
      width: maxTextWidth,
      height: Math.max(maxTextHeight, textHeight),
      align: "left",
      vAlign: "bottom"
    };
  }

  resize(handleName, point){
    const center = this.getCenter();
    const localPoint = this.worldToLocal(point, center);
    const halfWidth = this.getWidth() / 2;
    const halfHeight = this.getHeight() / 2;

    let left = -halfWidth;
    let right = halfWidth;
    let top = -halfHeight;
    let bottom = halfHeight;

    switch (handleName) {
      case "topLeft":
        left = localPoint.x;
        top = localPoint.y;
        break;
      case "top":
        top = localPoint.y;
        break;
      case "topRight":
        right = localPoint.x;
        top = localPoint.y;
        break;
      case "left":
        left = localPoint.x;
        break;
      case "right":
        right = localPoint.x;
        break;
      case "bottomLeft":
        left = localPoint.x;
        bottom = localPoint.y;
        break;
      case "bottom":
        bottom = localPoint.y;
        break;
      case "bottomRight":
        right = localPoint.x;
        bottom = localPoint.y;
        break;
      default:
        return false;
    }

    if (left > right) [left, right] = [right, left];
    if (top > bottom) [top, bottom] = [bottom, top];

    const newCenterLocal = {
      x: (left + right) / 2,
      y: (top + bottom) / 2,
    };
    const newCenterWorld = this.localToWorld(newCenterLocal, center);

    const newHalfWidth = (right - left) / 2;
    const newHalfHeight = (bottom - top) / 2;

    this.location = [
      { x: newCenterWorld.x - newHalfWidth, y: newCenterWorld.y - newHalfHeight },
      { x: newCenterWorld.x + newHalfWidth, y: newCenterWorld.y + newHalfHeight },
    ];
    return true;
  }

  translate(deltaX, deltaY){
    this.location = this.location.map((point) => ({
      x: point.x + deltaX,
      y: point.y + deltaY,
    }));
    return true;
  }

  rotateToPoint(point){
    const center = this.getCenter();
    const angle = Math.atan2(point.y - center.y, point.x - center.x);
    this.rotation = angle + Math.PI / 2;
    return true;
  }

  hasZeroSize(){
    return this.getWidth() === 0 || this.getHeight() === 0;
  }
}

class oval extends rectangle {
  constructor(location, borderColor, borderWidth, text = null, textSize = null, color = null, fillColor = null, textFont = null) {
    super(location, borderColor, borderWidth, text, textSize, color, fillColor, textFont);
  }

  draw(contextCanvas, isSelected = false) {
    if (contextCanvas === null) throw new Error("Canvas Not Loaded");

    const width = this.getWidth();
    const height = this.getHeight();
    const center = this.getCenter();
    const rx = width / 2;
    const ry = height / 2;

    contextCanvas.save();
    contextCanvas.translate(center.x, center.y);
    contextCanvas.rotate(this.rotation);

    contextCanvas.beginPath();
    contextCanvas.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);

    if (this.fillColor !== null && this.fillColor !== undefined) {
      contextCanvas.fillStyle = this.fillColor;
      contextCanvas.fill();
    }

    let drawBorderColor = this.borderColor;
    let drawBorderWidth = this.borderWidth;
    if (isSelected && (drawBorderColor === "transparent" || drawBorderWidth === 0 || drawBorderWidth == null)) {
      drawBorderColor = "blue";
      drawBorderWidth = 1;
    }

    if (drawBorderWidth > 0 && drawBorderWidth != null) {
      contextCanvas.strokeStyle = drawBorderColor;
      contextCanvas.lineWidth = drawBorderWidth;
      contextCanvas.stroke();
    }

    if (!this.isEditingText && this.text !== null && (this.textSize !== null && this.textSize != 0)) {
      const padding = 5;
      const maxTextWidth = Math.max(0, width - padding * 2);
      const maxTextHeight = Math.max(0, height - padding * 2);
      const textSize = this.textSize || 14;
      const textHeight = getRichTextHeight(this.text, maxTextWidth, textSize, this.textFont || "Arial");

      contextCanvas.save();
      contextCanvas.beginPath();
      contextCanvas.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      contextCanvas.clip();

      renderRichText(
        contextCanvas,
        this.text,
        -width / 2 + padding,
        -height / 2 + padding,
        maxTextWidth,
        this.textSize,
        this.textFont || "Arial",
        this.color,
        "center",
        "center",
        maxTextHeight
      );
      contextCanvas.restore();
    }

    contextCanvas.restore();
  }

  collissionCheck(point) {
    const localPoint = this.worldToLocal(point);
    const rx = this.getWidth() / 2;
    const ry = this.getHeight() / 2;
    const hitrange = hitboxSize + (this.borderWidth || 0);

    if (rx <= 0 || ry <= 0) return false;

    const normX = localPoint.x / (rx + hitrange);
    const normY = localPoint.y / (ry + hitrange);
    return (normX * normX + normY * normY) <= 1;
  }

  getTextEditorInfo() {
    const info = super.getTextEditorInfo();
    info.align = "center";
    info.vAlign = "center";
    return info;
  }
}

class image extends rectangle {
  constructor(location, fillColor = "transparent", borderWidth = 0, borderColor = "#000000", text = null, textSize = 14, color = "#000000", textFont = "Arial", imageSrc = null) {
    super(location, fillColor, borderWidth, text, textSize, color, fillColor, textFont);
    /*
    this.location = location;
    this.fillColor = fillColor;
    this.borderWidth = borderWidth;
    this.borderColor = borderColor;
    this.text = text;
    this.textSize = textSize;
    this.color = color;
    this.textFont = textFont;
    */
    this.imageSrc = imageSrc;
    this.imgElement = null;
    this.isLoaded = false;

    if (imageSrc) {
      this.loadImage(imageSrc);
    }
  }

  getTextEditorInfo() {
    const info = super.getTextEditorInfo();
    info.align = "center";
    info.vAlign = "center";
    return info;
  }

  loadImage(src, callback) {
    this.imageSrc = src;
    this.isLoaded = false;
    const img = new Image();

    if (src.startsWith('/api/v1/uploads/') || src.startsWith('http')) {
      const jwtToken = getCookieValue('auth');
      const version = getCookieValue('version');
      const authHeader = jwtToken ? `Bearer ${jwtToken}${version ? ',' + version : ''}` : null;

      fetch(src, {
        headers: authHeader ? { 'Authorization': authHeader } : {}
      })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.blob();
      })
      .then(blob => {
        const objectUrl = URL.createObjectURL(blob);
        img.onload = () => {
          this.imgElement = img;
          this.isLoaded = true;
          if (callback) callback();
        };
        img.src = objectUrl;
      })
      .catch(err => {
        console.error('Failed to load authenticated canvas image:', err);
      });
    } else {
      img.onload = () => {
        this.imgElement = img;
        this.isLoaded = true;
        if (callback) callback();
      };
      img.src = src;
    }
  }

  getWidth() {
    return Math.abs(this.location[1].x - this.location[0].x);
  }

  getHeight() {
    return Math.abs(this.location[1].y - this.location[0].y);
  }

  getCenter() {
    return {
      x: (this.location[0].x + this.location[1].x) / 2,
      y: (this.location[0].y + this.location[1].y) / 2
    };
  }

  draw(contextCanvas) {
    const width = this.getWidth();
    const height = this.getHeight();
    const center = this.getCenter();

    contextCanvas.save();
    contextCanvas.translate(center.x, center.y);

    if (this.isLoaded && this.imgElement) {
      contextCanvas.drawImage(this.imgElement, -width / 2, -height / 2, width, height);
    } else {
      contextCanvas.fillStyle = '#f0f0f0';
      contextCanvas.fillRect(-width / 2, -height / 2, width, height);
    }

    if (this.borderWidth > 0 && this.borderColor) {
      contextCanvas.strokeStyle = this.borderColor;
      contextCanvas.lineWidth = this.borderWidth;
      contextCanvas.strokeRect(-width / 2, -height / 2, width, height);
    }

    contextCanvas.restore();
  }
}
export { line, rectangle, oval, image };