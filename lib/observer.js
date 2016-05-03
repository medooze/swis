var MessageType = require("./message/type.js");
var MessageFactory = require("./message/factory.js");
var MessageParser = require("./message/parser.js");

var EventEmitter = require('events').EventEmitter;
var inherits = require('inherits');

function Observer(transport)
{
	this.transport = transport;
	this.map = new WeakMap();
	this.factory =  new MessageFactory(); 
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
	var factory = this.factory;
	
	var maxId=1;
	var doctype = "";
	var timer;
	
	function flush() {
		//Send messages
		transport.send(factory.flush());
		//clean queue
		factory = new MessageFactory();
		//Clear timer (jic)
		clearTimeout (timer);
		//Dismiss
		timer = null;
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
							//Clone DOM element and add ids
							var cloned = clone(mutation.addedNodes[i],mutation.addedNodes[i].cloneNode(false),exclude);
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
						//If not found
						if (id)
							//Put reference
							message.deleted.push(id);
						//Check if it has been inserted again
						if (!mutation.removedNodes[i].parentNode)
							//Add to GC list
							deleted[id] = mutation.removedNodes[i];
							
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
			//Remove node from map
			map.delete(deleted[id]);
	});

	// pass in the target node, as well as the observer options
	this.observer.observe (document, {
		attributes: true,
		childList: true,
		characterData: true,
		subtree: true
	});
	
	document.addEventListener ("mousemove", function (event) {
		queue(MessageType.MouseMove,{
			x: event.pageX,
			y: event.pageY
		});
	},true);

	var hovered;
	document.addEventListener("mouseover", function(e){
		//Check if we have changed
		if (hovered!==e.target)
		{
			var target = map.get(e.target)
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
	});

	document.addEventListener("focus", function(e){
		//Check if we have changed
		queue(MessageType.Focus,{
			target: map.get(e.target || e.target)
		});
	},true);

	document.addEventListener("blur", function(e){
		//Check if we have changed
		queue(MessageType.Blur,{
			target: map.get(e.target)
		});
	},true);

	document.addEventListener("input", function(e){
		//Check if we have changed
		queue(MessageType.Input,{
			target: map.get(e.target),
			value: e.target.value
		});
	},true);
	
	 window.addEventListener("resize", function(e){
		//Check if we have changed
		queue(MessageType.Resize,{
			width: window.innerWidth,
			height: window.innerHeight
		});
	},false);
	
	//Send initial size
	queue(MessageType.Resize,{
		width: window.innerWidth,
		height: window.innerHeight
	});
	
	//Check if there is a BASE element in the document
	if (!document.querySelector ("base"))
		//Rebase
		queue(MessageType.Base,{
			href: document.location.href
		});

	var mediaQueryListener = function(event) {
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
	transport.onmessage = function(blob)
	{	
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

								//Listen for changes
								mql.addListener(mediaQueryListener);
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
							break;
					}
				}
			})
			.catch(function(error){
				console.error(error);
			});
	
	};
};

Observer.prototype.stop = function()
{
	this.observer.disconnect();
	//TODO: remove the other listeners
	this.map = null;
	this.factory = null;
};

module.exports = Observer;