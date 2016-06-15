
//Helper class for handling remote font loading
function Font(url,requestRemote)
{
	//Nothing yet
	this.url = null;
	this.original = url;
	this.pending = [];
	//Check if we can reach it
	this.xhr = new XMLHttpRequest();
	//Ping
	this.xhr.open('HEAD', url);
	this.xhr.onerror = function(e) {
		//If we couln't not access to it
		if (this.status===0)
			//Request it remotelly
			requestRemote();
	};
	//Send
	this.xhr.send();
}

Font.getURL = function(src)
{
	return src.match(/url\s*\(\s*['"]?\s*([^\s"']*)\s*['"]?\s*\)/)[1];
}

Font.prototype.update = function(font,type)
{
	//Create blob
	var blob = new Blob([font],{type: type});
	//Create url
	this.url = URL.createObjectURL (blob);
	//Process pending rules
	for (var i=0;i<this.pending.length;++i)
		//Update rule
		this.rewriteStyle(this.pending[i]);
	//Empty pending
	this.pending = null;
};

Font.prototype.rewriteStyle = function(element)
{
	//Change us
	element.innerHTML = element.innerHTML.replace(this.original,this.url);
};

Font.prototype.addStyle = function(element)
{
	if (this.pending)
		this.pending.push(element);
	else
		this.rewriteStyle(element);
};

Font.prototype.release = function()
{
	if (this.url)
		URL.revokeObjectURL(this.url);
	this.pending = null;
	//JIC
	this.xhr.onerror = null;
	this.xhr.abort();
};

module.exports = Font;
