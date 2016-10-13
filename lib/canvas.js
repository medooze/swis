
function Path(canvas,color)
{
	this.canvas = canvas;
	this.color = color;
	this.points = [];
}

Path.prototype.add = function(x,y)
{
	//Push it to the points line
	this.points.push({
		x: x,
		y: y
	});
	//If it is the canvas current one
	if (this.canvas.current === this)
	{
		//paint it directly so we don't have to redraw the whole canvas
		this.canvas.context.lineTo(x, y);
		this.canvas.context.stroke();
	}
};

function Canvas(document)
{
	//List of paths
	this.paths = [];
	//Store document
	this.document = document;
	// Create container
	this.container = document.createElement('div');
	this.container.style["pointer-events"] = "none";
	this.container.style.position="fixed";
	this.container.style.overflow = 'hidden';
	this.container.style.padding=0;
	this.container.style.margin=0;
	this.container.style.border=0;
	this.container.style.left="0px";
	this.container.style.top="0px";
	this.container.style.width="100%";
	this.container.style.height="100%";
	this.container.style.zIndex="2147483646";
	// Create scrollable
	this.scrollable = document.createElement('div');
	this.scrollable.style["pointer-events"] = "none";
	this.scrollable.style.position="absolute";
	this.scrollable.style.overflow = 'hidden';
	this.scrollable.style.padding=0;
	this.scrollable.style.margin=0;
	this.scrollable.style.border=0;
	this.scrollable.style.width="100%";
	this.scrollable.style.height="100%";
	this.scrollable.style.left="0px";
	this.scrollable.style.top="0px";
	this.scrollable.style.zIndex="2147483646";
	// Create a blank div where we are going to put the canvas into.
	this.canvas = document.createElement('canvas');
	this.canvas.style["pointer-events"] = "none";
	this.canvas.style.position="absolute";
	this.canvas.style.overflow = 'visible';
	this.canvas.style.left="0px";
	this.canvas.style.top="0px";
	this.canvas.style.padding=0;
	this.canvas.style.margin=0;
	this.canvas.style.border=0;
	this.canvas.style.height="0px";
	this.canvas.style.width="0px";
	this.canvas.height = 0;
	this.canvas.width = 0;	
	this.canvas.style.zIndex="2147483644";
	//Create the div for the remote cursor
	this.cursor = document.createElement('div');
	this.cursor.style["pointer-events"] = "none";
	this.cursor.style.position="absolute";
	this.cursor.style.padding=0;
	this.cursor.style.margin=0;
	this.cursor.style.border=0;
	this.cursor.style["margin-left"]="-25px";
	this.cursor.style["margin-top"]="-25px";
	this.cursor.style["background-image"] = "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" version=\"1.1\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" preserveAspectRatio=\"none\" x=\"0px\" y=\"0px\" width=\"500px\" height=\"500px\" viewBox=\"0 0 50 50\"><defs><g id=\"S_mbolo_1_0_Layer0_0_FILL\"><path fill=\"black\" fill-opacity=\"0.34901960784313724\" stroke=\"none\" d=\"M 8.85 -8.85 Q 5.2 -12.5 0 -12.5 -5.15 -12.5 -8.8 -8.85 -12.5 -5.2 -12.5 0 -12.5 5.15 -8.8 8.85 -5.15 12.5 0 12.5 5.2 12.5 8.85 8.85 12.5 5.15 12.5 0 12.5 -5.2 8.85 -8.85 Z\"/></g><g id=\"Layer0_1_FILL\"><path fill=\"#000000\" stroke=\"none\" d=\"M 38.5 40.8 L 25 25 25 45.6 29.7 41.15 33.05 50 35.4 49.05 32.1 40.25 38.5 40.8 Z\"/></g></defs><g transform=\"matrix( 1, 0, 0, 1, 25,25) \"><g transform=\"matrix( 1, 0, 0, 1, 0,0) \"><use xlink:href=\"#S_mbolo_1_0_Layer0_0_FILL\"/></g></g><g transform=\"matrix( 0.6999969482421875, 0, 0, 0.6999969482421875, 7.5,7.5) \"><use xlink:href=\"#Layer0_1_FILL\"/></g></svg>')";
	this.cursor.style["background-position"] = "center";
	this.cursor.style["background-size"] = "cover";
	this.cursor.style.height="50px";
	this.cursor.style.width="50px";
	this.cursor.style.zIndex="2147483645";
	
	//Get context
	this.context = this.canvas.getContext("2d");
	//Resize
	this.resize();
	// Add int into the container
	this.container.appendChild(this.scrollable);
	this.scrollable.appendChild(this.canvas);
	this.scrollable.appendChild(this.cursor);
	//Add into body
	document.body.appendChild(this.container);
}

Canvas.prototype.contains = function(el)
{
	//Check if element is our canvas
	return this.canvas === el || this.container === el;
};

Canvas.prototype.enablePointerEvents = function(flag)
{
	//Set tsyle
	this.canvas.style["pointer-events"] = flag ? "auto": "none";
};

Canvas.prototype.setCursor = function(cursor)
{
	//Set tsyle
	this.canvas.style["cursor"] = cursor;
};

Canvas.prototype.createPath = function(color)
{
	//Create new path
	var path = new Path(this,color);
	//Push it into paths
	this.paths.push(path);
	//Set current path
	this.current = path;
	//Start painting
	this.context.beginPath();
	this.context.strokeStyle = this.current.color;     // a green line
	this.context.lineWidth = 4;			   // 4 pixels thickness
	//return it
	return path;
};

Canvas.prototype.remotecursormove = function(x,y)
{
	//Set new position
	this.cursor.style["left"] = x + "px";
	this.cursor.style["top"] =  y + "px";
};

Canvas.prototype.scroll = function(top,left)
{
	//Set new position
	this.scrollable.style["left"] = (-left) + "px";
	this.scrollable.style["top"] =  (-top) + "px";
};

Canvas.prototype.resize = function(width,heigth)
{
	// Check if the this.canvas is not the same size.
	if (this.canvas.width!==width || this.canvas.height!==heigth) 
	{
		// Make the this.canvas the same size
		this.canvas.width  = width;
		this.canvas.height = heigth;
		this.scrollable.style.width = width+"px";
		this.scrollable.style.height = heigth+"px";
		this.canvas.style.width = width+"px";
		this.canvas.style.height = heigth+"px";
		//Redraw
		this.redraw();
	}
};

Canvas.prototype.redraw = function()
{
	//Empty canvas
	this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
	//This should go into a request animation frame
	for (var i=0;i<this.paths.length;++i)
	{
		//Get current path
		this.current = this.paths[i];
		//Start painting
		this.context.beginPath();
		this.context.strokeStyle = this.current.color;     // a green line
		this.context.lineWidth = 4;			   // 4 pixels thickness
		//For each point
		for (var j=0;j<this.current.points.length;++j)
			//Draw next path
			this.context.lineTo(this.current.points[j].x, this.current.points[j].y);
		this.context.stroke();
	}
};

Canvas.prototype.clear = function()
{
	//Empty paths
	this.paths = [];
	//Empty current
	this.current = null;
	//Redraw
	this.redraw();
};

Canvas.prototype.close = function() {
	//Empty paths
	this.paths = [];
	//Empty current
	this.current = null;
	//Remove canvas
	this.context = null;
	//IE doesn't support node.remove()
	this.container.parentNode && this.container.parentNode.removeChild(this.container);
};

module.exports = Canvas;