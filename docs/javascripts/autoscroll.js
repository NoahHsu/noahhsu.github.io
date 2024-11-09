const LYRICS_TARGET = '{lyrics}';
const INSTRUMENT_TARGET = '{instrument}';

function transformToTab() {
    console.log("Initialize third-party libraries here");
    const contentElements = document.querySelectorAll('.md-content__inner.md-typeset');

    for (const contentElement of contentElements) {
        const paragraphs = contentElement.querySelectorAll('p');

        for (const paragraph of paragraphs) {
            const originalText = paragraph.textContent;

            if (originalText.startsWith(LYRICS_TARGET)) {
                paragraph.innerHTML = convertLyrics(originalText);
            } else if (originalText.startsWith(INSTRUMENT_TARGET)) {
                paragraph.innerHTML = convertInterlude(originalText);
            }
        }
    }
}

function convertLyrics(original) {
    var mid = original.substring(LYRICS_TARGET.length).replace(/.+/g, "<div class='chord'>$&</div>");
    // replace single char chord
    var ly = mid.replace(/\[(?<chord>[ABCDEFG]|N\.C\.)\]/g,
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