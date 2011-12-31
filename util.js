var	path = require('path'),
	fs = require('fs');

/**
 * Function to convert a number into 32-bit buffer
 *
 * @param       number  number to convert
 * @return      buffer  32 bits
 * @access      public
 */
exports.to32Bits = function to32Bits(num) {
	var bytes = new Buffer(4),
  		i = 4;

  	do {
    	bytes[--i] = num & (255);
     	num = num>>8;
  	} while ( i )
	//console.log(bytes);
  	return bytes;
}

/**
 * Function to convert a 32-bit buffer into a number
 *
 * @param      buffer  32 bits
 * @return     number  number representing the 32 bits
 * @access     public
 */
exports.toNum = function toNum(buf) {
  	var	i = 4;
		num = 0;
		numBits = 0;
		
  	do {
		num += (buf[--i]<<numBits);
		numBits += 8;
  	} while ( i )
	//console.log(num);
  	return num;
}

/**
 */
exports.loadStaticFile = function loadStaticFile(uri, res) {
	var filename = path.join(process.cwd(), uri);
	path.exists(filename, function(exists) {
		if(!exists) {
			res.writeHead(404, {"Content-Type": "text/plain"});
			res.write("404 Not Found\n");
			res.end();
			return;
		}

		fs.readFile(filename, "binary", function(err, file) {
			if(err) {
				res.writeHead(500, {"Content-Type": "text/plain"});
				res.write(err + "\n");
				res.end();
				return;
			}

			res.writeHead(200);
			res.write(file, "binary");
			res.end();
		});
	});
}

/**
 */
exports.computeLRC = function computeLRC(buf, start, end) {
  lrc = 0;
  for (var i = start; i <= end; i++) {
    lrc = lrc ^ buf[i];
  }
  return lrc;
}

/*
 * right justify
 */
exports.rjust = function rjust(val, ch, num) {
  var re = new RegExp(".{" + num + "}$");
  var pad = "";
  if (!ch) ch = " ";
  do  {
    pad += ch;
  } while(pad.length < num);
  
  return re.exec(pad + val)[0];
}

/*
 * pad right
 */
exports.ljust = function ljust(val, ch, num){
  var re = new RegExp("^.{" + num + "}");
  var pad = "";
  if (!ch) ch = " ";
  do {
    pad += ch;
  } while (pad.length < num);
 
  return re.exec(val + pad)[0];
}

/*
 * Date Format 1.2.3
 * (c) 2007-2009 Steven Levithan <stevenlevithan.com>
 * MIT license
 *
 * Includes enhancements by Scott Trenda <scott.trenda.net>
 * and Kris Kowal <cixar.com/~kris.kowal/>
 *
 * Accepts a date, a mask, or a date and a mask.
 * Returns a formatted version of the given date.
 * The date defaults to the current date/time.
 * The mask defaults to dateFormat.masks.default.
 */

