
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

Font.prototype.update = function(font)
{
	//Create blob
	var blob = new Blob([font]);
	//Create url
	this.url = URL.createObjectURL (blob);
	//Process pending rules
	for (var i=0;i<this.pending.length;++i)
		//Update rule
		this.rewriteRule(this.pending[i].rule,this.pending[i].pos);
	//Empty pending
	this.pending = null;
};

Font.prototype.rewriteRule = function(rule,pos)
{
	//Get SRCS
	var srcs = rule.style.src.split(", ");
	//Change us
	srcs[pos].replace(this.original,this.url);
	//Set it again
	rule.style.src = srcs.join(", ");
};

Font.prototype.addRule = function(rule,pos)
{
	if (this.pending)
		this.pending.push({
			rule: rule,
			pos: pos
		});
	else
		this.rewriteRule(rule,pos);
};

Font.prototype.release = function()
{
	if (this.url)
		URL.revokeObjectUrl(this.url);
	this.pending = null;
	//JIC
	this.xhr.onerror = null;
	this.xhr.abort();
};

module.exports = Font;
