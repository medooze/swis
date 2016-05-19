var MessageType = require("./message/type.js");
var MessageFactory = require("./message/factory.js");
var MessageParser = require("./message/parser.js");
var MessageChunkAggregator = require("./message/aggregator.js");
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
		blob: true,
		chunk: 0
	},options);
	//Are we using chunked transport?
	if (this.options.chunk)
	{
		//Ensure it is not blob
		this.options.blob = false;
		//If we are used a chunked transport, create dechunker
		this.aggregator = new MessageChunkAggregator();
	}
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
	
	//POstponed messasges
	var postponed = [];
	
	function flush() {
		//Clear timer (jic)
		clearTimeout (timer);
		//Dismiss
		timer = null;
		//Add postponed messages
		for (var i=0;i<postponed.length;i++)
			//Append them now
			factory.appendMessage(postponed[i].type,postponed[i].message);
		//Clean postposned
		postponed = [];
		//Ensure we have something to send
		if (!factory.isEmpty())
		{
			//Get messages
			var message = factory.flush(self.options.blob,self.options.chunk);
			//If we have to send chunks on transport
			if (self.options.chunk)
				//For each chunk
				for (var i=0;i<message.length;i++)
					//Send messages
					transport.send(message[i]);
			else
				//Send messages
				transport.send(message);
			//clean queue
			factory = new MessageFactory();
		}
	}
	
	function queue(type,message) {
		//Add message to queue
		factory.appendMessage(type,message);
		//Add post queue
		for (var i=0;i<postponed.length;i++)
			//Append them now
			factory.appendMessage(postponed[i].type,postponed[i].message);
		//Clean postposned
		postponed = [];
		//If not already scheduled
		if (!timer) 
			//Flush in 20ms
			timer = setTimeout(flush,20);
	}
	
	//Do not enqueue changes now, do it after next one
	function postpone(type,message) {
		//Postpone message
		postponed.push({
			type: type,
			message: message
		});
	}
	
	function getHTML(node) {
		//Check if it is a comment
		if (node.nodeType===8)
			//It is a comment
			return  "<!-- "+node.textContent+" -->";
		//IF it is text
		else if (node.nodeType===3)
			return node.textContent; 
		else
			//Return the HTML
			return node.outerHTML;
	}
	
	function getExternalStyle(id,href){
		
		//Get base absolute url
		var absolute = document.location.href;
		//Check if there is a BASE element in the document
		var base = document.querySelector("base");
		//If we have to rebase the absolue url
		if (base)
			//Get absolute path from BASE  href attributte
			absolute = new URL(base.getAttribute("href"),absolute).toString();
		//Get absolute path from document location
		var url = new URL(href,absolute).toString();
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
			//Errors may be launched while not finished processinng html, send on next tick
			setTimeout(function(){
				//We have not been able to get the css, import it
				queue(MessageType.Link,{
					target	: id,
					href	: url
				});
			},0);
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
	
	function createTextNodesAsync(target,previous,texts) {
		//Send a DOM update after this one
		setTimeout(function(){
			//Mutation message
			var message = {
				target		: map.get(target),
				previous	: map.get(previous),
				next		: map.get(texts[texts.length-1].nextSibling),
				added		: [],
				deleted		: []
			};
			//For each one
			for (var i = 0; i<texts.length; i++)
			{
				//Clone DOM element and add ids
				var cloned = clone(texts[i],exclude);
				//Put element
				message.added.push(getHTML(cloned));
			}
			//Push message to the queue
			queue(MessageType.ChildList,message);
		},0);
	}
	
	function clone(element,exclude){
		var cloned;
		
		//Ifgnore doctype
		if (element.nodeType===10) 
		{
			//Store doc type
			doctype = "<!DOCTYPE html>";
			//Ignore
			return null;
		}
		
		//Exclude selectors, canvas and highlighter elements
		if ((exclude && matches(element,exclude))
			|| (self.canvas && self.canvas.contains(element))
			|| (self.highlighter && self.highlighter.contains(element))
		)
			//Ignore
			return null;
		
		//Ensure we don't add not supported tags to header, or they will be moved to body on reflector
		//To be visible, those elements must be moved to body, so they will be created on reflector at that time
		if (element.parentNode && element.parentNode.nodeName==="HEAD"
			&& !(element.nodeName in {TITLE:1,STYLE:1,META:1,LINK:1,SCRIPT:1,BASE:1})
		)
			//Ignore
			return null;
		
		//Gen new id
		var id = maxId++;
		//Add element to maps
		map.set(element,id);
		reverse[id] = element;
		
		//Replace scripts
		if (element.nodeName==="SCRIPT")
		{
			//Create empty script
			cloned = document.createElement("script");
		//Emmbed css
		} else if (element.nodeName==="LINK" && (element.getAttribute("rel") || "").toLowerCase()==="stylesheet") {
			//Clone element
			cloned = element.cloneNode(false);
			//Remove href 
			cloned.removeAttribute("href");
			//Get external css
			getExternalStyle(id,element.getAttribute("href"));
		} else {
			//Clone 
			cloned = element.cloneNode(false);
			
			//Specific for each node type
			if (cloned.nodeName==="A")
				//Remove HREF from anchors
				cloned.removeAttribute("href");
			//Remove HREF from anchors
			else if (cloned.nodeName==="IFRAME")
			{
				//Remove src
				cloned.removeAttribute("src");
				//And Remove srcdoc
				cloned.removeAttribute("srcdoc");
			//Change BASE href
			} else if (cloned.nodeName==="BASE")
				//Change href
				cloned.setAttribute("href", new URL(cloned.getAttribute("href"),document.location.href).toString());
			else if (cloned.nodeName==="INPUT")
				//Remove autocomplete
				cloned.setAttribute("autocomplete","off");
			//Previous text node
			var existing = [];
			var texts = [];
			var first;
			//For each child node
			for (var i=0;i<element.childNodes.length;++i)
			{
				//get child
				var child = element.childNodes[i];
				
				//Check if we had this child already
				var childId = map.get(child);
				
				//If we have it
				if (childId)
				{
					//Add to existing ones
					existing.push({
						id: childId,
						element: child
					});
					//Send texts
					if (texts.length) {
						//Create them async
						createTextNodesAsync(element,first,texts);
						//Clean them
						texts = [];
						first = null;
					}
					//Skip this one
					continue;
				}
				
				//Check if child node is text and previous was a text node
				if ( child.nodeName ==="#text")
				{
					//If previous was also a text node
					if (child.previousSibling && child.previousSibling.nodeName==="#text")
					{
						//Appand for creating them async
						texts.push(child);
						//And skip it
						continue;
					//Also process it async if it is empty
					} else if (!child.textContent.length) {
						//This is first one
						first = child;
						//Appand for creating them async
						texts.push(child);
						//And skip it
						continue;
					}
					//This is the first one
					first = child;
				//If there where pending text nodes
				} else if (texts.length) {
					//Create them async
					createTextNodesAsync(element,first,texts);
					//Clean them
					texts = [];
					first = null;
				}	
				//Clone child
				var clonedChild = clone(child,exclude);
				//If we have to handle
				if (clonedChild)
					//Append to cloned element
					cloned.appendChild(clonedChild);
			}
			
			//If there where pending text nodes	
			 if (texts.length) 
				//Create them async
				createTextNodesAsync(element,first,texts);
			//For all existing childs
			//We process them now as we need the id of the next sibling
			for (var j=0;j<existing.length;j++)
			{
				//Push message to the queue after next queue
				postpone(MessageType.ChildList,{
					target		: id,
					previous	: map.get(existing[j].element.previousSibling),
					next		: map.get(existing[j].element.nextSibling),
					added		: [existing[j].id],
					deleted		: []
				});
			}
		}
		
		//TODO: remove!!
		if (element.dataset) element.dataset["swisId"] = id;
		
		//Remove all on* handlers
		var j=0;
		while(cloned.attributes && j<cloned.attributes.length)
		{
			//Check name
			if (cloned.attributes[j].name.indexOf("on")===0)
				//Remove event handler
				cloned.removeAttribute(cloned.attributes[j].name);
			else
				//Next child
				j++;
		}
		
		//Return cloned element
		return cloned;
	}
	
	//Clone DOM
	var cloned = clone(document,exclude);
	
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
					console.log(mutation);
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
							//Ensure it has not been removed later
							if (!child.parentNode)
								//Do not add it
								continue;
							//Clone DOM element and add ids
							var cloned = clone(child,exclude);
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
					queue(MessageType.CharacterData,{
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
	
	document.addEventListener("change", (this.onchange = function(e){
		//Get id
		var id = map.get(e.target);
		//If not tracked
		if (!id)
			//Ignore
			return;
		
		//Check if it is a radio or a checkbox
		if (e.target.type==="checkbox" || e.target.type==="radio")
			//Check if we have been checked
			queue(MessageType.Checked,{
				target: id,
				value: e.target.checked
			});
		else
			//Check if we have changed
			queue(MessageType.Input,{
				target: id,
				value: e.target.value
			});
	}),true);
	
	//Get all inputs
	var inputs = document.querySelectorAll("input");
	
	//Foe ach one
	for (var i=0;i<inputs.length;++i)
	{
		//Get id
		var id = map.get(inputs[i]);
		//If not tracked
		if (!id)
			//Ignore
			continue;
		
		//Check if it is a radio or a checkbox
		if (inputs[i].type==="checkbox" || inputs[i].type==="radio")
		{
			//If it has any value
			if (inputs[i].checked)
				//Check if we have been checked
				queue(MessageType.Checked,{
					target: id,
					value: inputs[i].checked
				});
		} else {
			//If it has any value
			if (inputs[i].value)
				//Check if we have changed
				queue(MessageType.Input,{
					target: id,
					value: inputs[i].value
				});
		}
	}

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
		var messages;
		
		//Get blob
		var blob = message.data || message;
		
		//If we are chunked
		if (self.options.chunk)
			//Dechunk them
			messages = self.aggregator.push(blob);
		else
			//ONly one
			messages = [blob];
		
		//For each group of messages
		for (var n=0;n<messages.length;n++)
		{
			//Create parser
			MessageParser.Parse(messages[n])
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
		}
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
	document.removeEventListener("change", this.onchange, true);
	document.removeEventListener("selectionchange", this.onselectionchange, true);
	window.removeEventListener("resize", this.onresize , true);
	
	//remove maps
	this.map = null;
	this.factory = null;
	this.mediaqueries = null;
};

module.exports = Observer;