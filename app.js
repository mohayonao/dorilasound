var express  = require("express");
var crypto   = require("crypto");
var util     = require("util");
var path     = require("path");
var fs       = require("fs");

if (typeof(Float32Array) === "undefined") {
    Float32Array = function(spec) {
        var i, imax;
        if (typeof spec === "number") {
            spec = spec || 0;
            if (spec > 0) {
                this.length = spec;
                while (spec--) {
                    this[spec] = 0.0;
                }
            }
        } else if (spec != null && typeof spec.length === "number") {
            this.length = spec.length;
            for (i = 0, imax = spec.length; i < imax; i++) {
                this[i] = Number(spec[i]);
            }
        }
    }
}


var SAMPLERATE = 22050;
var app = module.exports = express.createServer();

app.get("/", function(req, res) {
//    if (req.host === "mohayonao.herokuapp.com") {
        if (req.headers["user-agent"].indexOf("iPhone") !== -1) {
            sendDorilaSound(req, res);
        }
//    }
});
app.listen(process.env.PORT || 3001);


var wav_doriland = (function(src) {
    var binary, b0, b1, bb, x;
    var buffer;
    var i, imax;
    binary = new Buffer(src, "base64");
    buffer = new Float32Array(binary.length/2);
    for (i = 0, imax = buffer.length; i < imax; i++) {
        b0 = binary[i * 2];
        b1 = binary[i * 2 + 1];
        bb = (b1 << 8) + b0;
        x = (bb & 0x8000) ? -((bb^0xFFFF)+1) : bb;
        buffer[i] = (x / 65535);
    }
    return {buffer:buffer, samplerate:22050};
}(fs.readFileSync("doriland.wav.txt", "utf-8")));


function sendDorilaSound(req, res) {
    var sha1sum = crypto.createHash("sha1");
    var digest, filename, text, match, pos1, pos2, length;
    
    match = req.headers.range.match(/^bytes=(\d+)-(\d+)$/);
    if (!match) return;
    
    text = decodeURI(req.url.substr(2));
    sha1sum.update(text);
    digest = sha1sum.digest("hex");
    filename = digest + ".wav";
    
    pos1 = match[1]|0;
    pos2 = match[2]|0;
    length = pos2 - pos1;
    if (! path.existsSync(filename)) {
        makeDorilaSound(filename, text);
    }
    fs.open(filename, "r", function(err, fd) {
        fs.fstat(fd, function(err, stats) {
            var filesize = util.inspect(stats).match(/size: (\d+)/)[1]|0;
            if (length === 0) {
                res.writeHead(200, {
                    "Accept-Ranges": "bytes",
                    "Content-Length": filesize,
                    "Content-Type": "audio/wav",
                    "ETag": digest
                });
                res.end();
                fs.unlink(filename);
            } else {
                var buffer = new Buffer(length);
                fs.read(fd, buffer, 0, buffer.length, pos1, function(err, bytesRead, buffer) {
                    res.writeHead(206, {
                        "Content-Range": "bytes " + pos1 + "-" + pos2 + "/" + filesize,
                        "Accept-Ranges": "bytes",
                        "Content-Length": buffer.length,
                        "Content-Type": "audio/wav",
                        "ETag": digest
                    });
                    res.end(buffer);
                });
            }
        });
    });
}


function makeDorilaSound(filename, text) {
    var stream, wave, buffer, fd;
    var i, imax, y;
    
    stream = getstream(text);
    wave = waveheader(SAMPLERATE, 1, stream.length);
    for (i = 0, imax = stream.length; i < imax; i++) {
        y = (stream[i] * 32767.0) | 0;
        wave += String.fromCharCode(y & 0xFF, (y >> 8) & 0xFF);
    }
    buffer = new Buffer(wave, "binary");
    
    fd = fs.openSync(filename, "w");
    fs.writeSync(fd, buffer, 0, buffer.length, null);
    fs.close(fd);
}


function getstream(text) {
    var DorilaSound = require("DorilaSound");
    var size = 16384;
    var player_stub = {SAMPLERATE:SAMPLERATE,
                       STREAM_FULL_SIZE:size,
                       NONE_STREAM_FULL_SIZExC:new Float32Array(size*2)};
    var sys  = new DorilaSound(player_stub, wav_doriland);
    
    var s, result;
    var amp;
    var i, imax, j, jmax;
    
    result = [];
    sys.init({text:text});
    sys.play();
    for (i = 0; i < 17; i++) {
        s = sys.next();
        for (j = 0; j < s.length; j += 2) {
            result.push((s[j] + s[j+1]) / 2.0);
        }
    }
    
    amp  = 1.0;
    ampx = 1.0 / (size * 3);
    for (i = 0; i < 3; i++) {
        s = sys.next();
        for (j = 0; j < s.length; j += 2) {
            result.push((s[j] + s[j+1]) / 2.0 * amp);
            amp -= ampx;
            if (amp < 0) amp = 0;
        }
    }
    return new Float32Array(result);
}

function waveheader(samplerate, channel, samples) {
    var l1, l2, waveBytes;
    waveBytes = samples * channel * 2;
    l1 = waveBytes - 8;
    l2 = l1 - 36;
    return String.fromCharCode(
        0x52, 0x49, 0x46, 0x46, // 'RIFF'
        (l1 >>  0) & 0xFF,
        (l1 >>  8) & 0xFF,
        (l1 >> 16) & 0xFF,
        (l1 >> 24) & 0xFF,
        0x57, 0x41, 0x56, 0x45, // 'WAVE'
        0x66, 0x6D, 0x74, 0x20, // 'fmt '
        0x10, 0x00, 0x00, 0x00, // byte length
        0x01, 0x00,    // linear pcm
        channel, 0x00, // channel
        (samplerate >>  0) & 0xFF,
        (samplerate >>  8) & 0xFF,
        (samplerate >> 16) & 0xFF,
        (samplerate >> 24) & 0xFF,
        ((samplerate * channel * 2) >> 0) & 0xFF,
        ((samplerate * channel * 2) >> 8) & 0xFF,
        ((samplerate * channel * 2) >> 16) & 0xFF,
        ((samplerate * channel * 2) >> 24) & 0xFF,
        2 * channel, 0x00,      // block size
        0x10, 0x00,             // 16bit
        0x64, 0x61, 0x74, 0x61, // 'data'
        (l2 >>  0) & 0xFF,
        (l2 >>  8) & 0xFF,
        (l2 >> 16) & 0xFF,
        (l2 >> 24) & 0xFF);
};