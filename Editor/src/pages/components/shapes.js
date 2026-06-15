// Utility function for point-to-segment distance
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
const hitboxSize = 2;

class shape{
  constructor(location, borderColor, borderWidth, text, textSize, color, fillColor ,textFont){
    this.location = location;
    this.borderColor = borderColor;
    this.borderWidth = borderWidth;
    this.text = text;
    this.textSize = textSize;
    this.color = color;
    this.fillColor = fillColor;
    this.textFont = textFont;
    this.selected = false;
  }

  draw(contextCanvas){
    throw new Error("Method 'draw(contextCanvas)' must be implemented.");
  }

  save(){
    throw new Error("Method save() must be implemented");
  }

  collissionCheck(point){
    throw new Error("Method collissionCheck(point) must be implemented");
  }

  collissionCheck (leftBound, rightBound){
    throw new Error("Method collissionCheck(leftBound, rightBound) must be implemented");
  }

  drawHighlightBox(contextCanvas){
    if (contextCanvas === null) throw new Error("Canvas Not Loaded");

    contextCanvas.strokeStyle = "blue";
    contextCanvas.lineWidth = 0.25;
    contextCanvas.strokeRect(this.location[0].x-4,this.location[0].y-4,8,8);
    contextCanvas.strokeRect(this.location[1].x-4,this.location[1].y-4,8,8);
    contextCanvas.strokeRect(this.location[0].x-4,this.location[1].y-4,8,8);
    contextCanvas.strokeRect(this.location[1].x-4,this.location[0].y-4,8,8);


  }

  updateSecondLocation(secondLocation){
    this.location[1] = secondLocation;
  }
}

class line extends shape{

    // Returns the minimum distance from a point to this line segment
    distanceToPoint(point) {
      const x1 = this.location[0].x, y1 = this.location[0].y;
      const x2 = this.location[1].x, y2 = this.location[1].y;
      return pointToSegmentDistance(point.x, point.y, x1, y1, x2, y2);
    }
  constructor(location, borderColor, borderWidth, text = null, textSize = null, color = null, fillColor = null, textFont = null){
    super(location, borderColor, borderWidth, text, textSize, color, fillColor, textFont);
  }

  draw(contextCanvas){
    if (contextCanvas === null) throw new Error("Canvas Not Loaded");
    contextCanvas.strokeStyle = this.borderColor;
    contextCanvas.lineWidth = this.borderWidth;
    
    contextCanvas.beginPath();
    contextCanvas.moveTo(this.location[0].x, this.location[0].y);
    contextCanvas.lineTo(this.location[1].x, this.location[1].y);
    contextCanvas.stroke();

    
    if(this.text !== null && (this.textSize !== null && this.textSize != 0)){
      contextCanvas.fillStyle = this.color;
      contextCanvas.font = `${this.textSize}px ${this.textFont}`;
      contextCanvas.fillText(this.text, this.location[0].x + 5, this.location[0].y - 5); //TODO: make it sit on the line
    }
  }

  collissionCheck(point){
    const xBoundLeft = Math.min(this.location[0].x, this.location[1].x);
    const xBoundRight = Math.max(this.location[0].x, this.location[1].x);
    const yBoundTop = Math.min(this.location[0].y, this.location[1].y);
    const yBoundBottom = Math.max(this.location[0].y, this.location[1].y);

    const hitrange = hitboxSize + this.borderWidth;

    if(point.x < xBoundLeft - hitrange || point.x > xBoundRight + hitrange || point.y < yBoundTop - hitrange || point.y > yBoundBottom + hitrange){
      return false;
    }

    const diff = (point.x - this.location[0].x) / (this.location[1].x - this.location[0].x) - (point.y - this.location[0].y) / (this.location[1].y - this.location[0].y);

    if(diff < hitboxSize){
      return true;
    }

    return false;
  }
}

class rectangle extends shape{

    // Returns the minimum distance from a point to the rectangle border
    distanceToPoint(point) {
      let loc0 = this.location[0];
      let loc1 = this.location[1];
      let left = Math.min(loc0.x, loc1.x);
      let right = Math.max(loc0.x, loc1.x);
      let top = Math.min(loc0.y, loc1.y);
      let bottom = Math.max(loc0.y, loc1.y);
      let dx = Math.max(left - point.x, 0, point.x - right);
      let dy = Math.max(top - point.y, 0, point.y - bottom);
      if (dx === 0 || dy === 0) {
        return Math.max(dx, dy); // On the border or inside
      } else {
        return Math.sqrt(dx * dx + dy * dy);
      }
    }
  constructor(location, borderColor, borderWidth, text = null, textSize = null, color = null, fillColor = null, textFont = null){
    super(location, borderColor, borderWidth, text, textSize, color, fillColor,textFont);
  }

  draw(contextCanvas){
    if (contextCanvas === null) throw new Error("Canvas Not Loaded");
    contextCanvas.strokeStyle = this.borderColor;
    contextCanvas.lineWidth = this.borderWidth;
    
    if(this.fillColor !== null && this.fillColor !== undefined) {
      contextCanvas.fillStyle=this.fillColor;
      contextCanvas.fillRect(this.location[0].x, this.location[0].y,this.location[1].x - this.location[0].x, this.location[1].y - this.location[0].y);
    }

    if(this.borderWidth > 0 && this.borderWidth != null){
      contextCanvas.strokeStyle = this.borderColor;
      contextCanvas.lineWidth = this.borderWidth;
      contextCanvas.strokeRect(this.location[0].x, this.location[0].y,this.location[1].x - this.location[0].x, this.location[1].y - this.location[0].y);
    }

    
    if(this.text !== null && (this.textSize !== null && this.textSize != 0)){
      contextCanvas.fillStyle = this.color;
      contextCanvas.font = `${this.textSize}px ${this.textFont}`;
      contextCanvas.fillText(this.text, this.location[0].x + 5, this.location[0].y - 5); //TODO: make it sit on the line
    }
  }
  
  updateSecondLocation(secondLocation){
    if(secondLocation.x < this.location[0].x){
      this.location[1] = this.location[0];
      this.location[0] = secondLocation;
    }else{
      this.location[1] = secondLocation;
    }

  }

  collissionCheck(point){
    const xBoundLeft = Math.abs(point.x - this.location[0].x);
    const xBoundRight = Math.abs(point.x - this.location[1].x);
    const yBoundTop = Math.abs(point.y - this.location[0].y);
    const yBoundBottom = Math.abs(point.y - this.location[1].y);
    const hitrange = hitboxSize + this.borderWidth;

    console.log(xBoundLeft, xBoundRight, yBoundTop, yBoundBottom);

    if(xBoundLeft < hitrange || xBoundRight < hitrange || yBoundTop < hitrange || yBoundBottom < hitrange){
      return true;
    }
    return false;
  }
}

export {line, rectangle};