var Observer = require("../lib/observer.js");

	var ws = new WebSocket("wss://dev.ef2f.com/cobrowse/3");
	var transport = {
		send : function(data) {
			//Convert to json and send
			ws.send(data);
		}
	};

	var observer = new Observer(transport);
	
	ws.onopen = function() {
		setTimeout(function(){
			observer.observe();
		},5000);
	};

	ws.onmessage = function(message) {
		//Process then
		transport.onmessage(message.data);
	};