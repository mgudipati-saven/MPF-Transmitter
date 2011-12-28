var net = require('net'),
  events = require('events'),
  util = require('./util'),
  ctf = require('./ctf'),
  
  // ctf message deserialization states...
  EXPECTING_CTF_FRAME_START = 1,
  EXPECTING_CTF_PROTOCOL_SIGNATURE = 2,
  EXPECTING_CTF_PAYLOAD_SIZE = 3,
  EXPECTING_CTF_PAYLOAD = 4,
  EXPECTING_CTF_FRAME_END = 5,
  
  ctfState = EXPECTING_CTF_FRAME_START, // current ctf state
  payloadBuffer = null, // buffer to hold ctf payload
  payloadBytesLeft = 0, // ctf payload bytes left to be processed
  payloadSizeBuffer = null, // buffer to hold ctf payload size
  payloadSizeBytesLeft = 0, // ctf payload size bytes left to be processed
  
  lastCTFMessage = null, // last ctf message received
  
  done = 0,
  
  // List of CTF commands
  ctfCommandList = [ 
		"5022=LoginUser|5028=tamsupport|5029=bgood2me|5026=1",
		//"5022=LoginUser|5028=pfcanned|5029=cypress|5026=1",
		//"5022=LoginUser|5028=plusserver|5029=plusserver|5026=1",
		//"5022=ListAdministrationInfo|5026=2",
		//"5022=ListSystemPermission|5026=3",
		//"5022=ListUserPermission|5026=4",
		//"5022=SelectAvailableTokens|5026=5",
		//"5022=ListAvailableTokens|5026=6",
		//"5022=ListEnumeration|5026=7",
		//"5022=ListExchangeTokens|4=941|5026=8",
		//"5022=SelectUserTokens|5035=5|5035=308|5035=378|5026=9",
		//"5022=ListUserTokens|5026=10",
		//"5022=QuerySnap|4=941|5=E:TCS.EQ|5026=11",
		//"5022=QuerySnap|4=1057|5=IBM|5026=11",
		//"5022=QuerySnap|4=941|5026=11",
		"5022=Subscribe|4=328|5026=12",
		//"5022=Unsubscribe|5026=13",
		//"5022=SelectOutput|5018=ON|5026=14",
		//"5022=ListSplitExchanges|5026=15",
		//"5022=QueryWildCard|4=941|3177={machine}|5026=16",
		//"5022=QuerySubscribedExchanges|5026=17",
		//"5022=QuerySubscribedSymbols|5026=18",
		//"5022=ListSubscribedExchanges|5026=19",
		//"5022=ListSubscribedNews|5026=20",
		//"5022=ListSubscribedSymbols|5026=21",
		//"5022=QuerySnapAndSubscribe|4=1057|5026=22",
		//"5022=QuerySnapAndSubscribe|4=941|5=E:TCS.EQ|5026=22",
		//"5022=QueryDepth|4=328|5=IBM|5026=24",
		//"5022=QueryDepthAndSubscribe|4=328|5=IBM|5026=23",
		//"5022=QueryTasDates|5026=24",
		//"5022=QueryTas|4=1057|5=IBM|5026=25"
		//"5022=QueryTas|5040=CORRECTED|4=558|5=IBM|5026=6|5045=100",
		//"5022=QueryDepthAndSubscribe|4=249|5=IBM|5026=7",
		//"5022=QueryCorrections|5042=1223546400|5049=1224151200|4=558|5=IBM|5026=10",
		//"5022=QueryHistory|49227=1223546400|49228=1224151200|4=558|5=IBM|5026=11",
		//"5022=QueryHistory|49227=1214904600|49228=1225272600|4=558|5=IBM|5026=12",
		//"5022=QueryInterval|5043=10|5042=1223546400|5049=1224151200|4=558|5=IBM|5026=13",
		//"5022=QueryTas|7=P|5042=1223546400|5049=1224151200|49168=Q|5040=CORRECTED|4=558|5=IBM|5026=14",
		//"5022=QueryTas|7=P|5042=1223546400|5049=1224151200|5040=CORRECTED|4=558|5=IBM|5026=15",
		//"5022=QueryTas|5042=1224669600|5049=1224680400|49168=B|5040=CORRECTED|4=558|5=IBM|5026=16",
		//"5022=QueryTas|5042=1224669600|5049=1224680400|49168=T|5040=corrected|4=558|5=IBM|5026=17",
		//"5022=QueryTas|5042=1224669600|5049=1224680400|49168=T|5040=uncorrected|4=558|5=IBM|5026=18",
		//"5022=QueryTas|5042=1224669600|5049=1224680400|5040=CORRECTED|4=558|5=IBM|5026=19",
		//"5022=QueryTas|5042=1224669600|5049=1224680400|5040=CORRECTED|4=558|5=IBM|5026=20",
		//"5022=QueryTas|7=|5042=1225310400|5049=1225317600|5040=CORRECTED|4=558|5=IBM|5026=21",
		//"5022=QueryTas|7=|5042=1225704600|5049=1225715400|49168=B|5040=CORRECTED|4=558|5=IBM|5026=22",
  ],
  
  // emit an event when a new ctf message arrives from csp
  ctfMessageEmitter = new events.EventEmitter();

  // ctf connection
  //client = net.createConnection(4004, "trialdata.interactivedata-rts.com"); // 328
  //client = net.createConnection(4011, "trialdata.interactivedata-rts.com"); // 941
  client = net.createConnection(4001, "198.190.11.31");

