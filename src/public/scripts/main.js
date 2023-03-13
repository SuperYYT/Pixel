(function(window) {
    "use strict";
    var $ = window.jQuery;
    var createjs = window.createjs;
    var toastr = window.toastr;

    var Pixel = window.Pixel || {};
    var CANVAS_WIDTH = Pixel.CANVAS_WIDTH;
    var CANVAS_HEIGHT = Pixel.CANVAS_HEIGHT;
    var CANVAS_COLORS = Pixel.CANVAS_COLORS;

    var stage;                                          // EaselJS stage
    var pixels;                                         // EaselJS container to store all the pixels
    var zoom = Pixel.CANVAS_INITIAL_ZOOM;               // zoom level
    var isDrawing = false;                              // whether a new pixel to draw is being selected
    var drawingShape = new createjs.Shape();            // shape to render pixel selector
    var selectedColorID = 0;                            // ID of color to draw

    var pixelMap = new Array(CANVAS_WIDTH);             // 2D array mapping of pixels
    for (var i = 0; i < CANVAS_WIDTH; i++)
        pixelMap[i] = Array(CANVAS_HEIGHT);

    var pixelRefreshData;

    /* START PixelSocket CODE */

    var pixelSocket = new PixelSocket(Pixel.PIXEL_SERVER);

    pixelSocket.setCanvasRefreshHandler(function(pixelData) {
        console.log("从服务器接收像素数据");
        if (!pixels) {
            console.log("画板未准备好，暂时储存。")
            pixelRefreshData = pixelData;
            return;
        }
        for (var x = 0; x < CANVAS_WIDTH; x++) {
            for (var y = 0; y < CANVAS_HEIGHT; y++) {
                var colorID = pixelData[x + y * CANVAS_WIDTH];
                pixelMap[x][y]["shape"].graphics.beginFill(CANVAS_COLORS[colorID]).drawRect(x, y, 1, 1);
                pixelMap[x][y]["color"] = colorID;
            }
        }
        stage.update();
    });

    pixelSocket.setMessageHandler(function(data) {

        switch (data.action) {
            case "updatePixel":
                console.log("像素更新", data.x, data.y, "color", data.colorID);
                if (!pixels) return;

                pixelMap[data.x][data.y]["shape"].graphics.beginFill(CANVAS_COLORS[data.colorID]).drawRect(data.x, data.y, 1, 1);
                data["shape"] = pixelMap[data.x][data.y]["shape"];
                pixelMap[data.x][data.y] = data;
                stage.update();
                break;

            case "timer":
                console.log("计时器: ", data.time);
                if (data.type == "toofast")
                    toastr["warning"]("等一下下再画啦~", "你画的太快啦！", {"progressBar": true, "timeOut": data.time});
                break;

            case "pong":
                console.log("Received ping response.");
                break;

            default:
                console.log("未知行为:", data.action);
                break;
        }

    });

    pixelSocket.onclose = function() {
        toastr["error"]("与服务器断开连接", null, {"onclick": null, "timeOut": "0", "extendedTimeOut": "0"});
    };

    console.log("正在连接至 ", pixelSocket.server);
    pixelSocket.connect();
    /* END PixelSocket CODE */


    /* Enable pixel selector */
    function startDrawing(colorID = 0) {
        var color = CANVAS_COLORS[colorID];
        console.log("选择颜色", color);
        var p = pixels.globalToLocal(stage.mouseX, stage.mouseY);
        selectedColorID = colorID;
        drawingShape.graphics.clear().beginFill(CANVAS_COLORS[selectedColorID]).drawRect(0, 0, 1, 1);
        drawingShape.x = Math.floor(p.x);
        drawingShape.y = Math.floor(p.y);
        drawingShape.visible = true;
        isDrawing = true;
        $(screen.canvas).trigger("mousemove");
        stage.update();
    }

    /* Disable pixel selector, update canvas, and send data to server */
    function endDrawing(x, y) {
        if (x >= 0 && y >= 0 && x < CANVAS_WIDTH && y < CANVAS_HEIGHT) {
            console.log("画在像素上", x, y, CANVAS_COLORS[selectedColorID]);
            pixelMap[x][y]["shape"].graphics.beginFill(CANVAS_COLORS[selectedColorID]).drawRect(x, y, 1, 1);

            // SEND PIXEL UPDATE TO SERVER!
            pixelSocket.sendPixel(x, y, selectedColorID);
        }
        drawingShape.visible = false;
        isDrawing = false;
        stage.update();
    }

    $(document).ready(function() {

        console.log("初始化EaselJS阶段");
        stage = new createjs.Stage(Pixel.CANVAS_ELEMENT_ID);

        var context = stage.canvas.getContext("2d");
        context.webkitImageSmoothingEnabled = context.mozImageSmoothingEnabled = false;

        // create a container to store all the pixels
        pixels = new createjs.Container();
        pixels.scaleX = zoom;
        pixels.scaleY = zoom;

        // create shape objects for each pixel and render them
        for (var x = 0; x < CANVAS_WIDTH; x++) {
            for (var y = 0; y < CANVAS_HEIGHT; y++) {
                var shape = new createjs.Shape();
                pixels.addChild(shape);
                pixelMap[x][y] = {"color": 0, "shape": shape};
            }
        }

        if (pixelRefreshData)
            pixelSocket.refreshCallback(pixelRefreshData);

        pixels.addChild(drawingShape);
        stage.addChild(pixels);

        $(window).trigger("resize");
        pixels.x = (window.innerWidth - (zoom * CANVAS_WIDTH)) / 2;
        pixels.y = (window.innerHeight - (zoom * CANVAS_HEIGHT)) / 2;

        stage.update();
        console.log("画板初始化完成。");


        /* User selects color with number keys */
        $(document).keydown(function(e){
            var i = e.keyCode - 49;
            i += 1;             // ignore the first color in the CANVAS_COLORS array
            if ((i >= 0) && (i < CANVAS_COLORS.length))
                startDrawing(i);
        });
        /* User selects the pixel to paint (if selector is active) */
        stage.addEventListener("click", function(e) {
            if (isDrawing){
                var p = pixels.globalToLocal(e.rawX, e.rawY);
                endDrawing(Math.floor(p.x), Math.floor(p.y));
            }
        });
        /* While the selector is active, move it to the pixel over the cursor */
        stage.on("stagemousemove", function(e){
            if (isDrawing) {
                var p = pixels.globalToLocal(e.rawX, e.rawY);
                drawingShape.x = Math.floor(p.x);
                drawingShape.y = Math.floor(p.y);
                stage.update();
            }
        });


        /* Code for panning the canvas around the screen */
        var dragX = 0;
        var dragY = 0;
        pixels.on("mousedown", function(e){
            dragX = e.rawX - pixels.x;
            dragY = e.rawY - pixels.y;
        });
        pixels.on("pressmove", function(e){
            // canvas panning
            pixels.x = e.rawX - dragX;
            pixels.y = e.rawY - dragY;
            stage.update();
        });


        if (window.Pixel === undefined) {
            toastr["error"]("无法加载像素配置。检查pixel-config.js是否存在。", null, {"onclick": null, "timeOut": "0", "extendedTimeOut": "0"});
            return
        }

        if (Pixel.onload) {
            Pixel.onload();
        }

    });

    // zoom functionality
    $(window).on("mousewheel", function(e){
        e.preventDefault();
        zoom = (e.originalEvent.wheelDelta > 0 || e.originalEvent.detail < 0) ? zoom + 1 : zoom - 1;
        zoom = Math.min(Math.max(zoom, Pixel.CANVAS_MIN_ZOOM), Pixel.CANVAS_MAX_ZOOM);

        // zoom in/out to cursor position
        var centerX = stage.mouseX;
        var centerY = stage.mouseY;

        var local = pixels.globalToLocal(centerX, centerY);
        pixels.regX = local.x;
        pixels.regY = local.y;
        pixels.x = centerX;
        pixels.y = centerY;
        pixels.scaleX = pixels.scaleY = zoom;
        stage.update();
    });


    $(window).on("resize", function(e){
        // canvas MUST always be a square, otherwise it will get distorted
        stage.canvas.width = stage.canvas.height = Math.max(window.innerHeight, window.innerWidth);
        stage.update();
    });

    Pixel.pixelSocket = pixelSocket;
    Pixel.startDrawing = startDrawing;
    Pixel.endDrawing = endDrawing;
    window.Pixel = Pixel;
})(window);
