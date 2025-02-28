/*
    PixelServer.js hosts the server that saves the painted pixel data
        and broadcasts it to all clients

    CREDITS
        Brandon Asuncion <me@brandonasuncion.tech>

    SETUP:
        $ npm install

    RUNNING:
        $ npm start

*/

/* Port for WebSocket server to listen on */
const PORT = process.env.PORT || 3001;

const MONGODB_URI = process.env.MONGODB_URI || null;

/* Dimensions of the canvas, these values must be the same as the ones
set in the browser's code. */
const CANVAS_WIDTH = process.env.CANVAS_WIDTH || 100;
const CANVAS_HEIGHT = process.env.CANVAS_HEIGHT || 100;

/* Minimum wait time between each draw request, per IP address (in seconds) */
const USER_PAINT_LIMIT = process.env.USER_PAINT_LIMIT || 120;


/*  !!!!! DONT EDIT ANYTHING AFTER THIS !!!!!  */
var http = require("http");
var express = require("express");
var app = express();
var MongoClient = require('mongodb').MongoClient;

app.use(express.static(__dirname + "/public/"));

var server = http.createServer(app);
server.listen(PORT);

var WebSocket = require('ws');
var WebSocketServer = WebSocket.Server;

var timestamps = {};

var pixels = new Array(CANVAS_WIDTH);
for (var i = 0; i < CANVAS_WIDTH; i++)
    pixels[i] = Array(CANVAS_HEIGHT);

// Reset pixel array
function resetPixels() {
    for (var x = 0; x < CANVAS_WIDTH; x++) {
        for (var y = 0; y < CANVAS_HEIGHT; y++) {
            pixels[x][y] = { x, y, colorID: 0 };
        }
    }
}

console.log("像素服务器初始化");

let ws, mongoclient, pixelCollection;
resetPixels();

if (MONGODB_URI) {
    MongoClient.connect(MONGODB_URI, function (err, db) {
        mongoclient = db;
        pixelCollection = mongoclient.collection('pixels');
        if (pixelCollection) {
            var dbPixels = pixelCollection.find().toArray(function (err, dbPixels) {
                for (var i = 0; i < dbPixels.length; i++)
                    pixels[dbPixels[i].x][dbPixels[i].y].colorID = dbPixels[i].colorID;

                console.log("Loaded", dbPixels.length, "pixels from MongoDB");
            });
        } else {
            mongoclient.createCollection('pixels');
            console.log("创建MongoDB连接");
        }
    });
} else {
    console.log("没有MongoDB连接，所有像素将存储在RAM中");
}


ws = new WebSocketServer({ server });

ws.on("connection", function (socket, req) {
    // Check whether a reverse proxy exists
    var remoteIP;
    if (req.headers['x-real-ip'] != undefined) {
        remoteIP = req.headers['x-real-ip'];
    } else {
        remoteIP = socket._socket.remoteAddress;
    }

    var log = function (text) {
        //console.log("[" + (new Date()).toLocaleString() + "] [" + remoteIP + "] ->\t" + text);
        console.log("[客户端 " + remoteIP + "] ->\t" + text);
    };

    function sendPixelUpdate(x, y, receiver = socket) {
        receiver.send(JSON.stringify({
            "action": "updatePixel",
            x,
            y,
            'colorID': pixels[x][y].colorID
        }));
    }

    function sendTimer(type, time) {
        socket.send(JSON.stringify({
            "action": "timer",
            type,
            time
        }));
    }

    log("新客户端已连接\t(" + ws.clients.size + " total)");

    socket.send(JSON.stringify({
        "action": "canvasInfo",
        "width": CANVAS_WIDTH,
        "height": CANVAS_HEIGHT
    }));

    socket.on("message", function (rawdata) {
        var message_timestamp = new Date();

        var data;
        try {
            data = JSON.parse(rawdata);
        } catch (e) { }
        var action = (data && data.action) ? data.action : rawdata;

        switch (action) {
            /*
            case "clearCanvas":
                log("CLEARED CANVAS")
                resetPixels();
                break;
            */
            case "ping":
                socket.send('{"action":"pong"}');
                break;

            case "refreshPixels":
                log("客户端请求的像素刷新");

                var pixelArray = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
                for (var x = 0; x < CANVAS_WIDTH; x++) {
                    for (var y = 0; y < CANVAS_HEIGHT; y++) {
                        pixelArray[x + y * CANVAS_WIDTH] = pixels[x][y]["colorID"];
                    }
                }
                socket.send(pixelArray);
                break;

            case "paint":

                // Check rate limits
                if (remoteIP in timestamps) {
                    if (message_timestamp - timestamps[remoteIP] < USER_PAINT_LIMIT * 1000) {
                        sendTimer('toofast', USER_PAINT_LIMIT * 1000 - (message_timestamp - timestamps[remoteIP]));
                        sendPixelUpdate(data.x, data.y);
                        break;
                    }
                }

                if (data.x >= 0 && data.y >= 0 && data.x < CANVAS_WIDTH && data.y < CANVAS_HEIGHT) {

                    log("PAINT (" + data.x + ", " + data.y + ") " + data.colorID);
                    pixels[data.x][data.y]["colorID"] = data.colorID;
                    timestamps[remoteIP] = message_timestamp;
                    sendTimer("paintsuccess", USER_PAINT_LIMIT * 1000);

                    // Update MongoDB document, if collection is available
                    if (pixelCollection) {
                        pixelCollection.findOneAndUpdate({ "x": data.x, "y": data.y }, { $set: { colorID: data.colorID } }, { upsert: true });
                    }

                    var broadcastPacket = JSON.stringify({
                        "action": "updatePixel",
                        'x': data.x,
                        'y': data.y,
                        'colorID': pixels[data.x][data.y].colorID
                    });
                    ws.clients.forEach(function (client) {
                        if ((client !== socket) && (client.readyState === WebSocket.OPEN)) {
                            client.send(broadcastPacket);
                        }
                    });

                } else {
                    log("无效绘制请求");
                }
                break;

            case "getPixel":
                log("GETPIXEL (" + data.x + ", " + data.y + ")");
                sendPixelUpdate(data.x, data.y);
                break;

            default:
                log("无效信息");
                break;
        }
    });

    socket.on("error", function(exception) {
        log("遇到的错误");
        log(exception);
    });

    socket.on("close", function() {
        log("客户端断开连接 (" + ws.clients.size + " total)");
    });
});

console.log("像素服务器监听于端口 " + PORT);
