/*
 */

var util = require('./util'),

	FRAME_START 		= exports.FRAME_START 			= 0x04, // ctf start of frame byte
	FRAME_END 			= exports.FRAME_END 			= 0x03, // ctf end of frame byte
	PROTOCOL_SIGNATURE 	= exports.PROTOCOL_SIGNATURE	= 0x20; // ctf protocol signature byte
	
/**
 * serialize(string)
 * Creates a ctf message out of a name/value paired string.
 * For e.g. "5022=LoginUser|5028=plusserver|5029=plusserver|5026=1"
 *
 * @param       string  ctf message
 * @return      buffer  serialized ctf message
 * @access      public
 */
exports.serialize = function serialize (str) {

	var msglen = Buffer.byteLength(str, 'ascii'),
		ctfmsg = new Buffer(msglen + 7); //1 STX, 1 PROTO SIG, 4 LEN, 1 ETX

	// start of the frame - 1 byte
	ctfmsg[0] = FRAME_START;

	// protocol version - 1 byte
	ctfmsg[1] = PROTOCOL_SIGNATURE;

	// lenght of the payload - 4 bytes
	util.to32Bits(msglen).copy(ctfmsg, 2, 0, 4);

	// payload
	ctfmsg.write(str, 6, 'ascii');

	ctfmsg[ctfmsg.length-1] = FRAME_END;

	//console.log("CTF Message: " + ctfmsg);
	return ctfmsg;
}

/**
 * toJSONText(ctfmsg)
 * Converts a ctf message into JSON string
 * 
 * @param       string  ctf message
 * @return      string  JSON formatted ctf message
 * @access      public
 */
exports.toJSONText = function toJSONText (ctfmsg) {
	return JSON.stringify(toJSONObject(ctfmsg));
}

/**
 * toJSONObject(ctfmsg)
 * Converts a ctf message into JSON object
 * 
 * @param       string  ctf message
 * @return      object  JSON object containing parsed ctf message
 * @access      public
 */
exports.toJSONObject = function toJSONObject (ctfmsg) {
	var tokenPairs = ctfmsg.split("|");
		myJSONObject = {};
	
	for (var i = 0; i < tokenPairs.length; i++) {
		var tokenPair = tokenPairs[i].split("=");
		myJSONObject['' + tokenPair[0]] = tokenPair[1];
	}
	
	return myJSONObject;
}
