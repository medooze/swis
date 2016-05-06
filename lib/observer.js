var MessageType = require("./message/type.js");
var MessageFactory = require("./message/factory.js");
var MessageParser = require("./message/parser.js");
var Canvas = require("./canvas.js");
var SelectionHighlighter = require("./selectionhighlighter.js")

var EventEmitter = require('events').EventEmitter;
var inherits = require('inherits');
var Utils = require('./utils.js');

function Observer(transport,options)
{
	this.transport = transport;
	this.map = new WeakMap();
	this.reverse = {};
	this.factory =  new MessageFactory(); 
	this.mediaqueries = [];
	//Set defaults
	this.options = Object.assign({
		blob: true
	},options);
	//Make us an event emitter
	EventEmitter.call(this);
}

//Inherit from event emitter
inherits(Observer, EventEmitter);

Observer.prototype.observe = function(exclude)
{
	//Load objects from this
	var self = this;
	var transport = this.transport;
	var map = this.map;
	var reverse = this.reverse;
	var factory = this.factory;
	
	var maxId=1;
	var doctype = "";
	var timer;
	
	function flush() {
		//Clear timer (jic)
		clearTimeout (timer);
		//Dismiss
		timer = null;
		//Ensure we have something to send
		if (!factory.isEmpty())
		{
			//Send messages
			transport.send(factory.flush(self.options.blob));
			//clean queue
			factory = new MessageFactory();
		}
	}
	
	function queue(type,message) {
		//Add message to queue
		factory.appendMessage(type,message);
		//If not already scheduled
		if (!timer) 
			//Flush in 20ms
			timer = setTimeout(flush,20);
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
			queue(MessageType.CSS,{
				target	: id,
				href	: url,
				css	: this.responseText
			});
		});
		req.addEventListener("error", function(error){
			//We have not been able to get the css, import it
			queue(MessageType.Link,{
				target	: id,
				href	: url
			});
		});
		//Load css
		req.open("GET", url);
		req.send();
	}
	
	function matches(node,selector) {
		if (node.matches)	return node.matches(selector);
		if (node.msmatches)	return node.msmatches(selector);
		if (node.webkitmatches)return node.webkitmatches(selector);
		return false;
	}
	
	function clone(element,cloned,exclude){
		//Gen new id
		var id = maxId++;
		//Add element to maps
		map.set(element,id);
		reverse[id] = element;
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
				//Gen new id
				var childId = maxId++;
				//Add element to map
				map.set(child,childId);
				reverse[childId] = child;
			//Emmbed css
			} else if (child.nodeName==="LINK" && (child.getAttribute("rel") || "").toLowerCase()==="stylesheet") {
				//Clone child
				var clonedchild = child.cloneNode(false);
				//Remove href 
				clonedchild.removeAttribute("href");
				//Append to cloned element
				cloned.appendChild(clonedchild);
				//Gen new id
				var childId = maxId++;
				//Add element to map
				map.set(child,childId);
				reverse[childId] = child;
				//Get external css
				getExternalStyle(childId,child.getAttribute("href"));
			//Ignore DOCTYPE
			} else if (child.nodeType===10) {
				//Ignore
				doctype = "<!DOCTYPE html>";
			//Exclude selectors
			} else if (!(exclude && matches(child,exclude))
				&& !(self.canvas && self.canvas.contains(child))
				&& !(self.highlighter && self.highlighter.contains(child))
			) {
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
	
	//Check if there is a BASE element in the document
	if (!cloned.querySelector("base"))
	{
		//Craete base element
		var base = cloned.createElement("base");
		//Set href to documenbt location
		base.setAttribute("href",document.location.href);
		//Set href to documenbt location
		base.setAttribute("swis", true);
		//Append to head in the cloned doc
		cloned.querySelector("head").appendChild(base);
	}
	
	//Start with the doctype
	var html = doctype;
	//For each node of the document
	for (var i=0;i<cloned.childNodes.length;i++)
		//Append HTML for child node
		html += getHTML(cloned.childNodes[i]);
	
	//Set initial HTML message
	queue(MessageType.HTML,{
		href: document.location.href,
		html: html
	});
	
	//Send inmediatelly
	flush();
		
	//Listen for changes
	this.observer = new MutationObserver (function (mutations) {
		var handled = {};
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
					var message = {
						target		: target,
						previous	: map.get(mutation.previousSibling),
						next		: map.get(mutation.nextSibling),
						added		: [],
						deleted		: []
					};

					//Process the added nodes
					for (var i=0;i<mutation.addedNodes.length;i++)
					{
						//Get id for added node
						var id = map.get(mutation.addedNodes[i]);
						//If not found
						if (!id)
						{
							//Get node
							var child = mutation.addedNodes[i];
							//Ensure we don't have to exclude it
							//We don't need to look recursively on parents because if they were already excluded, it will not have id
							if (exclude && matches(child,exclude) 
								|| self.canvas.contains(child)
								|| self.highlighter.contains(child)
							)
								//Skip this
								continue;
							//Clone DOM element and add ids
							var cloned = clone(child,child.cloneNode(false),exclude);
							//Put element
							message.added.push(getHTML(cloned));
						} else {
							//Put reference
							message.added.push(id);
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
						//If element was tracked
						if (id)
						{
							//Put reference
							message.deleted.push(id);
							//Check if it has been inserted again
							if (!mutation.removedNodes[i].parentNode)
								//Add to GC list
								deleted[id] = mutation.removedNodes[i];
						}
							
					}
					//Push message to the queue
					queue(MessageType.ChildList,message);
					break;
				case "attributes":
					//Was it already handled?
					if (handled[target])
					{
						//Check if this attribute was handled
						if (handled[target].hasOwnProperty(mutation.attributeName))
							//Don't send duplicated entries
							return;
					} else {
						//Create empty 
						handled[target] = {};
					}
						
					//Mutaion message
					queue(MessageType.Attributes,{
						target	: target,
						key	: mutation.attributeName,
						value	: mutation.target.getAttribute(mutation.attributeName)
					});
					//Append to handled attributes
					handled[target][mutation.attributeName] = true;
					break;
				case "characterData":
					//Mutaion message
					queue(MessageType.Attributes,{
						target	: target,
						text	: mutation.target.data
					});
					break;
			}
			
		});
		//Flush
		flush();
		//Garbage collect
		for (var id in deleted)
		{
			//Remove node from map
			map.delete(deleted[id]);
			delete(reverse[id]);
		}
		//Send changed event
		self.emit("change");
	});

	// pass in the target node, as well as the observer options
	this.observer.observe (document, {
		attributes: true,
		childList: true,
		characterData: true,
		subtree: true
	});
	
	document.addEventListener ("mousemove", (this.onmousemove = function (event) {
		queue(MessageType.MouseMove,{
			x: event.pageX,
			y: event.pageY
		});
	}),true);

	var hovered;
	document.addEventListener("mouseover", (this.onmouseover = function(e){
		//Check if we have changed
		if (hovered!==e.target)
		{
			var target = map.get(e.target);
			//Check if it is tracked
			if (target)
			{
				//Send event
				queue(MessageType.MouseOver,{
					target: target
				});
				//Store hovered
				hovered = e.target;
			} else {
				//TODO: How do we skip remote cursor to get hovered?
			}
		}
	}),true);

	document.addEventListener("focus", (this.onfocus = function(e){
		//Check if we have changed
		queue(MessageType.Focus,{
			target: map.get(e.target || e.target)
		});
	}),true);

	document.addEventListener("blur", (this.onblur = function(e){
		//Check if we have changed
		queue(MessageType.Blur,{
			target: map.get(e.target)
		});
	}),true);

	document.addEventListener("input", (this.oninput = function(e){
		//Check if we have changed
		queue(MessageType.Input,{
			target: map.get(e.target),
			value: e.target.value
		});
	}),true);
	
	document.addEventListener("selectionchange", (this.onselectionchange = function(e) {
		//Get selection
		var selection = document.getSelection();
		//Get range
		var range = selection.rangeCount===1 ? selection.getRangeAt(0) : null;
		//Check if we have changed
		queue(MessageType.SelectionChange,{
			anchorNode: map.get(selection.anchorNode),
			anchorOffset: selection.anchorOffset,
			isCollapsed: selection.isCollapsed,
			startContainer: range ? map.get(range.startContainer) : 0,
			startOffset: range ? range.startOffset : 0,
			endContainer: range ? map.get(range.endContainer): 0,
			endOffset: range ? range.endOffset : 0
		});
	}), true);

	
	 window.addEventListener("resize", (this.onresize = function(e){
		//Check if we have changed
		queue(MessageType.Resize,{
			width: window.innerWidth,
			height: window.innerHeight
		});
		//Redraw canvas
		self.canvas && self.canvas.resize();
		//Redraw highlights
		self.highlighter && self.highlighter.redraw();
	}),false);
	
	//Send initial size
	queue(MessageType.Resize,{
		width: window.innerWidth,
		height: window.innerHeight
	});
	
	//Listener for media query changes
	this.mediaQueryListener = function(event) {
		//Get mql
		var mql =  event.target || event;
		//Create matched
		var matches =  {};
		//Set it
		matches[mql.id] =  mql.matches;
		//Send event
		queue(MessageType.MediaQueryMatches,{
			matches: matches
		});
	};
	
	//Listen for message changes again, as listener has been desroyed 
	transport.onmessage  = function(message)
	{	
		//Get blob
		var blob = message.data || message;
		
		//Create parser
		MessageParser.Parse(blob)
			.then(function(parser)
			{
				//For each message
				while(parser.hasNext())
				{		

					//Get nexr parsed message
					var parsed = parser.next();
					//get type
					var type = parsed.type;
					//Get message
					var message = parsed.message;

					//console.log(message);
					switch(type)
					{
						//Add media queries
						case MessageType.MediaQueryRequest:
							var matched = false;
							var matches = {};
							//For all media queries
							for (var k in message.queries)
							{
								//Create media query
								var mql = window.matchMedia(message.queries[k]);
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
								//Push it to the list
								self.mediaqueries.push(mql);
								//Listen for changes
								mql.addListener(self.mediaQueryListener);
							}
							//If one matched
							if (matched)
							{
								//Send event
								queue(MessageType.MediaQueryMatches,{
									matches: matches
								});
							}
							break;
						//Mouse cursor
						case MessageType.MouseMove:
							//Move cursor
							self.emit("remotecursormove",{x: message.x,y: message.y});
							//Check if we are drawing
							if (self.path)
								//Add point
								self.path.add(message.x,message.y);
							break;
						//Selection change
						case MessageType.SelectionChange:
							//console.log("Selection change",message);
							self.highlighter.select({
								anchorNode: reverse[message.anchorNode],
								anchorOffset: message.anchorOffset,
								isCollapsed: message.isCollapsed,
								startContainer: reverse[message.startContainer],
								startOffset: message.startOffset,
								endContainer: reverse[message.endContainer],
								endOffset: message.endOffset
							});
							break;
						//Paint request
						case MessageType.Paint:
							//console.log("Paint",message);
							// reset the path when starting over
							if (message.flag)
								//Create new path
								self.path = self.canvas.createPath('green');
							else
								//Stop old one
								self.path = null;
							break;
						//Clear request
						case MessageType.Clear:
							//Clear
							self.canvas.clear();
							self.highlighter.clear();
							//Delete local selection also
							document.getSelection().removeAllRanges();
							break;
						default:
							console.error("unknown message",message);
					}	
				}
			})
			.catch(function(error){
				console.error(error);
			});
	
	};
	//Create canvas
	this.canvas = new Canvas(document);
	//Create seleciton hihglighter
	this.highlighter = new SelectionHighlighter(document);
};

Observer.prototype.stop = function()
{
	//Stop mutation observer
	this.observer.disconnect();
	//SClose canvas
	this.canvas.close();
	//Close highlighter
	this.highlighter.close();
	//Clean any path
	this.path = null;
	//remove media query listeners
	for (var i=0;i<this.mediaqueries.length;i++)
		//Stop listener
		this.mediaqueries[i].removeListener(this.mediaQueryListener);
	
	//Remove DOM event listeners
	document.removeEventListener("mousemove", this.onmousemove ,true);
	document.removeEventListener("mouseover", this.onmouseover, true);
	document.removeEventListener("focus", this.onfocus, true);
	document.removeEventListener("blur", this.onblur, true);
	document.removeEventListener("input", this.oninput, true);
	document.removeEventListener("selectionchange", this.onselectionchange, true);
	window.removeEventListener("resize", this.onresize , true);
	
	//remove maps
	this.map = null;
	this.factory = null;
	this.mediaqueries = null;
};

module.exports = Observer;