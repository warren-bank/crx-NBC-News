// ==UserScript==
// @name         NBC News
// @description  Watch videos in external player.
// @version      1.0.2
// @match        *://nbcnews.com/*
// @match        *://*.nbcnews.com/*
// @icon         https://nodeassets.nbcnews.com/cdnassets/projects/ramen/favicon/nbcnews/all-other-sizes-PNG.ico/favicon-32x32.png
// @run-at       document-end
// @grant        unsafeWindow
// @homepage     https://github.com/warren-bank/crx-NBC-News/tree/webmonkey-userscript/es5
// @supportURL   https://github.com/warren-bank/crx-NBC-News/issues
// @downloadURL  https://github.com/warren-bank/crx-NBC-News/raw/webmonkey-userscript/es5/webmonkey-userscript/NBC-News.user.js
// @updateURL    https://github.com/warren-bank/crx-NBC-News/raw/webmonkey-userscript/es5/webmonkey-userscript/NBC-News.user.js
// @namespace    warren-bank
// @author       Warren Bank
// @copyright    Warren Bank
// ==/UserScript==

// ----------------------------------------------------------------------------- constants

var user_options = {
  "common": {
    "preferred_video_format": {
      "type":                       "mp4",  // "mp4" or "hls". Choose "mp4" for ExoAirPlayer on Android. Either works with Chromecast.
      "max_resolution": {
        "mp4": {
          "bitrate":                null,
          "width":                  null,
          "height":                 720
        }
      }
    },
    "redirect_show_pages":          true,
    "sort_newest_first":            true,
    "wrap_history_state_mutations": false
  },
  "webmonkey": {
    "post_intent_redirect_to_url":  "about:blank"
  },
  "greasemonkey": {
    "redirect_to_webcast_reloaded": true,
    "force_http":                   true,
    "force_https":                  false
  }
}

// ----------------------------------------------------------------------------- state

var state = {
  "page":            null,
  "show":            null,
  "videos":          null,
  "did_rewrite_dom": false
}

// ----------------------------------------------------------------------------- helpers (state)

var get_video = function(video_index) {
  return (state.videos && (video_index < state.videos.length))
    ? state.videos[video_index]
    : null
}

var get_first_episode_url = function() {
  var url = null
  var video

  if (Array.isArray(state.videos)) {
    for (var i=0; !url && (i < state.videos.length); i++) {
      video = state.videos[i]

      if ((video instanceof Object) && video.url)
        url = video.url
    }
  }

  return url
}

// ----------------------------------------------------------------------------- helpers (DOM)

var make_element = function(elementName, content, is_text_content) {
  var el = unsafeWindow.document.createElement(elementName)

  if (content) {
    if (is_text_content)
      el.innerText = content
    else
      el.innerHTML = content
  }

  return el
}

// ------------------------------------- helpers (unused)

var make_span = function(text) {return make_element('span', text)}
var make_h4   = function(text) {return make_element('h4',   text)}

// -------------------------------------

var cancel_event = function(event){
  event.stopPropagation();event.stopImmediatePropagation();event.preventDefault();event.returnValue=false;
}

// ----------------------------------------------------------------------------- helpers (data structures)

var extract_page = function(all_data) {
  var data, page

  try {
    data = all_data.props.initialProps.pageProps

    page = {
      page:     all_data.page,
      pageView: data.pageView,
      pageType: data.pageType,
      section:  data.section || data.path
    }

    state.page = page
  }
  catch(e) {}
}

var extract_show = function(all_data) {
  var data, show

  try {
    data = all_data.props.initialState.video.current

    show = {
      url:         '',
      title:       data.source.name || data.unibrow.text || '',
      description: ''
    }

    state.show = show
  }
  catch(e) {}
}

var extract_state = function(all_data) {
  extract_page(all_data)
  extract_show(all_data)
}

var choose_preferred_video_format = function(video) {
  var preferred_video_format, mp4_filter, mp4_sort, mp4_videos, mp4_video

  preferred_video_format = user_options.common.preferred_video_format

  if (preferred_video_format.type === 'mp4') {
    mp4_filter = function(mp4_video) {
      try {
        if (preferred_video_format.max_resolution.mp4.bitrate && (mp4_video.bitrate > preferred_video_format.max_resolution.mp4.bitrate))
          return false

        if (preferred_video_format.max_resolution.mp4.width   && (mp4_video.width   > preferred_video_format.max_resolution.mp4.width))
          return false

        if (preferred_video_format.max_resolution.mp4.height  && (mp4_video.height  > preferred_video_format.max_resolution.mp4.height))
          return false
      }
      catch(e) {}
      return true
    }

    mp4_sort = function(mp4_video_1, mp4_video_2) {
      var br1 = mp4_video_1.bitrate
      var br2 = mp4_video_2.bitrate

      // descending order; highest bitrate first
      return (br1 > br2)
        ? -1
        : (br1 < br2)
          ? 1
          : 0
    }

    mp4_videos = video.videos.mp4
    mp4_videos = mp4_videos.filter(mp4_filter)
    mp4_videos = mp4_videos.sort(mp4_sort)

    if (mp4_videos.length) {
      // cherry pick the highest bitrate MP4 that matches the filter criteria
      mp4_video = mp4_videos[0]
    }
    else {
      // no MP4 videos match the filter criteria
      // fallback to choosing the lowest available bitrate
      mp4_video = video.videos.mp4[ video.videos.mp4.length - 1 ]
    }

    video.video_type = 'video/mp4'
    video.video_url  = mp4_video.url
  }
  else {
    // default to 'hls'
    video.video_type = 'application/x-mpegurl'
    video.video_url  = video.videos.hls
  }
}

