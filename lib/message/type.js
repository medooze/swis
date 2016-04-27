var Types = require("./types.js")

var Type =  {};

//Fill types from array
for (var i = 0; i<Types.length; ++i)
	//Convert
	Type[Types[i]] = i;

module.exports = Type;