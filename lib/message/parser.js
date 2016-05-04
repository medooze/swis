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
		case MessageType.Resize:
			// width: window.innerWidth,
			// height: window.innerHeight
			message.width	= bytebuffer.readUint16();
			message.height	= bytebuffer.readUint16();
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
		default:
			//Error
			throw new Error("Unknown message type",type,message);
	}
	
	return {
		type: type,
		message: message
	};
};

MessageParser.Parse = function(blob)
{
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
		reader.readAsArrayBuffer(blob);
	});
};

module.exports = MessageParser;