/* 
 * Object assign porlyfill as in:
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign#polyfill
 * Required for IE
 */

var assign = Object.assign;

if (typeof Object.assign != 'function') 
	assign = function (target) {
			'use strict';
			if (target == null) {
				throw new TypeError ('Cannot convert undefined or null to object');
			}

			target = Object (target);
			for (var index = 1; index < arguments.length; index++) {
				var source = arguments[index];
				if (source != null) {
					for (var key in source) {
						if (Object.prototype.hasOwnProperty.call (source, key)) {
							target[key] = source[key];
						}
					}
				}
			}
			return target;
		};


module.exports = assign;