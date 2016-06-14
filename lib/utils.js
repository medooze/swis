
function canvasToArrayBuffer(canvas,callback, type, quality)
{
	if (!canvas.toBlob) 
	{
		//Use toDataURL instead
		var binStr = atob( canvas.toDataURL(type, quality).split(',')[1] ),
		   len = binStr.length,
		   arr = new Uint8Array(len);
		//Get binary data
		for (var i=0; i<len; i++ ) 
			arr[i] = binStr.charCodeAt(i);
		//Call callback
		callback(arr);
	} else {
		
		//Call it
		canvas.toBlob(function(blob){
			//Create readerr
			var fileReader = new FileReader();
			fileReader.onload = function() {
			    //Call callback
			    callback(this.result);
			};
			//Read as array
			fileReader.readAsArrayBuffer(blob);
		},type,quality);
	}
}

function getCommonAncestors(ancestorsA,ancestorsB)
{
	//Iterate in reverse order
	var a = ancestorsA.length;
	var b = ancestorsB.length;
	//Find inner most ancestor (note it is 1 and not 0 because --iterator)
	while (a>1 && b>1)
		//Check if they are still the same
		if (ancestorsA[--a] !== ancestorsB[--b])
			//Common ancestors was the previous ones
			break;
	//They are the same
	return ancestorsA.splice(a);
}
function getAncestors(node) {
	var ancestors = [];
	var parent = node;
	//Get until no parents
	while ((parent=parent.parentNode))
		//Push it
		ancestors.push(parent);
	//Return list of ancestors in reverse order
	return ancestors;
}
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

function createElementFromHTML (html)
{
	//If it is an empty string
	if (!html)
		//Return an empty text node
		return document.createTextNode(html);
	
	//If it is the body element
	if (html.substr(1,"body".length).toLowerCase()==="body")
	{
		//Parse
		var tmp = document.implementation.createHTMLDocument();
		//Set full HTML body and parse
		tmp.body.outerHTML = html;
		//Return body
		return tmp.body;
	}
	
	//Default wrap
	var wrap = [0,"",""];
	// From jquery
	var wrapMap = {
		option: [ 1, "<select multiple='multiple'>", "</select>" ],
		legend: [ 1, "<fieldset>", "</fieldset>" ],
		area: [ 1, "<map>", "</map>" ],
		param: [ 1, "<object>", "</object>" ],
		tbody: [ 1, "<table>", "</table>" ],
		thead: [ 1, "<table>", "</table>" ],
		tr: [ 2, "<table><tbody>", "</tbody></table>" ],
		col: [ 2, "<table><tbody></tbody><colgroup>", "</colgroup></table>" ],
		td: [ 3, "<table><tbody><tr>", "</tr></tbody></table>" ]
	};

	//Check if we need to wrap
	for (var tag in wrapMap) 
	{
		//Check if it is this element
		if (html.substr(1,tag.length).toLowerCase()===tag)
		{
			//Store wrap
			wrap = wrapMap[tag];
			//Found
			break;
		}
	}

	//Parse
	var tmp = document.implementation.createHTMLDocument();
	//Append wrap and parse
	tmp.body.innerHTML = wrap[1]+html+wrap[2];
	//Find element
	var element = tmp.body.childNodes[0];
	//Unwrap
	for (var i=0;i<wrap[0];++i)
		//Get child
		element = element.childNodes[0];
	//Return element
	return element;
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
	getSelectionClientRects: getSelectionClientRects,
	getAncestors : getAncestors,
	getCommonAncestors: getCommonAncestors,
	createElementFromHTML: createElementFromHTML,
	canvasToArrayBuffer: canvasToArrayBuffer
};