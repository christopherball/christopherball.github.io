# Kanji Quizzer

Written for the sole purpose of practicing writing both kanji and vocabulary words containing kanji.  Most of the tools out there limit you to writing a single kanji at a time, whereas this one intentionally supports vocabulary words.

## Supported Platforms

This tool should work on both desktop and mobile.  It's ideal for mobile so that one can practice writing from their phone.

## Deeplinking Support

While the tool doesn't directly advertise this, I have added support such that you can append `?input=言葉` to the end of the URL to pre-generate / share links to specific words to practice.

## Japanese Font Support

Please note that the font data used comes from a port of AnimCJK data for the purposes of hanzi-writer compatibility.  See https://github.com/mnako/hanzi-writer-data-ja for more details.  Given this, normal かな doesn't have supporting data files so I have written the application logic such that かな is rendered alongside the kanji to practice.

## License

See the LICENSE file in the root directory.  Links back to this repository would be kindly appreciated.