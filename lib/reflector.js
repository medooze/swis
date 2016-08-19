var MessageType = require("./message/type.js");
var MessageFactory = require("./message/factory.js");
var MessageParser = require("./message/parser.js");
var MessageChunkAggregator = require("./message/aggregator.js");
var MessageRecorder = require("./message/recorder.js");
var Utils = require("./utils.js");
var Canvas = require("./canvas.js");
var SelectionHighlighter = require("./selectionhighlighter.js")

var EventEmitter = require('events').EventEmitter;
var inherits = require('inherits');
var Font = require('./helpers/font.js');

var canvasColor = "#ffc820";

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
	//Scrolling elements
	this.scrolling = {};
	//The message factory
	this.factory =  new MessageFactory(); 
	//Fonts
	this.fonts = {};
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

Reflector.prototype.reflect = function(mirror,options) 
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
	var scrolling = this.scrolling;
	
	var options = Object.assign({
			scrollSync: true
		},
		options
	);
	
	//Set Sync scroll flag
	this.scrollSync(options.scrollSync);
		
	var factory = this.factory;
	
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
		clearTimeout (self.timer);
		//Dismiss
		self.timer = null;
	}
	
	function queue(type,message) {
		//Add message to queue
		factory.appendMessage(type,message || {});
		//If not already scheduled
		if (!self.timer) 
			//Flush in 20ms
			self.timer = setTimeout(flush,20);
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

	function attach(element) {
		//Get new id
		var id = maxId++;
		//Add element to reverse
		reverse[id] = element;
		//Add to reverse map also
		map.set(element,id);
		//Return id
		return id;
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
		//Ignore META X-UA-Compatible as IE adds one tag to the HTML that is not on the DOM tree
		else if (element.nodeName==="META" && (element.getAttribute("http-equiv") || "").toLowerCase()==="x-ua-compatible") 
			//Ignore
			return;
		//Add element to maps
		attach(element);
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
	
	function importCss(target,url) {
		//Create new style
		var style = mirror.createElement("style");
		//Insert before target
		target.parentNode.insertBefore(style,target);

		//Request css async
		var req = new XMLHttpRequest();
		//Set handlers
		req.addEventListener("load", function(){
			//Set css
			style.innerHTML = resolveCSSURLs(style,url,this.responseText);
			//Process media queries of the styles again
			processStyles();
		});
		req.addEventListener("error", function(error){
			//Print it
			console.error(error);
			//We have not been able to get the css, import it
			style.src = url;
		});
		//Load css
		req.open("GET", url);
		req.send();
	}

	function processExternalImports(target,href,css) {
		var ini = 0;
		var lower = css.toLowerCase();
		var output = "";

		//Find first import occurrence
		var i = lower.indexOf("@import ",ini);

		//Replace all
		while (i!==-1){
			//Append to output and ignore @import
			output += css.substring(ini,i);
			//Skip it
			i += "@import ".length;
			
			//Move ini
			ini = i;
			//Get end
			var j = lower.indexOf(";",ini);
			//Get end
			var end = j;
			//Check if there is also a media
			var k = lower.indexOf(" ",ini);
			//If found
			if (k>0 && k<j)
				//Skip it
				j = k;
			//Get all content
			var raw = css.substring(i,j);
			//Get url
			var url = raw.trim();
			//If it starts with url
			if (url.toLowerCase().indexOf("url(")===0)
				//remove both ends "url(" and ")"
				url = url.substring("url(".length,url.length-1).trim();
			//Remove start and end "'
			if (url.charAt(0)==='\'' || url.charAt(0)==='"')
				//remove both ends
				url = url.substring(1,url.length-1).trim();

			//Load external imports
			importCss(target,new URL(url,href).toString());

			//Move to end
			ini = end+1;
			//Find next occurrence
			var i = lower.indexOf("@import ",ini);
		}
		//Copy the rest
		output += css.substr(ini,css.length);
		//Return rebased css
		return output;
	}

	function resolveCSSURLs(target,href,css) 
	{
		//First remove external imports
		css = processExternalImports(target,href,css);

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
			//Get all content
			var raw = css.substring(i,j);
			//Get url
			var url = raw.trim();
			//Remove start and end "'
			if (url.charAt(0)==='\'' || url.charAt(0)==='"')
				//remove both ends
				url = url.substring(1,url.length-1).trim();
			//Check if it is a data: url
			if (url.indexOf("data:")!==0)
				//Create new url
				output += new URL(url,href);
			else
				//Do not process it
				output += raw;
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
			var owner = stylesheet.ownerNode;
			var parent = stylesheet.ownerNode.parentNode;
			var next = stylesheet.ownerNode.nextSibling;
			var childs = [];
			//Set child list
			csschilds[id] = childs;
			//Check if it has a media query itself
			if (stylesheet.media.length>0)
			{
				//Get id for this top media rule
				var mediaRuleId = maxMediaRuleId++;
				//Append media query
				mediarules[mediaRuleId] = {
					owner: owner,
					element: owner,
					disabled : true,
					media: stylesheet.media.mediaText
				};
				//request update
				queries[mediaRuleId] = stylesheet.media.mediaText;
				//Set media rule id on element
				owner.dataset["swisMediaRuleId"] = mediaRuleId;
				owner.dataset["swisMediaRuleText"] = stylesheet.media.mediaText;
				//Disable it
				owner.disabled = true;
				//Remove in style element
				owner.media = "";
			}
			//To keep order we need to add the rules 
			var remaining = "";
			//No need to keep order yet
			var keepOrder = false;
			//We are removing items inside the loop
			while(rules && rules.length && i<rules.length) 
			{
				//Check if it is a media rule
				if (rules[i].type===CSSRule.MEDIA_RULE)
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
						owner : owner,
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
				//Check if it is a CSSFont
				} else if (rules[i].type===CSSRule.FONT_FACE_RULE) {
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
					
					//Create new element
					var el = mirror.createElement("style");
					//Append css font definition
					el.innerHTML = rules[i].cssText;
					//Append befor next one
					parent.insertBefore(el,next);
					//Append to childs
					childs.push(el);
					
					//For each urls
					rules[i].style.src.split(", ").forEach(function(src,pos) {
						var font;
						//Get relative url
						var relative = Font.getURL(src);
						//If not an url() format
						if (!relative)
							//Skip
							return;
						//Make it absolute just in case, needed for local stylesheets
						var url = new URL(relative,self.remoteUrl).toString();

						//Check if it is already on fonts
						if (self.fonts.hasOwnProperty (url))
						{
							//Get font
							font = self.fonts[url];
						} else {
							//Create font
							font = new Font(relative,url,function(){
								//console.log("requesting font "+url);
								//Request font update if not found
								queue(MessageType.FontRequest,{
									url: url
								});
							});
							//Store on fonts
							self.fonts[url] = font;
						}
						//Add this rule
						font.addStyle(el);
					});
					
					el.dataset["swisFontFamily"] = rules[i].style["font-family"];
					
					//Remove the media rules
					stylesheet.removeRule(i);
					
					//We need to keep order of following css rules
					keepOrder = true;
					
				} else {
					
					//Check if its a CSSRule
					if (rules[i].type===CSSRule.STYLE_RULE) 
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
		//Store remote url
		self.remoteUrl = href;
		
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
		//Enable selection on body (needed for webview)
		mirror.body.style["-webkit-user-select"] = "text";
		//Never show scrollbars
		mirror.documentElement.style.overflow = "hidden";
		
		//Listen mouse events
		mirror.addEventListener ("click",(self.onclick = function (e) {
			//Get target
			var target =  map.get(e.target);
			//If we are not painting
			if (!self.painting && target)
				//Send clieck
				queue(MessageType.Click,{
					target: target
				});
			//Stop submission
			e.preventDefault();
			//Exit
			return false;
		}),true);
		
		mirror.addEventListener ("mousemove",(self.onmousemove = function (event) {
			//Get offset of event window
			var offset = Utils.getWindowOffset(event.currentTarget.defaultView,mirror.defaultView);
			//Send message back
			queue(MessageType.MouseMove, {
				x: event.clientX + offset.x,
				y: event.clientY + offset.y
			});
			//If we are painting
			if (self.path)
				//Add point
				self.path.add(event.clientX,event.clientY);
		}),true);
		//Listen selection evetns
		mirror.addEventListener("selectionchange", (self.onselectionchange = function(e) {
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
		
		//Listen selection evetns
		mirror.addEventListener("submit", (self.onsubmit = function(e) {
			//Stop submission
			e.preventDefault();
			//Exit
			return false;
		}), true);
		
		//Create painting canvas
		self.canvas = new Canvas(mirror);
		//Create highlighter
		self.highlighter = new SelectionHighlighter(mirror);
		//Prepare for resize
		mirror.defaultView.addEventListener("resize", (self.onresize = function(e) {
			//resize canvas
			self.canvas.resize();
			//Redraw highlights
			self.highlighter.redraw();
		}), true);
		
		//Start listiening scroll events
		mirror.defaultView.addEventListener("scroll",self.onscroll,{passive:true,capture:true});
		//Fire inited
		self.emit("init",{href:href});
	};
	
	function initIFrame(iframe,href,html,overflow)
	{
		var mirror = iframe.contentDocument;
		var window = iframe.contentWindow;
		
		//Clean mirrir before populating it
		while (mirror.childNodes.length)
			//Delete it
			mirror.childNodes[0].remove();
		//Create HTML
		mirror.open();
		mirror.write(html);
		mirror.close();
		//Override overflow
		mirror.documentElement.style.overflow = overflow;
		
		//Add iframe window to maps
		attach(window);
		
		//Pupulate ids
		populate(mirror);
		
		//Listen mouse events
		mirror.addEventListener ("click", self.onclick ,true);
		mirror.addEventListener ("mousemove", self.onmousemove ,true);
		//Listen selection evetns
		mirror.addEventListener("selectionchange", self.onselectionchange , true);
		//Listen selection evetns
		mirror.addEventListener("submit", self.onsubmit, true);
		//Start listiening scroll events
		//mirror.addEventListener("scroll",self.onscroll,true);
		window.addEventListener("scroll",self.onscroll,{passive:true,capture:true});
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
					//List of nodes with errors
					var corrupted = {};
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
								case MessageType.IFrame:
									//console.log("IFrame",message);
									//Get target
									var target = reverse[message.target];
									//Init
									initIFrame(target,message.href,message.html,message.overflow);
									break;
								case MessageType.Image:
									//console.log("Image",message);
									//Get target
									var target = reverse[message.target];
									//Create blob
									var blob = new Blob([message.image],{type: message.type});
									//release it on load
									target.onload = function(){
										URL.revokeObjectURL(this.src)
									};
									//Set it
									target.src = URL.createObjectURL(blob);
									
									break;
								case MessageType.ChildList:
									//console.log("ChildList",message);
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
											var node = Utils.createElementFromHTML(message.added[i]);
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
										//Never show scrollbars
										mirror.documentElement.style.overflow = "hidden";
									//If we are disabling a css style
									if (message.key === "disabled" && target.nodeName === "STYLE")
									{
										//Is style disabled?
										var disabled =  message.value;
										//Get childs (if any)
										var childs = csschilds[message.target];
										//For each one
										for (var i=0;i<childs.length;++i)
											//Apply it
											childs[i].disabled = disabled || mediarules[childs[i].dataset["swisMediaRuleId"]].disabled;
									}
									break;
								case MessageType.AttributesRemove:
									//console.log("AttributesRemove",message);
									//Get target
									var target = reverse[message.target];
									//Set data
									target.removeAttribute(message.key);
									//Check it has not changed the html
									if (target === mirror.documentElement )
										//Never show scrollbars
										mirror.documentElement.style.overflow = "hidden";
									//If we are disabling a css style
									if (message.key === "disabled" && target.nodeName === "STYLE")
									{
										//Is style disabled?
										var disabled =  message.value;
										//Get childs (if any)
										var childs = csschilds[message.target];
										//For each one
										for (var i=0;i<childs.length;++i)
											//Apply it
											childs[i].disabled = disabled || mediarules[childs[i].dataset["swisMediaRuleId"]].disabled;
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
										var parentId = map.get(target.parentNode);
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
									target.focus && target.focus();
									break;	
								//Blur
								case MessageType.Blur:
									//console.log("Blur",message);
									//Get target
									var target = reverse[message.target];
									//Blur focus
									target.blur && target.blur();
									break;
								//input
								case MessageType.Input:
									//console.log("Input",message);
									//Get target
									var target = reverse[message.target];
									//Set value
									target.value = message.value;
									break;
								//checked
								case MessageType.Checked:
									//console.log("Input",message);
									//Get target
									var target = reverse[message.target];
									//Set checked value
									target.checked = message.value;
									break;
								//Set exteranl CSS
								case MessageType.CSS:
									//console.log("External CSS content",message.target);
									//Get target
									var target = reverse[message.target];
									//Create new style
									var style = mirror.createElement("style");
									//Set all attributes
									for (var k=0; k<target.attributes.length;k++)
										//Ignore rel attribute
										if (target.attributes[k].name!=="rel")
											//Clone in style element
											style.setAttribute(target.attributes[k].name,target.attributes[k].value);
									//Replace in parent node the target by new style element
									target.parentNode.replaceChild(style,target);
									//Set css
									style.innerHTML = resolveCSSURLs(style,message.href,message.css);
									//Set the new element in maps
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
										if (!mediarules[id].owner.disabled)
											//Enable/disable associated element
											mediarules[id].element.disabled = !message.matches[id];
										//Store value on media rule
										mediarules[id].disabled = !message.matches[id];
										//If we are disabling a top style
										if (mediarules[id].element === mediarules[id].owner)
										{
											//Get target
											var target = map.get(mediarules[id].element);
											//Is top style disabled?
											var disabled =  mediarules[id].disabled;
											//Get childs (if any)
											var childs = csschilds[target];
											//For each one
											for (var i=0;i<childs.length;++i)
												//Apply it
												childs[i].disabled = disabled || mediarules[childs[i].dataset["swisMediaRuleId"]].disabled;
										}
									}
									break;
								//Resized
								case MessageType.Resize:
									//console.log("Resized",message);
									//Set document size
									mirror.documentElement.style.width  = message.scrollWidth  + "px";
									mirror.documentElement.style.height = message.scrollHeight + "px";
									//Event
									self.emit("resize",{
										width: message.width,
										height: message.height,
										documentWidth: message.documentWidth,
										documentHeight: message.documentHeight,
										scrollWidth: message.scrollWidth,
										scrollHeight: message.scrollHeight
									});
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
								//Scrolling
								case MessageType.Scroll:
									//console.log("Scroll",message);
									//Store values on scrolling element list, so we can check later and don't double-scroll
									scrolling[message.target] = {
										left: message.left,
										top: message.top
									};
									//Check if it is the window
									if (!message.target)
									{
										//Emit event
										self.emit("scroll",{
											left: message.left,
											top: message.top
										});
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
								//Set exteranl Font
								case MessageType.Font:
									//console.log("External Font content",message.url);
									//Get font
									var font = self.fonts[message.url];
									//If found
									if (font)
										//Update contents
										font.update(message.font,message.type);
									//Reset
									break;
								default:
									console.error("unknown message",message);
							}
						} catch (error) {
							//Error
							console.error(error,message);
							//If it tageted a node
							if (message.target)
								//Add it to the corrupted list
								corrupted[message.target] = reverse[message.target];
						}
					}
					//Garbage collect
					for (var id in deleted)
						//Release delete node refs
						release(id);
					//NOthing to request yet
					var ancestors = null;
					//Has any node been corrupted?
					for (var t in corrupted )
					{
						//Get target node
						var target = corrupted[t];
						//If we didn't had it
						if (!target || !target.parentNode)
						{
							//Request full body
							ancestors = [mirror.body];
							//And request now
							break;
						}
						//If first
						if (!ancestors)
							//Reset parent
							ancestors = Utils.getAncestors(target.parentNode);
						//Dont request upper than body
						else
							//Get common ancestors
							ancestors = Utils.getAncestors(ancestors,Utils.getAncestors(target.parentNode));
					}
					//Do we need to reset?
					if (ancestors)
					{
						///Get target
						var target = map.get(ancestors[0]);
						//request an update
						queue(MessageType.UpdateRequest, {
							target: target
						});
					}
					//Redraw highlights
					self.highlighter.redraw();
					//Send changed event
					self.emit("change");
				}).catch(function(error){
					//Error
					console.error(error);
				});
		}
	};
	
	//Create listener for click/mousedown/up for future use
	this.onmousedown = function (event) {
		//Send message back
		queue(MessageType.Paint, {
			flag: true
		});
		//Store state
		self.path = self.canvas.createPath(canvasColor);
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
	
	this.onscroll = function(e) {
		//Check if we are remotelly scrollgin
		if (self.remoteScrolling)
		{
			//Get target
			var target = 0, top, left;
			//If is is in the window
			if (e.target!==self.mirror)
			{
				//Search elements id
				target = self.map.get(e.target);
				//If not found
				if (!target)
					//Ignore it
					return;
				
			}
			//Get values
			top  = typeof e.target.scrollTop  === "number" ? e.target.scrollTop  : e.currentTarget.scrollY;
			left = typeof e.target.scrollLeft === "number" ? e.target.scrollLeft : e.currentTarget.scrollX;
			//Check if scroll event was produced by a RemoteScroll
			if (self.scrolling.hasOwnProperty(target) && self.scrolling[target].top===top && self.scrolling[target].left===left)
			{
				//Ok here it is the event
				delete(self.scrolling[target]);
				//Ignore it
				return;
			}
			//Check if we have changed
			self.queue(MessageType.Scroll,{
				target: target,
				top: top,
				left: left
			});
		}

		//Redraw highlights
		self.highlighter && self.highlighter.redraw();
	};
	
	//We are reflecting
	this.inited = true;
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


Reflector.prototype.refresh = function()
{
	///Get target
	var target = this.map.get(this.mirror.body);
	//request an update
	this.queue(MessageType.UpdateRequest, {
		target: target
	});
};

Reflector.prototype.paint = function(flag)
{
	//Ensure we have canvas
	if (!this.canvas)
		//Nothing to do
		throw new Error("You can't start painting wihtout being inited");
	
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
		//For all iframes
		var iframes = this.mirror.querySelectorAll("iframe");
		//Lisen on all of them
		for (var i=0;i<iframes.length;i++)
		{
			//Listen mouse down events
			iframes[i].contentDocument.addEventListener("mousedown",this.onmousedown,true);
			iframes[i].contentDocument.addEventListener("mouseleave",this.onmouseup,true);
			iframes[i].contentDocument.addEventListener("mouseup",this.onmouseup,true);
		}
		//Capture events on canvas
		this.canvas.enablePointerEvents(true);
		
	}  else {
		//Stop listening events
		this.mirror.removeEventListener("mousedown",this.onmousedown,true);
		this.mirror.removeEventListener("mouseleave",this.onmouseup,true);
		this.mirror.removeEventListener("mouseup",this.onmouseup,true);
		//For all iframes
		var iframes = this.mirror.querySelectorAll("iframe");
		//Stop listening on all of them
		for (var i=0;i<iframes.length;i++)
		{
			//Stop listening events
			iframes[i].contentDocument.removeEventListener("mousedown",this.onmousedown,true);
			iframes[i].contentDocument.removeEventListener("mouseleave",this.onmouseup,true);
			iframes[i].contentDocument.removeEventListener("mouseup",this.onmouseup,true);
		}
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

Reflector.prototype.scrollSync = function(flag)
{
	//Store flag
	this.remoteScrolling = flag;
};

Reflector.prototype.scroll = function(left,top)
{
	//Check if scroll event was produced by a RemoteScroll
	if (this.scrolling.hasOwnProperty(0) && this.scrolling[0].top===top && this.scrolling[0].left===left)
	{
		//Ok here it is the event
		delete(this.scrolling[0]);
		//Ignore it
		return;
	}
	//Send it
	this.queue(MessageType.Scroll,{
		target: 0,
		top: top,
		left: left
	});
};

Reflector.prototype.stop = function()
{
	//If not inited
	if (!this.inited)
		//Do nothing
		return;
	//Clear timer (jic)
	clearTimeout (this.timer);
	//Clear aggregator
	this.aggregator && this.aggregator.reset();
	//Free recording
	this.recorder  && this.recorder.close();
	//Stop painting
	this.paint(false);
	//Stop canvas
	this.canvas.close();
	//Stop higlhlighter
	this.highlighter.close();
	//Map and reverse map
	this.map = new WeakMap();
	this.reverse = {};
	//Release fonts
	for (var k in this.fonts)
		//release font
		this.fonts[k].release();
	//Empty font list
	this.fonts = {};
	//The CSS child references
	this.csschilds = {};
	//Media rules
	this.mediarules = {};
	//Scrolling elements
	this.scrolling = {};
	//Remove listener
	this.mirror.removeEventListener("click",this.onclick,true);
	this.mirror.removeEventListener("mousemove",this.onmousemove,true);
	this.mirror.removeEventListener("selectionchange",this.onselectionchange,true);
	this.mirror.removeEventListener("submit",this.onsubmit,true);
	this.mirror.defaultView.removeEventListener("scroll",this.onscroll,{passive:true,capture:true});
	this.mirror.defaultView.removeEventListener("resize",this.onresize,true);
	//Clean mirror
	this.mirror.documentElement.remove();
	
};

module.exports = Reflector;