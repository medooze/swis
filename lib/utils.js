var getSelectionClientRects = function(document,selection)
{
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
			var range = document.createRange();
			//Set start and end
			range.setStart(node, node === selection.startContainer ?  selection.startOffset : 0);
			range.setEnd(node, node === selection.endContainer ? selection.endOffset : node.wholeText.length);
			//Get bounding rects
			Array.prototype.push.apply(rects,range.getClientRects());
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