var convert_raw_video = function(raw_video) {
  var video = null
  var url, title, description, date, duration, mp4_videos, hls_video_url, caption_url
  var asset

  if (raw_video instanceof Object) {
    try {
      mp4_videos = []

      if ((raw_video.url instanceof Object) && raw_video.url.canonical)
        url = raw_video.url.canonical

      if ((raw_video.headline instanceof Object) && raw_video.headline.primary)
        title = raw_video.headline.primary

      if ((raw_video.description instanceof Object) && raw_video.description.primary)
        description = raw_video.description.primary

      if (raw_video.datePublished)
        date = (new Date(raw_video.datePublished)).toLocaleDateString()

      if (Array.isArray(raw_video.videoAssets) && raw_video.videoAssets.length) {
        for (var i=0; i < raw_video.videoAssets.length; i++) {
          asset = raw_video.videoAssets[i]

          if (!duration && asset.assetDuration) {
            duration = asset.assetDuration * 1000
          }

          if (asset.publicUrl && (asset.format === 'MPEG4')) {
            if (asset.publicUrl.substring(0,5).toLowerCase() === 'http:') {
              asset.publicUrl = 'https:' + asset.publicUrl.substring(5, asset.publicUrl.length)
            }

            mp4_videos.push({
              bitrate: asset.bitrate || -1,
              width:   asset.width   || -1,
              height:  asset.height  || -1,
              url:     asset.publicUrl + '&format=redirect&Tracking=true&Embedded=true&formats=MPEG4' + '#video.mp4'
            })

            if (!hls_video_url) {
              hls_video_url = asset.publicUrl + '&format=redirect&manifest=m3u&format=redirect&Tracking=true&Embedded=true&formats=MPEG4' + '#video.m3u8'
            }
          }
        }
      }

      if (raw_video.closedCaptioning instanceof Object)
        caption_url = raw_video.closedCaptioning.webvtt || raw_video.closedCaptioning.srt || raw_video.closedCaptioning.smptett

      if (hls_video_url) {
        video = {
          url:         url         || '',
          title:       title       || '',
          description: description || '',
          date:        date        || '',
          duration:    duration    || 0,
          videos:      {
            mp4:         mp4_videos,
            hls:         hls_video_url
          },
          caption_url: caption_url || ''
        }

        // normalize data structure by elevating a preferred video format
        choose_preferred_video_format(video)
      }
    }
    catch(e) {}
  }

  return video
}

var convert_raw_videos = function(raw_videos) {
  var videos = []

  if (Array.isArray(raw_videos) && raw_videos.length) {
    videos = raw_videos
    videos = videos.map(convert_raw_video)
    videos = videos.filter(function(video){return !!video})
  }

  return videos
}

// ----------------------------------------------------------------------------- helpers (xhr)

var serialize_xhr_body_object = function(data) {
  if (typeof data === 'string')
    return data

  if (!(data instanceof Object))
    return null

  var body = []
  var keys = Object.keys(data)
  var key, val
  for (var i=0; i < keys.length; i++) {
    key = keys[i]
    val = data[key]
    val = unsafeWindow.encodeURIComponent(val)

    body.push(key + '=' + val)
  }
  body = body.join('&')
  return body
}

var download_text = function(url, headers, data, callback) {
  if (data) {
    if (!headers)
      headers = {}
    if (!headers['content-type'])
      headers['content-type'] = 'application/x-www-form-urlencoded'

    data = serialize_xhr_body_object(data)
  }

  var xhr    = new unsafeWindow.XMLHttpRequest()
  var method = data ? 'POST' : 'GET'

  xhr.open(method, url, true, null, null)

  if (headers && (typeof headers === 'object')) {
    var keys = Object.keys(headers)
    var key, val
    for (var i=0; i < keys.length; i++) {
      key = keys[i]
      val = headers[key]
      xhr.setRequestHeader(key, val)
    }
  }

  xhr.onload = function(e) {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        callback(xhr.responseText)
      }
    }
  }

  if (data)
    xhr.send(data)
  else
    xhr.send()
}