var dateFormat = function () {
	var	token = /d{1,4}|m{1,4}|yy(?:yy)?|([HhMsTt])\1?|[LloSZ]|"[^"]*"|'[^']*'/g,
		timezone = /\b(?:[PMCEA][SDP]T|(?:Pacific|Mountain|Central|Eastern|Atlantic) (?:Standard|Daylight|Prevailing) Time|(?:GMT|UTC)(?:[-+]\d{4})?)\b/g,
		timezoneClip = /[^-+\dA-Z]/g,
		pad = function (val, len) {
			val = String(val);
			len = len || 2;
			while (val.length < len) val = "0" + val;
			return val;
		};

	// Regexes and supporting functions are cached through closure
	return function (date, mask, utc) {
		var dF = dateFormat;

		// You can't provide utc if you skip other args (use the "UTC:" mask prefix)
		if (arguments.length == 1 && Object.prototype.toString.call(date) == "[object String]" && !/\d/.test(date)) {
			mask = date;
			date = undefined;
		}

		// Passing date through Date applies Date.parse, if necessary
		date = date ? new Date(date) : new Date;
		if (isNaN(date)) throw SyntaxError("invalid date");

		mask = String(dF.masks[mask] || mask || dF.masks["default"]);

		// Allow setting the utc argument via the mask
		if (mask.slice(0, 4) == "UTC:") {
			mask = mask.slice(4);
			utc = true;
		}

		var	_ = utc ? "getUTC" : "get",
			d = date[_ + "Date"](),
			D = date[_ + "Day"](),
			m = date[_ + "Month"](),
			y = date[_ + "FullYear"](),
			H = date[_ + "Hours"](),
			M = date[_ + "Minutes"](),
			s = date[_ + "Seconds"](),
			L = date[_ + "Milliseconds"](),
			o = utc ? 0 : date.getTimezoneOffset(),
			flags = {
				d:    d,
				dd:   pad(d),
				ddd:  dF.i18n.dayNames[D],
				dddd: dF.i18n.dayNames[D + 7],
				m:    m + 1,
				mm:   pad(m + 1),
				mmm:  dF.i18n.monthNames[m],
				mmmm: dF.i18n.monthNames[m + 12],
				yy:   String(y).slice(2),
				yyyy: y,
				h:    H % 12 || 12,
				hh:   pad(H % 12 || 12),
				H:    H,
				HH:   pad(H),
				M:    M,
				MM:   pad(M),
				s:    s,
				ss:   pad(s),
				l:    pad(L, 3),
				L:    pad(L > 99 ? Math.round(L / 10) : L),
				t:    H < 12 ? "a"  : "p",
				tt:   H < 12 ? "am" : "pm",
				T:    H < 12 ? "A"  : "P",
				TT:   H < 12 ? "AM" : "PM",
				Z:    utc ? "UTC" : (String(date).match(timezone) || [""]).pop().replace(timezoneClip, ""),
				o:    (o > 0 ? "-" : "+") + pad(Math.floor(Math.abs(o) / 60) * 100 + Math.abs(o) % 60, 4),
				S:    ["th", "st", "nd", "rd"][d % 10 > 3 ? 0 : (d % 100 - d % 10 != 10) * d % 10]
			};

		return mask.replace(token, function ($0) {
			return $0 in flags ? flags[$0] : $0.slice(1, $0.length - 1);
		});
	};
}();

// Some common format strings
dateFormat.masks = {
	"default":      "ddd mmm dd yyyy HH:MM:ss",
	shortDate:      "m/d/yy",
	mediumDate:     "mmm d, yyyy",
	longDate:       "mmmm d, yyyy",
	fullDate:       "dddd, mmmm d, yyyy",
	shortTime:      "h:MM TT",
	mediumTime:     "h:MM:ss TT",
	longTime:       "h:MM:ss TT Z",
	isoDate:        "yyyy-mm-dd",
	isoTime:        "HH:MM:ss",
	isoDateTime:    "yyyy-mm-dd'T'HH:MM:ss",
	isoUtcDateTime: "UTC:yyyy-mm-dd'T'HH:MM:ss'Z'"
};

// Internationalization strings
dateFormat.i18n = {
	dayNames: [
		"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
		"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
	],
	monthNames: [
		"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
		"January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"
	]
};

// For convenience...
Date.prototype.format = function (mask, utc) {
	return dateFormat(this, mask, utc);
};

