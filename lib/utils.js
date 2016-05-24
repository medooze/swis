//Get the portion of a rectangle inside a bounary
function clipRect(rect,boundary){
	//Get bundary limits
	var left	= boundary.left;
	var right	= boundary.left+boundary.width;
	var top		= boundary.top;
	var bottom	= boundary.top+boundary.height;
	//If it is outside 
	if ( rect.left+rect.width<left || 
		rect.left>right  ||
		rect.top+rect.height<top ||
		rect.top>bottom		
	)
		//No rectangle
		return false;
	//Get inner part
	return {
		left	: Math.max(rect.left,left),
		top	: Math.max(rect.top,top),
		width	: Math.min(rect.left+rect.width,right)-Math.max(rect.left,left),
		height	: Math.min(rect.top+rect.height,bottom)-Math.max(rect.top,top)
	};
	
}

//Get the portion of a rectangle inside a bounary
function getElementScrollRect(node){

	return {
		top	: node.scrollTop,
		left	: node.scrollLeft,
		width	: node.clientWidth,
		height	: node.clientHeight
	};
	
}
function getSelectionClientRects(document,selection)
{
	//Check
	if (!selection || !selection.startContainer)
		//Empty
		return [];
	//Get scroll
	var scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
	var scrollLeft = document.documentElement.scrollLeft || document.body.scrollLeft;

	//Create new range
	var range = document.createRange();
	//Set start and end
	range.setStart(selection.startContainer, selection.startOffset);
	range.setEnd(selection.endContainer, selection.endOffset);

	//Create new bounding rects of the text fields
	var rects = [];
	var started = false;

	function walk(node) {
		//If we are not started and it is the start node
		if (!started && node===selection.startContainer) 
			//We have found it!
			started = true;
		//If it is a text node
		if (started && node.nodeType===3) 
		{
			try {
				var range = document.createRange();
				//Set start and end
				range.setStart(node, node === selection.startContainer ?  selection.startOffset : 0);
				range.setEnd(node, node === selection.endContainer ? selection.endOffset : node.textContent.length);
				//Get bounding rects
				var clientRects = range.getClientRects();
				//Positiion is top-left relative to the top-left of the viewport, so increas scroll
				for (var i=0;i<clientRects.length;++i)
				{
					//Get absolute pos
					clientRects[i].top += scrollTop;
					clientRects[i].left += scrollLeft;
					//Append
					rects.push({
						top	: clientRects[i].top + scrollTop,
						left	: clientRects[i].left + scrollLeft,
						width	: clientRects[i].width,
						height	:  clientRects[i].height,
					});
				}
			} catch(e) {
				debugger;
			}
		}
		//If we are now started and it is the end node
		if (started && node===selection.endContainer) 
			//Stop
			return false;
		//Check each children
		for (var i=0;i<node.childNodes.length;++i)
			//Process it
			if (!walk(node.childNodes[i]))
				//Ended
				return false;
		//Continue processing
		return true;
	}

	//Traverse nodes inside it
	walk(range.commonAncestorContainer);
	
	//return the client rectangles
	return rects;
};

module.exports = {
	getSelectionClientRects: getSelectionClientRects
}