
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
	this.container.style.position="absolute";
	this.container.style.overflow = 'hidden';
	this.container.style.left="0px";
	this.container.style.top="0px";
	this.container.style.width="100%";
	this.container.style.height="100%";
	this.container.style.zIndex="2147483646";
	// Create a blank div where we are going to put the canvas into.
	this.canvas = document.createElement('canvas');
	this.canvas.style["pointer-events"] = "none";
	this.canvas.style.position="relative";
	this.canvas.style.overflow = 'visible';
	this.canvas.style.left="0px";
	this.canvas.style.top="0px";
	this.canvas.style.zIndex="2147483646";
	//Get context
	this.context = this.canvas.getContext("2d");
	//Resize
	this.resize();
	// Add int into the container
	this.container.appendChild(this.canvas);
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

Canvas.prototype.resize = function()
{
	// Lookup the size the browser is displaying the canvas.
	var displayWidth  = this.document.documentElement.scrollWidth;
	var displayHeight = this.document.documentElement.scrollHeight;

	// Check if the this.canvas is not the same size.
	if (this.canvas.width!==displayWidth || this.canvas.height!==displayHeight) 
	{
		// Make the this.canvas the same size
		this.canvas.width  = displayWidth;
		this.canvas.height = displayHeight;
		this.canvas.style.width = displayWidth+"px";
		this.canvas.style.height = displayHeight+"px";
	}
	//Redraw
	this.redraw();
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
	this.container.remove();
};

module.exports = Canvas;