/**
 * Copyright (c) 2010 Jakob Westhoff
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
var sprintf = function( format ) {
    // Check for format definition
    if ( typeof format != 'string' ) {
        throw "sprintf: The first arguments need to be a valid format string.";
    }
    
    /**
     * Define the regex to match a formating string
     * The regex consists of the following parts:
     * percent sign to indicate the start
     * (optional) sign specifier
     * (optional) padding specifier
     * (optional) alignment specifier
     * (optional) width specifier
     * (optional) precision specifier
     * type specifier:
     *  % - literal percent sign
     *  b - binary number
     *  c - ASCII character represented by the given value
     *  d - signed decimal number
     *  f - floating point value
     *  o - octal number
     *  s - string
     *  x - hexadecimal number (lowercase characters)
     *  X - hexadecimal number (uppercase characters)
     */
    var r = new RegExp( /%(\+)?([0 ]|'(.))?(-)?([0-9]+)?(\.([0-9]+))?([%bcdfosxX])/g );

    /**
     * Each format string is splitted into the following parts:
     * 0: Full format string
     * 1: sign specifier (+)
     * 2: padding specifier (0/<space>/'<any char>)
     * 3: if the padding character starts with a ' this will be the real 
     *    padding character
     * 4: alignment specifier
     * 5: width specifier
     * 6: precision specifier including the dot
     * 7: precision specifier without the dot
     * 8: type specifier
     */
    var parts      = [];
    var paramIndex = 1;
    while ( part = r.exec( format ) ) {
        // Check if an input value has been provided, for the current
        // format string
        if ( paramIndex >= arguments.length ) {
            throw "sprintf: At least one argument was missing.";
        }

        parts[parts.length] = {
            /* beginning of the part in the string */
            begin: part.index,
            /* end of the part in the string */
            end: part.index + part[0].length,
            /* force sign */
            sign: ( part[1] == '+' ),
            /* is the given data negative */
            negative: ( parseInt( arguments[paramIndex] ) < 0 ) ? true : false,
            /* padding character (default: <space>) */
            padding: ( part[2] == undefined )
                     ? ( ' ' ) /* default */
                     : ( ( part[2].substring( 0, 1 ) == "'" ) 
                         ? ( part[3] ) /* use special char */
                         : ( part[2] ) /* use normal <space> or zero */
                       ),
            /* should the output be aligned left?*/
            alignLeft: ( part[4] == '-' ),
            /* width specifier (number or false) */
            width: ( part[5] != undefined ) ? part[5] : false,
            /* precision specifier (number or false) */
            precision: ( part[7] != undefined ) ? part[7] : false,
            /* type specifier */
            type: part[8],
            /* the given data associated with this part converted to a string */
            data: ( part[8] != '%' ) ? String ( arguments[paramIndex++] ) : false
        };
    }

    var newString = "";
    var start = 0;
    // Generate our new formated string
    for( var i=0; i<parts.length; ++i ) {
        // Add first unformated string part
        newString += format.substring( start, parts[i].begin );
        
        // Mark the new string start
        start = parts[i].end;

        // Create the appropriate preformat substitution
        // This substitution is only the correct type conversion. All the
        // different options and flags haven't been applied to it at this
        // point
        var preSubstitution = "";
        switch ( parts[i].type ) {
            case '%':
                preSubstitution = "%";
            break;
            case 'b':
                preSubstitution = Math.abs( parseInt( parts[i].data ) ).toString( 2 );
            break;
            case 'c':
                preSubstitution = String.fromCharCode( Math.abs( parseInt( parts[i].data ) ) );
            break;
            case 'd':
                preSubstitution = String( Math.abs( parseInt( parts[i].data ) ) );
            break;
            case 'f':
                preSubstitution = ( parts[i].precision == false )
                                  ? ( String( ( Math.abs( parseFloat( parts[i].data ) ) ) ) )
                                  : ( Math.abs( parseFloat( parts[i].data ) ).toFixed( parts[i].precision ) );
            break;
            case 'o':
                preSubstitution = Math.abs( parseInt( parts[i].data ) ).toString( 8 );
            break;
            case 's':
                preSubstitution = parts[i].data.substring( 0, parts[i].precision ? parts[i].precision : parts[i].data.length ); /* Cut if precision is defined */
            break;
            case 'x':
                preSubstitution = Math.abs( parseInt( parts[i].data ) ).toString( 16 ).toLowerCase();
            break;
            case 'X':
                preSubstitution = Math.abs( parseInt( parts[i].data ) ).toString( 16 ).toUpperCase();
            break;
            default:
                throw 'sprintf: Unknown type "' + parts[i].type + '" detected. This should never happen. Maybe the regex is wrong.';
        }

        // The % character is a special type and does not need further processing
        if ( parts[i].type ==  "%" ) {
            newString += preSubstitution;
            continue;
        }

        // Modify the preSubstitution by taking sign, padding and width
        // into account

        // Pad the string based on the given width
        if ( parts[i].width != false ) {
            // Padding needed?
            if ( parts[i].width > preSubstitution.length ) 
            {
                var origLength = preSubstitution.length;
                for( var j = 0; j < parts[i].width - origLength; ++j ) 
                {
                    preSubstitution = ( parts[i].alignLeft == true ) 
                                      ? ( preSubstitution + parts[i].padding )
                                      : ( parts[i].padding + preSubstitution );
                }
            }
        }

        // Add a sign symbol if neccessary or enforced, but only if we are
        // not handling a string
        if ( parts[i].type == 'b' 
          || parts[i].type == 'd' 
          || parts[i].type == 'o' 
          || parts[i].type == 'f' 
          || parts[i].type == 'x' 
          || parts[i].type == 'X' ) {
            if ( parts[i].negative == true ) {
                preSubstitution = "-" + preSubstitution;
            }
            else if ( parts[i].sign == true ) {
                preSubstitution = "+" + preSubstitution;
            }
        }

        // Add the substitution to the new string
        newString += preSubstitution;
    }

    // Add the last part of the given format string, which may still be there
    newString += format.substring( start, format.length );

    return newString;
};

String.prototype.printf = function() {
  var newArguments = Array.prototype.slice.call( arguments );
  newArguments.unshift( String( this ) );
  return sprintf.apply( undefined, newArguments );
}
