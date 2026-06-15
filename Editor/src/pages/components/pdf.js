import './pdf.css';
import React, { useState, useRef, useEffect } from 'react';
import { line, rectangle } from './shapes.js';
import { ChromePicker } from 'react-color';

let backgroundCanvas = null, foregroundCanvas = null, strokeColor = "black", lastClick = null, shapes = [], drawType = null, selectedShape = null;

function onMount() {
  if(foregroundCanvas !== null && backgroundCanvas !== null) return;
  foregroundCanvas = document.getElementById("document_foreground");
  backgroundCanvas = document.getElementById("document_background");
  foregroundCanvas = foregroundCanvas.getContext("2d");
  backgroundCanvas = backgroundCanvas.getContext("2d");
}

function mouseMoveHandler(event){
  if(lastClick === null) return;
  if(selectedShape === null) return;
  let canvas = document.getElementById("document_foreground");
  let rect = canvas.getBoundingClientRect();
  let eventX = event.clientX - rect.left;
  let eventY = event.clientY - rect.top;
  
  foregroundCanvas.clearRect(0, 0, canvas.width, canvas.height);
  selectedShape.updateSecondLocation({x: eventX, y: eventY});
  selectedShape.draw(foregroundCanvas);
  selectedShape.drawHighlightBox(foregroundCanvas);
}

//defualt mouseClick handler
function mouseClicked(event){
  let canvas = document.getElementById("document_foreground");
  let rect = canvas.getBoundingClientRect();
  let clickX = event.clientX - rect.left;
  let clickY = event.clientY - rect.top;

  if (lastClick === null){
    switch(drawType){
      case "line":
        selectedShape = new line([{x: clickX, y: clickY}, {x: clickX, y: clickY}], strokeColor, 1, null, null, null, null);
        break;
      case "rectangle":
        selectedShape = new rectangle([{x: clickX, y: clickY}, {x: clickX, y: clickY}], strokeColor, 1, null, null, null, null);
        break;
      default:
        let minDist = Infinity;
        let nearestShape = null;
        for(let i = 0; i < shapes.length; i++){
          if(shapes[i].collissionCheck({x: clickX, y: clickY})){
            let dist = typeof shapes[i].distanceToPoint === 'function'
              ? shapes[i].distanceToPoint({x: clickX, y: clickY})
              : Infinity;
            if(dist < minDist) {
              minDist = dist;
              nearestShape = shapes[i];
            }
          }
        }
        if (nearestShape) {
          selectedShape = nearestShape;
          backgroundCanvas.clearRect(0,0,canvas.width, canvas.height);
          shapes.map((item) => {
            if (item != selectedShape) item.draw(backgroundCanvas);
          });
          selectedShape.draw(foregroundCanvas);
          selectedShape.drawHighlightBox(foregroundCanvas);
        }
    }
    if (selectedShape != null) lastClick = {x: clickX, y: clickY};
    canvas.addEventListener("mousemove", mouseMoveHandler);
  }else{
    canvas.removeEventListener("mousemove", mouseMoveHandler);
    foregroundCanvas.clearRect(0, 0, canvas.width, canvas.height);

    if (selectedShape != null) shapes.push(selectedShape);
    selectedShape = null;
    lastClick = null;
    if(shapes.length > 0) shapes[shapes.length-1].draw(backgroundCanvas);
  }
}

//load previous document
function load(){
  //fetch
  //temporary example
  backgroundCanvas.clearRect(0,0,window.innerHeight, window.innerWidth);

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
        textSize: 5,
        color: "black",
        textFont: "Calibri",
        fillColor: null
      },
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
      default:
        temp = null
        break;
    }
    if (temp !== null) temp.draw(backgroundCanvas);
    return temp;
  });

  document.getElementById("document_foreground").addEventListener("click", mouseClicked);
}

function changeColor(newColor){
    strokeColor = newColor
    return true
}

//render the pdf editor
function RenderPDFEditor(){
  const [color, setColor] = useState("#000000");

  useEffect(() => {
    onMount();
    load();

    return () => {
      let canvas = document.getElementById("document_foreground");
      if (canvas) {
        canvas.removeEventListener("click", mouseClicked);
        canvas.removeEventListener("mousemove", mouseMoveHandler);
      }
      backgroundCanvas = null;
      foregroundCanvas = null;
    }
  }, []);

  return (
    <div id="pdf-editor">
      <canvas id = "document_background" width={window.innerWidth-40} height={window.innerHeight}/>
      <canvas id = "document_foreground" width={window.innerWidth-40} height={window.innerHeight}/>
      <div id = "button-col">
        <input type="button" id = "line_select" className='type_select' onClick={()=>{
            drawType = "line";
          }} value="Line"/>
        <input type="button" id = "rect_select" className='type_select' onClick={()=>{
            drawType = "rectangle";
          }} value="Rectangle"/>
        <input type="button" id = "rect_select" className='type_select' onClick={()=>{
            drawType = null;
          }} value="Mouse"/>
        <ChromePicker 
          color={color}
          width = "200px" 
          onChange={(newColor) => {
            setColor(newColor.hex);
            changeColor(newColor.hex);
          }}
        />
      </div>
    </div>
  );
}

export { RenderPDFEditor };   