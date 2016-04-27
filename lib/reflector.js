var MessageType = require("./message/type.js");
var MessageParser = require("./message/parser.js");

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

function Reflector(transport)
{
	this.transport = transport;
	//Reverse map <id,node>
	this.map = {};
	this.reverse = new WeakMap();
	//Media rules
	this.mediarules = {};
}
	
Reflector.prototype.reflect = function(mirror) 
{
	var remoteCursor;
	function showRemoteCursor(x,y) {
		//Check if first cursor
		if (!remoteCursor)
		{
			//Create new element
			remoteCursor = mirror.createElement("div");
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
			mirror.documentElement.appendChild(remoteCursor);
		}
		//Set new position
		remoteCursor.style["left"] = x + "px";
		remoteCursor.style["top"] =  y + "px";
	}
	
	//Store mirror
	this.mirror = mirror;

	//Get variables from this
	var map = this.map;
	var reverse = this.reverse;
	var mediarules = this.mediarules;
	var transport = this.transport;
	
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
		//Add element to map
		map[id] = element;
		//Add to reverse map also
		reverse.set(element,id);
	}

	function replace(id,element) {
		//Get old
		var old = map[id];
		//Delete old from map
		reverse.delete(old);
		//Set new value in map
		map[id] = element;
		//Add to reverse map also
		reverse.set(element,id);
	}
	//Populate map with ids
	function populate(element){
		//Add element to map
		add(maxId++,element);
		//For each child node
		for (var i=0;i<element.childNodes.length;++i)
		{

			if (element.childNodes[i].dataset) element.childNodes[i].dataset["swisId"] =maxId;

			//Ignore doctype
			if (element.childNodes[i].nodeType!==10)
				//Get child id
				populate(element.childNodes[i]);
		}
	}

	function releaseElement(element) {
		//Get id
		var id = reverse.get(element);
		//Add element to map
		delete(map[id]);
		//Delete from reverse map
		reverse.delete(element);
		//For each child node
		for (var i=0;i<element.childNodes.length;++i)
			//Get child
			releaseElement(element.childNodes[i]);
	}

	//Release map with ids
	function release(id){
		//Get element
		var element = map[id];
		//Add element to map
		delete(map[id]);
		//Delete from reverse map
		reverse.delete(element);
		//For each child node
		for (var i=0;i<element.childNodes.length;++i)
			//Get child
			releaseElement(element.childNodes[i]);
	}

	//Handle media queries and hover on elements
	function processStyles() {
		var queries = {};
		//Now get the styles
		for (var x = 0; x < mirror.styleSheets.length; x++) 
		{
			var rules = mirror.styleSheets[x].cssRules;
			var i = 0;

			//We are removing items inside the loop
			while(rules && rules.length && i<rules.length) 
			{
				//Check if it is a media rule
				if (rules[i] instanceof CSSMediaRule)
				{
					var html = "";
					//And append all the child styles
					for (var j = 0;j<rules[i].cssRules.length; j++)
						//Append HTML
						html = rules[i].cssRules[j].cssText + "\n";
					//Create new element
					var el = mirror.createElement("style");
					//Set it to disabled when loaded
					el.onload = function(){ el.disabled = true; };
					//Append html styles
					el.innerHTML = html;
					//Append to head (Do it async??)
					mirror.querySelector("head").appendChild(el).disabled;
					//Get id for this media rule
					var id = maxMediaRuleId++;
					//Append media query
					mediarules[id] = {
						element: el,
						media: rules[i].media.mediaText
					};
					//request update
					queries[id] = rules[i].media.mediaText;
					//Remove the media rules
					mirror.styleSheets[x].removeRule(i);
				} else if (rules[i] instanceof CSSStyleRule) {
					//Replace pseudo classes
					rules[i].selectorText = rules[i].selectorText.replace(":hover","[data-hover]");
					//Next
					i++;
				} else {
					//Leave it as it is
					i++;
				}
			}
		}
		//Send event
		transport.send({
			m: 0,
			q: queries
		});
	}


	transport.onInit = function(html)
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
	};

	transport.onMessages = function(blob)
	{	
		//Create parser
		MessageParser.Parse(blob)
			.then(function(parser)
			{
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
						//Get mutation
						var mutation = parsed.mutation;
						
						//console.log(mutation);
						switch(type)
						{
							case MessageType.ChildListarget:
								console.log("ChildList",mutation);
								//Get target
								var target = map[mutation.t];
								//Get previous
								var previous = map[mutation.p];
								//Get next
								var next = map[mutation.n];
								//Deleted elements
								for (var i=0;i<mutation.d.length;i++)
								{
									//Add to the deleted ones
									deleted[mutation.d[i]] = true;
									//Remove node
									map[mutation.d[i]].remove();
								}
								//Added elements
								for (var i=0;i<mutation.a.length;i++)
								{
									//Check if it is an id or a new element
									if (typeof mutation.a[i] === "string")
									{
										//Create node from HTML
										var node = createElementFromHTML(mutation.a[i]);
										//Pupulate it
										populate(node);
										//Add
										target.insertBefore(node,next);
									} else {
										//Delete from deleted (jic)
										delete(deleted[mutation.a[i]]);
										//Add it
										target.insertBefore(map[mutation.a[i]],next);
									}
								}
								break;
							case MessageType.Attributes:
								console.log("Atrribute",mutation);
								//Get target
								var target = map[mutation.t];
								//Set data
								target.setAttribute(mutation.k,mutation.v);
								break;
							case MessageType.CharacterData:
								console.log("CharData",mutation);
								//Get target
								var target = map[mutation.t];
								//Set data
								target.data = mutation.d;
								break;
							//Hovered
							case MessageType.MouseOver:
								console.log("Hover",mutation);
								//Get target
								var target = map[mutation.t];
								//Hover target
								hover(target);
								break;	
							//Focus
							case MessageType.Focus:
								console.log("Focus",mutation);
								//Get target
								var target = map[mutation.t];
								//Focus
								target.focus();
								break;	
							//Blur
							case MessageType.Blur:
								console.log("Blur",mutation);
								//Get target
								var target = map[mutation.t];
								//Blur focus
								target.blur();
								break;
							//input
							case MessageType.Input:
								console.log("Input",mutation);
								//Get target
								var target = map[mutation.t];
								//Set value
								target.value = mutation.v;
								break;
							//Set exteranl CSS
							case MessageType.CSS:
								console.log("External CSS content",mutation.t);
								//Get target
								var target = map[mutation.t];
								//Create new style
								var style = mirror.createElement("style");
								//Set all attributes
								for (var k in target.attributes)
									//Clone in style element
									style[k] = target[k];
								//Set css
								style.innerHTML = resolveCSSURLs(mutation.c,mutation.h);
								//Replace in parent node the target by element
								target.parentNode.replaceChild(style,target);
								//Set the  new element in map
								replace(mutation.t,style);
								//Process styles on next run
								setTimeout(processStyles,0);
								//Reset
								break;
							//External css fallback
							case MessageType.Link:
								console.log("External CSS link",mutation.t);
								//Get target
								var target = map[mutation.t];
								//Process styles on load
								target.onload = processStyles;
								//Set href
								target.href = mutation.h;
								break;
							//Queries match
							case MessageType.MediaQueryList:
								console.log("Queries match",mutation);
								//For all changes
								for (var id in mutation.q)
									//Enable/disable associated element
									mediarules[id].element.disabled = !mutation.q[id];
								break;
							//Resized
							case MessageType.Resize:
								console.log("Resized",mutation);
								/*
								//Get viewport
								var viewport = mirror.querySelector("meta[name=viewport]");
								//If not found, create empty one
								if (!viewport)
								{
									//Create it
									viewport = mirror.createElement("meta");
									//Set name
									viewport.name = "viewport";
									//Add it to document
									mirror.querySelector("head").appendChild(viewport);
								}
								//Set content
								viewport.content = "width="+mutation.s[0]+",height="+mutation.s[1];
								*/
							       window.resizeTo(mutation.s[0],mutation.s[1]);
							       break;
							//Rebase
							case MessageType.Base:
								console.log("Rebase",mutation);
								//Get base element
								var base = mirror.querySelector("base");
								//Check if it exist already
								if (!base)
								{
									//Craete base element
									base = mirror.createElement("base");
									//Set href to documenbt location
									base.setAttribute("href", mutation.h);
									//Append to head in the cloned doc
									mirror.querySelector("head").appendChild(base);
								} else {
									//JUst change href
									base.setAttribute("href", mutation.h);
								}
								break;
							//Mouse cursor
							case 12:
								console.log("Mouse cursor",mutation);
								//Move cursor
								showRemoteCursor(mutation.x,mutation.y);
								break;
							default:
								console.log("unknown mutation",mutation);
						}
					} catch (e) {
						console.error(e);
					}
				}
				//Garbage collect
				for (var id in deleted)
					//Release delete node refs
					release(id);

			}).catch(function(error){
				console.error(error);
			});
	};

	//Send back mouse position
	this.mouselistener = function (event) {
		//Send message back
		transport.send({
			m: 1,
			x: event.pageX,
			y: event.pageY
		});
	};
	//Listen mose events
	mirror.addEventListener ("mousemove",this.mouselistener,true);
};

Reflector.prototype.stop = function()
{
	//Clean maps
	this.map = {};
	this.reverse = new WeakMap();
	//Media rules
	this.mediarules = {};
	//Remove listener
	this.mirror.removeEventListener(this.mouselistener);
};

module.exports = Reflector;