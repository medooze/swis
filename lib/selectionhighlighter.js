var Utils = require("./utils.js");

function SelectionHighlighter(document)
{
	this.document = document;
	this.highlights = [];
}


SelectionHighlighter.prototype.clear = function()
{
	//Clean
	this.selection = null;
	this.redraw();
};

SelectionHighlighter.prototype.select = function(selection)
{
	//Store selection
	this.selection = selection;
	//Redraw
	this.redraw();
};

SelectionHighlighter.prototype.redraw = function()
{
	//Clean highligts first
	for (var i=0;i<this.highlights.length;i++)
		//REmove nodes
		this.highlights[i].remove();
	
	//Clean array
	this.highlights = [];

	//Get rects
	var rects = Utils.getSelectionClientRects(this.document,this.selection);

	//Create a highlight for each rect
	for (var i=0;i<rects.length;i++)
	{
		//Create new element
		var high = document.createElement("div");
		//Set absolute positioning
		high.style["pointer-events"] = "none";
		high.style["position"] = "absolute";
		high.style["top"] = rects[i].top+"px";
		high.style["left"] = rects[i].left+"px";
		high.style["width"] = rects[i].width+"px";
		high.style["height"] = rects[i].height+"px";
		high.style["border"] = "1px dotted orange";
		high.style["background-color"] = "yellow";
		high.style["margin"] = "0px";
		high.style["padding"] = "0px";
		high.style["opacity"] = "0.4";
		high.style["z-index"] = "2147483646";
		//Insert into
		this.document.documentElement.appendChild(high);
		//Push to this.highlights array
		this.highlights.push(high);
	}
};

SelectionHighlighter.prototype.contains = function(el)
{
	//Check each element in us
	for (var i=0;i<this.highlights.length;i++)
		//REmove nodes
		if (this.highlights[i] === el)
			return true;
	//Not found
	return false;
};

SelectionHighlighter.prototype.close = function()
{
	//clear
	this.clear();
};

module.exports = SelectionHighlighter;