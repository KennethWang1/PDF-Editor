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

/*
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
*/

function applyTextTransform(text, transform) {
  if (!text || !transform || transform === 'none') return text;
  if (transform === 'uppercase') return text.toUpperCase();
  if (transform === 'lowercase') return text.toLowerCase();
  if (transform === 'capitalize') {
    return text.replace(/\b\w/g, c => c.toUpperCase());
  }
  return text;
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
  boxHeight = null,
  options = {}
) {
  if (!htmlText) return;
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlText;
  
  const lineSpacingMult = options.lineHeight || 1.2;
  const letterSpacing = options.letterSpacing || 0;
  const isStrikethroughOption = options.isStrikethrough || false;
  const textTransformOption = options.textTransform || 'none';

  const lineHeight = Math.max(12, Math.ceil(defaultFontSize * lineSpacingMult));
  context.textBaseline = "top";

  const lines = [[]];

  function measureWordWidth(word, fontStr) {
    context.font = fontStr;
    const baseWidth = context.measureText(word).width;
    if (letterSpacing > 0 && word.length > 0) {
      return baseWidth + (word.length - 1) * letterSpacing;
    }
    return baseWidth;
  }

  function getLineWidth(lineItems) {
    let w = 0;
    for (const item of lineItems) {
      w += item.width;
    }
    return w;
  }

  function processNode(node, isBold, isItalic, isUnderline, isStrikethrough, currentLink = null) {
    if (node.nodeType === Node.TEXT_NODE) {
      let textVal = applyTextTransform(node.textContent, textTransformOption);
      const words = textVal.split(/(\s+)/);
      for (const word of words) {
        if (word === "") continue;
        if (word === '\n') {
          lines.push([]);
          continue;
        }
        
        const fontStr = `${isItalic ? 'italic ' : ''}${isBold ? 'bold ' : ''}${defaultFontSize}px ${defaultFontFamily}`;
        const wordWidth = measureWordWidth(word, fontStr);
        
        let currentLine = lines[lines.length - 1];
        let currentWidth = getLineWidth(currentLine);

        if (currentWidth + wordWidth > maxWidth && word.trim() !== "" && currentLine.length > 0) {
          lines.push([]);
          currentLine = lines[lines.length - 1];
        }

        currentLine.push({
          text: word,
          width: wordWidth,
          font: fontStr,
          isBold,
          isItalic,
          isUnderline,
          isStrikethrough: isStrikethrough || isStrikethroughOption,
          link: currentLink,
        });
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName.toLowerCase();
      let newBold = isBold;
      let newItalic = isItalic;
      let newUnderline = isUnderline;
      let newStrikethrough = isStrikethrough;
      let newLink = currentLink;
      
      if (tag === 'b' || tag === 'strong') newBold = true;
      else if (tag === 'i' || tag === 'em') newItalic = true;
      else if (tag === 'u') newUnderline = true;
      else if (tag === 's' || tag === 'strike' || tag === 'del') newStrikethrough = true;
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
        }
        if ((node.style.textDecoration && node.style.textDecoration.includes('line-through')) || (node.style.textDecorationLine && node.style.textDecorationLine.includes('line-through'))) {
          newStrikethrough = true;
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
        processNode(child, newBold, newItalic, newUnderline, newStrikethrough, newLink);
      }
      
      lastLine = lines[lines.length - 1];
      if (tag === 'div' && lastLine && lastLine.length > 0) {
        lines.push([]);
      }
    }
  }

  for (const child of tempDiv.childNodes) {
    processNode(child, false, false, false, false, null);
  }

  const totalHeight = lines.length * lineHeight;
  const effectiveBoxHeight = boxHeight !== null ? boxHeight : totalHeight;
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

    const spaceCount = lineItems.filter(i => i.text.trim() === "").length;
    const isJustified = align === "justify" && spaceCount > 0 && lineItems !== lines[lines.length - 1];
    const justifyExtraWidth = isJustified ? (maxWidth - lineWidth) / spaceCount : 0;

    for (const item of lineItems) {
      context.font = item.font;
      const textColor = defaultColor;
      context.fillStyle = textColor;

      let drawWidth = item.width;
      if (item.text.trim() === "" && isJustified) {
        drawWidth += justifyExtraWidth;
      }

      if (letterSpacing > 0) {
        let charX = currentX;
        for (let c = 0; c < item.text.length; c++) {
          const charStr = item.text[c];
          context.fillText(charStr, charX, currentY);
          charX += context.measureText(charStr).width + letterSpacing;
        }
      } else {
        context.fillText(item.text, currentX, currentY);
      }

      if (item.isUnderline || item.link) {
        context.save();
        context.strokeStyle = textColor;
        context.lineWidth = Math.max(1, Math.floor(defaultFontSize / 14));
        context.beginPath();
        context.moveTo(currentX, currentY + defaultFontSize);
        context.lineTo(currentX + drawWidth, currentY + defaultFontSize);
        context.stroke();
        context.restore();
      }

      if (item.isStrikethrough) {
        context.save();
        context.strokeStyle = textColor;
        context.lineWidth = Math.max(1, Math.floor(defaultFontSize / 14));
        context.beginPath();
        context.moveTo(currentX, currentY + defaultFontSize / 2);
        context.lineTo(currentX + drawWidth, currentY + defaultFontSize / 2);
        context.stroke();
        context.restore();
      }

      currentX += drawWidth;
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
  boxHeight = null,
  options = {}
) {
  if (!htmlText || typeof document === 'undefined') return null;

  const canvas = document.getElementById("document_foreground") || document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return null;

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlText;

  const lineSpacingMult = options.lineHeight || 1.2;
  const letterSpacing = options.letterSpacing || 0;
  const textTransformOption = options.textTransform || 'none';

  const lineHeight = Math.max(12, Math.ceil(defaultFontSize * lineSpacingMult));
  const lines = [[]];

  function measureWordWidth(word, fontStr) {
    context.font = fontStr;
    const baseWidth = context.measureText(word).width;
    if (letterSpacing > 0 && word.length > 0) {
      return baseWidth + (word.length - 1) * letterSpacing;
    }
    return baseWidth;
  }

  function getLineWidth(lineItems) {
    let w = 0;
    for (const item of lineItems) {
      w += item.width;
    }
    return w;
  }

  function processNode(node, isBold, isItalic, isUnderline, currentLink = null) {
    if (node.nodeType === Node.TEXT_NODE) {
      let textVal = applyTextTransform(node.textContent, textTransformOption);
      const words = textVal.split(/(\s+)/);
      for (const word of words) {
        if (word === "") continue;
        if (word === '\n') {
          lines.push([]);
          continue;
        }

        const fontStr = `${isItalic ? 'italic ' : ''}${isBold ? 'bold ' : ''}${defaultFontSize}px ${defaultFontFamily}`;
        const wordWidth = measureWordWidth(word, fontStr);

        let currentLine = lines[lines.length - 1];
        let currentWidth = getLineWidth(currentLine);

        if (currentWidth + wordWidth > maxWidth && word.trim() !== "" && currentLine.length > 0) {
          lines.push([]);
          currentLine = lines[lines.length - 1];
        }

        currentLine.push({
          text: word,
          width: wordWidth,
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
  const effectiveBoxHeight = boxHeight !== null ? boxHeight : totalHeight;
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

function getRichTextHeight(htmlText, maxWidth, defaultFontSize, defaultFontFamily, options = {}) {
  if (typeof document === 'undefined') return defaultFontSize * (options.lineHeight || 1.2);
  const canvas = document.getElementById("document_foreground") || document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return defaultFontSize * (options.lineHeight || 1.2);

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlText || "";
  
  let currentX = 0;
  let linesCount = 1;
  const lineSpacingMult = options.lineHeight || 1.2;
  const letterSpacing = options.letterSpacing || 0;
  const textTransformOption = options.textTransform || 'none';

  const lineHeight = Math.max(12, Math.ceil(defaultFontSize * lineSpacingMult));

  function processNode(node, isBold, isItalic, isUnderline) {
    if (node.nodeType === Node.TEXT_NODE) {
      let textVal = applyTextTransform(node.textContent, textTransformOption);
      const words = textVal.split(/(\s+)/);
      for (const word of words) {
        if (word === "") continue;
        if (word === '\n') {
          currentX = 0;
          linesCount++;
          continue;
        }
        context.font = `${isItalic ? 'italic ' : ''}${isBold ? 'bold ' : ''}${defaultFontSize}px ${defaultFontFamily}`;
        let wordWidth = context.measureText(word).width;
        if (letterSpacing > 0 && word.length > 0) {
          wordWidth += (word.length - 1) * letterSpacing;
        }

        if (currentX + wordWidth > maxWidth && word.trim() !== "") {
          currentX = 0;
          linesCount++;
        }
        currentX += wordWidth;
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
      if (tag === 'br') {
        currentX = 0;
        linesCount++;
        return;
      }
      for (const child of node.childNodes) {
        processNode(child, newBold, newItalic, newUnderline);
      }
    }
  }

  for (const child of tempDiv.childNodes) {
    processNode(child, false, false, false);
  }

  return linesCount * lineHeight;
}

class shape {
  constructor(location = null, borderColor = null, borderWidth = null, text = null, textSize = null, color = null, fillColor = null, textFont = null) {
    this.location = location;
    this.borderColor = borderColor;
    this.borderWidth = borderWidth;
    this.text = text;
    this.textSize = textSize;
    this.color = color;
    this.fillColor = fillColor;
    this.textFont = textFont;
    this.rotation = 0;
    this.isEditingText = false;
    this.textAlign = "left";
    this.verticalAlign = "top";
    this.letterSpacing = 0;
    this.lineHeight = 1.2;
    this.isStrikethrough = false;
    this.textTransform = "none";
    this.padding = 5;
  }

  getFormattingOptions() {
    return {
      textAlign: this.textAlign || "left",
      verticalAlign: this.verticalAlign || "top",
      letterSpacing: this.letterSpacing || 0,
      lineHeight: this.lineHeight || 1.2,
      isStrikethrough: this.isStrikethrough || false,
      textTransform: this.textTransform || "none",
      padding: this.padding !== null ? this.padding : 5
    };
  }

  worldToLocal(point, customCenter = null) {
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

  localToWorld(point, customCenter = null) {
    const center = customCenter || this.getCenter();
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    return {
      x: center.x + (point.x * cos - point.y * sin),
      y: center.y + (point.x * sin + point.y * cos),
    };
  }

  drawHighlightBox(contextCanvas) {
    contextCanvas.save();
    contextCanvas.strokeStyle = "blue";
    contextCanvas.lineWidth = 1;
    contextCanvas.fillStyle = "white";

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
    const anchorLocal = this.getRotationAnchor();
    if (anchorLocal === null) return null;

    const directionLocal = normalizeVector(this.getRotationDirection());
    const circleLocal = {
      x: anchorLocal.x + directionLocal.x * rotationStemLength,
      y: anchorLocal.y + directionLocal.y * rotationStemLength,
    };

    return {
      anchor: this.localToWorld(anchorLocal),
      circle: this.localToWorld(circleLocal),
    };
  }
}

class line extends shape {
  constructor(location = null, borderColor = null, borderWidth = null, text = null, textSize = null, color = null, fillColor = null, textFont = null) {
    super(location, borderColor, borderWidth, text, textSize, color, fillColor, textFont);
  }

  getCenter(){
    return {
      x: (this.location[0].x + this.location[1].x) / 2,
      y: (this.location[0].y + this.location[1].y) / 2,
    };
  }

  getHighlightBoxes(){
    return [
      { name: "start", point: makePoint(this.location[0]) },
      { name: "end", point: makePoint(this.location[1]) },
    ];
  }

  getRotationAnchor(){
    return { x: 0, y: 0 };
  }

  getRotationDirection(){
    const dx = this.location[1].x - this.location[0].x;
    const dy = this.location[1].y - this.location[0].y;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length === 0) return { x: 0, y: -1 };
    return {
      x: -dy / length,
      y: dx / length,
    };
  }

  getRotationHandle(){
    const dx = this.location[1].x - this.location[0].x;
    const dy = this.location[1].y - this.location[0].y;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length === 0) return null;

    const midPoint = this.getCenter();
    const normal = {
      x: -dy / length,
      y: dx / length,
    };

    return {
      anchor: midPoint,
      circle: {
        x: midPoint.x + normal.x * rotationStemLength,
        y: midPoint.y + normal.y * rotationStemLength,
      },
    };
  }

  draw(contextCanvas) {
    contextCanvas.save();
    contextCanvas.strokeStyle = this.borderColor;
    contextCanvas.lineWidth = this.borderWidth;
    contextCanvas.beginPath();
    contextCanvas.moveTo(this.location[0].x, this.location[0].y);
    contextCanvas.lineTo(this.location[1].x, this.location[1].y);
    contextCanvas.stroke();

    if(!this.isEditingText && this.text !== null && (this.textSize !== null && this.textSize !== 0)){
      const dx = this.location[1].x - this.location[0].x;
      const dy = this.location[1].y - this.location[0].y;
      const angle = Math.atan2(dy, dx);
      const opts = this.getFormattingOptions();
      const textHeight = getRichTextHeight(this.text, 240, this.textSize, this.textFont || "Arial", opts);

      contextCanvas.save();
      contextCanvas.translate(this.location[0].x, this.location[0].y);
      contextCanvas.rotate(angle);
      renderRichText(contextCanvas, this.text, 5, -5 - textHeight, 240, this.textSize, this.textFont || "Arial", this.color, opts.textAlign, opts.verticalAlign, null, opts);
      contextCanvas.restore();
    }
    contextCanvas.restore();
  }

  getTextEditorInfo(){
    const dx = this.location[1].x - this.location[0].x;
    const dy = this.location[1].y - this.location[0].y;
    const angle = Math.atan2(dy, dx);
    const textSize = this.textSize || 14;
    const opts = this.getFormattingOptions();
    const textHeight = getRichTextHeight(this.text, 240, textSize, this.textFont || "Arial", opts);

    const rotatedOffset = rotateOffset({ x: 5, y: -5 - textHeight }, angle);

    return {
      point: {
        x: this.location[0].x + rotatedOffset.x,
        y: this.location[0].y + rotatedOffset.y,
      },
      width: 240,
      height: Math.max(20, textHeight),
      angle: angle,
      align: opts.textAlign,
      vAlign: opts.verticalAlign
    };
  }

  collissionCheck(point){
    return pointToSegmentDistance(
      point.x,
      point.y,
      this.location[0].x,
      this.location[0].y,
      this.location[1].x,
      this.location[1].y
    ) <= (hitboxSize + this.borderWidth / 2);
  }

  distanceToPoint(point) {
    return pointToSegmentDistance(
      point.x,
      point.y,
      this.location[0].x,
      this.location[0].y,
      this.location[1].x,
      this.location[1].y
    );
  }

  getLinkAtPoint(point) {
    if (!this.text || this.isEditingText) return null;
    const dx = this.location[1].x - this.location[0].x;
    const dy = this.location[1].y - this.location[0].y;
    const angle = Math.atan2(dy, dx);
    const opts = this.getFormattingOptions();
    const textHeight = getRichTextHeight(this.text, 240, this.textSize, this.textFont || "Arial", opts);

    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    const relX = point.x - this.location[0].x;
    const relY = point.y - this.location[0].y;
    const localPoint = {
      x: relX * cos - relY * sin,
      y: relX * sin + relY * cos,
    };

    return getRichTextLinkAtPoint(
      this.text,
      localPoint,
      5,
      -5 - textHeight,
      240,
      this.textSize || 14,
      this.textFont || "Arial",
      opts.textAlign,
      opts.verticalAlign,
      null,
      opts
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
    if (!this.text || (this.textSize === null || this.textSize === 0)) return null;
    const dx = this.location[1].x - this.location[0].x;
    const dy = this.location[1].y - this.location[0].y;
    const angle = Math.atan2(dy, dx);
    const opts = this.getFormattingOptions();
    const textHeight = getRichTextHeight(this.text, 240, this.textSize, this.textFont || "Arial", opts);

    return {
      x: this.location[0].x,
      y: this.location[0].y - textHeight - 5,
      width: 240,
      height: textHeight,
      rotation: angle,
    };
  }
}

class rectangle extends shape {
  constructor(location = null, borderColor = null, borderWidth = null, text = null, textSize = null, color = null, fillColor = null, textFont = null) {
    super(location, borderColor, borderWidth, text, textSize, color, fillColor, textFont);
  }

  getHighlightBoxes(){
    const halfWidth = this.getWidth() / 2;
    const halfHeight = this.getHeight() / 2;

    const handles = [
      { name: "topLeft", local: { x: -halfWidth, y: -halfHeight } },
      { name: "topRight", local: { x: halfWidth, y: -halfHeight } },
      { name: "bottomLeft", local: { x: -halfWidth, y: halfHeight } },
      { name: "bottomRight", local: { x: halfWidth, y: halfHeight } },
    ];

    return [
      ...handles.map((handle) => ({
        name: handle.name,
        point: this.localToWorld(handle.local),
      })),
    ];
  }

  getRotationAnchor(){
    return { x: 0, y: -this.getHeight() / 2 };
  }

  getRotationDirection(){
    return { x: 0, y: -1 };
  }

  draw(contextCanvas) {
    const width = this.getWidth();
    const height = this.getHeight();
    const center = this.getCenter();

    contextCanvas.save();
    contextCanvas.translate(center.x, center.y);
    contextCanvas.rotate(this.rotation);

    if (this.fillColor !== null && this.fillColor !== "transparent" && this.fillColor !== undefined) {
      contextCanvas.fillStyle = this.fillColor;
      contextCanvas.fillRect(-width / 2, -height / 2, width, height);
    }

    let drawBorderColor = this.borderColor;
    let drawBorderWidth = this.borderWidth;

    if (drawBorderWidth === 0 && (drawBorderColor === "transparent" || drawBorderColor == null)) {
      drawBorderColor = "blue";
      drawBorderWidth = 1;
    }

    if(drawBorderWidth > 0 && drawBorderWidth !== null){
      contextCanvas.strokeStyle = drawBorderColor;
      contextCanvas.lineWidth = drawBorderWidth;
      contextCanvas.strokeRect(-width / 2, -height / 2, width, height);
    }

    if(!this.isEditingText && this.text !== null && (this.textSize !== null && this.textSize !== 0)){
      const opts = this.getFormattingOptions();
      const padding = opts.padding;
      const maxTextWidth = Math.max(0, width - padding * 2);
      const maxTextHeight = Math.max(0, height - padding * 2);

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
        opts.textAlign,
        opts.verticalAlign,
        maxTextHeight,
        opts
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

  getTextEditorInfo(){
    const center = this.getCenter();
    const width = this.getWidth();
    const height = this.getHeight();
    const opts = this.getFormattingOptions();
    const padding = opts.padding;

    const innerWidth = Math.max(10, width - padding * 2);
    const innerHeight = Math.max(10, height - padding * 2);

    const topLeftWorld = this.localToWorld({
      x: -width / 2 + padding,
      y: -height / 2 + padding,
    }, center);

    return {
      point: topLeftWorld,
      width: innerWidth,
      height: innerHeight,
      angle: this.rotation,
      align: opts.textAlign,
      vAlign: opts.verticalAlign
    };
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
    const opts = this.getFormattingOptions();
    const padding = opts.padding;
    const maxTextWidth = Math.max(0, width - padding * 2);
    const maxTextHeight = Math.max(0, height - padding * 2);

    const localPoint = this.worldToLocal(point);

    return getRichTextLinkAtPoint(
      this.text,
      localPoint,
      -width / 2 + padding,
      -height / 2 + padding,
      maxTextWidth,
      this.textSize || 14,
      this.textFont || "Arial",
      opts.textAlign,
      opts.verticalAlign,
      maxTextHeight,
      opts
    );
  }

  resize(handleName, point){
    const center = this.getCenter();
    const localPoint = this.worldToLocal(point, center);

    let left = -this.getWidth() / 2;
    let right = this.getWidth() / 2;
    let top = -this.getHeight() / 2;
    let bottom = this.getHeight() / 2;

    switch (handleName) {
      case "topLeft":
        left = localPoint.x;
        top = localPoint.y;
        break;
      case "topRight":
        right = localPoint.x;
        top = localPoint.y;
        break;
      case "bottomLeft":
        left = localPoint.x;
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
  constructor(location = null, borderColor = null, borderWidth = null, text = null, textSize = null, color = null, fillColor = null, textFont = null) {
    super(location, borderColor, borderWidth, text, textSize, color, fillColor, textFont);
  }

  draw(contextCanvas) {
    const width = this.getWidth();
    const height = this.getHeight();
    const center = this.getCenter();

    contextCanvas.save();
    contextCanvas.translate(center.x, center.y);
    contextCanvas.rotate(this.rotation);

    contextCanvas.beginPath();
    contextCanvas.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);

    if (this.fillColor !== null && this.fillColor !== "transparent" && this.fillColor !== undefined) {
      contextCanvas.fillStyle = this.fillColor;
      contextCanvas.fill();
    }

    if(this.borderWidth > 0 && this.borderColor !== null){
      contextCanvas.strokeStyle = this.borderColor;
      contextCanvas.lineWidth = this.borderWidth;
      contextCanvas.stroke();
    }

    if(!this.isEditingText && this.text !== null && (this.textSize !== null && this.textSize !== 0)){
      const opts = this.getFormattingOptions();
      const padding = opts.padding;
      const maxTextWidth = Math.max(0, width - padding * 2);
      const maxTextHeight = Math.max(0, height - padding * 2);

      contextCanvas.save();
      contextCanvas.beginPath();
      contextCanvas.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
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
        opts.textAlign,
        opts.verticalAlign,
        maxTextHeight,
        opts
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

  distanceToPoint(point) {
    const localPoint = this.worldToLocal(point);
    const rx = this.getWidth() / 2;
    const ry = this.getHeight() / 2;

    if (rx <= 0 || ry <= 0) return Infinity;

    const normX = localPoint.x / rx;
    const normY = localPoint.y / ry;
    const distSq = normX * normX + normY * normY;

    if (distSq <= 1) return 0;
    return (Math.sqrt(distSq) - 1) * Math.min(rx, ry);
  }
}

class image extends rectangle {
  constructor(location = null, borderColor = null, borderWidth = null, text = null, textSize = null, color = null, fillColor = null, textFont = null, imageSrc = null) {
    super(location, borderColor, borderWidth, text, textSize, color, fillColor, textFont);
    this.imageSrc = imageSrc;
    this.imgElement = null;
    this.isLoaded = false;
    if (imageSrc) {
      this.loadImage(imageSrc);
    }
  }

  loadImage(src, callback) {
    const img = new Image();
    const token = getCookieValue('authtoken');
    if (token) {
      fetch(src, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      .then(res => {
        if (!res.ok) throw new Error('Image fetch failed');
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
    contextCanvas.rotate(this.rotation);

    if (this.isLoaded && this.imgElement) {
      contextCanvas.drawImage(this.imgElement, -width / 2, -height / 2, width, height);
    } else {
      contextCanvas.fillStyle = "#e0e0e0";
      contextCanvas.fillRect(-width / 2, -height / 2, width, height);
    }

    if (this.borderWidth > 0 && this.borderColor && this.borderColor !== "transparent") {
      contextCanvas.strokeStyle = this.borderColor;
      contextCanvas.lineWidth = this.borderWidth;
      contextCanvas.strokeRect(-width / 2, -height / 2, width, height);
    }

    contextCanvas.restore();
  }
}

export { line, rectangle, oval, image };