/**
 * Code to create dynamic canvas above all other element in a html page.
 * F. Permadi, 2009
 * http://www.permadi.com 
 *
 * This code is made available for educational purpose comes with no warranty.  Use at your own risk.
 */
var myCanvas;

 function createCanvasOverlay(color, canvasContainer)
 {
    if (!myCanvas)
    {
      if (!canvasContainer)
      {
        canvasContainer = document.createElement('div'); 
        document.body.appendChild(canvasContainer);
        canvasContainer.style.position="absolute";
        canvasContainer.style.left="0px";
        canvasContainer.style.top="0px";
        canvasContainer.style.width="100%";
        canvasContainer.style.height="100%";
        canvasContainer.style.zIndex="1000";
        superContainer=document.body;
      }
      else
        superContainer=canvasContainer;
      
      // Part of block below is inspired by code from Google excanvas.js
      {
      myCanvas = document.createElement('canvas');    
      myCanvas.style.width = superContainer.scrollWidth+"px";
      myCanvas.style.height = superContainer.scrollHeight+"px";
      // You must set this otherwise the canvas will be streethed to fit the container
      myCanvas.width=superContainer.scrollWidth;
      myCanvas.height=superContainer.scrollHeight;    
      //surfaceElement.style.width=window.innerWidth; 
      myCanvas.style.overflow = 'visible';
      myCanvas.style.position = 'absolute';
      }
      
      var context=myCanvas.getContext('2d');
      context.fillStyle = color;
      context.fillRect(0,0, myCanvas.width, myCanvas.height);
      canvasContainer.appendChild(myCanvas);
  
      var closeButton=document.createElement('div');
      closeButton.style.position="relative";      
      closeButton.style.float="right";
      closeButton.onclick = hideCanvas;
      closeButton.style.left="20px";
      closeButton.style.top="14px";      
      closeButton.style.width="50px";
      closeButton.style.height="20px";
      closeButton.style.background="#f00";
      closeButtonText=document.createTextNode("CLOSE");
      closeButton.appendChild(closeButtonText);
      
      canvasContainer.appendChild(closeButton);
     
      context.strokeStyle='rgb(0,255,0)';  // a green line
      context.lineWidth=4;                 // 4 pixels thickness     
      myCanvas.parentNode.addEventListener('mousemove', onMouseMoveOnMyCanvas, false); 
      myCanvas.parentNode.addEventListener('mousedown', onMouseClickOnMyCanvas, false); 
      //alert(myCanvas);
    }
    else
      myCanvas.parentNode.style.visibility='visible';

      
 }
 
  function onMouseMoveOnMyCanvas(event)
  {
    if (myCanvas.drawing)
    {  
      var mouseX=event.layerX;  
      var mouseY=event.layerY;

      var context = myCanvas.getContext("2d");
      if (myCanvas.pathBegun==false)
      {
        context.beginPath();
        myCanvas.pathBegun=true;
      }
      else
      {
        context.lineTo(mouseX, mouseY);
        context.stroke();
      }
    }
  }

  function onMouseClickOnMyCanvas(event)
  {
    myCanvas.drawing=!myCanvas.drawing;
    // reset the path when starting over
    if (myCanvas.drawing)
      myCanvas.pathBegun=false;
  }
 
 function hideCanvas()
 {
    if (myCanvas)
    {
      myCanvas.parentNode.style.visibility='hidden';
    }
 }
 
