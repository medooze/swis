var ByteBuffer = require("./bytebuffer.js");

var EventEmitter = require('events').EventEmitter;
var inherits = require('inherits');

function MessagePlayer()
{
	//Make us an event emitter
	EventEmitter.call(this);
}

//Inherit from event emitter
inherits(MessagePlayer, EventEmitter);


MessagePlayer.prototype.load = function(file)
{
	var self = this;
	 // Initialize a new instance of the FileReader class.
	var reader = new FileReader();
	// Called when the read operation is successfully completed.
	reader.onload = function () {
		//Create a byte buffer
		self.bytebuffer = new ByteBuffer(0);
		//Reuse the one that we have been passed
		self.bytebuffer.buffer = this.result;
		self.bytebuffer.view = new Uint8Array(this.result);
		self.bytebuffer.limit = self.bytebuffer.buffer.byteLength;
		//Message offset
		self.offset = 0;
		//Error
		self.emit("load");
	};
	// On error
	reader.onerror = function(error){
		//Error
		self.emit("load:error",error);
	};
	// Starts reading the contents of the specified blob.
	reader.readAsArrayBuffer(file);
};

MessagePlayer.prototype.next = function()
{
	//Read the ts offset and message size
	var ts	 = this.bytebuffer.readVarint32();
	var size = this.bytebuffer.readVarint32();
	
	//Skip header 
	var pos = ByteBuffer.calculateVarint32(ts) + ByteBuffer.calculateVarint32(size);
	
	//Create new view
	var view = new Uint8Array(this.bytebuffer.buffer,this.bytebuffer.offset,size);
	
	//Create newmessage
	var data = new ArrayBuffer(size);
	var view = new Uint8Array(data);
	
	//Copy
	view.set(new Uint8Array(this.bytebuffer.buffer,this.bytebuffer.offset,size));
		
	//Skip size
	this.bytebuffer.skip(size);
	
	//Return it
	return {
		ts: ts,
		size: size,
		data: data
	};
};

MessagePlayer.prototype.nextTick = function()
{
	//Check if we have endend
	if (!this.bytebuffer.remaining())
		//Error
		return -1;
	//mark position
	this.bytebuffer.mark();
	
	//Read the ts offset and message size
	var ts = this.bytebuffer.readVarint32();
	
	//Go to marked position
	this.bytebuffer.reset();
	
	//Return timestamp
	return ts;
};


MessagePlayer.prototype.play = function()
{
	var self = this;
	//Calculate initial time
	self.ini = new Date().getTime();
	//Get next relative offset
	var next = this.nextTick();
	
	//If ended
	if (next<0)
	{
		//Emit event
		this.emit("ended");
		//Exit
		return;
	}
	
	var tick = function()
	{
		//Get time offset
		var now = new Date().getTime()-self.ini;
		
		//Process all pending changes
		while(next<now) 
		{
			//Get next message
			var message = self.next();
			//Emit
			self.emit("message",message);
			
			//Get next tick ime
			next = self.nextTick();
			
			//If ended
			if (next<0)
			{
				//Emit event
				self.emit("ended");
				//Exit
				return;
			}
		}
		
		//Run again
		self.timer = window.requestAnimationFrame(tick);
	};
	
	//Start
	tick();
};

MessagePlayer.prototype.pause = function()
{
	//Cancel next timer
	window.cancelAnimationFrame(this.timer);
};


MessagePlayer.prototype.stop = function()
{
	//Cancel next timer
	window.cancelAnimationFrame(this.timer);
	//Free buffer
	this.bytebuffer = null;
};


module.exports = MessagePlayer;