var download_json = function(url, headers, data, callback) {
  download_text(url, headers, data, function(text){
    if (!headers)
      headers = {}
    if (!headers.accept)
      headers.accept = 'application/json'

    try {
      callback(JSON.parse(text))
    }
    catch(e) {}
  })
}

// -----------------------------------------------------------------------------

var download_live_video_data = function(pid, callback) {
  var url, headers, data, xhr_callback
  var video_source, cdn_sources, cdn_source, drm_source, drm_config, video_data

  url     = 'https://api-leap.nbcsports.com/feeds/assets/' + pid + '?application=NBCNews&format=nbc-player&platform=desktop'
  headers = null
  data    = null

  xhr_callback = function(json) {
    try {
      if ((json instanceof Object) && Array.isArray(json.videoSources) && json.videoSources.length) {
        for (var i1=0; i1 < json.videoSources.length; i1++) {
          video_source = json.videoSources[i1]

          if ((video_source instanceof Object) && (video_source.cdnSources instanceof Object)) {
            cdn_sources = Object.keys(video_source.cdnSources)

            for (var i2=0; i2 < cdn_sources.length; i2++) {
              if (Array.isArray(video_source.cdnSources[cdn_sources[i2]])) {
                for (var i3=0; i3 < video_source.cdnSources[cdn_sources[i2]].length; i3++) {
                  cdn_source = video_source.cdnSources[cdn_sources[i2]][i3]

                  if ((cdn_source instanceof Object) && cdn_source.sourceUrl) {
                    video_data = {
                      video_url:  cdn_source.sourceUrl,
                      video_type: 'application/x-mpegurl'
                    }

                    if (cdn_source.contentProtection && Array.isArray(video_source.sourceDrm) && video_source.sourceDrm.length) {
                      for (var i4=0; i4 < video_source.sourceDrm.length; i4++) {
                        drm_source = video_source.sourceDrm[i4]

                        if ((drm_source instanceof Object) && Array.isArray(drm_source.drmConfig) && drm_source.drmConfig.length) {
                          for (var i5=0; i5 < drm_source.drmConfig.length; i5++) {
                            drm_config = drm_source.drmConfig[i5]

                            if ((drm_config instanceof Object) && drm_config.type && drm_config.primaryUrl) {
                              video_data.drm = {
                                scheme:    drm_config.type.toLowerCase(),
                                server:    drm_config.primaryUrl,
                                headers:   null
                              }

                              callback(video_data)
                              return
                            }
                          }
                        }
                      }
                    }

                    callback(video_data)
                    return
                  }
                }
              }
            }
          }
        }
      }
    }
    catch(e) {}
  }

  download_json(url, headers, data, xhr_callback)
}

// ----------------------------------------------------------------------------- URL links to tools on Webcast Reloaded website

var get_webcast_reloaded_url = function(video_url, caption_url, referer_url, force_http, force_https) {
  force_http  = (typeof force_http  === 'boolean') ? force_http  : user_options.greasemonkey.force_http
  force_https = (typeof force_https === 'boolean') ? force_https : user_options.greasemonkey.force_https

  var encoded_video_url, encoded_caption_url, encoded_referer_url, webcast_reloaded_base, webcast_reloaded_url

  encoded_video_url     = encodeURIComponent(encodeURIComponent(btoa(video_url)))
  encoded_caption_url   = caption_url ? encodeURIComponent(encodeURIComponent(btoa(caption_url))) : null
  referer_url           = referer_url ? referer_url : unsafeWindow.location.href
  encoded_referer_url   = encodeURIComponent(encodeURIComponent(btoa(referer_url)))

  webcast_reloaded_base = {
    "https": "https://warren-bank.github.io/crx-webcast-reloaded/external_website/index.html",
    "http":  "http://webcast-reloaded.surge.sh/index.html"
  }

  webcast_reloaded_base = (force_http)
                            ? webcast_reloaded_base.http
                            : (force_https)
                               ? webcast_reloaded_base.https
                               : (video_url.toLowerCase().indexOf('http:') === 0)
                                  ? webcast_reloaded_base.http
                                  : webcast_reloaded_base.https

  webcast_reloaded_url  = webcast_reloaded_base + '#/watch/' + encoded_video_url + (encoded_caption_url ? ('/subtitle/' + encoded_caption_url) : '') + '/referer/' + encoded_referer_url
  return webcast_reloaded_url
}

// ----------------------------------------------------------------------------- URL redirect

