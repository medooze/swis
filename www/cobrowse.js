function cobrowse(transport,exclude)
{
	var maxId=1;
	var doctype = "";
	var map = new WeakMap();
	var timer;
	var messages = [];
	
	function flush() {
		//Send messages
		transport.send(messages);
		//clean queue
		messages = [];
		//Clear timer (jic)
		clearTimeout (timer);
		//Dismiss
		timer = null;
	}
	
	function queue(message) {
		//Add message to queue
		messages.push(message);
		//If not already scheduled
		if (!timer)
			timer =setTimeout(flush,20);
	}
	
	var remoteCursor;
	function showRemoteCursor(x,y) {
		//Check if first cursor
		if (!remoteCursor)
		{
			//Create new element
			remoteCursor = document.createElement("div");
			//Set absolute positioning
			remoteCursor.style["position"] = "absolute";
			remoteCursor.style["width"] = "150px";
			remoteCursor.style["height"] = "25px";
			remoteCursor.style["border"] = "1px black solid";
			remoteCursor.style["background-color"] = "green";
			remoteCursor.style["color"] = "white";
			remoteCursor.style["margin"] = "0px";
			remoteCursor.style["padding"] = "0px";
			remoteCursor.style["z-index"] = "99999999999999999999999999";
			//Set text
			remoteCursor.innerHTML = "^Remote Cursor";
			//Insert into
			document.documentElement.appendChild(remoteCursor);
		}
		//Set new position
		remoteCursor.style["left"] = x + "px";
		remoteCursor.style["top"] =  y + "px";
	}
	
	function getHTML(node) {
		//Check if it is a comment
		if (node.nodeType===8)
			//It is a comment
			return  "<!-- "+node.textContent+" -->";
		//IF it is text
		else if (node.nodeType===3)
			return node.wholeText; 
		else
			//Return the HTML
			return node.outerHTML;
	}
	
	function getExternalStyle(id,href){
		//Get absolute path
		var url = new URL(href,document.location.href).toString();
		//Request css async
		var req = new XMLHttpRequest();
		//Set handlers
		req.addEventListener("load", function(){
			//Check if we have changed
			queue({
				m: 7,
				t: id,
				h: url,
				c: this.responseText
			});
		});
		req.addEventListener("error", function(error){
			//We have not been able to get the css, import it
			queue({
				m: 8,
				t: id,
				h: url
			});
		});
		//Load css
		req.open("GET", url);
		req.send();
	}
	
	function clone(element,cloned,exclude){
		//Add element to map
		map.set(element,maxId++);
		//For each child node
		for (var i=0;i<element.childNodes.length;++i)
		{
			//Get child
			var child = element.childNodes[i];
			//Replace scripts
			if (child.nodeName==="SCRIPT")
			{
				//Create empty script
				var clonedchild = document.createElement("script");
				//Append to cloned element
				cloned.appendChild(clonedchild);
				//Add element to map
				map.set(child,maxId++);
			//Emmbed css
			} else if (child.nodeName==="LINK" && (child.getAttribute("rel") || "").toLowerCase()==="stylesheet") {
				//Clone child
				var clonedchild = child.cloneNode(false);
				//Remove href 
				clonedchild.removeAttribute("href");
				//Append to cloned element
				cloned.appendChild(clonedchild);
				//Get id 
				var childId = maxId++;
				//Add element to map
				map.set(child,childId);
				//Get external css
				getExternalStyle(childId,child.getAttribute("href"));
			//Ignore DOCTYPE
			} else if (child.nodeType===10) {
				//Ignore
				doctype = "<!DOCTYPE html>";
			//Exclude selectors
			} else if (!exclude || (
					(child.matches && !child.matches(exclude)) &&
					(child.msmatches && !child.msmatches(exclude)) &&
					(child.webkitmatches && !child.webkitmatches(exclude))
			))
			{
				//Clone child
				var clonedchild = child.cloneNode(false);
				//Remove HREF from anchors
				if (child.nodeName==="A")
					//Remove href
					clonedchild.removeAttribute("href");
				else if (child.nodeName==="#text" && !child.textContent.length)
					//HACK: Replace by a zero width space so the node is created on the mirror also
					clonedchild.textContent = '\u200B';
				//Change BASE href
				else if (child.nodeName==="BASE")
					//Change href
					clonedchild.setAttribute("href", new URL(child.getAttribute("href"),document.location.href).toString());
				//TODO: remove!!
				if (child.dataset) child.dataset["swisId"] = maxId;
				//Append to cloned element
				cloned.appendChild(clonedchild);
				//Clone child recursivelly
				clone(child,clonedchild,exclude);
			}
		}
		
		//Return new promose
		return cloned;
	}
	
	//Clone DOM
	var cloned = clone(document,document.cloneNode(0),exclude);
	
	//Start with the doctype
	var html = doctype;
	//For each node of the document
	for (var i=0;i<cloned.childNodes.length;i++)
		//Append HTML for child node
		html += getHTML(cloned.childNodes[i]);
	
	//PUT Initial html
	transport.init(html);

	//Listen for changes
	var observer = new MutationObserver (function (mutations) {
		var deleted = {};
		mutations.forEach (function (mutation) {
			//console.log(mutation);
			var message;
			//Get target
			var target = map.get(mutation.target);
			//Ensure we have a reference for it
			if (!target)
				//We will handle it later, and send full HTML so no need to store partial updates
				return;
			//Check type
			switch(mutation.type)
			{
				case "childList":

					//Mutation message
					message = {
						m: 0,
						t: target,
						p: map.get(mutation.previousSibling),
						n: map.get(mutation.nextSibling),
						a: [],
						d: []
					};

					//Process the added nodes
					for (var i=0;i<mutation.addedNodes.length;i++)
					{
						//Check it is not the remote cursor
						if (mutation.addedNodes[i]===remoteCursor)
							//Skipt
							continue;
						//Get id for added node
						var id = map.get(mutation.addedNodes[i]);
						//If not found
						if (!id)
						{
							//console.log("created",mutation.addedNodes[i]);
							//Clone DOM element and add ids
							var cloned = clone(mutation.addedNodes[i],mutation.addedNodes[i].cloneNode(false),exclude);
							//Put element
							message.a.push(getHTML(cloned));
						} else {
							//console.log("added "+id,mutation.addedNodes[i]);
							//Put reference
							message.a.push(id);
							//Remove from deleted (jic)
							delete(deleted[id]);
						}
					}
					//Process the removed nodes
					for (var i=0;i<mutation.removedNodes.length;i++)
					{
						//Get id for added node
						var id = map.get(mutation.removedNodes[i]);
						//console.log("removed "+id,mutation.removedNodes[i],mutation.removedNodes[i].parentNode);
						//If not found
						if (id)
							//Put reference
							message.d.push(id);
						//Check if it has been inserted again
						if (!mutation.removedNodes[i].parentNode)
							//Add to GC list
							deleted[id] = mutation.removedNodes[i];
							
					}
					console.log("childList",message,mutation);
					break;
				case "attributes":
					//Mutaion message
					message = {
						m: 1,
						t: target,
						k: mutation.attributeName,
						v: mutation.target.getAttribute(mutation.attributeName)
					};
					console.log("attributes",message,mutation);
					break;
				case "characterData":
					//Mutaion message
					message = {
						m: 2,
						t: target,
						d: mutation.target.data
					};
					console.log("characterData",message,mutation);
					break;
			}
			//Push message to the queue
			queue(message);
		});
		//Flush
		flush();
		//Garbage collect
		for (var id in deleted)
			//Remove node from map
			map.delete(deleted[id]);
	});

	// pass in the target node, as well as the observer options
	observer.observe (document, {
		attributes: true,
		childList: true,
		characterData: true,
		subtree: true
	});
	
	document.addEventListener ("mousemove", function (event) {
		queue({
			m: 12,
			x: event.pageX,
			y: event.pageY
		});
	},true);

	var hovered;
	document.addEventListener("mouseover", function(e){
		//Check if we have changed
		if (hovered!==e.srcElement)
		{
			queue({
				m: 3,
				t: map.get(e.srcElement)
			});
		}
	});

	document.addEventListener("focus", function(e){
		//Check if we have changed
		queue({
			m: 4,
			t: map.get(e.srcElement)
		});
	},true);

	document.addEventListener("blur", function(e){
		//Check if we have changed
		queue({
			m: 5,
			t: map.get(e.srcElement)
		});
	},true);

	document.addEventListener("input", function(e){
		//Check if we have changed
		queue({
			m: 6,
			t: map.get(e.srcElement),
			v: e.srcElement.value
		});
	},true);
	
	 window.addEventListener("resize", function(e){
		//Check if we have changed
		queue({
			m: 10,
			s: [window.innerWidth,window.innerHeight]
		});
	},false);
	
	//Send initial size
	queue({
		m: 10,
		s: [window.innerWidth,window.innerHeight]
	});
	
	//Check if there is a BASE element in the document
	if (!document.querySelector ("base"))
	{
		//Rebase
		queue({
			m: 11,
			h: document.location.href
		});
	}
		
	var mediaQueries = {};
	
	var mediaQueryListener = function(event) {
		//Get mql
		var mql =  event.srcElement;
		//Create matched
		var matches =  {};
		//Set it
		matches[mql.id] =  mql.matches;
		//Send event
		queue({
			m: 9,
			q: matches
		});
	};
	
	//Listen for message changes again, as listener has been desroyed 
	window.addEventListener("message", function(message){
		//Get list of request 
		var cmds = JSON.parse(message.data);
		//For each mutation
		for (var j=0;j<cmds.length;++j)
		{
			var cmd = cmds[j];
			
			//Check command
			switch(cmd.m)
			{
				//Add media queries
				case 0:
					console.log("Media query match",cmd);
					var matched = false;
					var matches = {};
					//For all media queries
					for (var k in cmd.q)
					{
						//Create media query
						var mql = window.matchMedia(cmd.q[k]);
						//Set id
						mql.id = k;
						//If it is matched
						if (mql.matches) 
						{
							//Push it
							matches[k] = true;
							//At least one matched
							matched = true;
						}
						
						//Listen for changes
						mql.addListener(mediaQueryListener);
					}
					//If one matched
					if (matched)
					{
						//Send event
						queue({
							m: 9,
							q: matches
						});
					}
					break;
				//Mouse cursor
				case 1:
					console.log("Mouse cursor",cmd);
					//Move cursor
					showRemoteCursor(cmd.x,cmd.y);
					break;
			}
		}
	});
}

/* global Promise */
var inited = false;
document.addEventListener('DOMContentLoaded', function() {
	if (inited)
		return;
	inited = true;
	var wnd = window.open("viewer.html","viewer","width=400px");
	setTimeout(function(){
		cobrowse({
			init : function (html) {
				//Send HTML
				wnd.postMessage(html, "*");
			},
			send : function(messages) {
				//Convert to json and send
				wnd.postMessage(JSON.stringify(messages), "*");
			}
		});
	},2000);	
}, false);




	
