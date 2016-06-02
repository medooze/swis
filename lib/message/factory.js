var MessageType = require("./type.js");
var ByteBuffer = require("./bytebuffer.js");
var pako = require("pako");

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
	this.size = 0;
}

MessageFactory.prototype.isEmpty = function() 
{
	return !this.size;
};

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
			// html: [compressed]
			bytebuffer.writeVString(message.href);
			//Compress html
			var compressed = pako.deflate(message.html);
			bytebuffer.writeVarint32(compressed.length);
			bytebuffer.writeBytes(compressed);
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
		case MessageType.Checked:
			// target: map.get(e.srcElement),
			// value: e.srcElement.checked
			bytebuffer.writeVarint32(message.target);
			bytebuffer.writeByte(message.value ? 1 : 0);
			break;
		case MessageType.Resize:
			// width: window.innerWidth,
			// height: window.innerHeight,
			// documentWidth: window.getComputedStyle(document.documentElement).width
			// documentHeight: window.getComputedStyle(document.documentElement).height
			// scrollWidth: document.body.scrollWidth,
			// scrollHeight: document.body.scrollHeight
			bytebuffer.writeUint16(message.width);
			bytebuffer.writeUint16(message.height);
			bytebuffer.writeUint16(message.documentWidth);
			bytebuffer.writeUint16(message.documentHeight);
			bytebuffer.writeUint16(message.scrollWidth);
			bytebuffer.writeUint16(message.scrollHeight);
			break;
		case MessageType.Base:
			// href: document.location.href
			bytebuffer.writeVString(message.href);
			break;
		case MessageType.CSS:
			// target: target
			// href: document.location.href
			// css: [compressed]
			bytebuffer.writeVarint32(message.target);
			bytebuffer.writeVString(message.href);
			//Compress css
			var compressed = pako.deflate(message.css || "");
			bytebuffer.writeVarint32(compressed.length);
			bytebuffer.writeBytes(compressed);
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
		case MessageType.SelectionChange:
			// anchorNode: map.get(selection.target)
			// anchorOffset: selection.anchorOffset
			// isCollapsed: selection.isCollapsed
			// startContainer: map.get(selection.getRangeAt(0).startContainer)
			// startOffset: selection.getRangeAt(0).startOffset
			// endContainer:map.get(selection.getRangeAt(0).endContainer)
			// endOffset: selection.getRangeAt(0).endOffset
			bytebuffer.writeVarint32(message.anchorNode || 0);
			bytebuffer.writeVarint32(message.anchorOffset);
			bytebuffer.writeByte(message.isCollapsed ? 1 : 0);
			bytebuffer.writeVarint32(message.startContainer || 0);
			bytebuffer.writeVarint32(message.startOffset);
			bytebuffer.writeVarint32(message.endContainer || 0);
			bytebuffer.writeVarint32(message.endOffset);
			break;
		case MessageType.Paint:
			// flag: on/offt
			bytebuffer.writeByte(message.flag ? 1:0);
			break;
		case MessageType.Clear:
			//Empty
			break;
		case MessageType.Scroll:
			// target: target
			// top:
			// left:
			bytebuffer.writeVarint32(message.target);
			bytebuffer.writeVarint32(message.top || 0);
			bytebuffer.writeVarint32(message.left || 0);
			break;
		case MessageType.UpdateRequest:
			// target: target
			bytebuffer.writeVarint32(message.target);
			break;
		default:
			//Error
			throw new Error("Unknown message type",type,message);
	}
	//End it
	bytebuffer.flip();
	//Get array
	var buffer = bytebuffer.toArrayBuffer(true);
	//Push part
	this.parts.push(buffer);
	//Inc size
	this.size += buffer.byteLength;
};

MessageFactory.prototype.flush = function(useBlob,chunked)
{
	var data;
	//Check if we can return a blob directly
	if (useBlob) 
	{
		//Create blob with parts
		data =  new Blob(this.parts);
	} else if (!chunked) {
		//Create new array
		var offset = 0;
		data = new ArrayBuffer(this.size);
		var buffer = new Uint8Array(data);
		//Append each one
		for (var i=0;i<this.parts.length;i++)
		{
			//Append
			buffer.set(new Uint8Array(this.parts[i]),offset);
			//Increase size
			offset += this.parts[i].byteLength;
		}
	} else {
		//Get size of header
		var headSize = ByteBuffer.calculateVarint32(this.size);
		//Create header
		var header = new ByteBuffer(headSize);
		//Set the message size
		header.writeVarint32(this.size);
		//End it
		header.flip();
		//Create the chunk array
		data = [];

		//Amount left
		var left = this.size;

		//Calculate the size of the first chunk
		var chunkSize = chunked;

		//If we can put all in one
		if (left+headSize<chunkSize)
			//Limit it
			chunkSize = left+headSize;

		//Create new array up to chunk size
		var offset = 0;
		var chunk = new ArrayBuffer(chunkSize);
		var buffer = new Uint8Array(chunk);
		//Append chunk
		data.push(chunk);
		//Get header buffer
		var head = header.toArrayBuffer(true);
		//Append header
		buffer.set(new Uint8Array(head),offset);
		//Increase size
		offset += headSize;
		
		//Append each one
		for (var i=0;i<this.parts.length;i++)
		{
			//Get 
			var partSize = this.parts[i].byteLength;
			var partPos = 0;
			
			//While we still have data on the parts
			while (partPos<partSize)
			{
				//Get what is let
				var len = partSize-partPos;
			
				//Check if we can append all in this chunk
				if (offset+len<=chunkSize)
				{
					//Append
					buffer.set(new Uint8Array(this.parts[i],partPos,len),offset);
					//Increase size
					offset += len;
					//Decrease left
					left -= len; 
					//Move part position
					partPos += len;
				} else {
					//Get what can we push in this chunk
					len = chunkSize-offset;
					//Put it on this chunk
					buffer.set(new Uint8Array(this.parts[i],partPos,len),offset);
					//Decrease left
					left -= len;
					//Move part position
					partPos += len;

					//Calculate the size of the next chunk
					chunkSize = chunked;

					//If we can put all in one
					if (left<chunkSize)
						//Limit it
						chunkSize = left;

					//Create new array up to chunk size
					offset = 0;
					chunk = new ArrayBuffer(chunkSize);
					buffer = new Uint8Array(chunk);
					//Append chunk
					data.push(chunk);
				}
			}
		}
		
	}
	//Clear parts
	this.parts = [];
	//clear size
	this.size = 0;
	//return blob
	return data;
};

module.exports =  MessageFactory;
