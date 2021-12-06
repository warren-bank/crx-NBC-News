### [NBC News](https://github.com/warren-bank/crx-NBC-News/tree/webmonkey-userscript/es5)

[Userscript](https://github.com/warren-bank/crx-NBC-News/raw/webmonkey-userscript/es5/webmonkey-userscript/NBC-News.user.js) for [nbcnews.com](https://www.nbcnews.com/) to run in both:
* the [WebMonkey](https://github.com/warren-bank/Android-WebMonkey) application for Android
* the [Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) web browser extension for Chrome/Chromium

Its purpose is to:
* on a page for a live stream, or a video that _isn't_ part of a series:
  - redirect the video stream to an external player
* on a page for a video that _is_ part of a series:
  - list all freely available full-length episodes in the series
  - provide ability to redirect the video stream for any chosen episode to an external player
* on a page intended to list episodes in a series:
  - if there is only one episode:
    * redirect the video stream to an external player
  - if there is more than one episode:
    * redirect to the page for the first video in the series

#### Legal:

* copyright: [Warren Bank](https://github.com/warren-bank)
* license: [GPL-2.0](https://www.gnu.org/licenses/old-licenses/gpl-2.0.txt)
