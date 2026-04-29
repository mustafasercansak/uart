
const lineText = '      <span className="text-gray-500">{t(\'builder.checksum\')}</span>';
const jsxTextRegex = />([^<{}\n\r]*[a-zA-ZğüşıöçĞÜŞİÖÇ][^<{}\n\r]*)</g;

let match;
while ((match = jsxTextRegex.exec(lineText)) !== null) {
    console.log('Match found:', match[1]);
}
console.log('Done');