/* 
* ctf connection handlers
*/
client.addListener("connect", function () {
  //console.log("connection is established with ctf server...");
  //client.setEncoding('ascii');
  
	ctfCommandList.forEach(function(cmd, pos) {
		client.write(ctf.serialize(cmd));
	});
});

client.addListener("data", function (chunk) {
  //console.log("data is received from ctf server..." + chunk.toString());
  deserialize(chunk);
});

client.addListener("end", function () {
  console.log("ctf server disconnected...");
});
  
ctfMessageEmitter.addListener("newmsg", function(ctfPayloadBuffer) {
  var ctfmsg = ctf.toJSONObject(ctfPayloadBuffer.toString());
  //console.log(ctfmsg);
  if (ctfmsg['4']) {
		// quotes...
		if (ctfmsg['4'] == "328") {
			// nyse openbook level 2 messages
			processL2Message(ctfmsg);
		}
  }
});

/**
* deserialize(buffer)
* Parses a ctf message stream into name/value paired strings.
* For e.g. "5022=LoginUser|5028=plusserver|5029=plusserver|5026=1"
*
* @param       buffer  raw ctf messages
* @return      string  ctf message
* @access      public
*/
function deserialize (buf) {
  //console.log("Length: " + buf.length);
  for (var i = 0; i < buf.length; i++) {
    switch (ctfState) {
      case EXPECTING_CTF_FRAME_START:
        if (buf[i] == ctf.FRAME_START) {
          ctfState = EXPECTING_CTF_PROTOCOL_SIGNATURE;
        } else {
          console.log("Error: expecting ctf start byte, received " + buf[i]);
          // TODO
        }
      break;

      case EXPECTING_CTF_PROTOCOL_SIGNATURE:
        if (buf[i] == ctf.PROTOCOL_SIGNATURE) {
          ctfState = EXPECTING_CTF_PAYLOAD_SIZE;
          payloadSizeBuffer = new Buffer(4);
          payloadSizeBytesLeft = 4;
        } else {
          console.log("Error: expecting ctf protocol signature byte, received " + buf[i]);
          // TODO
        }
      break;

      case EXPECTING_CTF_PAYLOAD_SIZE:
        // continute to collect payload size bytes
        payloadSizeBuffer[payloadSizeBuffer.length - payloadSizeBytesLeft--] = buf[i];

        if (payloadSizeBytesLeft == 0) {
          // done collecting payload size bytes
          //console.log(payloadSizeBuffer);
          var payloadSize = util.toNum(payloadSizeBuffer);
          //console.log("payload size = ", payloadSize);
          payloadBuffer = new Buffer(payloadSize);
          payloadBytesLeft = payloadSize;
          ctfState = EXPECTING_CTF_PAYLOAD;
        }
      break;

      case EXPECTING_CTF_PAYLOAD:
        payloadBuffer[payloadBuffer.length - payloadBytesLeft--] = buf[i];
        if (payloadBytesLeft == 0) {
          //console.log("New CTF Message: " + payloadBuffer);
          ctfState = EXPECTING_CTF_FRAME_END;
        }
      break;

      case EXPECTING_CTF_FRAME_END:
        if (buf[i] == ctf.FRAME_END) {
          //lastCTFMessage = payloadBuffer.toString();
          console.log("=>" + payloadBuffer.toString());
          ctfMessageEmitter.emit("newmsg", payloadBuffer);
          ctfState = EXPECTING_CTF_FRAME_START;
        } else {
          console.log("Error: expecting ctf frame end byte, received " + buf[i]);
          // TODO
        }
      break;
    }
  }
}
