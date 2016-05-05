
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
	// Create a blank div where we are going to put the canvas into.
	this.canvas = document.createElement('canvas');
	this.canvas.className = "cursor";
	this.canvas.style["pointer-events"] = "none";
	this.canvas.style.position="absolute";
	this.canvas.style.overflow = 'visible';
	this.canvas.style.left="0px";
	this.canvas.style.top="0px";
	this.canvas.style.zIndex="2147483646";
	//Resize
	this.resize();
	// Add int into the container
	document.body.appendChild(this.canvas);
	//Get context
	this.context = this.canvas.getContext("2d");
}


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
	var displayWidth  = this.document.documentElement.clientWidth;
	var displayHeight = this.document.documentElement.clientHeight;

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

Canvas.prototype.stop = function() {
	//Empty paths
	this.paths = [];
	//Empty current
	this.current = null;
	//Remove canvas
	this.canvas.remove();
};

module.exports = Canvas;