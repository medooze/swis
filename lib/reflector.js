var MessageType = require("./message/type.js");
var MessageFactory = require("./message/factory.js");
var MessageParser = require("./message/parser.js");
var MessageChunkAggregator = require("./message/aggregator.js");
var MessageRecorder = require("./message/recorder.js");

var Canvas = require("./canvas.js");
var SelectionHighlighter = require("./selectionhighlighter.js")

var EventEmitter = require('events').EventEmitter;
var inherits = require('inherits');

function createElementFromHTML (html)
{
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

function resolveCSSURLs(css,base) 
{
	var ini = 0;
	var lower = css.toLowerCase();
	var output = "";

	//Find first url occurrence
	var i = lower.indexOf("url(",ini);

	//Replace all
	while (i!==-1){
		//Skip url(
		i += "url(".length;
		//Append to output
		output += css.substring(ini,i);
		//Move ini
		ini = i;
		//Get end
		var j = lower.indexOf(")",ini);
		//Get url
		var url = css.substring(i,j).trim();
		//Remove start and end "'
		if (url.charAt(0)==='\'' || url.charAt(0)==='"')
			//remove both ends
			url = url.substring(1,url.length-1).trim();
		//Create new url
		output += new URL(url,base);
		//Append end of url
		output += ")";
		//Move end
		ini = j+1;
		//Find first url occurrence
		var i = lower.indexOf("url(",ini);
	}
	//Copy the rest
	output += css.substr(ini,css.length);
	//Return rebased css
	return output;
}

function Reflector(transport,options)
{
	this.transport = transport;
	//Map and reverse map
	this.map = new WeakMap();
	this.reverse = {};
	//The CSS child references
	this.csschilds = {};
	//Media rules
	this.mediarules = {};
	//The message factory
	this.factory =  new MessageFactory(); 
	//Set defaults
	this.options = Object.assign({
		blob: true,
		chunk: false,
		recording: false
	},options);
	//Are we using chunked transport?
	if (this.options.chunk)
	{
		//Ensure it is not blob
		this.options.blob = false;
		//If we are used a chunked transport, create dechunker
		this.aggregator = new MessageChunkAggregator();
	}
	//If we are recording
	if (this.options.recording)
		//Create recorder
		this.recorder = new MessageRecorder();
	//Make us an event emitter
	EventEmitter.call(this);
}

//Inherit from event emitter
inherits(Reflector, EventEmitter);

Reflector.prototype.reflect = function(mirror) 
{
	//Store mirror
	this.mirror = mirror;

	//Get variables from this
	var self = this;
	var reverse = this.reverse;
	var map = this.map;
	var csschilds = this.csschilds;
	var mediarules = this.mediarules;
	var transport = this.transport;
	
	
	var factory = this.factory;
	var timer;
	
	function flush() {
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
		//Clear timer (jic)
		clearTimeout (timer);
		//Dismiss
		timer = null;
	}
	
	function queue(type,message) {
		//Add message to queue
		factory.appendMessage(type,message || {});
		//If not already scheduled
		if (!timer) 
			//Flush in 20ms
			timer = setTimeout(flush,20);
	}
	this.queue = queue;
	
	
	var maxId = 1;
	var maxMediaRuleId = 1;
	var hovered;

	function hover(element) {
		//Check if it was the same
		if (element!==hovered)
		{
			//Unhover
			if (hovered)
			{
				var el = hovered;
				//Clear all recurisvelly
				while (el)
				{
					//Remove data
					if(el.dataset) delete(el.dataset['hover']);
					//Un hover parent
					el = el.parentNode;
				}
			}
			//Now hover element and parets
			if (element) {
				var el = element;
				//Set all recurisvelly
				while (el)
				{
					//Set data
					if(el.dataset) el.dataset['hover']=true;
					//Un hover parent
					el = el.parentNode;
				}
			}
			//Set new hovered
			hovered = element;
		}
	}

	function add(id,element) {
		//Add element to reverse
		reverse[id] = element;
		//Add to reverse map also
		map.set(element,id);
	}

	function replace(id,element) {
		//Get old
		var old = reverse[id];
		//Delete old from reverse
		map.delete(old);
		//Set new value in reverse
		reverse[id] = element;
		//Add to reverse map also
		map.set(element,id);
	}
	//Populate reverse with ids
	function populate(element){
		//If it is the base and we have to ignore it
		if (element.nodeName==="BASE" && element.hasAttribute("swis"))
			//Ignore
			return;
		//Add element to reverse
		add(maxId++,element);
		//For each child node
		for (var i=0;i<element.childNodes.length;++i)
		{
			if (element.childNodes[i].dataset) element.childNodes[i].dataset["swisReflectorId"] =maxId;

			//Ignore doctype
			if (element.childNodes[i].nodeType!==10)
				//Get child id
				populate(element.childNodes[i]);
		}
	}
	
	function releaseCSSChilds(id) {
		//Check if found
		if (csschilds.hasOwnProperty (id))
		{
			//Get childs
			var childs = csschilds[id];
			//For each child
			for (var i=0;i<childs.length;i++)
				//Delete node
				childs[i].remove();
			//Delete from css list
			delete(csschilds[id]);
		}
		//TODO: Release media queries
	}

	function releaseElement(element) {
		//Get id
		var id = map.get(element);
		//Add element to reverse
		delete(reverse[id]);
		//Delete from css list
		releaseCSSChilds(id);
		//Delete from reverse map
		map.delete(element);
		//For each child node
		for (var i=0;i<element.childNodes.length;++i)
			//Get child
			releaseElement(element.childNodes[i]);
	}

	//Release reverse with ids
	function release(id){
		//Get element
		var element = reverse[id];
		//Add element to reverse
		delete(reverse[id]);
		//Delete from css list
		releaseCSSChilds(id);
		//Delete from reverse map
		map.delete(element);
		//For each child node
		for (var i=0;i<element.childNodes.length;++i)
			//Get child
			releaseElement(element.childNodes[i]);
	}

	//Handle media queries and hover on elements
	function processStyles() {
		var queries = {};
		var stylesheets =[];
		//Get current sheets
		for (var i = 0; i < mirror.styleSheets.length; i++) 
			//We need to store on a new array because we are goint to add new styles in the next loop
			stylesheets.push(mirror.styleSheets[i]);
		//Now process the original list
		for (var x = 0; x <stylesheets.length; x++) 
		{
			var stylesheet = stylesheets[x];
			var rules = stylesheet.cssRules;
			var i = 0;
			//Get css id
			var id = map.get(stylesheet.ownerNode);
			//If we already processed this style
			if (csschilds.hasOwnProperty (id))
				//Skipt this one
				continue;
			//Get parent node and next
			var parent = stylesheet.ownerNode.parentNode;
			var next = stylesheet.ownerNode.nextSibling;
			var childs = [];
			//Set child list
			csschilds[id] = childs;
			//To keep order we need to add the rules 
			var remaining = "";
			//No need to keep order yet
			var keepOrder = false;
			//We are removing items inside the loop
			while(rules && rules.length && i<rules.length) 
			{
				//Check if it is a media rule
				if (rules[i].type===4)
				{
					//Check if we have css in the buffer
					if (remaining)
					{
						//Create new element
						var el = mirror.createElement("style");
						//Append html styles
						el.innerHTML = remaining;
						//Append befor next one
						parent.insertBefore(el,next);
						//Append to childs
						childs.push(el);
						//Clean reamining
						remaining = "";
					}
					
					var html = "";
					//And append all the child styles
					for (var j = 0;j<rules[i].cssRules.length; j++)
						//Append HTML
						html += rules[i].cssRules[j].cssText + "\n";
					//Create new element
					var el = mirror.createElement("style");
					//Set it to disabled when loaded
					el.onload = function(){ 
						this.disabled = true; 
					};
					//Append html styles
					el.innerHTML = html;
					//Append befor next one
					parent.insertBefore(el,next);
					//Append to childs
					childs.push(el);
					//Get id for this media rule
					var mediaRuleId = maxMediaRuleId++;
					//Append media query
					mediarules[mediaRuleId] = {
						element: el,
						parent : parent,
						disabled : true,
						media: rules[i].media.mediaText
					};
					//request update
					queries[mediaRuleId] = rules[i].media.mediaText;
					//Set media rule id on element
					el.dataset["swisMediaRuleId"] = mediaRuleId;
					el.dataset["swisMediaRuleText"] = rules[i].media.mediaText;
					
					//Remove the media rules
					stylesheet.removeRule(i);
					
					//We need to keep order of following css rules
					keepOrder = true;
					
				} else {
					
					//Check if its a CSSRule
					if (rules[i].type===1) 
						//Replace pseudo classes
						rules[i].selectorText = rules[i].selectorText.replace(":hover","[data-hover]");
					//If we are accumulating because we need to keep order of css
					if (keepOrder)
					{
						//Append HTML
						remaining += rules[i].cssText + "\n";
						//Remove the media rules
						stylesheet.removeRule(i);
					} else {
						//Next
						i++;
					}
				}
			}
			//Check if we have css in the buffer
			if (remaining)
			{
				//Create new element
				var el = mirror.createElement("style");
				//Append html styles
				el.innerHTML = remaining;
				//Append befor next one
				parent.insertBefore(el,next);
				//Append to childs
				childs.push(el);
			}
		}
		//Send event
		queue(MessageType.MediaQueryRequest,{
			queries: queries
		});
	}


	function init(href,html)
	{
		//Clean mirrir before populating it
		while (mirror.childNodes.length)
			//Delete it
			mirror.childNodes[0].remove();
		//Create HTML
		mirror.open();
		mirror.write(html);
		mirror.close();
		
		//Pupulate ids
		populate(mirror);
		
		//Process styles
		processStyles();
		//Always show scrollbars
		mirror.documentElement.style.overflow = "scroll";
		
		//Listen mouse events
		mirror.addEventListener ("mousemove",(this.onmousemove = function (event) {
			//Send message back
			queue(MessageType.MouseMove, {
				x: event.pageX,
				y: event.pageY
			});
			//If we are painting
			if (self.path)
				//Add point
				self.path.add(event.pageX,event.pageY);
		}),true);
		//Listen selection evetns
		mirror.addEventListener("selectionchange", (this.onselectionchange = function(e) {
			//Get selection
			var selection = mirror.getSelection();
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
		//Create painting canvas
		self.canvas = new Canvas(mirror);
		//Create highlighter
		self.highlighter = new SelectionHighlighter(mirror);
		//Prepare for resize
		mirror.defaultView.addEventListener("resize", (this.onresize = function(e) {
			//resize canvas
			self.canvas.resize();
			//Redraw highlights
			self.highlighter.redraw();
		}), true);
		//Fire inited
		self.emit("init",{href:href});
	};

	transport.onmessage = function(message)
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
		
		//If we are recording
		if (self.recorder)
			//Append to parts
			self.recorder.push(messages);
		
		//For each group of messages
		for (var n=0;n<messages.length;n++)
		{
			//Create parser
			MessageParser.Parse(messages[n])
				.then(function(parser)
				{
					var timer = null;
					//List of deleted nodes
					var deleted = {};
					//For each message
					while(parser.hasNext())
					{
						try {
							//Get nexr parsed message
							var parsed = parser.next();
							//get type
							var type = parsed.type;
							//Get message
							var message = parsed.message;

							//console.log(message);
							switch(type)
							{
								case MessageType.HTML:
									//console.log("HTML",message);
									//Init
									init(message.href,message.html);
									break;
								case MessageType.ChildList:
									console.log("ChildList",message);
									//Get target
									var target = reverse[message.target];
									//Get previous
									var previous = reverse[message.previous];
									//Get next
									var next = reverse[message.next];
									//Deleted elements
									for (var i=0;i<message.deleted.length;i++)
									{
										//Add to the deleted ones
										deleted[message.deleted[i]] = true;
										//Remove node
										reverse[message.deleted[i]].remove();
										//If changing a CSS style
										if (target.nodeName === "STYLE")
											//Clean childs
											releaseCSSChilds(message.target);
									}
									//Added elements
									for (var i=0;i<message.added.length;i++)
									{
										//Check if it is an id or a new element
										if (typeof message.added[i] === "string")
										{
											//Create node from HTML
											var node = createElementFromHTML(message.added[i]);
											//Pupulate it
											populate(node);
											//Add
											target.insertBefore(node,next);
										} else {
											//Delete from deleted (jic)
											delete(deleted[message.added[i]]);
											//Add it
											target.insertBefore(reverse[message.added[i]],next);
										}
									}
									break;
								case MessageType.Attributes:
									//console.log("Atrribute",message);
									//Get target
									var target = reverse[message.target];
									//Set data
									target.setAttribute(message.key,message.value);
									//Check it has not changed the html
									if (target === mirror.documentElement )
										//Always show scrollbars
										mirror.documentElement.style.overflow = "scroll";
									//If we are disabling a css style
									if (message.key === "disabled" && target.nodeName === "STYLE")
									{
										//Get childs (if any)
										var childs = csschilds[message.target];
										//For each one
										for (var i=0;i<childs.length;++i)
											//Apply it
											childs[i].disabled = value || mediaRules[childs[i].dataset["swisMediaRuleId"]].disabled;
									}
									break;
								case MessageType.CharacterData:
									//console.log("CharData",message);
									//Get target
									var target = reverse[message.target];
									//Set data
									target.data = message.text;
									//If changing a CSS style
									if (target.parentNode.nodeName === "STYLE")
									{
										//Get id of parent
										var parentId = map.get(target.parentNode)
										//Clean childs
										releaseCSSChilds(parentId);
										//If it is the first CSS on this run
										if (!timer)
											//Process styles on next run
											timer = setTimeout(processStyles,0);
									}
									break;
								//Hovered
								case MessageType.MouseOver:
									//console.log("Hover",message);
									//Get target
									var target = reverse[message.target];
									//Hover target
									hover(target);
									break;	
								//Focus
								case MessageType.Focus:
									//console.log("Focus",message);
									//Get target
									var target = reverse[message.target];
									//Focus
									target.focus();
									break;	
								//Blur
								case MessageType.Blur:
									//console.log("Blur",message);
									//Get target
									var target = reverse[message.target];
									//Blur focus
									target.blur();
									break;
								//input
								case MessageType.Input:
									//console.log("Input",message);
									//Get target
									var target = reverse[message.target];
									//Set value
									target.value = message.value;
									break;
								//Set exteranl CSS
								case MessageType.CSS:
									//console.log("External CSS content",message.target);
									//Get target
									var target = reverse[message.target];
									//Create new style
									var style = mirror.createElement("style");
									//Set all attributes
									for (var k in target.attributes)
										//Clone in style element
										style[k] = target[k];
									//Set css
									style.innerHTML = resolveCSSURLs(message.css,message.href);
									//Replace in parent node the target by element
									target.parentNode.replaceChild(style,target);
									//Set the  new element in reverse
									replace(message.target,style);
									//If it is the first CSS on this run
									if (!timer)
										//Process styles on next run
										timer = setTimeout(processStyles,0);
									//Reset
									break;
								//External css fallback
								case MessageType.Link:
									//console.log("External CSS link",message.target);
									//Get target
									var target = reverse[message.target];
									//Process styles on load
									target.onload = processStyles;
									//Set href
									target.href = message.href;
									break;
								//Queries match
								case MessageType.MediaQueryMatches:
									//console.log("Queries match",message);
									//For all changes
									for (var id in message.matches)
									{
										//Ensure that the original style element for the element is not disabled
										if (!mediarules[id].parent.disabled)
											//Enable/disable associated element
											mediarules[id].element.disabled = !message.matches[id];
										//Store value on media rule
										mediarules[id].disabled = !message.matches[id];
									}
									break;
								//Resized
								case MessageType.Resize:
									//console.log("Resized",message);
									//Event
									self.emit("resize",{width: message.width, height: message.height});
									break;
								//Rebase
								case MessageType.Base:
									//console.log("Rebase",message);
									//Get base element
									var base = mirror.querySelector("base");
									//Check if it exist already
									if (!base)
									{
										//Craete base element
										base = mirror.createElement("base");
										//Set href to documenbt location
										base.setAttribute("href", message.href);
										//Append to head in the cloned doc
										mirror.querySelector("head").appendChild(base);
									} else {
										//JUst change href
										base.setAttribute("href", message.href);
									}
									break;
								//Mouse cursor
								case MessageType.MouseMove:
									//console.log("Mouse cursor",message);
									//Move cursor
									self.emit("remotecursormove",{
										x: message.x,
										y: message.y
									});
									break;
								//Selection change
								case MessageType.SelectionChange:
									//console.log("Selection change",message);
									//Trigger selection change
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
								default:
									console.error("unknown message",message);
							}
						} catch (e) {
							console.error(e);
						}
					}
					//Garbage collect
					for (var id in deleted)
						//Release delete node refs
						release(id);
					//Send changed event
					self.emit("change");
				}).catch(function(error){
					console.error(error);
				});
		}
	};
	
	//Create listener for mousedown/up for future use
	this.onmousedown = function (event) {
		//If we are painting
		if (self.painting)
			//Send message back
			queue(MessageType.Paint, {
				flag: true
			});
		//Store state
		self.path = self.canvas.createPath('green');
		//Set style of cursor
		self.canvas.setCursor("pointer");
		//Disable texg selection and oder interactions
		event.stopPropagation();
		event.preventDefault();
	};
	this.onmouseup = function (event) {
		//If we are painting and not gone out of document
		if (self.painting && self.path)
			//Send message back
			queue(MessageType.Paint, {
				flag: false
			});
		//Set style of cursor
		self.canvas.setCursor("auto");
		//Store state
		self.path = false;
	};
};
Reflector.prototype.clear = function()
{
	//Ensure we have canvas
	if (!this.canvas || !this.highlighter)
		//Error
		throw new Error("You cannot clear wihtout being inited");
	//Clear both
	this.canvas.clear();
	this.highlighter.clear();
	//Delete local selection also
	this.mirror.getSelection().removeAllRanges();
	//Queue change
	this.queue(MessageType.Clear);
};

Reflector.prototype.paint = function(flag)
{
	//Ensure we have canvas
	if (!this.canvas)
		//Error
		throw new Error("You can start paintinf wihtout being inited");
	
	//Ensure we are in different state
	if (this.painting===flag)
		//Nothing
		return;
	
	//Check if we were not painting 
	if (!this.painting)
	{
		//Listen mouse down events
		this.mirror.addEventListener("mousedown",this.onmousedown,true);
		this.mirror.addEventListener("mouseleave",this.onmouseup,true);
		this.mirror.addEventListener("mouseup",this.onmouseup,true);
		//Capture events on canvas
		this.canvas.enablePointerEvents(true);
		
	}  else {
		//Stop listening events
		this.mirror.removeEventListener("mousedown",this.onmousedown,true);
		this.mirror.removeEventListener("mouseleave",this.onmouseup,true);
		this.mirror.removeEventListener("mouseup",this.onmouseup,true);
		//If we were down
		if (this.mousedown)
			//Emulate it
			this.onmouseup();
		//Stop capturng events
		this.canvas.enablePointerEvents(false);
	}
	
	//Store
	this.painting = flag;
	
};

Reflector.prototype.download = function()
{
	//If not recording
	if (!this.recorder)
		//Exit
		return;
	//Create new blob from parts
	var blob = this.recorder.toBlob();;
	//Creata url
	var url = window.URL.createObjectURL(blob);
	//Create element for download
	var a = document.createElement("a");
	//Set values for download
	a.style = "display: none";
        a.href = url;
        a.download = "swis-recording-" + new Date().toISOString() +".dat";
	//Add anchor to document
	document.body.appendChild(a);
	//Start download
        a.click();
	//Remove element
	a.remove();
	//revoke url for blob
	window.URL.revokeObjectURL(url);
};

Reflector.prototype.stop = function()
{
	//Free recording
	this.recorder  && this.recorder.close();
	//Stop painting
	this.paint(false);
	//Stop canvas
	this.canvas.close();
	//Stop higlhlighter
	this.highlighter.close();
	//Clean reverses
	this.reverse = {};
	this.map = new WeakMap();
	//Media rules
	this.mediarules = {};
	//Remove listener
	this.mirror.removeEventListener("mousemove",this.onmousemove,true);
	this.mirror.removeEventListener("selectionchange",this.onselectionchange,true);
	this.mirror.defaultView.removeEventListener("rsize",this.onresize,true);
	
};

module.exports = Reflector;