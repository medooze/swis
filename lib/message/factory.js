var MessageType = require("./type.js");
var ByteBuffer = require("bytebuffer");

function getSize(obj)
{
	if (typeof obj === "number" || typeof obj === "undefined" || obj === null )
	{
		return 4;
	} else if (typeof obj === "string") {
		return 4+obj.length*4;
	} else if (typeof obj === "boolean") {
		return 1;
	} else if (Array.isArray(obj)) {
		var length = 4;
		for (var i=0;i<obj.length;++i)
			length += getSize(obj[i])+1;
		return length;
	} else if (typeof obj === "object") {
		var length = 0;
		for (var k in obj)
			if (obj.hasOwnProperty (k))
				length += getSize(obj[k]);
		return length;
	} 
	throw new Error("Unusported type",obj);
}

function MessageFactory()
{
	this.parts = [];
}

MessageFactory.prototype.appendMessage = function(type,message) 
{
		
	//Create new buffer with maximum size for input message
	var bytebuffer = new ByteBuffer(1+getSize(message));
	
	//Write type
	bytebuffer.writeByte(type);
	
	//Depending on the type
	switch (type)
	{
		case MessageType.HTML:
			// href: document.location.href
			// html: document.innerHTML
			bytebuffer.writeVString(message.href);
			bytebuffer.writeVString(message.html);
			break;
		case MessageType.ChildList:
			// target: target,
			// previous: map.get(mutation.previousSibling),
			// next: map.get(mutation.nextSibling),
			// added: [],
			// deleted: []
			
			//Targets
			bytebuffer.writeVarint32(message.target);
			bytebuffer.writeVarint32(message.previous || 0);
			bytebuffer.writeVarint32(message.next || 0);
			
			//Added array
			bytebuffer.writeUint16(message.added.length);
			for (var i=0;i<message.added.length;++i)
				if (typeof message.added[i] === "string")
				{
					bytebuffer.writeByte(1);
					bytebuffer.writeVString( message.added[i]);
				} else {
					bytebuffer.writeByte(0);
					bytebuffer.writeVarint32(message.added[i]);
				}
				
			//Deleted array	
			bytebuffer.writeUint16(message.deleted.length);
			for (var i=0;i<message.deleted.length;++i)
				bytebuffer.writeVarint32(message.deleted[i]);
			break;
		case MessageType.Attributes:
			// target: target,
			// key: mutation.attributeName,
			// value: mutation.target.getAttribute(mutation.attributeName)
			bytebuffer.writeVarint32(message.target);
			bytebuffer.writeVString(message.key);
			bytebuffer.writeVString(message.value || "");
			break;
		case MessageType.CharacterData:
			// target: target,
			// text: mutation.target.data
			bytebuffer.writeVarint32(message.target);
			bytebuffer.writeVString(message.text || "");
			break;
		case MessageType.MouseMove:
			// x: event.pageX,
			// y: event.pageY
			bytebuffer.writeUint16(message.x);
			bytebuffer.writeUint16(message.y);
			break;
		case MessageType.MouseOver:
			// target: target
			bytebuffer.writeVarint32(message.target);
			break;
		case MessageType.Focus:
			// target: target
			bytebuffer.writeVarint32(message.target);
			break;
		case MessageType.Blur:
			// target: target
			bytebuffer.writeVarint32(message.target);
			break;
		case MessageType.Input:
			// target: map.get(e.srcElement),
			// value: e.srcElement.value
			bytebuffer.writeVarint32(message.target);
			bytebuffer.writeVString(message.value|| "");
			break;
		case MessageType.Resize:
			// width: window.innerWidth,
			// height: window.innerHeight
			bytebuffer.writeUint16(message.width);
			bytebuffer.writeUint16(message.height);
			break;
		case MessageType.Base:
			// href: document.location.href
			bytebuffer.writeVString(message.href);
			break;
		case MessageType.CSS:
			// target: target
			// href: document.location.href
			// css: this.responseText
			bytebuffer.writeVarint32(message.target);
			bytebuffer.writeVString(message.href);
			bytebuffer.writeVString(message.css|| "");
			break;
		case MessageType.Link:
			// target: target
			// href: document.location.href
			bytebuffer.writeVarint32(message.target);
			bytebuffer.writeVString(message.href);
			break;
		case MessageType.MediaQueryRequest:
			// queries: [{id,media}]
			// Get media query ids
			var ids = Object.keys(message.queries);
			//Write pair list
			bytebuffer.writeUint16(ids.length);
			for (var i=0;i<ids.length;++i)
			{
				var id = parseInt(ids[i]);
				bytebuffer.writeVarint32(id);
				bytebuffer.writeVString(message.queries[id]);
			}
			break;
		case MessageType.MediaQueryMatches:
			// matches: [{id,bolean}]
			// Get media query ids
			var ids = Object.keys(message.matches);
			//Write pair list
			bytebuffer.writeUint16(ids.length);
			for (var i=0;i<ids.length;++i)
			{
				var id = parseInt(ids[i]);
				bytebuffer.writeVarint32(id);
				bytebuffer.writeUint8(message.matches[id]?1:0);
			}
			break;
		default:
			//Error
			throw new Error("Unknown message type",type,message);
	}
	//End it
	bytebuffer.flip();
	//Push part
	this.parts.push(bytebuffer.toArrayBuffer(true));
};

MessageFactory.prototype.flush = function() 
{
	//Create blob with parts
	var blob =  new Blob(this.parts);
	//Clear parts
	this.parts = [];
	//return blob
	return blob;
};

module.exports =  MessageFactory;
