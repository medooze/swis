var ByteBuffer = require("./bytebuffer.js");


function MessageRecorder()
{
	this.ini;
	this.parts = [];
}


MessageRecorder.prototype.push = function(messages)
{
	var timestamp = 0;
	//If first
	if (!this.ini)
		//Get now
		this.ini = new Date().getTime();
	else
		//Get difference
		timestamp = new Date().getTime()-this.ini;
	
	//For each message
	for (var i=0;i<messages.length;++i)
	{
		//Get the size of he message
		var length = messages[i].byteLength || messages[i].size;
		//Create header
		var header = new ByteBuffer(4+ByteBuffer.calculateVarint32(length));
		//Writ the timestamp
		header.writeVarint32(timestamp);
		//Set the message size
		header.writeVarint32(length);
		//End it
		header.flip();
		//Append header
		this.parts.push(header.toArrayBuffer(true));
		//Apend message
		this.parts.push(messages[i]);
	}
};

MessageRecorder.prototype.toBlob = function()
{
	//Crete new blob
	return new Blob(this.parts);
};

MessageRecorder.prototype.close = function()
{
	this.parts = [];
};

module.exports = MessageRecorder;