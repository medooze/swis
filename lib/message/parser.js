var MessageType  = require("./type.js");
var ByteBuffer = require("./bytebuffer.js");
var pako = require("pako");

function MessageParser(data)
{
	//Create empty buffer
	this.bytebuffer = new ByteBuffer(0);
	//Reuse the one that we have been passed
        this.bytebuffer.buffer = data;
        this.bytebuffer.view = new Uint8Array(this.bytebuffer.buffer);
	this.bytebuffer.limit = this.bytebuffer.buffer.byteLength;
}

MessageParser.prototype.hasNext = function() 
{
	return this.bytebuffer.remaining()>0;
};

MessageParser.prototype.next = function() 
{
	
	var  bytebuffer = this.bytebuffer;
	
	//Get message index type
	var type = bytebuffer.readByte();
	
	//Emtpy message, yet
	var message = {};
	
	//Depending on the type
	switch (type)
	{
		case MessageType.HTML:
			// href: document.location.href
			// html: [compressed]
			message.href	= bytebuffer.readVString();
			message.html	= pako.inflate( bytebuffer.readBytes( bytebuffer.readVarint32( )).toArrayBuffer(), { to: 'string' });
			break;
		case MessageType.IFrame:
			// target: iframe element,
			// href: document.location.href
			// html: [compressed]
			message.target	= bytebuffer.readVarint32();
			message.href	= bytebuffer.readVString();
			message.html	= pako.inflate( bytebuffer.readBytes( bytebuffer.readVarint32( )).toArrayBuffer(), { to: 'string' });
			break;
		case MessageType.ChildList:
			// target: target,
			// previous: map.get(mutation.previousSibling),
			// next: map.get(mutation.nextSibling),
			// added: [],
			// deleted: []
			
			//Targets
			message.target		= bytebuffer.readVarint32();
			message.previous	= bytebuffer.readVarint32();
			message.next		= bytebuffer.readVarint32();
			
			//Added array
			message.added = new Array(bytebuffer.readUint16());
			
			for (var i=0;i<message.added.length;++i)
				if (bytebuffer.readByte())
				{
					message.added[i] = bytebuffer.readVString( );
				} else {
					message.added[i] = bytebuffer.readVarint32();
				}
				
			//Deleted array	
			message.deleted = new Array(bytebuffer.readUint16());
			for (var i=0;i<message.deleted.length;++i)
				message.deleted[i] = bytebuffer.readVarint32();
			break;
		case MessageType.Attributes:
			// target: target,
			// key: mutation.attributeName,
			// value: mutation.target.getAttribute(mutation.attributeName)
			message.target	= bytebuffer.readVarint32();
			message.key	= bytebuffer.readVString();
			message.value	= bytebuffer.readVString();
			break;
		case MessageType.CharacterData:
			// target: target,
			// text: mutation.target.data
			message.target	= bytebuffer.readVarint32();
			message.text	= bytebuffer.readVString();
			break;
		case MessageType.MouseMove:
			// x: event.pageX,
			// y: event.pageY
			message.x	= bytebuffer.readUint16();
			message.y	= bytebuffer.readUint16();
			break;
		case MessageType.MouseOver:
			// target: target
			message.target	= bytebuffer.readVarint32();
			break;
		case MessageType.Focus:
			// target: target
			message.target	= bytebuffer.readVarint32();
			break;
		case MessageType.Blur:
			// target: target
			message.target	= bytebuffer.readVarint32();
			break;
		case MessageType.Input:
			// target: map.get(e.srcElement),
			// value: e.srcElement.value
			message.target	= bytebuffer.readVarint32();
			message.value	= bytebuffer.readVString();
			break;
		case MessageType.Checked:
			// target: map.get(e.srcElement),
			// value: e.srcElement.checked
			message.target	= bytebuffer.readVarint32();
			message.value	= bytebuffer.readByte();
			break;
		case MessageType.Resize:
			// width: window.innerWidth,
			// height: window.innerHeight,
			// documentWidth: window.getComputedStyle(document.documentElement).width
			// documentHeight: window.getComputedStyle(document.documentElement).height
			// scrollWidth: document.body.scrollWidth,
			// scrollHeight: document.body.scrollHeight
			message.width	= bytebuffer.readUint16();
			message.height	= bytebuffer.readUint16();
			message.documentWidth  = bytebuffer.readUint16();
			message.documentHeight = bytebuffer.readUint16();
			message.scrollWidth  = bytebuffer.readUint16();
			message.scrollHeight = bytebuffer.readUint16();
			break;
		case MessageType.Base:
			// href: document.location.href
			message.href	= bytebuffer.readVString();
			break;
		case MessageType.CSS:
			// target: target
			// href: document.location.href
			// css: this.responseText
			message.target	= bytebuffer.readVarint32();
			message.href	= bytebuffer.readVString();
			message.css	= pako.inflate( bytebuffer.readBytes( bytebuffer.readVarint32( )).toArrayBuffer(), { to: 'string' });
			break;
		case MessageType.Link:
			// target: target
			// href: document.location.href
			message.target	= bytebuffer.readVarint32();
			message.href	= bytebuffer.readVString();
			break;
		case MessageType.MediaQueryRequest:
			// queries: [{id,media}]
			// Get media query ids
			message.queries = {};
			//Get number of items to read
			var num = bytebuffer.readUint16();
			//Write pair list
			for (var i=0;i<num;++i)
				//Read <id,matched> typle
				message.queries[bytebuffer.readVarint32()] = bytebuffer.readVString();
			break;
		case MessageType.MediaQueryMatches:
			// matches: [{id,bolean}]
			//Media queries
			message.matches = {};
			//Get number of items to read
			var num = bytebuffer.readUint16();
			//Write pair list
			for (var i=0;i<num;++i)
				//Read <id,matched> typle
				message.matches[bytebuffer.readVarint32()] = (bytebuffer.readUint8()>0);
			break;
		case MessageType.SelectionChange:
			// anchorNode: map.get(selection.target)
			// anchorOffset: selection.anchorOffset
			// isCollapsed: selection.isCollapsed
			// startContainer: map.get(selection.getRangeAt(0).startContainer)
			// startOffset: selection.getRangeAt(0).startOffset
			// endContainer:map.get(selection.getRangeAt(0).endContainer)
			// endOffset: selection.getRangeAt(0).endOffset
			message.anchorNode = bytebuffer.readVarint32();
			message.anchorOffset = bytebuffer.readVarint32();
			message.isCollapsed = bytebuffer.readByte();
			message.startContainer = bytebuffer.readVarint32();
			message.startOffset = bytebuffer.readVarint32();
			message.endContainer = bytebuffer.readVarint32();
			message.endOffset = bytebuffer.readVarint32();
			break;
		case MessageType.Paint:
			// flag: on/offt
			message.flag = bytebuffer.readByte();
			break
		case MessageType.Clear:
			//Empty
			break;
		case MessageType.Scroll:
			// target: target
			// top:
			// left:
			message.target = bytebuffer.readVarint32();
			message.top = bytebuffer.readVarint32();
			message.left = bytebuffer.readVarint32();
			break;
		case MessageType.UpdateRequest:
			// target: target
			message.target	= bytebuffer.readVarint32();
			break;
		default:
			//Error
			throw new Error("Unknown message type",type,message);
	}
	
	return {
		type: type,
		message: message
	};
};

MessageParser.Parse = function(data)
{
	//Check if it is a blob
	if (data instanceof Blob)
		//Return a new promise that will be resolve with the parser object
		return new Promise(function(resolve,reject){
			 // Initialize a new instance of the FileReader class.
			var reader = new FileReader();
			// Called when the read operation is successfully completed.
			reader.onload = function () {
			    //Create callback and resolve
			    resolve(new MessageParser(this.result));
			};
			// On error
			reader.onerror = reject;
			// Starts reading the contents of the specified blob.
			reader.readAsArrayBuffer(data);
		});
	else if (data instanceof ArrayBuffer)
		//Return a promise
		return Promise.resolve(new MessageParser(data));
	else if (data.buffer instanceof ArrayBuffer)
		//Return a promise
		return Promise.resolve(new MessageParser(data.buffer));
	else 
		throw new Error("Data is neither a Blob or an ArrayBuffer");
};

module.exports = MessageParser;