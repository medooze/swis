var ByteBuffer = require("./bytebuffer.js");

function MessageChunkAggregator()
{
	//Clean
	this.message = null;
	this.view = null;
	this.messageSize = 0;
	this.messagePos = 0;
}

MessageChunkAggregator.prototype.reset = function()
{
	//Clean
	this.message = null;
	this.view = null;
	this.messageSize = 0;
	this.messagePos = 0;
};

MessageChunkAggregator.prototype.push = function(buffer)
{
	var messages =[];
	
	//Process input stream
	var pos = 0;
	
	//Read chunk by chunk
	while(pos<buffer.byteLength)
	{
		//If it is the first message
		if (!this.message)
		{
			//We need to read the length
			var header = new ByteBuffer(0);
			//Reuse the one that we have been passed
			header.buffer = buffer;
			header.view = new Uint8Array(header.buffer);
			header.limit = header.buffer.byteLength;
			//Read message size
			this.messageSize = header.readVarint32();
			this.messagePos = 0;
			//Skip header 
			pos += ByteBuffer.calculateVarint32(this.messageSize);
			
			//Create newmessage
			this.message = new ArrayBuffer(this.messageSize);
			this.view = new Uint8Array(this.message);
		
		} else {
			//Get number of 
			var len = buffer.byteLength-pos;
			//Check if we can complete the message
			if (len>=this.messageSize-this.messagePos)
				//Read only the pending ammount
				len = this.messageSize-this.messagePos;
			//Append
			this.view.set(new Uint8Array(buffer,pos,len),this.messagePos);
			//Increase length
			this.messagePos += len;
			//increase global len
			pos += len;
			//Check if we have a complete message
			if (this.messagePos === this.messageSize)
			{
				//Append to list
				messages.push(this.message);
				//Clean
				this.reset();
			}
		}
	}
	
	return messages;
};

module.exports = MessageChunkAggregator;