var redirect_to_url = function(url) {
  if (!url) return

  if (typeof GM_loadUrl === 'function') {
    if (typeof GM_resolveUrl === 'function')
      url = GM_resolveUrl(url, unsafeWindow.location.href) || url

    GM_loadUrl(url, 'Referer', unsafeWindow.location.href)
  }
  else {
    try {
      unsafeWindow.top.location = url
    }
    catch(e) {
      unsafeWindow.window.location = url
    }
  }
}

var process_webmonkey_post_intent_redirect_to_url = function() {
  var url = null

  if (typeof user_options.webmonkey.post_intent_redirect_to_url === 'string')
    url = user_options.webmonkey.post_intent_redirect_to_url

  if (typeof user_options.webmonkey.post_intent_redirect_to_url === 'function')
    url = user_options.webmonkey.post_intent_redirect_to_url()

  if (typeof url === 'string')
    redirect_to_url(url)
}

var process_video_data = function(data) {
  if (!data.video_url) return

  if (!data.referer_url)
    data.referer_url = unsafeWindow.location.href

  if (typeof GM_startIntent === 'function') {
    // running in Android-WebMonkey: open Intent chooser

    var args = [
      /* action = */ 'android.intent.action.VIEW',
      /* data   = */ data.video_url,
      /* type   = */ data.video_type
    ]

    // extras:
    if (data.caption_url) {
      args.push('textUrl')
      args.push(data.caption_url)
    }
    if (data.referer_url) {
      args.push('referUrl')
      args.push(data.referer_url)
    }
    if (data.drm instanceof Object) {
      if (data.drm.scheme) {
        args.push('drmScheme')
        args.push(data.drm.scheme)
      }
      if (data.drm.server) {
        args.push('drmUrl')
        args.push(data.drm.server)
      }
      if (data.drm.headers instanceof Object) {
        var drm_header_keys, drm_header_key, drm_header_val

        drm_header_keys = Object.keys(data.drm.headers)
        for (var i=0; i < drm_header_keys.length; i++) {
          drm_header_key = drm_header_keys[i]
          drm_header_val = data.drm.headers[drm_header_key]

          args.push('drmHeader')
          args.push(drm_header_key + ': ' + drm_header_val)
        }
      }
    }

    GM_startIntent.apply(this, args)
    process_webmonkey_post_intent_redirect_to_url()
    return true
  }
  else if (user_options.greasemonkey.redirect_to_webcast_reloaded) {
    // running in standard web browser: redirect URL to top-level tool on Webcast Reloaded website

    redirect_to_url(get_webcast_reloaded_url(data.video_url, data.caption_url, data.referer_url))
    return true
  }
  else {
    return false
  }
}

// -------------------------------------

var process_video_url = function(video_url, video_type, caption_url, referer_url) {
  var data = {
    drm: {
      scheme:    null,
      server:    null,
      headers:   null
    },
    video_url:   video_url   || null,
    video_type:  video_type  || null,
    caption_url: caption_url || null,
    referer_url: referer_url || null
  }

  process_video_data(data)
}

// ------------------------------------- helpers (unused)

var process_hls_data = function(data) {
  data.video_type = 'application/x-mpegurl'
  process_video_data(data)
}

var process_dash_data = function(data) {
  data.video_type = 'application/dash+xml'
  process_video_data(data)
}

// ------------------------------------- helpers (unused)

var process_hls_url = function(video_url, caption_url, referer_url) {
  process_video_url(video_url, /* video_type= */ 'application/x-mpegurl', caption_url, referer_url)
}

var process_dash_url = function(video_url, caption_url, referer_url) {
  process_video_url(video_url, /* video_type= */ 'application/dash+xml', caption_url, referer_url)
}

// ----------------------------------------------------------------------------- process video

var process_video = function(video_index, callback) {
  if (!callback)
    callback = process_video_data

  download_video_url_with_authorization(video_index, callback)
}

// ----------------------------------------------------------------------------- rewrite DOM to display all available full-episodes for show

// ------------------------------------- constants

var strings = {
  "button_start_video":             "Start Video",
  "episode_labels": {
    "title":                        "title:",
    "episode":                      "episode:",
    "date_release":                 "date:",
    "time_duration":                "duration:",
    "summary":                      "summary:"
  },
  "episode_units": {
    "duration_hour":                "hour",
    "duration_hours":               "hours",
    "duration_minutes":             "minutes"
  }
}

var constants = {
  "dom_classes": {
    "div_show":                     "show",
    "div_episodes":                 "episodes",
    "div_webcast_icons":            "icons-container"
  },
  "dom_attributes": {
    "video_index":                  "x-video-index"
  },
  "img_urls": {
    "base_webcast_reloaded_icons":  "https://github.com/warren-bank/crx-webcast-reloaded/raw/gh-pages/chrome_extension/2-release/popup/img/"
  }
}

// -------------------------------------  helpers

