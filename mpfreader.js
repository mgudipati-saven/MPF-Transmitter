var net = require('net'),
    events = require('events'),
    mpf = require('./mpf');


var server = net.createServer(function (stream) {
  // event emitter
  var eventEmitter = new events.EventEmitter();

  // emit an event when a new packet arrives from a client
  eventEmitter.addListener("NewMPFPacket", function(buf) {
    var mpfmsg = mpf.parse(buf);
    console.log(mpfmsg);  
    
    // send ack
    var seqno = mpfmsg.SeqNo;
    if (seqno) {
      buf = mpf.createACKPacket(seqno);
      console.log("sending ack packet => " + buf.toString('hex'));
      stream.write(buf);
    }
  });

  // mpf packet state
  var laststate = mpf.MPF_FRAME_START,
      lastarr = new Array();
  
  stream.addListener("data", function (chunk) {
    console.log("received => " + chunk.toString('hex'));
    laststate = mpf.pack(chunk, laststate, lastarr, eventEmitter);    
  });
}).listen(2000, "127.0.0.1", function() {
    console.log("waiting for connections on port 2000...");
  });
  
