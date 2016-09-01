var MessageType = require("./message/type.js");
var MessageFactory = require("./message/factory.js");
var MessageParser = require("./message/parser.js");
var MessageChunkAggregator = require("./message/aggregator.js");
var Canvas = require("./canvas.js");
var SelectionHighlighter = require("./selectionhighlighter.js")


var EventEmitter = require('events').EventEmitter;
var inherits = require('inherits');
var Utils = require('./utils.js');
var assign = require('./helpers/assign.js');
var URL = require('./helpers/url.js');

var canvasColor = "#ffc820";

function Observer(transport,options)
{
	this.transport = transport;
	this.observers = new WeakMap();
	this.documents = new WeakMap();
	this.map = new WeakMap();
	this.reverse = {};
	this.factory =  new MessageFactory(); 
	this.mediaqueries = [];
	this.scrolling = {};
	this.inlining = {};
	//Set defaults
	this.options = assign({
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

Observer.prototype.observe = function(exclude,wnd,href)
{
	var inlineImages = true;
	//Load objects from this
	var self = this;
	var transport = this.transport;
	var documents = this.documents;
	var map = this.map;
	var reverse = this.reverse;
	var factory = this.factory;
	var scrolling = this.scrolling;
	
	var maxId=1;
	var doctype = "";
	
	//Store observed window && document
	this.wnd = wnd || window;
	this.document = this.wnd.document;
	this.baseURL = href || this.document.location.href;
	
	
	this.onscroll = function(e){
		//Get target
		var target = 0, top, left;
		//If is is in the window
		if (e.target!==self.document)
		{
			//Search elements id
			target = map.get(e.target);
			//If not found
			if (!target)
				//Ignore it
				return;
		} 
		//Get values
		top  = typeof e.target.scrollTop  === "number" ? e.target.scrollTop  : e.currentTarget.scrollY || e.currentTarget.pageYOffset;
		left = typeof e.target.scrollLeft === "number" ? e.target.scrollLeft : e.currentTarget.scrollX || e.currentTarget.pageXOffset;

		//Check if scroll event was produced by a RemoteScroll
		if (self.scrolling.hasOwnProperty(target) && self.scrolling[target].top===top && self.scrolling[target].left===left)
		{
			//Ok here it is the event
			delete(self.scrolling[target]);
			//Ignore it
			return;
		}
		//Check if we have changed
		queue(MessageType.Scroll,{
			target: target,
			top: top,
			left: left
		});

		//Redraw highlights
		self.highlighter && self.highlighter.redraw();
	};
	
	//POstponed messasges
	var postponed = [];
	
	function flush() {
		//Clear timer (jic)
		clearTimeout (self.timer);
		//Dismiss
		self.timer = null;
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
		{
			//Get messageand type
			var type = postponed[i].type;
			var message = postponed[i].message;
			//If it was a message factory
			if (typeof message === "function")
				//Generate message
				message = message();
			//Append them now
			factory.appendMessage(type,message);
		}
		//Clean postposned
		postponed = [];
		//If not already scheduled
		if (!self.timer) 
			//Flush in 20ms
			self.timer = setTimeout(flush,20);
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
		var absolute = self.baseURL;
		//Check if there is a BASE element in the document
		var base = self.document.querySelector("base");
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
	
	function cancelExternalImage(id) {
		//Did we had a previous xhr for this id?
		if (self.inlining.hasOwnProperty (id))
		{
			//Abort it
			self.inlining[id].abort();
			//Done
			delete (self.inlining[id]);
		}
	}
	
	function getExternalImage(id,href) {
		//Cancel previous attemps
		cancelExternalImage(id);
		//Get base absolute url
		var absolute = self.baseURL;
		//Check if there is a BASE element in the document
		var base = self.document.querySelector("base");
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
			//Ensure that the id is still valid
			if (reverse.hasOwnProperty (id))
				//Check if we have changed
				postpone(MessageType.Image,{
					target		: id,
					type		: this.getResponseHeader('content-type'),
					image		: this.response
				});
			//Done
			delete (self.inlining[id]);
		});
		req.addEventListener("error", function(){
			//Done, I like  to clean my own stuff
			delete (self.inlining[id]);
		});
		
		//Load css
		req.open("GET", url);
		req.responseType = "arraybuffer";
		req.send();
		//Append to map of current requests
		self.inlining[id] = req;
	}
	
	function matches(node,selector) {
		//Get what is implemented
		var func = 
			node.matches ||
			node.matchesSelector || 
			node.mozMatchesSelector ||
			node.msMatchesSelector || 
			node.oMatchesSelector || 
			node.webkitMatchesSelector;
		//Match
		return func ? func.call(node,selector) : false;
	}
	
	function createTextNodesAsync(target,previous,next,texts,clonedDocument) {
		//Push message factory to the postponedqueue
		postpone (MessageType.ChildList,function(){
			//Mutation message
			var message = {
				target		: target,
				previous	: previous,
				next		: next,
				added		: [],
				deleted		: []
			};
			//For each one
			for (var i = 0; i<texts.length; i++)
			{
				//Clone DOM element and add ids
				var cloned = clone(texts[i],exclude,clonedDocument);
				//Check
				if (cloned)
					//Put element
					message.added.push(getHTML(cloned));
			}
			//return it
			return message;
		});
	}
	
	function processIFrame(id,element) {
		//Try to get window andd document
		var wnd = element.contentWindow;
		var doc = element.contentDocument;
		
		//Attach also to window so we can send targeted events
		attach(wnd);
		
		//Clone DOM
		var cloned = cloneDocument(doc,exclude);

		//Check if there is a BASE element in the document
		if (!cloned.querySelector("base"))
		{
			//Craete base element
			var base = cloned.createElement("base");
			//Set href to documenbt location
			base.setAttribute("href",self.baseURL);
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
		queue(MessageType.IFrame,{
			target: id,
			href: doc.location.href,
			overflow: wnd.getComputedStyle(doc.documentElement).overflow, //We need to send this so chrome apps webview can handle it
			html: html
		});

		//Send inmediatelly
		flush();
		
		//Listen for changes
		var observer = new MutationObserver (mutator);

		// pass in the target node, as well as the observer options
		observer.observe (doc, {
			attributes: true,
			childList: true,
			characterData: true,
			subtree: true
		});
		//Add to observers
		self.observers.set(doc,observer);
		
		//Add iframe event listeners
		doc.addEventListener ("mousemove", self.onmousemove,true);
	}
	
	function attach(element) {
		//Generate new id
		var id = maxId++;
		//Add element to maps
		map.set(element,id);
		reverse[id] = element;
		//Return id
		return id;
	}
	
	function cloneDocument(document,exclude)
	{
		return clone(document,exclude,null);
	}
	
	function cloneNode(element,exclude)
	{
		//Get cloned document
		var clonedDocument = documents.get(element.ownerDocument);
		//Clone it
		return clone(element,exclude,clonedDocument);
	}
	
	function clone(element,exclude,clonedDocument){
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
		//Ignore META X-UA-Compatible as IE adds one tag to the HTML that is not on the DOM tree
		if (element.nodeName==="META" && (element.getAttribute("http-equiv") || "").toLowerCase()==="x-ua-compatible")
			//Ignore
			return null;
		
		//Gen new id
		var id = attach(element);
		
		
		//Replace scripts
		if (element.nodeName==="SCRIPT") {
			//Create empty script
			cloned = clonedDocument.createElement("script");
		//Emmbed css
		} else if (element.nodeName==="LINK" && (element.getAttribute("rel") || "").toLowerCase()==="stylesheet") {
			//Clone element
			cloned = clonedDocument.importNode(element,false);
			//Remove href 
			cloned.removeAttribute("href");
			//Get external css
			getExternalStyle(id,element.getAttribute("href"));
		} else {
			//Check if it is a document
			if (element.nodeName ==="#document") 
			{
				//Clone document
				cloned = element.cloneNode(false);
				//Store as document to work with fron now on
				clonedDocument = cloned;
				//Store
				documents.set(element,clonedDocument);
			} else  {
				//Just clone 
				cloned = clonedDocument.importNode(element,false);
			}
			
			//Specific for each node type
			if (cloned.nodeName==="A")
			{
				//Remove HREF from anchors
				cloned.removeAttribute("href");
			}
			//If we are sending the imgs inline
			else if (cloned.nodeName==="IMG" && inlineImages && element.hasAttribute("src"))
			{
				//Remove src
				cloned.removeAttribute("src");
				//Fecth element externally
				getExternalImage(id,element.src);
			}
			//Remove HREF from anchors
			else if (cloned.nodeName==="IFRAME")
			{
				//Remove src
				cloned.removeAttribute("src");
				//And Remove srcdoc
				cloned.removeAttribute("srcdoc");
				//Try to add it async so ids are set after the document is filled
				setTimeout(function(){
					processIFrame(id,element);
					//Set scroll event on content window
					element.contentWindow.addEventListener("scroll",self.onscroll,{passive:true,capture:true});
				},0);
			} 
			//Change BASE href
			else if (cloned.nodeName==="BASE")
			{
				//Change href
				cloned.setAttribute("href", new URL(cloned.getAttribute("href"),self.baseURL).toString());
			}
			//Do not allow autocomplete on input 
			else if (cloned.nodeName==="INPUT")
			{
				//IF it is an IMAGE type
				if (inlineImages && (cloned.type || "").toLowerCase()==="image")
				{
					//Set src to 1x1 transparent gif so it can be overriden later
					cloned.setAttribute("src","data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7");
					//Fecth element externally
					getExternalImage(id,element.src);
				}
				//Remove autocomplete
				cloned.setAttribute("autocomplete","off");
				
				
			}
			//Nodes that already were 
			var existing = null;
			//Previous text node
			var texts = [];
			var last;
			var previousId;
			//For each child node
			for (var i=0;i<element.childNodes.length;++i)
			{
				//get child
				var child = element.childNodes[i];
				
				//Check if we had this child already
				var childId = map.get(child);
				
				//If we have it
				if (childId)
				{	//We are last
					last = child;
					//If it was a pending text nodes
					if (texts.length)
						//Create them async
						createTextNodesAsync(id,previousId,childId,texts,clonedDocument);
					
					//If there was a previously existing node			
					if (existing)
						//Push message to the queue after next queue
						postpone(MessageType.ChildList,{
							target		: id,
							previous	: previousId,
							next		: childId,
							added		: [existing],
							deleted		: []
						});
					//Postpone existing child insertion
					existing = childId;
					//Clear nodes
					texts = [];
					previousId = childId;
				//Check if child node is text and it is empty or previous was a text node also
				} else if ( child.nodeName ==="#text" && ((last && last.nodeName==="#text") || !child.textContent.length )) {
					//Append for creating them async
					texts.push(child); 
				//Normal child
				} else {
					//Clone child
					var clonedChild = clone(child,exclude,clonedDocument);
					//If we have to handle
					if (clonedChild)
					{
						//Get new id
						childId = map.get(child);
						//We are last
						last = child;
						//Append to cloned element
						cloned.appendChild(clonedChild);

						//We process text and existing nodes now as we need the id of the next sibling (i.e this child)

						//If it was a pending text nodes
						if (texts.length)
							//Create them async
							createTextNodesAsync(id,previousId,childId,texts,clonedDocument);

						//If there was a previously existing node			
						if (existing)
							//Push message to the queue after next queue
							postpone(MessageType.ChildList,{
								target		: id,
								previous	: previousId,
								next		: childId,
								added		: [existing],
								deleted		: []
							});
						//Clear nodes
						existing = null;
						texts = [];
						previousId = childId;
					}
				}
			}
			
			//If there where pending text nodes	
			 if (texts.length) 
				//Create them async
				createTextNodesAsync(id,previousId,0,clonedDocument);
			//If there was a previously existing node			
			if (existing)
				//Push message to the queue after next queue
				postpone(MessageType.ChildList,{
					target		: id,
					previous	: previousId,
					next		: 0,
					added		: [existing],
					deleted		: []
				});
		}
		//If it is scrlled
		if (element.scrollTop || element.scrollLeft)
			//Send the scroll event async
			postpone(MessageType.Scroll,{
				target	: id,
				top	: element.scrollTop,
				left	: element.scrollLeft
			});
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
	function release(id,node)
	{
		//Remove node from map
		map.delete(node);
		delete(reverse[id]);
		
		//Cancel any pending attempt of image download
		cancelExternalImage(id);

		//TODO: remove!!
		if (node.dataset) delete(node.dataset["swisId"]);
		
		//For each child node
		for (var i=0;i<node.childNodes.length;++i)
			//Release recursivelly
			releaseNode(node.childNodes[i]);
	}
	
	function releaseNode(node)
	{
		//get id
		var id = map.get(node);
		//If it was found
		if (id)
			//Release it
			release(id,node);
	}
	
	//Clone DOM
	var cloned = cloneDocument(self.document,exclude);
	
	//Check if there is a BASE element in the document
	if (!cloned.querySelector("base"))
	{
		//Craete base element
		var base = cloned.createElement("base");
		//Set href to documenbt location
		base.setAttribute("href",self.baseURL);
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
		href: self.baseURL,
		userAgent : navigator.userAgent,
		html: html
	});
	
	//Send inmediatelly
	flush();
		
	function mutator(mutations) {
		var handled = {};
		var deleted = {};
		var resized = false;
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
					//console.log(mutation);
					//Mutation message
					var message = {
						target		: target,
						previous	: map.get(mutation.previousSibling),
						next		: map.get(mutation.nextSibling),
						added		: [],
						deleted		: []
					};
					
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
							var cloned = cloneNode(child,exclude);
							//Put element
							message.added.push(getHTML(cloned));
						} else {
							//Put reference
							message.added.push(id);
							//Remove from deleted (jic)
							delete(deleted[id]);
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
					//Check if we are updating the stile body
					if (target===self.document.body && mutation.attributeName==="style")
						//We may have been resized
						resized = true;
					
					//check if element has the attribute or if we are removing it
					if (mutation.target.hasAttribute(mutation.attributeName))
					{
						//Check if we are sending images (img or input type image) inline and it was an img src change
						if (inlineImages 
							&& ( mutation.target.nodeName === "IMG" || (mutation.target.nodeName==="INPUT" && (mutation.target.type || "").toLowerCase()==="image"))
							&&  mutation.attributeName==="src")
							//Fetch image and send inline
							getExternalImage(target,mutation.target.src);
						else
							//Mutaion message
							queue(MessageType.Attributes, {
								target	: target,
								key	: mutation.attributeName,
								value	: mutation.target.getAttribute(mutation.attributeName)
							});
					} else  {
						//Check if we are sending images inline and it was an img src change
						if (inlineImages && mutation.target.nodeName === "IMG" &&  mutation.attributeName==="src")
							//Cancel any previous attempt
							cancelExternalImage (target);
						//Mutaion message
						queue(MessageType.AttributesRemove, {
							target	: target,
							key	: mutation.attributeName
						});
					}
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
		//in case the document coudl have been resized
		if (resized)
		{
			//Check if we have changed
			queue(MessageType.Resize,{
				width: self.wnd.innerWidth,
				height: self.wnd.innerHeight,
				documentWidth: parseInt(self.wnd.getComputedStyle(self.document.documentElement).width),
				documentHeight: parseInt(self.wnd.getComputedStyle(self.document.documentElement).height),
				scrollWidth: self.document.body.scrollWidth,
				scrollHeight: self.document.body.scrollHeight
			});
			//Send initial scroll
			queue(MessageType.Scroll,{
				target: 0,
				top: self.wnd.scrollY || self.wnd.pageYOffset,
				left: self.wnd.scrollX  || self.wnd.pageXOffset
			});
		}
		//Flush
		flush();
		//Garbage collect
		for (var id in deleted)
			//Release nodes
			release(id,deleted[id]);
		//Send changed event
		self.emit("change");
	};
	
	//Listen for changes
	var observer = new MutationObserver (mutator);

	// pass in the target node, as well as the observer options
	observer.observe (self.document, {
		attributes: true,
		childList: true,
		characterData: true,
		subtree: true
	});
	
	//Add to map
	this.observers.set(self.document,observer);
	
	self.document.addEventListener ("mousemove", (this.onmousemove = function (event) {
		//Get offset of event window
		var offset = Utils.getWindowOffset(event.currentTarget.defaultView,self.wnd);
		//Send message back
		queue(MessageType.MouseMove, {
			x: event.clientX + offset.x,
			y: event.clientY + offset.y
		});
	}),true);
	
	self.document.addEventListener ("mouseup", (this.mouseup = function (event) {
		//HACK: resize in textarea does not trigger DOM mutation event in chrome
		if (event.target.nodeName==="TEXTAREA")
		{
			//Get target
			var target = map.get(event.target);
			//Emulate DOM mutations
			//TODO: Add fine grained events
			queue(MessageType.Attributes,{
				target	: target,
				key	: 'style',
				value	: event.target.style.cssText
			});
		}
	}),true);

	var hovered;
	self.document.addEventListener("mouseover", (this.onmouseover = function(e){
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

	self.document.addEventListener("focus", (this.onfocus = function(e){
		//Firefox launches blur on document
		//which is not liked by chrome
		if (e.target===self.document)
			//Ignore it then
			return;
		//Get target
		var target = map.get(e.target);
		//If not yet observed
		if (!target)
			//TODO: handle focused elements on mutation events
			return;
		//Check if we have changed
		queue(MessageType.Focus,{
			target: map.get(e.target)
		});
	}),true);

	self.document.addEventListener("blur", (this.onblur = function(e){
		//Firefox launches blur on document
		//which is not liked by chrome
		if (e.target===self.document)
			//Ignore it then
			return;
		//Check if we have changed
		queue(MessageType.Blur,{
			target: map.get(e.target)
		});
	}),true);

	self.document.addEventListener("input", (this.oninput = function(e){
		//Check if we have changed
		queue(MessageType.Input,{
			target: map.get(e.target),
			value: e.target.value
		});
	}),true);
	
	self.document.addEventListener("change", (this.onchange = function(e){
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
	
	function fillInputs(node)
	{
		//Get all inputs
		var inputs = node.querySelectorAll("input");

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
	}
	
	//Prefill all input values
	fillInputs(self.document);

	self.document.addEventListener("selectionchange", (this.onselectionchange = function(e) {
		//Get selection
		var selection = self.document.getSelection();
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

	
	self.wnd.addEventListener("scroll", this.onscroll,{passive:true,capture:true});
	
	self.wnd.addEventListener("resize", (this.onresize = function(e){
		//Check if we have changed
		queue(MessageType.Resize,{
			width: self.wnd.innerWidth,
			height: self.wnd.innerHeight,
			documentWidth: parseInt(self.wnd.getComputedStyle(self.document.documentElement).width),
			documentHeight: parseInt(self.wnd.getComputedStyle(self.document.documentElement).height),
			scrollWidth: self.document.body.scrollWidth,
			scrollHeight: self.document.body.scrollHeight
		});
		//Send initial scroll
		queue(MessageType.Scroll,{
			target: 0,
			top: self.wnd.scrollY || self.wnd.pageYOffset,
			left: self.wnd.scrollX  || self.wnd.pageXOffset
		});
		//Redraw canvas
		self.canvas && self.canvas.resize();
		//Redraw highlights
		self.highlighter && self.highlighter.redraw();
	}),false);
	
	//Send initial size
	queue(MessageType.Resize,{
		width: self.wnd.innerWidth,
		height: self.wnd.innerHeight,
		documentWidth: parseInt(self.wnd.getComputedStyle(self.document.documentElement).width),
		documentHeight: parseInt(self.wnd.getComputedStyle(self.document.documentElement).height),
		scrollWidth: self.document.body.scrollWidth,
		scrollHeight: self.document.body.scrollHeight
	});
	
	//Send initial scroll
	queue(MessageType.Scroll,{
		target: 0,
		top: self.wnd.scrollY || self.wnd.pageYOffset,
		left: self.wnd.scrollX  || self.wnd.pageXOffset
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
	
	function processMessage(message,type) {
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
					var mql = self.wnd.matchMedia(message.queries[k]);
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
			//Click
			case MessageType.Click:
				//Get target
				var target = reverse[message.target];
				//Click
				target.click && target.click();
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
					self.path = self.canvas.createPath(canvasColor);
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
				self.document.getSelection().removeAllRanges();
				break;
			//Scrolling
			case MessageType.Scroll:
				//Store values on scrolling element list, so we can check later and don't double-scroll
				scrolling[message.target] = {
					left: message.left,
					top: message.top
				};
				//Check if it is the window
				if (!message.target)
				{
					//Scroll document
					self.wnd.scrollTo(message.left,message.top);
				} else {
					//Get target
					var target = reverse[message.target];
					//if it is in the dcument of an iframe 
					if (target.nodeType === 9)
					{
						//Scroll iframe window
						target.defaultView.scrollTo(message.left,message.top);
					} else {
						//Scroll
						target.scrollTop = message.top;
						target.scrollLeft = message.left;
					}
				}
				break;
			//Update element request
			case MessageType.UpdateRequest:
				//Get requested id
				var id  = message.target;
				//Get target element
				var target = reverse[message.target];
				//If no target
				if (!target)
				{	
					//Retarget to whole body
					target = self.document.body;
					id = map.get(target);
				}
				//Delete element referencesl
				release(id,target);
				//Clone DOM element again and add ids
				var cloned = cloneNode(target,exclude);
				//Send event
				queue(MessageType.ChildList,{
					target		: map.get(target.parentNode),
					previous	: map.get(target.previousSibling),
					next		: map.get(target.nextSibling),
					added		: [getHTML(cloned)],
					deleted		: [id]
				});
				//Prefill all input values
				fillInputs(target);
				//Update scroll after request (JIC)
				queue(MessageType.Scroll,{
					target: 0,
					top: self.wnd.scrollY || self.wnd.pageYOffset,
					left: self.wnd.scrollX  || self.wnd.pageXOffset
				});
				break;
			//Fecth font
			case MessageType.FontRequest:
				//Get requested url
				var url  = message.url;
				//Fetch it
				var xhr = new XMLHttpRequest ();
				//console.log("Requesting font",url);
				//Set handlers
				xhr.addEventListener("load", function(){
					//Check if we have changed
					queue(MessageType.Font,{
						url	: url,
						type	: this.getResponseHeader('content-type'),
						font	: this.response
					});
				});
				//Load css
				xhr.open("GET", url);
				xhr.responseType = "arraybuffer";
				xhr.send();
				break;
			default:
				console.error("unknown message",message);
		}	
	}
	
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
				.then(function(parser){
					//For each message
					while(parser.hasNext())
					{		
						//Get next parsed message
						var parsed = parser.next();
						//get type
						var type = parsed.type;
						//Get message
						var message = parsed.message;
						//Process it
						processMessage (message,type);
					}
				})
				.catch(function(error){
					console.error(error);
				});
		}
	};
	//Create canvas
	this.canvas = new Canvas(self.document);
	//Create seleciton hihglighter
	this.highlighter = new SelectionHighlighter(self.document);
	//We are inited
	this.inited = true;
};

Observer.prototype.stop = function()
{
	var self = this;
	
	//If not inited
	if (!this.inited)
		//Do nothing
		return;
	//Clear timer (jic)
	clearTimeout (this.timer);
	
	//Clear message factory
	this.factory.reset();
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
	//Clean pending request
	for (var k in this.inlining)
		//Stop them
		this.inlining[k].abort();
	//Clean map
	this.inlining = {};
	
	//Remove DOM event listeners
	function unlisten(wnd) {
		var doc = wnd.document;
		//Get observer for doc
		var observer = self.observers.get(doc);
		//If found
		if (observer)
			//Stop it
			observer.disconnect();
		//Remove all 
		doc.removeEventListener("mouseup", self.mouseup ,true);
		doc.removeEventListener("mousemove", self.onmousemove ,true);
		doc.removeEventListener("mouseover", self.onmouseover, true);
		doc.removeEventListener("focus", self.onfocus, true);
		doc.removeEventListener("blur", self.onblur, true);
		doc.removeEventListener("input", self.oninput, true);
		doc.removeEventListener("change", self.onchange, true);
		doc.removeEventListener("selectionchange", self.onselectionchange, true);
		wnd.removeEventListener("resize", self.onresize , true);
		wnd.removeEventListener("scroll", self.onscroll , {passive:true,capture:true});
		//For all childrens
		for (var i=0;i<wnd.frames.length;i++)
			//Unlisten recursivelly
			unlisten(wnd.frames[i]);
	}
	//Remove all event listeners
	unlisten(this.wnd);
	//remove maps
	this.observers = new WeakMap();
	this.documents = new WeakMap();
	this.map = new WeakMap();
	this.reverse = {};
	this.factory =  new MessageFactory(); 
	this.mediaqueries = [];
	this.scrolling = {};
	this.document = null;
	this.wnd = null;
};

module.exports = Observer;