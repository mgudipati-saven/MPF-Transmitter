var net = require('net'),
    events = require('events'),
    mpf = require('./mpf');


var server = net.createServer(function (stream) {
  console.log("new client...");

  // window size
  var windowsize = 7;

  var mpfClient = mpf.createClient(stream);
  mpfClient.on('packet', function (packet) {
    console.log(packet);  
    
    if (--windowsize == 0) {
      // send ack
      var seqno = packet.SeqNo;
      if (seqno) {
        var type = mpf.MPF_PACKET_TYPE_NAK;
        packet = { PacketType: type, SeqNo: seqno };
        console.log("sending packet: " + JSON.stringify(packet));
        mpfClient.sendPacket(packet);
        windowsize = 7;
      }
    }
  });  
}).listen(2000, "127.0.0.1", function() {
    console.log("waiting for connections on port 2000...");
  });
