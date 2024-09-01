const LYRICS_TARGET = '{lyrics}';
const INSTRUMENT_TARGET = '{instrument}';

function convertLyrics(original) {
    var mid = original.substring(LYRICS_TARGET.length).replace(/.+/g, "<div class='chord'>$&</div>");
    // replace single char chord
    var ly = mid.replace(/\[(?<chord>[ABCDEFG]+)\]/g,
     "<span class='chord'>$<chord></span>");
    // replace complex chord
    ly = ly.replace(/\[(?<chord>[ABCDEFG])(?<dec>[\w#b\-\/]+)\]/g,
     "<span class='chord'>$<chord><sub>$<dec></sub></span>");
    var line = ly.replace(/\{(?<ji>[\u3005\u4e00-\u9fff]+)\|(?<hira>[\u3040-\u30ff]+)\}/g,
     "<ruby>$<ji><rt>$<hira></rt></ruby>");
    return line;
}

function convertInterlude(original) {
    var mid = original.substring(INSTRUMENT_TARGET.length).replace(/.+/g, "<div class='instrument'>$&</div>");
    var ly = mid.replace(/\[(?<chord>[ABCDEFG]+)\]/g,
         "<span class='instrument'>$<chord></span>");
    ly = ly.replace(/\[(?<chord>[ABCDEFG])(?<dec>[\w#b\-\/]+)\]/g,
         "<span class='instrument'>$<chord><sub>$<dec></sub></span>");
    return ly
}