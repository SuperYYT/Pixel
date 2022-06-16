/*
    Pixel Configuration File
    Brandon Asuncion <me@brandonasuncion.tech>
*/

(function(window) {
    "use strict";

    // Pixel Settings
    var Pixel = {
        PIXEL_SERVER: location.origin.replace(/^http/, 'ws'),
        CANVAS_WIDTH: 100, // The width and height must be the same as the values set for the server
        CANVAS_HEIGHT: 100,
        CANVAS_INITIAL_ZOOM: 20,
        CANVAS_MIN_ZOOM: 10,
        CANVAS_MAX_ZOOM: 40,
        CANVAS_COLORS: ["#eeeeee", "red", "orange", "yellow", "green", "blue", "purple", "#614126", "white", "black"],
        CANVAS_ELEMENT_ID: "pixelCanvas",

        // optional onload()
        onload: function() {
            toastr["info"]("通过数字键 1-9 选择一个颜色\r\n按 0 来擦除", "介绍");
            setTimeout(function() {
                toastr["info"]("请记住，你绘制的每个像素之间有2分钟的间隔");
            }, 4000);
            setTimeout(function() {
                toastr["info"]("最最重要的是，玩得开心！( •̀ ω •́ )✧");
            }, 8000);
        }
    };
    window.Pixel = Pixel;

    // toastr Notifications
    toastr.options = {
        "closeButton": false,
        "debug": false,
        "newestOnTop": false,
        "progressBar": false,
        "positionClass": "toast-bottom-center",
        "preventDuplicates": true,
        "onclick": null,
        "showDuration": "300",
        "hideDuration": "100",
        "timeOut": "3500",
        "extendedTimeOut": "100",
        "showEasing": "swing",
        "hideEasing": "linear",
        "showMethod": "fadeIn",
        "hideMethod": "fadeOut"
    };

})(window);