var get_video_index = function($element) {
  var video_index

  video_index = $element.getAttribute(constants.dom_attributes.video_index)
  if (!video_index) return -1

  video_index = parseInt(video_index, 10)
  if (isNaN(video_index)) return -1

  return video_index
}

// -------------------------------------

var repeat_string = function(str, count) {
  var rep = ''
  for (var i=0; i < count; i++)
    rep += str
  return rep
}

var pad_zeros = function(num, len) {
  var str = num.toString()
  var pad = len - str.length
  if (pad > 0)
    str = repeat_string('0', pad) + str
  return str
}

// -------------------------------------  URL links to tools on Webcast Reloaded website

var get_webcast_reloaded_url_chromecast_sender = function(video_url, caption_url, referer_url) {
  return get_webcast_reloaded_url(video_url, caption_url, referer_url, /* force_http= */ null, /* force_https= */ null).replace('/index.html', '/chromecast_sender.html')
}

var get_webcast_reloaded_url_airplay_sender = function(video_url, caption_url, referer_url) {
  return get_webcast_reloaded_url(video_url, caption_url, referer_url, /* force_http= */ true, /* force_https= */ false).replace('/index.html', '/airplay_sender.es5.html')
}

var get_webcast_reloaded_url_proxy = function(hls_url, caption_url, referer_url) {
  return get_webcast_reloaded_url(hls_url, caption_url, referer_url, /* force_http= */ true, /* force_https= */ false).replace('/index.html', '/proxy.html')
}

// -------------------------------------  DOM: static skeleton

var reset_dom = function() {
  unsafeWindow.document.close()
  unsafeWindow.document.write('')
  unsafeWindow.document.close()
}

