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