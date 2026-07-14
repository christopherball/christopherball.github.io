(function (window, document) {
    "use strict";

    // define KanjiCanvas as a global
    // call KanjiCanvas.init(id) to initialize a canvas as a KanjiCanvas
    // `id` must be the id attribute of the canvas.
    // ex: KanjiCanvas.init('canvas-1');
    window.KanjiCanvas = new Object();

    // patterns loaded externally from ref-patterns.js (always run after KanjiCanvas is defined)
    KanjiCanvas.refPatterns = [];

    // color coded stroke colors (for 30 strokes)
    // based on https://kanjivg.tagaini.net/viewer.html
    KanjiCanvas.strokeColors = [
        "#bf0000",
        "#bf5600",
        "#bfac00",
        "#7cbf00",
        "#26bf00",
        "#00bf2f",
        "#00bf85",
        "#00a2bf",
        "#004cbf",
        "#0900bf",
        "#5f00bf",
        "#b500bf",
        "#bf0072",
        "#bf001c",
        "#bf2626",
        "#bf6b26",
        "#bfaf26",
        "#89bf26",
        "#44bf26",
        "#26bf4c",
        "#26bf91",
        "#26a8bf",
        "#2663bf",
        "#2d26bf",
        "#7226bf",
        "#b726bf",
        "#bf2682",
        "#bf263d",
        "#bf4c4c",
        "#bf804c",
    ];

    // init canvas
    KanjiCanvas.init = function (id) {
        KanjiCanvas["canvas_" + id] = document.getElementById(id);
        KanjiCanvas["canvas_" + id].tabIndex = 0; // makes canvas focusable, allowing usage of shortcuts
        KanjiCanvas["ctx_" + id] = KanjiCanvas["canvas_" + id].getContext("2d");
        KanjiCanvas["w_" + id] = KanjiCanvas["canvas_" + id].width;
        KanjiCanvas["h_" + id] = KanjiCanvas["canvas_" + id].height;
        KanjiCanvas["flagOver_" + id] = false;
        KanjiCanvas["flagDown_" + id] = false;
        KanjiCanvas["prevX_" + id] = 0;
        KanjiCanvas["currX_" + id] = 0;
        KanjiCanvas["prevY_" + id] = 0;
        KanjiCanvas["currY_" + id] = 0;
        KanjiCanvas["dot_flag_" + id] = false;
        KanjiCanvas["recordedPattern_" + id] = new Array();
        KanjiCanvas["currentLine_" + id] = null;

        KanjiCanvas["canvas_" + id].addEventListener(
            "mousemove",
            function (e) {
                KanjiCanvas.findxy("move", e, id);
            },
            false,
        );
        KanjiCanvas["canvas_" + id].addEventListener(
            "mousedown",
            function (e) {
                KanjiCanvas.findxy("down", e, id);
            },
            false,
        );
        KanjiCanvas["canvas_" + id].addEventListener(
            "mouseup",
            function (e) {
                KanjiCanvas.findxy("up", e, id);
            },
            false,
        );
        KanjiCanvas["canvas_" + id].addEventListener(
            "mouseout",
            function (e) {
                KanjiCanvas.findxy("out", e, id);
            },
            false,
        );
        KanjiCanvas["canvas_" + id].addEventListener(
            "mouseover",
            function (e) {
                KanjiCanvas.findxy("over", e, id);
            },
            false,
        );

        // touch events
        KanjiCanvas["canvas_" + id].addEventListener(
            "touchmove",
            function (e) {
                KanjiCanvas.findxy("move", e, id);
            },
            false,
        );
        KanjiCanvas["canvas_" + id].addEventListener(
            "touchstart",
            function (e) {
                KanjiCanvas.findxy("down", e, id);
            },
            false,
        );
        KanjiCanvas["canvas_" + id].addEventListener(
            "touchend",
            function (e) {
                KanjiCanvas.findxy("up", e, id);
            },
            false,
        );
    };

    KanjiCanvas.draw = function (id, color) {
        KanjiCanvas["ctx_" + id].beginPath();
        KanjiCanvas["ctx_" + id].moveTo(
            KanjiCanvas["prevX_" + id],
            KanjiCanvas["prevY_" + id],
        );
        KanjiCanvas["ctx_" + id].lineTo(
            KanjiCanvas["currX_" + id],
            KanjiCanvas["currY_" + id],
        );
        KanjiCanvas["ctx_" + id].strokeStyle = color ? color : "#333";
        KanjiCanvas["ctx_" + id].lineCap = "round";
        //KanjiCanvas["ctx_" + id].lineJoin = "round";
        //KanjiCanvas["ctx_" + id].lineMiter = "round";
        KanjiCanvas["ctx_" + id].lineWidth = 4;
        KanjiCanvas["ctx_" + id].stroke();
        KanjiCanvas["ctx_" + id].closePath();
    };

    KanjiCanvas.deleteLast = function (id) {
        KanjiCanvas["ctx_" + id].clearRect(
            0,
            0,
            KanjiCanvas["w_" + id],
            KanjiCanvas["h_" + id],
        );
        for (
            var i = 0;
            i < KanjiCanvas["recordedPattern_" + id].length - 1;
            i++
        ) {
            var stroke_i = KanjiCanvas["recordedPattern_" + id][i];
            for (var j = 0; j < stroke_i.length - 1; j++) {
                KanjiCanvas["prevX_" + id] = stroke_i[j][0];
                KanjiCanvas["prevY_" + id] = stroke_i[j][1];

                KanjiCanvas["currX_" + id] = stroke_i[j + 1][0];
                KanjiCanvas["currY_" + id] = stroke_i[j + 1][1];
                KanjiCanvas.draw(id);
            }
        }
        KanjiCanvas["recordedPattern_" + id].pop();
    };

    KanjiCanvas.erase = function (id) {
        KanjiCanvas["ctx_" + id].clearRect(
            0,
            0,
            KanjiCanvas["w_" + id],
            KanjiCanvas["h_" + id],
        );
        KanjiCanvas["recordedPattern_" + id].length = 0;
    };

    KanjiCanvas.findxy = function (res, e, id) {
        var touch = e.changedTouches ? e.changedTouches[0] : null;

        if (touch) e.preventDefault(); // prevent scrolling while drawing to the canvas

        if (res == "down") {
            var rect = KanjiCanvas["canvas_" + id].getBoundingClientRect();
            KanjiCanvas["prevX_" + id] = KanjiCanvas["currX_" + id];
            KanjiCanvas["prevY_" + id] = KanjiCanvas["currY_" + id];
            KanjiCanvas["currX_" + id] =
                (touch ? touch.clientX : e.clientX) - rect.left;
            KanjiCanvas["currY_" + id] =
                (touch ? touch.clientY : e.clientY) - rect.top;
            KanjiCanvas["currentLine_" + id] = new Array();
            KanjiCanvas["currentLine_" + id].push([
                KanjiCanvas["currX_" + id],
                KanjiCanvas["currY_" + id],
            ]);

            KanjiCanvas["flagDown_" + id] = true;
            KanjiCanvas["flagOver_" + id] = true;
            KanjiCanvas["dot_flag_" + id] = true;
            if (KanjiCanvas["dot_flag_" + id]) {
                KanjiCanvas["ctx_" + id].beginPath();
                KanjiCanvas["ctx_" + id].fillRect(
                    KanjiCanvas["currX_" + id],
                    KanjiCanvas["currY_" + id],
                    2,
                    2,
                );
                KanjiCanvas["ctx_" + id].closePath();
                KanjiCanvas["dot_flag_" + id] = false;
            }
        }
        if (res == "up") {
            KanjiCanvas["flagDown_" + id] = false;
            if (KanjiCanvas["flagOver_" + id] == true) {
                KanjiCanvas["recordedPattern_" + id].push(
                    KanjiCanvas["currentLine_" + id],
                );
            }
        }

        if (res == "out") {
            KanjiCanvas["flagOver_" + id] = false;
            if (KanjiCanvas["flagDown_" + id] == true) {
                KanjiCanvas["recordedPattern_" + id].push(
                    KanjiCanvas["currentLine_" + id],
                );
            }
            KanjiCanvas["flagDown_" + id] = false;
        }

        /*
	if (res == "over") {
    }
	*/

        if (res == "move") {
            if (
                KanjiCanvas["flagOver_" + id] &&
                KanjiCanvas["flagDown_" + id]
            ) {
                var rect = KanjiCanvas["canvas_" + id].getBoundingClientRect();
                KanjiCanvas["prevX_" + id] = KanjiCanvas["currX_" + id];
                KanjiCanvas["prevY_" + id] = KanjiCanvas["currY_" + id];
                KanjiCanvas["currX_" + id] =
                    (touch ? touch.clientX : e.clientX) - rect.left;
                KanjiCanvas["currY_" + id] =
                    (touch ? touch.clientY : e.clientY) - rect.top;
                KanjiCanvas["currentLine_" + id].push([
                    KanjiCanvas["prevX_" + id],
                    KanjiCanvas["prevY_" + id],
                ]);
                KanjiCanvas["currentLine_" + id].push([
                    KanjiCanvas["currX_" + id],
                    KanjiCanvas["currY_" + id],
                ]);
                KanjiCanvas.draw(id);
            }
        }
    };

    // redraw to current canvas according to
    // what is currently stored in KanjiCanvas["recordedPattern_" + id]
    // add numbers to each stroke
    KanjiCanvas.redraw = function (id) {
        KanjiCanvas["ctx_" + id].clearRect(
            0,
            0,
            KanjiCanvas["w_" + id],
            KanjiCanvas["h_" + id],
        );

        // draw strokes
        for (var i = 0; i < KanjiCanvas["recordedPattern_" + id].length; i++) {
            var stroke_i = KanjiCanvas["recordedPattern_" + id][i];

            for (var j = 0; j < stroke_i.length - 1; j++) {
                KanjiCanvas["prevX_" + id] = stroke_i[j][0];
                KanjiCanvas["prevY_" + id] = stroke_i[j][1];

                KanjiCanvas["currX_" + id] = stroke_i[j + 1][0];
                KanjiCanvas["currY_" + id] = stroke_i[j + 1][1];
                KanjiCanvas.draw(id, KanjiCanvas.strokeColors[i]);
            }
        }

        // draw stroke numbers
        // if (KanjiCanvas["canvas_" + id].dataset.strokeNumbers != 'false') {
        //   for(var i = 0;i<KanjiCanvas["recordedPattern_" + id].length;i++) {
        //     var stroke_i = KanjiCanvas["recordedPattern_" + id][i],
        //         x = stroke_i[Math.floor(stroke_i.length/2)][0] + 5,
        //         y = stroke_i[Math.floor(stroke_i.length/2)][1] - 5;

        //     KanjiCanvas["ctx_" + id].font = "20px Arial";

        //     // outline
        //     KanjiCanvas["ctx_" + id].lineWidth = 3;
        //     KanjiCanvas["ctx_" + id].strokeStyle = KanjiCanvas.alterHex(KanjiCanvas.strokeColors[i] ? KanjiCanvas.strokeColors[i] : "#333333", 60, 'dec');
        //     KanjiCanvas["ctx_" + id].strokeText((i + 1).toString(), x, y);

        //     // fill
        //     KanjiCanvas["ctx_" + id].fillStyle = KanjiCanvas.strokeColors[i] ? KanjiCanvas.strokeColors[i] : "#333";
        //     KanjiCanvas["ctx_" + id].fillText((i + 1).toString(), x, y);
        //   }
        // }
    };

    // modifies hex colors to darken or lighten them
    // ex: KanjiCanvas.alterHex(KanjiCanvas.strokeColors[0], 60, 'dec'); // decrement all colors by 60 (use 'inc' to increment)
    KanjiCanvas.alterHex = function (hex, number, action) {
        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex),
            color = [
                parseInt(result[1], 16),
                parseInt(result[2], 16),
                parseInt(result[3], 16),
            ],
            i = 0,
            j = color.length;

        for (; i < j; i++) {
            switch (action) {
                case "inc":
                    color[i] = (
                        color[i] + number > 255 ? 255 : color[i] + number
                    ).toString(16);
                    break;

                case "dec":
                    color[i] = (
                        color[i] - number < 0 ? 0 : color[i] - number
                    ).toString(16);
                    break;

                default:
                    break;
            }

            // add trailing 0
            if (color[i].length == 1) color[i] = color[i] + "0";
        }

        return "#" + color.join("");
    };

    // linear normalization for KanjiCanvas["recordedPattern_" + id]
    KanjiCanvas.normalizeLinear = function (id) {
        var normalizedPattern = new Array();
        KanjiCanvas.newHeight = 256;
        KanjiCanvas.newWidth = 256;
        KanjiCanvas.xMin = 256;
        KanjiCanvas.xMax = 0;
        KanjiCanvas.yMin = 256;
        KanjiCanvas.yMax = 0;
        // first determine drawn character width / length
        for (var i = 0; i < KanjiCanvas["recordedPattern_" + id].length; i++) {
            var stroke_i = KanjiCanvas["recordedPattern_" + id][i];
            for (var j = 0; j < stroke_i.length; j++) {
                KanjiCanvas.x = stroke_i[j][0];
                KanjiCanvas.y = stroke_i[j][1];
                if (KanjiCanvas.x < KanjiCanvas.xMin) {
                    KanjiCanvas.xMin = KanjiCanvas.x;
                }
                if (KanjiCanvas.x > KanjiCanvas.xMax) {
                    KanjiCanvas.xMax = KanjiCanvas.x;
                }
                if (KanjiCanvas.y < KanjiCanvas.yMin) {
                    KanjiCanvas.yMin = KanjiCanvas.y;
                }
                if (KanjiCanvas.y > KanjiCanvas.yMax) {
                    KanjiCanvas.yMax = KanjiCanvas.y;
                }
            }
        }
        KanjiCanvas.oldHeight = Math.abs(KanjiCanvas.yMax - KanjiCanvas.yMin);
        KanjiCanvas.oldWidth = Math.abs(KanjiCanvas.xMax - KanjiCanvas.xMin);

        for (var i = 0; i < KanjiCanvas["recordedPattern_" + id].length; i++) {
            var stroke_i = KanjiCanvas["recordedPattern_" + id][i];
            var normalized_stroke_i = new Array();
            for (var j = 0; j < stroke_i.length; j++) {
                KanjiCanvas.x = stroke_i[j][0];
                KanjiCanvas.y = stroke_i[j][1];
                KanjiCanvas.xNorm =
                    (KanjiCanvas.x - KanjiCanvas.xMin) *
                    (KanjiCanvas.newWidth / KanjiCanvas.oldWidth);
                KanjiCanvas.yNorm =
                    (KanjiCanvas.y - KanjiCanvas.yMin) *
                    (KanjiCanvas.newHeight / KanjiCanvas.oldHeight);
                normalized_stroke_i.push([
                    KanjiCanvas.xNorm,
                    KanjiCanvas.yNorm,
                ]);
            }
            normalizedPattern.push(normalized_stroke_i);
        }
        KanjiCanvas["recordedPattern_" + id] = normalizedPattern;
        KanjiCanvas.redraw(id);
    };

    // helper functions for moment normalization

    KanjiCanvas.m10 = function (pattern) {
        var sum = 0;
        for (var i = 0; i < pattern.length; i++) {
            var stroke_i = pattern[i];
            for (var j = 0; j < stroke_i.length; j++) {
                sum += stroke_i[j][0];
            }
        }
        return sum;
    };

    KanjiCanvas.m01 = function (pattern) {
        var sum = 0;
        for (var i = 0; i < pattern.length; i++) {
            var stroke_i = pattern[i];
            for (var j = 0; j < stroke_i.length; j++) {
                sum += stroke_i[j][1];
            }
        }
        return sum;
    };

    KanjiCanvas.m00 = function (pattern) {
        var sum = 0;
        for (var i = 0; i < pattern.length; i++) {
            var stroke_i = pattern[i];
            sum += stroke_i.length;
        }
        return sum;
    };

    KanjiCanvas.mu20 = function (pattern, xc) {
        var sum = 0;
        for (var i = 0; i < pattern.length; i++) {
            var stroke_i = pattern[i];
            for (var j = 0; j < stroke_i.length; j++) {
                var diff = stroke_i[j][0] - xc;
                sum += diff * diff;
            }
        }
        return sum;
    };

    KanjiCanvas.mu02 = function (pattern, yc) {
        var sum = 0;
        for (var i = 0; i < pattern.length; i++) {
            var stroke_i = pattern[i];
            for (var j = 0; j < stroke_i.length; j++) {
                var diff = stroke_i[j][1] - yc;
                sum += diff * diff;
            }
        }
        return sum;
    };

    KanjiCanvas.aran = function (width, height) {
        var r1 = 0;
        if (height > width) {
            r1 = width / height;
        } else {
            r1 = height / width;
        }

        var a = Math.PI / 2;
        var b = a * r1;
        var b1 = Math.sin(b);
        var c = Math.sqrt(b1);
        var d = c;

        var r2 = Math.sqrt(Math.sin((Math.PI / 2) * r1));
        return r2;
    };

    KanjiCanvas.chopOverbounds = function (pattern) {
        var chopped = new Array();
        for (var i = 0; i < pattern.length; i++) {
            var stroke_i = pattern[i];
            var c_stroke_i = new Array();
            for (var j = 0; j < stroke_i.length; j++) {
                var x = stroke_i[j][0];
                var y = stroke_i[j][1];
                if (x < 0) {
                    x = 0;
                }
                if (x >= 256) {
                    x = 255;
                }
                if (y < 0) {
                    y = 0;
                }
                if (y >= 256) {
                    y = 255;
                }
                c_stroke_i.push([x, y]);
            }
            chopped.push(c_stroke_i);
        }
        return chopped;
    };

    KanjiCanvas.transform = function (pattern, x_, y_) {
        var pt = new Array();
        for (var i = 0; i < pattern.length; i++) {
            var stroke_i = pattern[i];
            var c_stroke_i = new Array();
            for (var j = 0; j < stroke_i.length; j++) {
                var x = stroke_i[j][0] + x_;
                var y = stroke_i[j][1] + y_;
                c_stroke_i.push([x, y]);
            }
            pt.push(c_stroke_i);
        }
        return pt;
    };

    // main function for moment normalization
    KanjiCanvas.momentNormalize = function (id) {
        KanjiCanvas.newHeight = 256;
        KanjiCanvas.newWidth = 256;
        KanjiCanvas.xMin = 256;
        KanjiCanvas.xMax = 0;
        KanjiCanvas.yMin = 256;
        KanjiCanvas.yMax = 0;
        // first determine drawn character width / length
        for (var i = 0; i < KanjiCanvas["recordedPattern_" + id].length; i++) {
            var stroke_i = KanjiCanvas["recordedPattern_" + id][i];
            for (var j = 0; j < stroke_i.length; j++) {
                KanjiCanvas.x = stroke_i[j][0];
                KanjiCanvas.y = stroke_i[j][1];
                if (KanjiCanvas.x < KanjiCanvas.xMin) {
                    KanjiCanvas.xMin = KanjiCanvas.x;
                }
                if (KanjiCanvas.x > KanjiCanvas.xMax) {
                    KanjiCanvas.xMax = KanjiCanvas.x;
                }
                if (KanjiCanvas.y < KanjiCanvas.yMin) {
                    KanjiCanvas.yMin = KanjiCanvas.y;
                }
                if (KanjiCanvas.y > KanjiCanvas.yMax) {
                    KanjiCanvas.yMax = KanjiCanvas.y;
                }
            }
        }
        KanjiCanvas.oldHeight = Math.abs(KanjiCanvas.yMax - KanjiCanvas.yMin);
        KanjiCanvas.oldWidth = Math.abs(KanjiCanvas.xMax - KanjiCanvas.xMin);

        var r2 = KanjiCanvas.aran(KanjiCanvas.oldWidth, KanjiCanvas.oldHeight);

        var aranWidth = KanjiCanvas.newWidth;
        var aranHeight = KanjiCanvas.newHeight;

        if (KanjiCanvas.oldHeight > KanjiCanvas.oldWidth) {
            aranWidth = r2 * KanjiCanvas.newWidth;
        } else {
            aranHeight = r2 * KanjiCanvas.newHeight;
        }

        var xOffset = (KanjiCanvas.newWidth - aranWidth) / 2;
        var yOffset = (KanjiCanvas.newHeight - aranHeight) / 2;

        var m00_ = KanjiCanvas.m00(KanjiCanvas["recordedPattern_" + id]);
        var m01_ = KanjiCanvas.m01(KanjiCanvas["recordedPattern_" + id]);
        var m10_ = KanjiCanvas.m10(KanjiCanvas["recordedPattern_" + id]);

        var xc_ = m10_ / m00_;
        var yc_ = m01_ / m00_;

        var xc_half = aranWidth / 2;
        var yc_half = aranHeight / 2;

        var mu20_ = KanjiCanvas.mu20(KanjiCanvas["recordedPattern_" + id], xc_);
        var mu02_ = KanjiCanvas.mu02(KanjiCanvas["recordedPattern_" + id], yc_);

        var alpha = aranWidth / (4 * Math.sqrt(mu20_ / m00_)) || 0;
        var beta = aranHeight / (4 * Math.sqrt(mu02_ / m00_)) || 0;

        var nf = new Array();
        for (var i = 0; i < KanjiCanvas["recordedPattern_" + id].length; i++) {
            var si = KanjiCanvas["recordedPattern_" + id][i];
            var nsi = new Array();
            for (var j = 0; j < si.length; j++) {
                var newX = alpha * (si[j][0] - xc_) + xc_half;
                var newY = beta * (si[j][1] - yc_) + yc_half;

                nsi.push([newX, newY]);
            }
            nf.push(nsi);
        }

        return KanjiCanvas.transform(nf, xOffset, yOffset);
    };

    // distance functions
    KanjiCanvas.euclid = function (x1y1, x2y2) {
        var a = x1y1[0] - x2y2[0];
        var b = x1y1[1] - x2y2[1];
        var c = Math.sqrt(a * a + b * b);
        return c;
    };

    // extract points in regular intervals
    KanjiCanvas.extractFeatures = function (kanji, interval) {
        var extractedPattern = new Array();
        var nrStrokes = kanji.length;
        for (var i = 0; i < nrStrokes; i++) {
            var stroke_i = kanji[i];
            var extractedStroke_i = new Array();
            var dist = 0.0;
            var j = 0;
            while (j < stroke_i.length) {
                // always add first point
                if (j == 0) {
                    var x1y1 = stroke_i[0];
                    extractedStroke_i.push(x1y1);
                }
                if (j > 0) {
                    var x1y1 = stroke_i[j - 1];
                    var x2y2 = stroke_i[j];
                    dist += KanjiCanvas.euclid(x1y1, x2y2);
                }
                if (dist >= interval && j > 1) {
                    dist = dist - interval;
                    var x1y1 = stroke_i[j];
                    extractedStroke_i.push(x1y1);
                }
                j++;
            }
            // if we so far have only one point, always add last point
            if (extractedStroke_i.length == 1) {
                var x1y1 = stroke_i[stroke_i.length - 1];
                extractedStroke_i.push(x1y1);
            } else {
                if (dist > 0.75 * interval) {
                    var x1y1 = stroke_i[stroke_i.length - 1];
                    extractedStroke_i.push(x1y1);
                }
            }
            extractedPattern.push(extractedStroke_i);
        }
        return extractedPattern;
    };

    KanjiCanvas.endPointDistance = function (pattern1, pattern2) {
        var dist = 0;
        var l1 = typeof pattern1 == "undefined" ? 0 : pattern1.length;
        var l2 = typeof pattern2 == "undefined" ? 0 : pattern2.length;
        if (l1 == 0 || l2 == 0) {
            return 0;
        } else {
            var x1y1 = pattern1[0];
            var x2y2 = pattern2[0];
            dist += Math.abs(x1y1[0] - x2y2[0]) + Math.abs(x1y1[1] - x2y2[1]);
            x1y1 = pattern1[l1 - 1];
            x2y2 = pattern2[l2 - 1];
            dist += Math.abs(x1y1[0] - x2y2[0]) + Math.abs(x1y1[1] - x2y2[1]);
        }
        return dist;
    };

    KanjiCanvas.initialDistance = function (pattern1, pattern2) {
        var l1 = pattern1.length;
        var l2 = pattern2.length;
        var lmin = Math.min(l1, l2);
        var lmax = Math.max(l1, l2);
        var dist = 0;
        for (var i = 0; i < lmin; i++) {
            var x1y1 = pattern1[i];
            var x2y2 = pattern2[i];
            dist += Math.abs(x1y1[0] - x2y2[0]) + Math.abs(x1y1[1] - x2y2[1]);
        }
        return dist * (lmax / lmin);
    };

    // given to pattern, determine longer (more strokes)
    // and return quadruple with sorted patterns and their
    // stroke numbers [k1,k2,n,m] where n >= m and
    // they denote the #of strokes of k1 and k2
    KanjiCanvas.getLargerAndSize = function (pattern1, pattern2) {
        var l1 = typeof pattern1 == "undefined" ? 0 : pattern1.length;
        var l2 = typeof pattern2 == "undefined" ? 0 : pattern2.length;
        // definitions as in paper
        // i.e. n is larger
        var n = l1;
        var m = l2;
        var k1 = pattern1;
        var k2 = pattern2;
        if (l1 < l2) {
            m = l1;
            n = l2;
            k1 = pattern2;
            k2 = pattern1;
        }
        return [k1, k2, n, m];
    };

    KanjiCanvas.wholeWholeDistance = function (pattern1, pattern2) {
        // [k1, k2, n, m]
        // a[0], a[1], a[2], a[3]
        var a = KanjiCanvas.getLargerAndSize(pattern1, pattern2);
        var dist = 0;
        for (var i = 0; i < a[3]; i++) {
            KanjiCanvas.j_of_i = parseInt(parseInt(a[2] / a[3]) * i);
            var x1y1 = a[0][KanjiCanvas.j_of_i];
            var x2y2 = a[1][i];
            dist += Math.abs(x1y1[0] - x2y2[0]) + Math.abs(x1y1[1] - x2y2[1]);
        }
        return parseInt(dist / a[3]);
    };

    // initialize N-stroke map by greedy initialization
    KanjiCanvas.initStrokeMap = function (pattern1, pattern2, distanceMetric) {
        // [k1, k2, n, m]
        // a[0], a[1], a[2], a[3]
        var a = KanjiCanvas.getLargerAndSize(pattern1, pattern2);
        // larger is now k1 with length n
        var map = new Array();
        for (var i = 0; i < a[2]; i++) {
            map[i] = -1;
        }
        var free = new Array();
        for (var i = 0; i < a[2]; i++) {
            free[i] = true;
        }
        for (var i = 0; i < a[3]; i++) {
            KanjiCanvas.minDist = 10000000;
            KanjiCanvas.min_j = -1;
            for (var j = 0; j < a[2]; j++) {
                if (free[j] == true) {
                    var d = distanceMetric(a[0][j], a[1][i]);
                    if (d < KanjiCanvas.minDist) {
                        KanjiCanvas.minDist = d;
                        KanjiCanvas.min_j = j;
                    }
                }
            }
            free[KanjiCanvas.min_j] = false;
            map[KanjiCanvas.min_j] = i;
        }
        return map;
    };

    // get best N-stroke map by iterative improvement
    KanjiCanvas.getMap = function (pattern1, pattern2, distanceMetric) {
        // [k1, k2, n, m]
        // a[0], a[1], a[2], a[3]
        var a = KanjiCanvas.getLargerAndSize(pattern1, pattern2);
        // larger is now k1 with length n
        var L = 3;
        var map = KanjiCanvas.initStrokeMap(a[0], a[1], distanceMetric);
        for (var l = 0; l < L; l++) {
            for (var i = 0; i < map.length; i++) {
                if (map[i] != -1) {
                    KanjiCanvas.dii = distanceMetric(a[0][i], a[1][map[i]]);
                    for (var j = 0; j < map.length; j++) {
                        // we need to check again, since
                        // manipulation of map[i] can occur within
                        // the j-loop
                        if (map[i] != -1) {
                            if (map[j] != -1) {
                                var djj = distanceMetric(a[0][j], a[1][map[j]]);
                                var dij = distanceMetric(a[0][j], a[1][map[i]]);
                                var dji = distanceMetric(a[0][i], a[1][map[j]]);
                                if (dji + dij < KanjiCanvas.dii + djj) {
                                    var mapj = map[j];
                                    map[j] = map[i];
                                    map[i] = mapj;
                                    KanjiCanvas.dii = dij;
                                }
                            } else {
                                var dij = distanceMetric(a[0][j], a[1][map[i]]);
                                if (dij < KanjiCanvas.dii) {
                                    map[j] = map[i];
                                    map[i] = -1;
                                    KanjiCanvas.dii = dij;
                                }
                            }
                        }
                    }
                }
            }
        }
        return map;
    };

    // from optimal N-stroke map create M-N stroke map
    KanjiCanvas.completeMap = function (
        pattern1,
        pattern2,
        distanceMetric,
        map,
    ) {
        // [k1, k2, _, _]
        // a[0], a[1], a[2], a[3]
        var a = KanjiCanvas.getLargerAndSize(pattern1, pattern2);
        if (!map.includes(-1)) {
            return map;
        }
        // complete at the end
        var lastUnassigned = map[map.length];
        var mapLastTo = -1;
        for (var i = map.length - 1; i >= 0; i--) {
            if (map[i] == -1) {
                lastUnassigned = i;
            } else {
                mapLastTo = map[i];
                break;
            }
        }
        for (var i = lastUnassigned; i < map.length; i++) {
            map[i] = mapLastTo;
        }
        // complete at the beginning
        var firstUnassigned = -1;
        var mapFirstTo = -1;
        for (var i = 0; i < map.length; i++) {
            if (map[i] == -1) {
                firstUnassigned = i;
            } else {
                mapFirstTo = map[i];
                break;
            }
        }
        for (var i = 0; i <= firstUnassigned; i++) {
            map[i] = mapFirstTo;
        }
        // for the remaining unassigned, check
        // where to "split"
        for (var i = 0; i < map.length; i++) {
            if (i + 1 < map.length && map[i + 1] == -1) {
                // we have a situation like this:
                //   i       i+1   i+2   ...  i+n
                //   start   -1    ?     -1   stop
                var start = i;

                var stop = i + 1;
                while (stop < map.length && map[stop] == -1) {
                    stop++;
                }

                var div = start;
                var max_dist = 1000000;
                for (var j = start; j < stop; j++) {
                    var stroke_ab = a[0][start];
                    // iteration of concat, possibly slow
                    // due to memory allocations; optimize?!
                    for (var temp = start + 1; temp <= j; temp++) {
                        stroke_ab = stroke_ab.concat(a[0][temp]);
                    }
                    var stroke_bc = a[0][j + 1];

                    for (var temp = j + 2; temp <= stop; temp++) {
                        stroke_bc = stroke_bc.concat(a[0][temp]);
                    }

                    var d_ab = distanceMetric(stroke_ab, a[1][map[start]]);
                    var d_bc = distanceMetric(stroke_bc, a[1][map[stop]]);
                    if (d_ab + d_bc < max_dist) {
                        div = j;
                        max_dist = d_ab + d_bc;
                    }
                }
                for (var j = start; j <= div; j++) {
                    map[j] = map[start];
                }
                for (var j = div + 1; j < stop; j++) {
                    map[j] = map[stop];
                }
            }
        }
        return map;
    };

    // given two patterns, M-N stroke map and distanceMetric function,
    // compute overall distance between two patterns
    KanjiCanvas.computeDistance = function (
        pattern1,
        pattern2,
        distanceMetric,
        map,
    ) {
        // [k1, k2, n, m]
        // a[0], a[1], a[2], a[3]
        var a = KanjiCanvas.getLargerAndSize(pattern1, pattern2);
        var dist = 0.0;
        var idx = 0;
        while (idx < a[2]) {
            var stroke_idx = a[1][map[idx]];
            var start = idx;
            var stop = start + 1;
            while (stop < map.length && map[stop] == map[idx]) {
                stop++;
            }
            var stroke_concat = a[0][start];
            for (var temp = start + 1; temp < stop; temp++) {
                stroke_concat = stroke_concat.concat(a[0][temp]);
            }
            dist += distanceMetric(stroke_idx, stroke_concat);
            idx = stop;
        }
        return dist;
    };

    // given two patterns, M-N strokemap, compute weighted (respect stroke
    // length when there are concatenated strokes using the wholeWhole distance
    KanjiCanvas.computeWholeDistanceWeighted = function (
        pattern1,
        pattern2,
        map,
    ) {
        // [k1, k2, n, m]
        // a[0], a[1], a[2], a[3]
        var a = KanjiCanvas.getLargerAndSize(pattern1, pattern2);
        var dist = 0.0;
        var idx = 0;
        while (idx < a[2]) {
            var stroke_idx = a[1][map[idx]];
            var start = idx;
            var stop = start + 1;
            while (stop < map.length && map[stop] == map[idx]) {
                stop++;
            }
            var stroke_concat = a[0][start];
            for (var temp = start + 1; temp < stop; temp++) {
                stroke_concat = stroke_concat.concat(a[0][temp]);
            }

            var dist_idx = KanjiCanvas.wholeWholeDistance(
                stroke_idx,
                stroke_concat,
            );
            if (stop > start + 1) {
                // concatenated stroke, adjust weight
                var mm =
                    typeof stroke_idx == "undefined" ? 0 : stroke_idx.length;
                var nn = stroke_concat.length;
                if (nn < mm) {
                    var temp = nn;
                    nn = mm;
                    mm = temp;
                }
                dist_idx = dist_idx * (nn / mm);
            }
            dist += dist_idx;
            idx = stop;
        }
        return dist;
    };

    // apply coarse classficiation w.r.t. inputPattern
    // considering _all_ referencePatterns using endpoint distance
    KanjiCanvas.coarseClassification = function (inputPattern) {
        var inputLength = inputPattern.length;
        var candidates = [];
        for (var i = 0; i < KanjiCanvas.refPatterns.length; i++) {
            var iLength = KanjiCanvas.refPatterns[i][1];
            if (inputLength < iLength + 2 && inputLength > iLength - 3) {
                var iPattern = KanjiCanvas.refPatterns[i][2];
                var iMap = KanjiCanvas.getMap(
                    iPattern,
                    inputPattern,
                    KanjiCanvas.endPointDistance,
                );
                iMap = KanjiCanvas.completeMap(
                    iPattern,
                    inputPattern,
                    KanjiCanvas.endPointDistance,
                    iMap,
                );
                var dist = KanjiCanvas.computeDistance(
                    iPattern,
                    inputPattern,
                    KanjiCanvas.endPointDistance,
                    iMap,
                );
                var m = iLength;
                var n = iPattern.length;
                if (n < m) {
                    var temp = n;
                    n = m;
                    m = temp;
                }
                candidates.push([i, dist * (m / n)]);
            }
        }
        candidates.sort(function (a, b) {
            return a[1] - b[1];
        });

        return candidates;
    };

    // fine classfication. returns best 100 matches for inputPattern
    // and candidate list (which should be provided by coarse classification
    KanjiCanvas.fineClassification = function (inputPattern, inputCandidates) {
        var inputLength = inputPattern.length;
        var candidates = [];
        for (var i = 0; i < Math.min(inputCandidates.length, 100); i++) {
            var j = inputCandidates[i][0];
            var iLength = KanjiCanvas.refPatterns[j][1];
            var iPattern = KanjiCanvas.refPatterns[j][2];
            if (inputLength < iLength + 2 && inputLength > iLength - 3) {
                var iMap = KanjiCanvas.getMap(
                    iPattern,
                    inputPattern,
                    KanjiCanvas.initialDistance,
                );

                iMap = KanjiCanvas.completeMap(
                    iPattern,
                    inputPattern,
                    KanjiCanvas.wholeWholeDistance,
                    iMap,
                );
                if (KanjiCanvas.refPatterns[j][0] == "委") {
                    console.log("finished imap, fine:");
                    console.log(iMap);
                    console.log("weight:");
                    console.log(
                        KanjiCanvas.computeDistance(
                            iPattern,
                            inputPattern,
                            KanjiCanvas.wholeWholeDistance,
                            iMap,
                        ),
                    );
                    console.log("weight intended:");
                    console.log(
                        KanjiCanvas.computeDistance(
                            iPattern,
                            inputPattern,
                            KanjiCanvas.wholeWholeDistance,
                            [0, 1, 2, 3, 4, 7, 5, 6],
                        ),
                    );
                }
                var dist = KanjiCanvas.computeWholeDistanceWeighted(
                    iPattern,
                    inputPattern,
                    iMap,
                );
                var n = inputLength;
                var m = iPattern.length;
                if (m > n) {
                    m = n;
                }
                dist = dist / m;
                candidates.push([j, dist]);
            }
        }
        candidates.sort(function (a, b) {
            return a[1] - b[1];
        });
        var outStr = "";
        for (var i = 0; i < Math.min(candidates.length, 10); i++) {
            if (
                KanjiCanvas.isJoyoKanji(
                    KanjiCanvas.refPatterns[candidates[i][0]][0],
                )
            ) {
                outStr +=
                    "<span class='candidate joyo'>" +
                    KanjiCanvas.refPatterns[candidates[i][0]][0] +
                    "</span>";
            } else {
                outStr +=
                    "<span class='candidate'>" +
                    KanjiCanvas.refPatterns[candidates[i][0]][0] +
                    "</span>";
            }
        }

        return outStr;
    };

    KanjiCanvas.isJoyoKanji = function (char) {
        // Ensure the input is a single character
        if (typeof char !== "string" || char.length !== 1) {
            return false;
        }

        // Set containing all 2,136 official Joyo Kanji
        const joyoSet = new Set([
            "一",
            "二",
            "三",
            "四",
            "五",
            "六",
            "七",
            "八",
            "九",
            "十",
            "百",
            "千",
            "万",
            "円",
            "人",
            "日",
            "月",
            "火",
            "水",
            "木",
            "金",
            "土",
            "曜",
            "年",
            "時",
            "分",
            "今",
            "午",
            "前",
            "後",
            "上",
            "下",
            "中",
            "横",
            "右",
            "左",
            "本",
            "机",
            "東",
            "西",
            "南",
            "北",
            "方",
            "白",
            "黒",
            "赤",
            "青",
            "先",
            "生",
            "学",
            "校",
            "家",
            "部",
            "屋",
            "店",
            "駅",
            "銀",
            "行",
            "会",
            "社",
            "電",
            "車",
            "自",
            "動",
            "転",
            "道",
            "男",
            "女",
            "子",
            "主",
            "奥",
            "私",
            "父",
            "母",
            "兄",
            "弟",
            "姉",
            "妹",
            "友",
            "何",
            "誰",
            "名",
            "高",
            "安",
            "新",
            "古",
            "大",
            "小",
            "長",
            "短",
            "朝",
            "昼",
            "夜",
            "晩",
            "夕",
            "春",
            "夏",
            "秋",
            "冬",
            "山",
            "川",
            "石",
            "田",
            "多",
            "少",
            "明",
            "暗",
            "低",
            "近",
            "遠",
            "強",
            "弱",
            "広",
            "悪",
            "重",
            "軽",
            "早",
            "遅",
            "暑",
            "寒",
            "深",
            "浅",
            "細",
            "太",
            "若",
            "忙",
            "寝",
            "起",
            "始",
            "終",
            "食",
            "飲",
            "来",
            "帰",
            "乗",
            "降",
            "作",
            "休",
            "見",
            "勉",
            "住",
            "持",
            "知",
            "酒",
            "茶",
            "地",
            "鉄",
            "者",
            "所",
            "外",
            "国",
            "内",
            "旅",
            "語",
            "英",
            "世",
            "界",
            "倍",
            "半",
            "全",
            "間",
            "回",
            "週",
            "毎",
            "体",
            "頭",
            "口",
            "目",
            "耳",
            "手",
            "足",
            "心",
            "力",
            "立",
            "座",
            "歩",
            "走",
            "話",
            "聞",
            "読",
            "書",
            "借",
            "貸",
            "返",
            "出",
            "入",
            "売",
            "買",
            "払",
            "着",
            "脱",
            "働",
            "泳",
            "写",
            "待",
            "遊",
            "呼",
            "洗",
            "使",
            "歌",
            "習",
            "思",
            "言",
            "通",
            "渡",
            "送",
            "泊",
            "覚",
            "忘",
            "調",
            "続",
            "考",
            "答",
            "教",
            "開",
            "閉",
            "止",
            "焼",
            "消",
            "直",
            "並",
            "変",
            "残",
            "集",
            "倒",
            "郵",
            "便",
            "局",
            "病",
            "院",
            "窓",
            "雨",
            "京",
            "映",
            "画",
            "仕",
            "事",
            "質",
            "問",
            "料",
            "理",
            "真",
            "紙",
            "好",
            "元",
            "気",
            "静",
            "利",
            "親",
            "切",
            "笑",
            "泣",
            "喜",
            "困",
            "怒",
            "押",
            "引",
            "死",
            "吹",
            "急",
            "咲",
            "置",
            "勝",
            "選",
            "飛",
            "踏",
            "進",
            "盗",
            "受",
            "取",
            "合",
            "吸",
            "拾",
            "誘",
            "疲",
            "比",
            "決",
            "伝",
            "流",
            "落",
            "晴",
            "投",
            "逃",
            "過",
            "捨",
            "発",
            "到",
            "計",
            "定",
            "注",
            "意",
            "説",
            "解",
            "参",
            "加",
            "練",
            "研",
            "究",
            "連",
            "絡",
            "濯",
            "結",
            "婚",
            "運",
            "案",
            "卒",
            "業",
            "用",
            "去",
            "趣",
            "味",
            "授",
            "橋",
            "花",
            "薬",
            "色",
            "服",
            "客",
            "犬",
            "文",
            "物",
            "族",
            "公",
            "園",
            "医",
            "宿",
            "題",
            "寺",
            "図",
            "館",
            "室",
            "席",
            "度",
            "機",
            "場",
            "県",
            "府",
            "都",
            "暖",
            "涼",
            "悲",
            "苦",
            "楽",
            "辛",
            "甘",
            "痛",
            "有",
            "退",
            "屈",
            "同",
            "平",
            "和",
            "等",
            "第",
            "筆",
            "算",
            "符",
            "簡",
            "単",
            "戦",
            "争",
            "反",
            "対",
            "村",
            "付",
            "団",
            "寸",
            "支",
            "技",
            "術",
            "街",
            "封",
            "筒",
            "竹",
            "替",
            "賛",
            "成",
            "功",
            "工",
            "的",
            "約",
            "束",
            "速",
            "達",
            "違",
            "逆",
            "整",
            "務",
            "省",
            "談",
            "相",
            "想",
            "首",
            "身",
            "員",
            "損",
            "別",
            "特",
            "点",
            "無",
            "然",
            "当",
            "予",
            "野",
            "原",
            "因",
            "正",
            "幾",
            "糸",
            "級",
            "能",
            "可",
            "代",
            "化",
            "他",
            "仏",
            "位",
            "供",
            "共",
            "以",
            "性",
            "不",
            "必",
            "要",
            "価",
            "値",
            "普",
            "昔",
            "増",
            "減",
            "感",
            "留",
            "貿",
            "易",
            "量",
            "裏",
            "表",
            "面",
            "最",
            "初",
            "刀",
            "号",
            "労",
            "協",
            "門",
            "関",
            "係",
            "孫",
            "系",
            "懸",
            "態",
            "池",
            "湖",
            "海",
            "島",
            "岸",
            "岩",
            "谷",
            "林",
            "森",
            "空",
            "天",
            "星",
            "光",
            "風",
            "虫",
            "凡",
            "冗",
            "個",
            "固",
            "豆",
            "登",
            "祭",
            "際",
            "察",
            "警",
            "驚",
            "敬",
            "尊",
            "導",
            "停",
            "件",
            "牛",
            "馬",
            "魚",
            "鳥",
            "鳴",
            "羊",
            "群",
            "毛",
            "羽",
            "翌",
            "義",
            "議",
            "講",
            "論",
            "倫",
            "輪",
            "輸",
            "較",
            "効",
            "果",
            "郊",
            "交",
            "渉",
            "干",
            "汗",
            "軒",
            "形",
            "枠",
            "械",
            "識",
            "職",
            "就",
            "経",
            "済",
            "活",
            "法",
            "律",
            "往",
            "復",
            "複",
            "雑",
            "誌",
            "勤",
            "難",
            "漢",
            "字",
            "数",
            "政",
            "治",
            "台",
            "路",
            "戸",
            "居",
            "民",
            "守",
            "宅",
            "管",
            "官",
            "庁",
            "庭",
            "床",
            "庫",
            "廊",
            "郎",
            "市",
            "区",
            "町",
            "丁",
            "番",
            "郡",
            "州",
            "欧",
            "満",
            "両",
            "向",
            "周",
            "独",
            "狭",
            "肉",
            "米",
            "類",
            "種",
            "科",
            "芸",
            "草",
            "芝",
            "葉",
            "荷",
            "預",
            "頼",
            "顔",
            "産",
            "玉",
            "宝",
            "王",
            "現",
            "皇",
            "聖",
            "望",
            "亡",
            "未",
            "末",
            "申",
            "神",
            "存",
            "在",
            "禅",
            "弾",
            "丸",
            "弓",
            "矢",
            "失",
            "夫",
            "妻",
            "婦",
            "姓",
            "嫁",
            "婿",
            "娘",
            "良",
            "飾",
            "飯",
            "坂",
            "皆",
            "階",
            "段",
            "役",
            "殺",
            "設",
            "施",
            "備",
            "準",
            "率",
            "演",
            "絵",
            "給",
            "声",
            "音",
            "昨",
            "暇",
            "由",
            "油",
            "曲",
            "農",
            "濃",
            "豊",
            "富",
            "典",
            "興",
            "己",
            "記",
            "紀",
            "組",
            "素",
            "麦",
            "責",
            "任",
            "信",
            "徒",
            "従",
            "得",
            "徳",
            "聴",
            "舟",
            "船",
            "般",
            "航",
            "億",
            "憶",
            "漫",
            "慢",
            "情",
            "慣",
            "快",
            "適",
            "敵",
            "欠",
            "次",
            "姿",
            "冷",
            "句",
            "旬",
            "保",
            "証",
            "許",
            "認",
            "課",
            "税",
            "程",
            "実",
            "美",
            "差",
            "養",
            "善",
            "様",
            "植",
            "極",
            "端",
            "需",
            "器",
            "品",
            "商",
            "袋",
            "製",
            "制",
            "誕",
            "延",
            "期",
            "基",
            "礎",
            "疑",
            "紹",
            "介",
            "招",
            "委",
            "季",
            "節",
            "即",
            "企",
            "歯",
            "歳",
            "歴",
            "史",
            "央",
            "非",
            "常",
            "堂",
            "党",
            "賞",
            "償",
            "与",
            "券",
            "巻",
            "角",
            "負",
            "敗",
            "貝",
            "具",
            "散",
            "故",
            "放",
            "敷",
            "致",
            "改",
            "配",
            "酔",
            "針",
            "録",
            "緑",
            "縁",
            "納",
            "絶",
            "総",
            "為",
            "老",
            "孝",
            "才",
            "材",
            "財",
            "貯",
            "蓄",
            "氏",
            "底",
            "抵",
            "抗",
            "接",
            "換",
            "条",
            "契",
            "喫",
            "潔",
            "清",
            "士",
            "志",
            "恩",
            "忠",
            "恐",
            "翻",
            "訳",
            "尺",
            "釈",
            "択",
            "描",
            "拝",
            "提",
            "拡",
            "抜",
            "振",
            "打",
            "折",
            "採",
            "菜",
            "指",
            "揮",
            "輝",
            "軍",
            "隊",
            "衛",
            "防",
            "坊",
            "訪",
            "妨",
            "害",
            "割",
            "憲",
            "毒",
            "危",
            "険",
            "剣",
            "検",
            "験",
            "騒",
            "試",
            "式",
            "専",
            "博",
            "薄",
            "夢",
            "葬",
            "蒸",
            "確",
            "権",
            "観",
            "視",
            "規",
            "則",
            "側",
            "測",
            "例",
            "列",
            "殊",
            "示",
            "禁",
            "宗",
            "完",
            "了",
            "承",
            "浮",
            "乳",
            "礼",
            "祈",
            "祖",
            "査",
            "助",
            "努",
            "収",
            "状",
            "将",
            "奨",
            "励",
            "陸",
            "陽",
            "傷",
            "湯",
            "混",
            "湿",
            "温",
            "泉",
            "線",
            "雪",
            "雷",
            "雲",
            "霧",
            "露",
            "震",
            "厚",
            "宴",
            "宣",
            "各",
            "格",
            "資",
            "源",
            "貴",
            "賃",
            "貨",
            "費",
            "貧",
            "乏",
            "額",
            "願",
            "塾",
            "熟",
            "勢",
            "熱",
            "昭",
            "照",
            "黙",
            "燃",
            "灯",
            "畑",
            "災",
            "灰",
            "炭",
            "鉱",
            "精",
            "請",
            "育",
            "絹",
            "綿",
            "織",
            "編",
            "縮",
            "績",
            "積",
            "布",
            "希",
            "衣",
            "依",
            "報",
            "告",
            "吉",
            "幸",
            "福",
            "祉",
            "幅",
            "副",
            "判",
            "断",
            "継",
            "繰",
            "燥",
            "乾",
            "江",
            "液",
            "汚",
            "染",
            "港",
            "湾",
            "浜",
            "沖",
            "波",
            "漁",
            "鯨",
            "鮮",
            "洋",
            "卸",
            "御",
            "缶",
            "益",
            "盛",
            "盟",
            "塩",
            "監",
            "督",
            "皿",
            "血",
            "宮",
            "営",
            "辞",
            "乱",
            "求",
            "救",
            "球",
            "儀",
            "犠",
            "牲",
            "象",
            "像",
            "免",
            "城",
            "誠",
            "詳",
            "詩",
            "討",
            "謝",
            "評",
            "誤",
            "誇",
            "訓",
            "順",
            "序",
            "秩",
            "矛",
            "盾",
            "掃",
            "除",
            "余",
            "途",
            "込",
            "辺",
            "述",
            "迫",
            "造",
            "追",
            "師",
            "桜",
            "梅",
            "松",
            "桃",
            "枝",
            "株",
            "根",
            "限",
            "眼",
            "睡",
            "眠",
            "瞬",
            "隣",
            "舞",
            "枚",
            "杯",
            "札",
            "析",
            "核",
            "板",
            "棒",
            "柄",
            "柱",
            "構",
            "再",
            "黄",
            "兵",
            "靴",
            "革",
            "命",
            "令",
            "領",
            "統",
            "補",
            "佐",
            "臣",
            "巨",
            "拒",
            "否",
            "距",
            "離",
            "推",
            "哲",
            "掲",
            "抱",
            "包",
            "均",
            "射",
            "占",
            "況",
            "祝",
            "賀",
            "競",
            "景",
            "影",
            "響",
            "郷",
            "里",
            "童",
            "章",
            "障",
            "壁",
            "卓",
            "著",
            "諸",
            "緒",
            "鏡",
            "環",
            "境",
            "破",
            "壊",
            "激",
            "攻",
            "撃",
            "襲",
            "暴",
            "爆",
            "煙",
            "犯",
            "罪",
            "逮",
            "捕",
            "担",
            "批",
            "刑",
            "健",
            "康",
            "建",
            "築",
            "策",
            "籍",
            "筋",
            "箱",
            "範",
            "囲",
            "雰",
            "井",
            "帯",
            "帝",
            "締",
            "純",
            "粋",
            "迷",
            "惑",
            "域",
            "越",
            "超",
            "赴",
            "更",
            "恵",
            "恋",
            "愛",
            "互",
            "涙",
            "房",
            "雇",
            "肩",
            "背",
            "胸",
            "腰",
            "腹",
            "豚",
            "届",
            "属",
            "展",
            "殿",
            "凍",
            "氷",
            "永",
            "久",
            "及",
            "幼",
            "稚",
            "移",
            "秘",
            "密",
            "骨",
            "胃",
            "腸",
            "肝",
            "臓",
            "脳",
            "悩",
            "蔵",
            "倉",
            "創",
            "看",
            "護",
            "弁",
            "念",
            "息",
            "応",
            "寄",
            "突",
            "穴",
            "容",
            "欲",
            "裕",
            "浴",
            "河",
            "沿",
            "沈",
            "没",
            "添",
            "歓",
            "迎",
            "仰",
            "卵",
            "印",
            "刷",
            "刊",
            "刻",
            "劇",
            "仮",
            "版",
            "片",
            "皮",
            "被",
            "彼",
            "徹",
            "徴",
            "微",
            "妙",
            "秒",
            "砂",
            "劣",
            "勇",
            "募",
            "墓",
            "幕",
            "暮",
            "漠",
            "模",
            "概",
            "既",
            "裁",
            "我",
            "武",
            "輩",
            "俳",
            "優",
            "仲",
            "促",
            "秀",
            "似",
            "傾",
            "候",
            "修",
            "偏",
            "遍",
            "遇",
            "遺",
            "貢",
            "献",
            "僚",
            "寮",
            "帳",
            "張",
            "緊",
            "繁",
            "栄",
            "挙",
            "厳",
            "派",
            "閥",
            "閣",
            "衆",
            "略",
            "異",
            "圧",
            "至",
            "票",
            "標",
            "戻",
            "丘",
            "匹",
            "司",
            "詞",
            "訂",
            "訴",
            "訟",
            "譲",
            "購",
            "廷",
            "処",
            "拠",
            "遣",
            "還",
            "逐",
            "遂",
            "墜",
            "悔",
            "慎",
            "頻",
            "項",
            "販",
            "贈",
            "賄",
            "賂",
            "賢",
            "堅",
            "臨",
            "幹",
            "稿",
            "稼",
            "稲",
            "穏",
            "隠",
            "隔",
            "融",
            "邸",
            "隅",
            "偶",
            "僕",
            "偉",
            "俗",
            "侵",
            "伺",
            "伸",
            "倣",
            "催",
            "債",
            "併",
            "圏",
            "宇",
            "宙",
            "抽",
            "拍",
            "摘",
            "握",
            "探",
            "掘",
            "堀",
            "埋",
            "排",
            "拓",
            "抑",
            "拐",
            "扱",
            "撮",
            "挑",
            "兆",
            "援",
            "緩",
            "丈",
            "牧",
            "畜",
            "充",
            "玄",
            "豪",
            "盲",
            "帽",
            "昇",
            "曇",
            "糧",
            "糖",
            "粧",
            "臭",
            "鼻",
            "憩",
            "舌",
            "君",
            "含",
            "叫",
            "奇",
            "崎",
            "峡",
            "紅",
            "繊",
            "維",
            "紛",
            "紳",
            "縦",
            "索",
            "累",
            "畳",
            "翼",
            "裸",
            "軌",
            "載",
            "軟",
            "硬",
            "柔",
            "炊",
            "冊",
            "盤",
            "盆",
            "煮",
            "署",
            "罰",
            "型",
            "刺",
            "削",
            "剰",
            "垂",
            "華",
            "兼",
            "嫌",
            "尋",
            "寿",
            "闘",
            "娯",
            "妊",
            "娠",
            "妥",
            "威",
            "戒",
            "釣",
            "鈴",
            "鋼",
            "鎖",
            "鉛",
            "銅",
            "胴",
            "腕",
            "肺",
            "胆",
            "肌",
            "飢",
            "餓",
            "飼",
            "旨",
            "脂",
            "肪",
            "肥",
            "脈",
            "膨",
            "肢",
            "枯",
            "杉",
            "彫",
            "髪",
            "珍",
            "診",
            "療",
            "症",
            "癖",
            "避",
            "恥",
            "患",
            "菌",
            "荘",
            "装",
            "裂",
            "鈍",
            "鋭",
            "克",
            "児",
            "旧",
            "慮",
            "寧",
            "寛",
            "寂",
            "孤",
            "触",
            "踊",
            "躍",
            "焦",
            "駐",
            "循",
            "衝",
            "征",
            "徐",
            "斜",
            "滑",
            "潜",
            "渇",
            "沢",
            "洪",
            "津",
            "浪",
            "汁",
            "渋",
            "淡",
            "滞",
            "肯",
            "齢",
            "履",
            "奮",
            "奪",
            "獲",
            "穫",
            "猫",
            "薦",
            "廃",
            "庶",
            "麻",
            "摩",
            "擦",
            "邪",
            "魔",
            "魅",
            "酸",
            "伏",
            "伐",
            "伴",
            "俊",
            "倹",
            "俵",
            "俸",
            "偽",
            "傍",
            "僧",
            "傑",
            "吐",
            "唆",
            "喝",
            "喚",
            "嘆",
            "嘱",
            "塔",
            "塀",
            "壇",
            "如",
            "姻",
            "岐",
            "帆",
            "壮",
            "弦",
            "弧",
            "径",
            "衡",
            "怪",
            "怖",
            "恨",
            "悦",
            "悟",
            "惜",
            "悼",
            "惨",
            "愉",
            "慌",
            "惰",
            "慨",
            "憎",
            "懐",
            "憾",
            "抄",
            "扶",
            "把",
            "披",
            "拘",
            "拙",
            "抹",
            "括",
            "挟",
            "拷",
            "捜",
            "措",
            "掛",
            "挿",
            "控",
            "据",
            "揚",
            "摂",
            "搭",
            "搾",
            "操",
            "携",
            "搬",
            "撤",
            "撲",
            "擁",
            "汽",
            "泌",
            "泥",
            "沸",
            "浄",
            "浸",
            "涯",
            "渦",
            "溝",
            "滅",
            "溶",
            "漏",
            "漸",
            "滴",
            "漆",
            "漬",
            "漂",
            "潮",
            "潤",
            "澄",
            "濁",
            "濫",
            "狂",
            "狩",
            "猟",
            "猛",
            "猶",
            "獄",
            "阻",
            "附",
            "陛",
            "陥",
            "陣",
            "陳",
            "陰",
            "陶",
            "旋",
            "旗",
            "朴",
            "枢",
            "栓",
            "桟",
            "棟",
            "棺",
            "棋",
            "棚",
            "槽",
            "欄",
            "殉",
            "殖",
            "班",
            "祥",
            "禍",
            "胎",
            "脚",
            "膜",
            "騰",
            "眺",
            "矯",
            "砕",
            "硫",
            "硝",
            "礁",
            "称",
            "襟",
            "褐",
            "粉",
            "粒",
            "粘",
            "粗",
            "糾",
            "紺",
            "紡",
            "紋",
            "絞",
            "綱",
            "網",
            "縄",
            "縛",
            "緯",
            "縫",
            "繕",
            "舶",
            "託",
            "詐",
            "詰",
            "該",
            "諾",
            "諭",
            "諮",
            "謙",
            "謹",
            "譜",
            "賊",
            "賦",
            "跳",
            "跡",
            "践",
            "軸",
            "轄",
            "酌",
            "酢",
            "酪",
            "酬",
            "酵",
            "酷",
            "鉢",
            "銭",
            "銃",
            "銘",
            "鋳",
            "錬",
            "錯",
            "錠",
            "鍛",
            "鎮",
            "鐘",
            "鑑",
            "剖",
            "駄",
            "駆",
            "刈",
            "剛",
            "劾",
            "勧",
            "却",
            "叙",
            "耐",
            "彩",
            "彰",
            "邦",
            "敢",
            "欺",
            "款",
            "殴",
            "殻",
            "穀",
            "朗",
            "泡",
            "胞",
            "砲",
            "飽",
            "噴",
            "憤",
            "准",
            "唯",
            "雄",
            "雅",
            "雌",
            "培",
            "陪",
            "賠",
            "頂",
            "頑",
            "頒",
            "煩",
            "顕",
            "顧",
            "嬢",
            "壌",
            "醸",
            "亭",
            "棄",
            "舎",
            "傘",
            "冠",
            "呈",
            "宜",
            "宰",
            "寡",
            "審",
            "賓",
            "崩",
            "崇",
            "芳",
            "荒",
            "菓",
            "慕",
            "冒",
            "是",
            "罷",
            "羅",
            "窃",
            "窒",
            "窮",
            "蛍",
            "掌",
            "奉",
            "奏",
            "泰",
            "笛",
            "箇",
            "篤",
            "簿",
            "覇",
            "覆",
            "零",
            "霊",
            "霜",
            "啓",
            "召",
            "塁",
            "堕",
            "塗",
            "墨",
            "妄",
            "忌",
            "怠",
            "悠",
            "愁",
            "愚",
            "慰",
            "懲",
            "架",
            "香",
            "暫",
            "脅",
            "烈",
            "勲",
            "薫",
            "紫",
            "誓",
            "誉",
            "貫",
            "匠",
            "匿",
            "囚",
            "閑",
            "閲",
            "暦",
            "厄",
            "尼",
            "尾",
            "尿",
            "層",
            "尽",
            "唐",
            "庸",
            "廉",
            "腐",
            "磨",
            "慶",
            "扇",
            "扉",
            "疫",
            "疾",
            "痢",
            "痴",
            "癒",
            "虐",
            "虚",
            "膚",
            "巡",
            "迅",
            "迭",
            "透",
            "逝",
            "逸",
            "遮",
            "遭",
            "遵",
            "鬼",
            "塊",
            "魂",
            "醜",
            "甚",
            "勘",
            "堪",
            "某",
            "媒",
            "謀",
            "又",
            "双",
            "貞",
            "偵",
            "叔",
            "淑",
            "朱",
            "珠",
            "卑",
            "碑",
            "享",
            "郭",
            "刃",
            "忍",
            "滋",
            "磁",
            "慈",
            "斉",
            "剤",
            "斎",
            "耕",
            "耗",
            "垣",
            "恒",
            "巧",
            "朽",
            "謡",
            "揺",
            "凝",
            "擬",
            "随",
            "髄",
            "唇",
            "辱",
            "幣",
            "弊",
            "墾",
            "懇",
            "敏",
            "侮",
            "炉",
            "炎",
            "哀",
            "衰",
            "衷",
            "喪",
            "晶",
            "唱",
            "尚",
            "肖",
            "凶",
            "丹",
            "幻",
            "弔",
            "甲",
            "斥",
            "亜",
            "奔",
            "幽",
            "栽",
            "瓶",
            "執",
            "粛",
            "蛮",
            "疎",
            "鼓",
            "碁",
            "憂",
            "舗",
            "覧",
            "麗",
            "菊",
            "芋",
            "芽",
            "茎",
            "苗",
            "薪",
            "藻",
            "茂",
            "滝",
            "沼",
            "渓",
            "洞",
            "瀬",
            "浦",
            "潟",
            "峰",
            "峠",
            "岬",
            "岳",
            "堤",
            "樹",
            "柳",
            "桑",
            "穂",
            "畔",
            "暁",
            "昆",
            "蚊",
            "蛇",
            "巣",
            "鶏",
            "獣",
            "猿",
            "蚕",
            "竜",
            "姫",
            "妃",
            "嫡",
            "奴",
            "隷",
            "后",
            "騎",
            "爵",
            "侯",
            "伯",
            "侍",
            "仁",
            "仙",
            "孔",
            "尉",
            "吏",
            "虜",
            "嗣",
            "陵",
            "楼",
            "墳",
            "塚",
            "藩",
            "儒",
            "艦",
            "租",
            "帥",
            "勅",
            "遷",
            "赦",
            "賜",
            "謁",
            "窯",
            "戯",
            "婆",
            "韻",
            "吟",
            "詠",
            "琴",
            "宵",
            "乙",
            "丙",
            "厘",
            "壱",
            "弐",
            "坪",
            "斤",
            "升",
            "屯",
            "隻",
            "斗",
            "凸",
            "凹",
            "但",
            "且",
            "嚇",
            "隆",
            "坑",
            "呉",
            "艇",
            "佳",
            "痘",
            "曹",
            "恭",
            "詔",
            "褒",
            "謄",
            "朕",
            "畝",
            "翁",
            "逓",
            "塑",
            "虞",
            "繭",
            "璽",
            "茨",
            "栃",
            "埼",
            "阜",
            "奈",
            "阪",
            "岡",
            "媛",
            "畿",
            "鎌",
            "弥",
            "韓",
            "柿",
            "梨",
            "蜜",
            "麺",
            "餅",
            "餌",
            "酎",
            "串",
            "箸",
            "丼",
            "釜",
            "鍋",
            "煎",
            "膳",
            "眉",
            "瞳",
            "頰",
            "顎",
            "拳",
            "爪",
            "臼",
            "肘",
            "股",
            "膝",
            "尻",
            "捻",
            "挫",
            "痩",
            "箋",
            "唾",
            "咽",
            "喉",
            "腎",
            "脊",
            "腺",
            "腫",
            "骸",
            "瘍",
            "痕",
            "斑",
            "潰",
            "椎",
            "梗",
            "鹿",
            "虎",
            "熊",
            "哺",
            "牙",
            "亀",
            "鶴",
            "蜂",
            "虹",
            "嵐",
            "崖",
            "麓",
            "窟",
            "葛",
            "藤",
            "藍",
            "堆",
            "湧",
            "沃",
            "闇",
            "玩",
            "駒",
            "呂",
            "巾",
            "袖",
            "裾",
            "籠",
            "蓋",
            "芯",
            "瓦",
            "鍵",
            "枕",
            "柵",
            "椅",
            "舷",
            "挨",
            "拶",
            "沙",
            "汰",
            "頃",
            "旦",
            "宛",
            "隙",
            "脇",
            "桁",
            "毀",
            "錮",
            "勾",
            "賭",
            "醒",
            "溺",
            "綻",
            "踪",
            "謎",
            "蔽",
            "詮",
            "匂",
            "嗅",
            "狙",
            "拉",
            "乞",
            "蹴",
            "剝",
            "斬",
            "俺",
            "傲",
            "遜",
            "辣",
            "凄",
            "貪",
            "旺",
            "淫",
            "艶",
            "妖",
            "貌",
            "摯",
            "爽",
            "璧",
            "憧",
            "憬",
            "拭",
            "貼",
            "捉",
            "冶",
            "詣",
            "遡",
            "塡",
            "頓",
            "氾",
            "勃",
            "捗",
            "采",
            "羨",
            "嫉",
            "妬",
            "惧",
            "弄",
            "嘲",
            "蔑",
            "𠮟",
            "罵",
            "呪",
            "怨",
            "臆",
            "諦",
            "羞",
            "鬱",
            "須",
            "汎",
            "曖",
            "昧",
            "瞭",
            "緻",
            "刹",
            "那",
            "恣",
            "僅",
            "苛",
            "慄",
            "畏",
            "萎",
            "塞",
            "曽",
            "戚",
            "冥",
            "侶",
            "訃",
            "諧",
            "楷",
            "伎",
            "唄",
            "瑠",
            "璃",
            "稽",
            "喩",
            "彙",
            "錦",
            "睦",
            "戴",
        ]);

        return joyoSet.has(char);
    };

    KanjiCanvas.recognize = function (id) {
        var mn = KanjiCanvas.momentNormalize(id);

        var extractedFeatures = KanjiCanvas.extractFeatures(mn, 20);

        var map = KanjiCanvas.getMap(
            extractedFeatures,
            KanjiCanvas.refPatterns[0][2],
            KanjiCanvas.endPointDistance,
        );
        map = KanjiCanvas.completeMap(
            extractedFeatures,
            KanjiCanvas.refPatterns[0][2],
            KanjiCanvas.endPointDistance,
            map,
        );

        var candidates = KanjiCanvas.coarseClassification(extractedFeatures);

        KanjiCanvas.redraw(id);

        // display candidates in the specified element
        if (KanjiCanvas["canvas_" + id].dataset.candidateList) {
            document.getElementById(
                KanjiCanvas["canvas_" + id].dataset.candidateList,
            ).innerHTML = KanjiCanvas.fineClassification(
                extractedFeatures,
                candidates,
            );
        }

        // otherwise log the result to the console if no candidateList is specified
        else {
            return KanjiCanvas.fineClassification(
                extractedFeatures,
                candidates,
            );
        }
    };

    /* copy current drawn pattern
	   as array to clipboard
	   i.e. to add missing patterns
	*/
    KanjiCanvas.copyStuff = function (id) {
        KanjiCanvas.s = "";

        for (
            var i = 0, j = KanjiCanvas["recordedPattern_" + id].length;
            i < j;
            i++
        ) {
            console.log(
                i + 1,
                KanjiCanvas["recordedPattern_" + id][i],
                KanjiCanvas["recordedPattern_" + id][i].toString(),
            );
            console.log(KanjiCanvas["recordedPattern_" + id][i]);
            console.log(
                JSON.stringify(KanjiCanvas["recordedPattern_" + id][i]),
            );
            KanjiCanvas.s +=
                "[" +
                JSON.stringify(KanjiCanvas["recordedPattern_" + id][i]) +
                "],";
        }

        KanjiCanvas.copyToClipboard(KanjiCanvas.s);
    };

    KanjiCanvas.copyToClipboard = function (str) {
        var el = document.createElement("textarea");
        el.value = str;
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
    };

    // event listener for shortcuts
    document.addEventListener("keydown", function (e) {
        var id = document.activeElement.id;

        if (KanjiCanvas["canvas_" + id] && e.ctrlKey) {
            switch (e.key.toLowerCase()) {
                // undo
                case "z":
                    e.preventDefault();
                    KanjiCanvas.deleteLast(id);
                    break;

                // erase
                case "x":
                    e.preventDefault();
                    KanjiCanvas.erase(id);
                    break;

                // recognize
                case "f":
                    e.preventDefault();
                    KanjiCanvas.recognize(id);
                    break;

                default:
                    break;
            }
        }
    });
})(window, document);