var reinitialize_dom = function() {
  reset_dom()

  var head = unsafeWindow.document.getElementsByTagName('head')[0]
  var body = unsafeWindow.document.body

  var html = {
    "head": [
      '<style>',

      // --------------------------------------------------- CSS: global

      'body {',
      '  margin: 0;',
      '  padding: 0;',
      '  font-family: serif;',
      '  font-size: 16px;',
      '  color: #000 !important;',
      '  background-color: #fff !important;',
      '  text-align: left;',
      '}',

      // --------------------------------------------------- CSS: show

      'div.' + constants.dom_classes.div_show + ' > h2 {',
      '  display: block;',
      '  margin: 0;',
      '  padding: 0.5em;',
      '  font-size: 22px;',
      '  text-align: center;',
      '  background-color: #ccc;',
      '}',

      'div.' + constants.dom_classes.div_show + ' > h2 > a {',
      '  display: inline-block;',
      '  margin: 0;',
      '  color: inherit;',
      '  text-decoration: none;',
      '}',

      'div.' + constants.dom_classes.div_show + ' > blockquote {',
      '  display: block;',
      '  margin: 0;',
      '  padding: 0.5em;',
      '  font-size: 18px;',
      '}',

      // --------------------------------------------------- CSS: episodes

      'div.' + constants.dom_classes.div_episodes + ' > ul {',
      '  list-style: none;',
      '  margin: 0;',
      '  padding: 0;',
      '  padding-left: 1em;',
      '}',

      'div.' + constants.dom_classes.div_episodes + ' > ul > li {',
      '  list-style: none;',
      '  margin-top: 0.5em;',
      '  border-top: 1px solid #999;',
      '  padding-top: 0.5em;',
      '}',

      'div.' + constants.dom_classes.div_episodes + ' > ul > li > table {',
      '  min-height: 70px;',
      '}',

      'div.' + constants.dom_classes.div_episodes + ' > ul > li > table td:first-child {',
      '  font-style: italic;',
      '  padding-right: 1em;',
      '}',

      'div.' + constants.dom_classes.div_episodes + ' > ul > li > table td > a {',
      '  display: inline-block;',
      '  margin: 0;',
      '  color: blue;',
      '  text-decoration: none;',
      '}',

      'div.' + constants.dom_classes.div_episodes + ' > ul > li > blockquote {',
      '  display: block;',
      '  background-color: #eee;',
      '  padding: 0.5em 1em;',
      '  margin: 0;',
      '}',

      'div.' + constants.dom_classes.div_episodes + ' > ul > li > button {',
      '  margin: 0.75em 0;',
      '}',

      'div.' + constants.dom_classes.div_episodes + ' > ul > li > div.' + constants.dom_classes.div_webcast_icons + ' {',
      '}',

      // --------------------------------------------------- CSS: EPG data (links to tools on Webcast Reloaded website)

      'div.' + constants.dom_classes.div_webcast_icons + ' {',
      '  display: block;',
      '  position: relative;',
      '  z-index: 1;',
      '  float: right;',
      '  margin: 0.5em;',
      '  width: 60px;',
      '  height: 60px;',
      '  max-height: 60px;',
      '  vertical-align: top;',
      '  background-color: #d7ecf5;',
      '  border: 1px solid #000;',
      '  border-radius: 14px;',
      '}',

      'div.' + constants.dom_classes.div_webcast_icons + ' > a.chromecast,',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.chromecast > img,',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.airplay,',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.airplay > img,',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.proxy,',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.proxy > img,',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.video-link,',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.video-link > img {',
      '  display: block;',
      '  width: 25px;',
      '  height: 25px;',
      '}',

      'div.' + constants.dom_classes.div_webcast_icons + ' > a.chromecast,',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.airplay,',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.proxy,',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.video-link {',
      '  position: absolute;',
      '  z-index: 1;',
      '  text-decoration: none;',
      '}',

      'div.' + constants.dom_classes.div_webcast_icons + ' > a.chromecast,',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.airplay {',
      '  top: 0;',
      '}',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.proxy,',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.video-link {',
      '  bottom: 0;',
      '}',

      'div.' + constants.dom_classes.div_webcast_icons + ' > a.chromecast,',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.proxy {',
      '  left: 0;',
      '}',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.airplay,',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.video-link {',
      '  right: 0;',
      '}',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.airplay + a.video-link {',
      '  right: 17px; /* (60 - 25)/2 to center when there is no proxy icon */',
      '}',

      '</style>'
    ],
    "body": [
      '<div class="' + constants.dom_classes.div_show     + '"></div>',
      '<div class="' + constants.dom_classes.div_episodes + '"></div>'
    ]
  }

  head.innerHTML = '' + html.head.join("\n")
  body.innerHTML = '' + html.body.join("\n")
}

// ------------------------------------- DOM: dynamic elements - episodes

var make_webcast_reloaded_div = function(video_url, caption_url, referer_url) {
  var webcast_reloaded_urls = {
//  "index":             get_webcast_reloaded_url(                  video_url, caption_url, referer_url),
    "chromecast_sender": get_webcast_reloaded_url_chromecast_sender(video_url, caption_url, referer_url),
    "airplay_sender":    get_webcast_reloaded_url_airplay_sender(   video_url, caption_url, referer_url),
    "proxy":             get_webcast_reloaded_url_proxy(            video_url, caption_url, referer_url)
  }

  var div = make_element('div')

  var html = [
    '<a target="_blank" class="chromecast" href="' + webcast_reloaded_urls.chromecast_sender + '" title="Chromecast Sender"><img src="'       + constants.img_urls.base_webcast_reloaded_icons + 'chromecast.png"></a>',
    '<a target="_blank" class="airplay" href="'    + webcast_reloaded_urls.airplay_sender    + '" title="ExoAirPlayer Sender"><img src="'     + constants.img_urls.base_webcast_reloaded_icons + 'airplay.png"></a>',
    '<a target="_blank" class="proxy" href="'      + webcast_reloaded_urls.proxy             + '" title="HLS-Proxy Configuration"><img src="' + constants.img_urls.base_webcast_reloaded_icons + 'proxy.png"></a>',
    '<a target="_blank" class="video-link" href="' + video_url                                 + '" title="direct link to video"><img src="'    + constants.img_urls.base_webcast_reloaded_icons + 'video_link.png"></a>'
  ]

  div.setAttribute('class', constants.dom_classes.div_webcast_icons)
  div.innerHTML = html.join("\n")

  return div
}

var insert_webcast_reloaded_div = function(block_element, video_url, caption_url, referer_url) {
  var webcast_reloaded_div = make_webcast_reloaded_div(video_url, caption_url, referer_url)

  if (block_element.childNodes.length)
    block_element.insertBefore(webcast_reloaded_div, block_element.childNodes[0])
  else
    block_element.appendChild(webcast_reloaded_div)
}

// -------------------------------------

var convert_ms_to_mins = function(X) {
  // (X ms)(1 sec / 1000 ms)(1 min / 60 sec)
  return Math.ceil(X / 60000)
}

var get_ms_duration_time_string = function(ms) {
  var time_string = ''
  var mins = convert_ms_to_mins(ms)
  var hours

  if (mins >= 60) {
    hours       = Math.floor(mins / 60)
    time_string = hours + ' ' + ((hours < 2) ? strings.episode_units.duration_hour : strings.episode_units.duration_hours) + ', '
    mins        = mins % 60
  }

  return time_string + mins + ' ' + strings.episode_units.duration_minutes
}

var make_episode_listitem_html = function(video, video_index) {
  if (video.duration)
    video.duration = get_ms_duration_time_string(video.duration)

  var tr = []

  var append_tr = function(td, colspan) {
    if (Array.isArray(td))
      tr.push('<tr><td>' + td.join('</td><td>') + '</td></tr>')
    else if ((typeof colspan === 'number') && (colspan > 1))
      tr.push('<tr><td colspan="' + colspan + '">' + td + '</td></tr>')
    else
      tr.push('<tr><td>' + td + '</td></tr>')
  }

  if (video.title && video.url)
    video.title = '<a target="_blank" href="' + video.url + '">' + video.title + '</a>'
  if (video.title)
    append_tr([strings.episode_labels.title, video.title])
  if (video.season && video.episode)
    append_tr([strings.episode_labels.episode, ('S' + pad_zeros(video.season, 2) + ' E' + pad_zeros(video.episode, 2))])
  if (video.date)
    append_tr([strings.episode_labels.date_release, video.date])
  if (video.duration)
    append_tr([strings.episode_labels.time_duration, video.duration])
  if (video.description)
    append_tr(strings.episode_labels.summary, 2)

  var html = ['<table>' + tr.join("\n") + '</table>']
  if (video.description)
    html.push('<blockquote>' + video.description + '</blockquote>')

  return '<li ' + constants.dom_attributes.video_index + '="' + video_index + '">' + html.join("\n") + '</li>'
}

var make_show_html = function() {
  var html = []

  if (state.show) {
    if (state.show.title) {
      if (state.show.url)
        html.push('<h2><a target="_blank" href="' + state.show.url + '">' + state.show.title + '</a></h2>')
      else
        html.push('<h2>' + state.show.title + '</h2>')
    }

    if (state.show.description)
      html.push('<blockquote>' + state.show.description + '</blockquote>')
  }

  return html.join("\n")
}

// -------------------------------------

var onclick_start_video_button = function(event) {
  cancel_event(event)

  var button, video_index, video_data

  button = event.target

  video_index = get_video_index(button)
  if (video_index < 0) return

  video_data = get_video(video_index)
  if (!video_data) return

  process_video_data(video_data)
}

var make_start_video_button = function(video_index) {
  var button = make_element('button')

  button.setAttribute(constants.dom_attributes.video_index, video_index)
  button.innerHTML = strings.button_start_video
  button.addEventListener("click", onclick_start_video_button)

  return button
}

var add_start_video_button = function(video_index, block_element, old_button) {
  var new_button = make_start_video_button(video_index)

  if (old_button)
    old_button.parentNode.replaceChild(new_button, old_button)
  else
    block_element.appendChild(new_button)
}

// -------------------------------------

var add_episode_div_buttons = function(episodes_div) {
  var episode_items = episodes_div.querySelectorAll('li[' + constants.dom_attributes.video_index + ']')
  var episode_item, video_index, video_data

  for (var i=0; i < episode_items.length; i++) {
    episode_item = episode_items[i]

    video_index = get_video_index(episode_item)
    if (video_index < 0) continue

    video_data = get_video(video_index)
    if (!video_data) continue

    insert_webcast_reloaded_div(/* block_element= */ episode_item, video_data.video_url, video_data.caption_url)
    add_start_video_button(video_index, /* block_element= */ episode_item, /* old_button= */ null)
  }
}

// -------------------------------------

var rewrite_show_page = function() {
  var show_div, episodes_div, html

  reinitialize_dom()

  show_div     = unsafeWindow.document.querySelector('div.' + constants.dom_classes.div_show)
  episodes_div = unsafeWindow.document.querySelector('div.' + constants.dom_classes.div_episodes)

  if (show_div && state.show) {
    html = make_show_html()
    show_div.innerHTML = html
  }

  if (episodes_div && state.videos) {
    html = '<ul>' + state.videos.map(make_episode_listitem_html).join("\n") + '</ul>'
    episodes_div.innerHTML = html

    add_episode_div_buttons(episodes_div)
  }

  user_options.webmonkey.post_intent_redirect_to_url = null
  state.did_rewrite_dom = true
}

// ----------------------------------------------------------------------------- extract data from DOM

var extract_live_stream_pid = function() {
  var pid       = null
  var url_regex = new RegExp('^https?://(?:www\\.)?nbcnews\\.com/playmaker/embed/(.+)$', 'i')
  var scripts, script, data

  try {
    scripts = unsafeWindow.document.querySelectorAll('script[type="application/ld+json"]:not([src])')
    for (var i=0; !pid && (i < scripts.length); i++) {
      script = scripts[i]
      script = script.innerText.trim()

      try {
        data = JSON.parse(script)

        if ((data instanceof Object) && data.embedUrl && url_regex.test(data.embedUrl)) {
          pid = data.embedUrl.replace(url_regex, '$1')
        }
      }
      catch(e2) {}
    }
  }
  catch(e1) {}

  return pid
}

// -------------------------------------

var extract_vod_dataset = function() {
  var data = null

  try {
    data = JSON.parse( unsafeWindow.document.querySelector('script#__NEXT_DATA__').innerText )
  }
  catch(e) {}

  return data
}

// ----------------------------------------------------------------------------- bootstrap

/*
 * ======
 * notes:
 * ======
 * - return value is a wrapper function
 */

var trigger_on_function_call = function(func, func_this, trigger) {
  if (typeof trigger !== 'function') return func

  return function() {
    func.apply((func_this || null), arguments)

    trigger()
  }
}

var wrap_history_state_mutations = function() {
  if (unsafeWindow.history && (typeof unsafeWindow.history.pushState === 'function'))
    unsafeWindow.history.pushState = trigger_on_function_call(unsafeWindow.history.pushState, unsafeWindow.history, init)

  if (unsafeWindow.history && (typeof unsafeWindow.history.replaceState === 'function'))
    unsafeWindow.history.replaceState = trigger_on_function_call(unsafeWindow.history.replaceState, unsafeWindow.history, init)

  unsafeWindow.onpopstate = function() {
    if (state.did_rewrite_dom)
      unsafeWindow.location.reload()
  }

  if (unsafeWindow.history && (typeof unsafeWindow.history.back === 'function'))
    unsafeWindow.history.back = trigger_on_function_call(unsafeWindow.history.back, unsafeWindow.history, unsafeWindow.onpopstate)
}

// -------------------------------------

var init_page_live_stream = function() {
  var is_done = false
  var pid

  if ((state.page instanceof Object) && (state.page.page === '/videoLive'))
    pid = extract_live_stream_pid()

  if (pid) {
    is_done = true
    download_live_video_data(pid, process_video_data)
  }

  return is_done
}

// -------------------------------------

var init_page_vod_episode = function(data) {
  var is_done = false
  var videos

  if ((state.page instanceof Object) && (state.page.page === '/video') && (state.page.pageView === 'video')) {
    if (!videos) {
      try {
        videos = data.props.initialState.video.current.associatedVideoPlaylist.videos
      }
      catch(e) {}
    }

    if (!videos) {
      try {
        videos = data.props.initialState.video.associatedPlaylists[0].videos
      }
      catch(e) {}
    }

    if (videos && Array.isArray(videos) && videos.length) {
      try {
        videos = convert_raw_videos(videos)
        if (!videos.length) throw ''

        is_done = true

        if (!user_options.common.sort_newest_first)
          videos.reverse()

        state.videos = videos

        if (videos.length === 1)
          process_video(0)
        else
          rewrite_show_page()
      }
      catch(e) {
        videos = null
      }
    }
  }

  return is_done
}

// -------------------------------------

var init_page_vod_episodes_list = function(data) {
  var is_done = false
  var videos  = []
  var layouts, layout, package, item, first_episode_url

  if ((state.page instanceof Object) && (state.page.page === '/front') && (state.page.pageView === 'front') && !state.page.pageType && (state.page.section.indexOf('-full-episodes') !== -1)) {
    try {
      layouts = data.props.initialState.front.curation.layouts

      for (var i1=0; i1 < layouts.length; i1++) {
        layout = layouts[i1]

        if ((layout instanceof Object) && Array.isArray(layout.packages) && layout.packages.length) {
          for (var i2=0; i2 < layout.packages.length; i2++) {
            package = layout.packages[i2]

            if ((package instanceof Object) && Array.isArray(package.items) && package.items.length) {
              for (var i3=0; i3 < package.items.length; i3++) {
                item = package.items[i3]

                if ((item instanceof Object) && (item.type === 'video') && (item.item instanceof Object)) {
                  videos.push(item.item)
                }
              }
            }
          }
        }
      }
    }
    catch(e) {}
  }

  if (videos.length) {
    try {
      videos = convert_raw_videos(videos)
      if (!videos.length) throw ''

      is_done = true

      if (!user_options.common.sort_newest_first)
        videos.reverse()

      state.videos = videos
      first_episode_url = get_first_episode_url()

      if (videos.length === 1)
        process_video(0)
      else if (user_options.common.redirect_show_pages && first_episode_url)
        redirect_to_url(first_episode_url)
      else
        rewrite_show_page()
    }
    catch(e) {
      videos = []
    }
  }

  return is_done
}

// -------------------------------------

var init_page_vod = function(data) {
  var is_done = false

  if (data && !is_done)
    is_done = init_page_vod_episode(data)

  if (data && !is_done)
    is_done = init_page_vod_episodes_list(data)

  return is_done
}

// -------------------------------------

var init = function() {
  var data = extract_vod_dataset()

  if (data)
    extract_state(data)

  init_page_live_stream() || init_page_vod(data)
}

init()

if (user_options.common.wrap_history_state_mutations)
  wrap_history_state_mutations()

// -----------------------------------------------------------------------------
