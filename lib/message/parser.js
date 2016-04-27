var Types = require("./types.js");
var Type  = require("./type.js");
var ByteBuffer = require("bytebuffer");

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
		case Type.ChildList:
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
		case Type.Attributes:
			// target: target,
			// key: mutation.attributeName,
			// value: mutation.target.getAttribute(mutation.attributeName)
			message.target	= bytebuffer.readVarint32();
			message.key	= bytebuffer.readVString();
			message.value	= bytebuffer.readVString();
			break;
		case Type.CharacterData:
			// target: target,
			// text: mutation.target.data
			message.target	= bytebuffer.readVarint32();
			message.text	= bytebuffer.readVString();
			break;
		case Type.MouseMove:
			// x: event.pageX,
			// y: event.pageY
			message.x	= bytebuffer.readUint16();
			message.y	= bytebuffer.readUint16();
			break;
		case Type.MouseOver:
			// target: target
			message.target	= bytebuffer.readVarint32();
			break;
		case Type.Focus:
			// target: target
			message.target	= bytebuffer.readVarint32();
			break;
		case Type.Blur:
			// target: target
			message.target	= bytebuffer.readVarint32();
			break;
		case Type.Input:
			// target: map.get(e.srcElement),
			// value: e.srcElement.value
			message.target	= bytebuffer.readVarint32();
			message.value	= bytebuffer.readVString();
			break;
		case Type.Resize:
			// width: window.innerWidth,
			// height: window.innerHeight
			message.width	= bytebuffer.readUint16();
			message.height	= bytebuffer.readUint16();
			break;
		case Type.Base:
			// href: document.location.href
			message.href	= bytebuffer.readVString();
			break;
		case Type.CSS:
			// href: document.location.href
			// css: this.responseText
			message.href	= bytebuffer.readVString();
			message.css	= bytebuffer.readVString();
			break;
		case Type.Link:
			// href: document.location.href
			message.href	= bytebuffer.readVString();
			break;
		case Type.MediaQueryList:
			// queries: [{id,bolean}]
			//Media queries
			message.queries = {};
			//Get number of items to read
			var num = bytebuffer.readUint16();
			//Write pair list
			for (var i=0;i<num;++i)
				//Read <id,matched> typle
				message.queries[bytebuffer.readVarint32()] = bytebuffer.readUint8();
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