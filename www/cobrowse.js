var MessageType = {};



/* global Promise */
/*
var inited = false;
var transport = {
	init : function (html) {
		//Send HTML
		wnd.postMessage(html, "*");
	},
	send : function(messages) {
		//Convert to json and send
		wnd.postMessage(JSON.stringify(messages), "*");
	}
};
document.addEventListener('DOMContentLoaded', function() {
	if (inited)
		return;
	inited = true;
	var wnd = 
	setTimeout(function(){
		cobrowse(transport);
	},2000);	
}, false);
																
window.addEventListener("message",function(message){
	//Get list of request 
	var cmds = JSON.parse(message.data);												
	//
	transrport.onMessage(cmds);
});																
*/
var wnd = window.open("viewer.html","viewer","width=400px");
var ws = new WebSocket("wss://dev.ef2f.com/cobrowse/2");
ws.binaryType = "arraybuffer";
 var transport = {
	onMessage : null,
	init : function (html) {
		//Send HTML
		ws.send(html);
	},
	send : function(messages) {
		//Convert to json and send
		ws.send(JSON.stringify(messages));
	}
};
ws.onopen = function() {
	cobrowse(transport);
};

ws.onmessage = function(message) {
	//Get list of request 
	var cmds = JSON.parse(message.data);												
	//Process then
	transport.onMessage(cmds);
};




	
